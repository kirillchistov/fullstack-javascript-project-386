import assert from 'node:assert/strict';
import { test } from 'node:test';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { buildApp } from '../src/app.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Europe/Moscow';

/** Ближайший будний день в будущем (расписание сида: Пн–Пт 10:00–18:00 МСК) */
function nextWorkday() {
  let day = dayjs.tz(dayjs(), TZ).add(1, 'day');
  while ([6, 0].includes(day.day())) {
    day = day.add(1, 'day');
  }
  return day.format('YYYY-MM-DD');
}

async function login(app) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/session',
    payload: { email: 'owner@example.com', password: 'secret' },
  });
  assert.equal(res.statusCode, 200);
  const setCookie = res.headers['set-cookie'];
  const session = /session=([^;]+)/.exec(String(setCookie))[1];
  return { cookies: { session } };
}

test('гость видит типы событий', async () => {
  const app = buildApp();
  const res = await app.inject({ method: 'GET', url: '/api/event-types' });
  assert.equal(res.statusCode, 200);
  const types = res.json();
  assert.ok(types.length > 0);
  assert.equal(types[0].durationMinutes, 30);
});

test('слоты: будний день по расписанию содержит 16 свободных слотов по 30 минут', async () => {
  const app = buildApp();
  const day = nextWorkday();
  const res = await app.inject({ method: 'GET', url: `/api/slots?from=${day}&to=${day}` });
  assert.equal(res.statusCode, 200);
  const slots = res.json();
  assert.equal(slots.length, 16); // 10:00–18:00 = 8 часов × 2 слота
  const first = dayjs(slots[0].startsAt).tz(TZ);
  assert.equal(first.format('HH:mm'), '10:00');
});

test('слоты: некорректный период — 422 по контракту', async () => {
  const app = buildApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/slots?from=2026-08-10&to=2026-08-01',
  });
  assert.equal(res.statusCode, 422);
  assert.equal(res.json().code, 'validation_error');
});

test('бронирование: успешное создание, повтор того же слота — 409', async () => {
  const app = buildApp();
  const day = nextWorkday();
  const slotsRes = await app.inject({ method: 'GET', url: `/api/slots?from=${day}&to=${day}` });
  const slot = slotsRes.json()[0];

  const payload = {
    eventTypeId: 1,
    startsAt: slot.startsAt,
    guestName: 'Иван Петров',
    guestEmail: 'ivan@example.com',
    comment: 'Обсудить проект',
  };

  const created = await app.inject({ method: 'POST', url: '/api/bookings', payload });
  assert.equal(created.statusCode, 201);
  const booking = created.json();
  assert.equal(booking.status, 'active');
  assert.equal(booking.endsAt, dayjs(slot.startsAt).add(30, 'minute').toISOString());

  // Слот исчез из свободных
  const slotsAfter = await app.inject({ method: 'GET', url: `/api/slots?from=${day}&to=${day}` });
  assert.ok(!slotsAfter.json().some((s) => s.startsAt === slot.startsAt));

  // Повторное бронирование того же слота — конфликт
  const conflict = await app.inject({ method: 'POST', url: '/api/bookings', payload });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().code, 'slot_unavailable');
});

test('бронирование: слот в прошлом или вне расписания — 409', async () => {
  const app = buildApp();
  const past = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: {
      eventTypeId: 1,
      startsAt: '2020-01-06T10:00:00Z',
      guestName: 'Иван',
      guestEmail: 'ivan@example.com',
    },
  });
  assert.equal(past.statusCode, 409);

  // 03:00 по Москве — вне расписания 10:00–18:00
  const day = nextWorkday();
  const offSchedule = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: {
      eventTypeId: 1,
      startsAt: dayjs.tz(`${day}T03:00`, TZ).toISOString(),
      guestName: 'Иван',
      guestEmail: 'ivan@example.com',
    },
  });
  assert.equal(offSchedule.statusCode, 409);
});

test('бронирование: невалидное тело — 422 со списком полей', async () => {
  const app = buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: { eventTypeId: 1, startsAt: 'not-a-date', guestName: '', guestEmail: 'нет' },
  });
  assert.equal(res.statusCode, 422);
  const body = res.json();
  assert.equal(body.code, 'validation_error');
  assert.ok(Array.isArray(body.errors));
});

test('владелец: эндпоинты закрыты без сессии (401)', async () => {
  const app = buildApp();
  for (const [method, url] of [
    ['GET', '/api/bookings'],
    ['DELETE', '/api/bookings/1'],
    ['GET', '/api/availability'],
    ['PUT', '/api/availability'],
  ]) {
    const res = await app.inject({
      method,
      url,
      ...(method === 'PUT' && { payload: { timezone: 'Europe/Moscow', rules: [] } }),
    });
    assert.equal(res.statusCode, 401, `${method} ${url}`);
  }
});

test('владелец: вход, список встреч, отмена освобождает слот', async () => {
  const app = buildApp();
  const day = nextWorkday();
  const slotsRes = await app.inject({ method: 'GET', url: `/api/slots?from=${day}&to=${day}` });
  const slot = slotsRes.json()[0];

  await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: {
      eventTypeId: 1,
      startsAt: slot.startsAt,
      guestName: 'Иван',
      guestEmail: 'ivan@example.com',
    },
  });

  const auth = await login(app);

  const list = await app.inject({ method: 'GET', url: '/api/bookings', ...auth });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().length, 1);
  const bookingId = list.json()[0].id;

  const cancel = await app.inject({
    method: 'DELETE',
    url: `/api/bookings/${bookingId}`,
    ...auth,
  });
  assert.equal(cancel.statusCode, 204);

  // Слот снова свободен
  const slotsAfter = await app.inject({ method: 'GET', url: `/api/slots?from=${day}&to=${day}` });
  assert.ok(slotsAfter.json().some((s) => s.startsAt === slot.startsAt));

  // Повторная отмена — 404
  const again = await app.inject({
    method: 'DELETE',
    url: `/api/bookings/${bookingId}`,
    ...auth,
  });
  assert.equal(again.statusCode, 404);
});

test('владелец: неверный пароль — 401', async () => {
  const app = buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/session',
    payload: { email: 'owner@example.com', password: 'wrong' },
  });
  assert.equal(res.statusCode, 401);
});

test('доступность: чтение и обновление, пересечения — 422', async () => {
  const app = buildApp();
  const auth = await login(app);

  const current = await app.inject({ method: 'GET', url: '/api/availability', ...auth });
  assert.equal(current.statusCode, 200);
  assert.equal(current.json().timezone, 'Europe/Moscow');

  const updated = await app.inject({
    method: 'PUT',
    url: '/api/availability',
    ...auth,
    payload: {
      timezone: 'Europe/Moscow',
      rules: [{ weekday: 1, startTime: '09:00', endTime: '12:00' }],
    },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().rules.length, 1);

  const overlapping = await app.inject({
    method: 'PUT',
    url: '/api/availability',
    ...auth,
    payload: {
      timezone: 'Europe/Moscow',
      rules: [
        { weekday: 1, startTime: '10:00', endTime: '14:00' },
        { weekday: 1, startTime: '13:00', endTime: '18:00' },
      ],
    },
  });
  assert.equal(overlapping.statusCode, 422);
  assert.ok(overlapping.json().errors.length > 0);
});
