import assert from 'node:assert/strict';
import { test } from 'node:test';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { buildApp } from '../src/app.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Europe/Moscow';
const SLUG = 'kirill';

function nextWorkday() {
  let day = dayjs.tz(dayjs(), TZ).add(1, 'day');
  while ([6, 0].includes(day.day())) {
    day = day.add(1, 'day');
  }
  return day.format('YYYY-MM-DD');
}

function build() {
  return buildApp({ databasePath: ':memory:' });
}

async function login(app, email = 'owner@example.com', password = 'secret') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/session',
    payload: { email, password },
  });
  assert.equal(res.statusCode, 200);
  const setCookie = res.headers['set-cookie'];
  const session = /session=([^;]+)/.exec(String(setCookie))[1];
  return { cookies: { session } };
}

test('гость видит публичный профиль и типы событий по slug', async () => {
  const app = build();
  const profile = await app.inject({ method: 'GET', url: `/api/public/${SLUG}` });
  assert.equal(profile.statusCode, 200);
  assert.equal(profile.json().slug, SLUG);
  assert.equal(profile.json().timezone, TZ);

  const types = await app.inject({
    method: 'GET',
    url: `/api/public/${SLUG}/event-types`,
  });
  assert.equal(types.statusCode, 200);
  assert.ok(types.json().length >= 2);
  assert.ok(types.json().some((t) => t.durationMinutes === 60));
});

test('слоты: будний день для 30-мин типа содержит 16 слотов', async () => {
  const app = build();
  const day = nextWorkday();
  const types = (
    await app.inject({ method: 'GET', url: `/api/public/${SLUG}/event-types` })
  ).json();
  const thirty = types.find((t) => t.durationMinutes === 30);
  const res = await app.inject({
    method: 'GET',
    url: `/api/public/${SLUG}/slots?from=${day}&to=${day}&eventTypeId=${thirty.id}`,
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().length, 16);
  assert.equal(dayjs(res.json()[0].startsAt).tz(TZ).format('HH:mm'), '10:00');
});

test('слоты: 60-мин тип даёт меньше слотов; пересечение блокирует соседний', async () => {
  const app = build();
  const day = nextWorkday();
  const types = (
    await app.inject({ method: 'GET', url: `/api/public/${SLUG}/event-types` })
  ).json();
  const hour = types.find((t) => t.durationMinutes === 60);
  const slotsRes = await app.inject({
    method: 'GET',
    url: `/api/public/${SLUG}/slots?from=${day}&to=${day}&eventTypeId=${hour.id}`,
  });
  assert.equal(slotsRes.json().length, 8);

  const slot = slotsRes.json()[0];
  await app.inject({
    method: 'POST',
    url: `/api/public/${SLUG}/bookings`,
    payload: {
      eventTypeId: hour.id,
      startsAt: slot.startsAt,
      guestName: 'Иван',
      guestEmail: 'ivan@example.com',
    },
  });

  const after = await app.inject({
    method: 'GET',
    url: `/api/public/${SLUG}/slots?from=${day}&to=${day}&eventTypeId=${hour.id}`,
  });
  assert.ok(!after.json().some((s) => s.startsAt === slot.startsAt));
});

test('слоты: некорректный период — 422', async () => {
  const app = build();
  const res = await app.inject({
    method: 'GET',
    url: `/api/public/${SLUG}/slots?from=2026-08-10&to=2026-08-01&eventTypeId=1`,
  });
  assert.equal(res.statusCode, 422);
});

test('слоты: за горизонтом 14 дней слотов нет', async () => {
  const app = build();
  const day = dayjs.tz(dayjs(), TZ).add(20, 'day').format('YYYY-MM-DD');
  const res = await app.inject({
    method: 'GET',
    url: `/api/public/${SLUG}/slots?from=${day}&to=${day}&eventTypeId=1`,
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), []);
});

test('бронирование: успех, повтор — 409', async () => {
  const app = build();
  const day = nextWorkday();
  const types = (
    await app.inject({ method: 'GET', url: `/api/public/${SLUG}/event-types` })
  ).json();
  const et = types[0];
  const slot = (
    await app.inject({
      method: 'GET',
      url: `/api/public/${SLUG}/slots?from=${day}&to=${day}&eventTypeId=${et.id}`,
    })
  ).json()[0];

  const payload = {
    eventTypeId: et.id,
    startsAt: slot.startsAt,
    guestName: 'Иван Петров',
    guestEmail: 'ivan@example.com',
  };
  const created = await app.inject({
    method: 'POST',
    url: `/api/public/${SLUG}/bookings`,
    payload,
  });
  assert.equal(created.statusCode, 201);
  assert.equal(
    created.json().endsAt,
    dayjs(slot.startsAt).add(et.durationMinutes, 'minute').toISOString(),
  );

  const conflict = await app.inject({
    method: 'POST',
    url: `/api/public/${SLUG}/bookings`,
    payload,
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().code, 'slot_unavailable');
});

test('бронирование: слот в прошлом — 409', async () => {
  const app = build();
  const past = await app.inject({
    method: 'POST',
    url: `/api/public/${SLUG}/bookings`,
    payload: {
      eventTypeId: 1,
      startsAt: '2020-01-06T10:00:00Z',
      guestName: 'Иван',
      guestEmail: 'ivan@example.com',
    },
  });
  assert.equal(past.statusCode, 409);
});

test('регистрация: новый владелец получает сессию и публичную страницу', async () => {
  const app = build();
  const res = await app.inject({
    method: 'POST',
    url: '/api/owners',
    payload: {
      name: 'Анна',
      email: 'anna@example.com',
      password: 'secret1',
      slug: 'anna',
    },
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().owner.slug, 'anna');
  assert.ok(String(res.headers['set-cookie']).includes('session='));

  const publicPage = await app.inject({ method: 'GET', url: '/api/public/anna' });
  assert.equal(publicPage.statusCode, 200);
  assert.equal(publicPage.json().name, 'Анна');
});

test('регистрация: занятый slug — 409 already_exists', async () => {
  const app = build();
  const res = await app.inject({
    method: 'POST',
    url: '/api/owners',
    payload: {
      name: 'Другой',
      email: 'other@example.com',
      password: 'secret1',
      slug: 'kirill',
    },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().code, 'already_exists');
});

test('владелец: CRUD типов событий с длительностью', async () => {
  const app = build();
  const auth = await login(app);

  const created = await app.inject({
    method: 'POST',
    url: '/api/event-types',
    ...auth,
    payload: { name: 'Созвон 45', durationMinutes: 45, description: 'Длинный' },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().durationMinutes, 45);

  const id = created.json().id;
  const updated = await app.inject({
    method: 'PUT',
    url: `/api/event-types/${id}`,
    ...auth,
    payload: { name: 'Созвон 90', durationMinutes: 90 },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().durationMinutes, 90);

  const removed = await app.inject({
    method: 'DELETE',
    url: `/api/event-types/${id}`,
    ...auth,
  });
  assert.equal(removed.statusCode, 204);
});

test('владелец: эндпоинты закрыты без сессии (401)', async () => {
  const app = build();
  for (const [method, url] of [
    ['GET', '/api/bookings'],
    ['DELETE', '/api/bookings/1'],
    ['GET', '/api/availability'],
    ['GET', '/api/event-types'],
  ]) {
    const res = await app.inject({ method, url });
    assert.equal(res.statusCode, 401, `${method} ${url}`);
  }
});

test('владелец: вход, список встреч, отмена освобождает слот', async () => {
  const app = build();
  const day = nextWorkday();
  const types = (
    await app.inject({ method: 'GET', url: `/api/public/${SLUG}/event-types` })
  ).json();
  const et = types[0];
  const slot = (
    await app.inject({
      method: 'GET',
      url: `/api/public/${SLUG}/slots?from=${day}&to=${day}&eventTypeId=${et.id}`,
    })
  ).json()[0];

  await app.inject({
    method: 'POST',
    url: `/api/public/${SLUG}/bookings`,
    payload: {
      eventTypeId: et.id,
      startsAt: slot.startsAt,
      guestName: 'Иван',
      guestEmail: 'ivan@example.com',
    },
  });

  const auth = await login(app);
  const list = await app.inject({ method: 'GET', url: '/api/bookings', ...auth });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().length, 1);

  const cancel = await app.inject({
    method: 'DELETE',
    url: `/api/bookings/${list.json()[0].id}`,
    ...auth,
  });
  assert.equal(cancel.statusCode, 204);

  const slotsAfter = await app.inject({
    method: 'GET',
    url: `/api/public/${SLUG}/slots?from=${day}&to=${day}&eventTypeId=${et.id}`,
  });
  assert.ok(slotsAfter.json().some((s) => s.startsAt === slot.startsAt));
});

test('ошибки: битый JSON — 400, а не 500', async () => {
  const app = build();
  const res = await app.inject({
    method: 'POST',
    url: `/api/public/${SLUG}/bookings`,
    headers: { 'content-type': 'application/json' },
    payload: '{"oops": ',
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, 'bad_request');
});

test('доступность: чтение и обновление, пересечения — 422', async () => {
  const app = build();
  const auth = await login(app);

  const current = await app.inject({ method: 'GET', url: '/api/availability', ...auth });
  assert.equal(current.statusCode, 200);
  assert.equal(current.json().timezone, TZ);

  const overlapping = await app.inject({
    method: 'PUT',
    url: '/api/availability',
    ...auth,
    payload: {
      timezone: TZ,
      rules: [
        { weekday: 1, startTime: '10:00', endTime: '14:00' },
        { weekday: 1, startTime: '13:00', endTime: '18:00' },
      ],
    },
  });
  assert.equal(overlapping.statusCode, 422);
});
