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
  assert.equal(list.json()[0].eventTypeName, et.name);

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
  assert.equal(current.json().bufferMinutes, 0);
  assert.deepEqual(current.json().exceptions, []);

  const overlapping = await app.inject({
    method: 'PUT',
    url: '/api/availability',
    ...auth,
    payload: {
      timezone: TZ,
      bufferMinutes: 0,
      exceptions: [],
      rules: [
        { weekday: 1, startTime: '10:00', endTime: '14:00' },
        { weekday: 1, startTime: '13:00', endTime: '18:00' },
      ],
    },
  });
  assert.equal(overlapping.statusCode, 422);
});

test('доступность: перерыв, буфер и праздник влияют на слоты', async () => {
  const app = build();
  const auth = await login(app);
  const day = nextWorkday();

  const weekday = ((dayjs.tz(day, TZ).day() + 6) % 7) + 1;

  await app.inject({
    method: 'PUT',
    url: '/api/availability',
    ...auth,
    payload: {
      timezone: TZ,
      bufferMinutes: 30,
      rules: [
        { weekday, startTime: '10:00', endTime: '13:00' },
        { weekday, startTime: '14:00', endTime: '18:00' },
      ],
      exceptions: [{ date: day, intervals: [] }],
    },
  });

  const types = (
    await app.inject({ method: 'GET', url: `/api/public/${SLUG}/event-types` })
  ).json();
  const et = types.find((t) => t.durationMinutes === 30);
  const holidaySlots = await app.inject({
    method: 'GET',
    url: `/api/public/${SLUG}/slots?from=${day}&to=${day}&eventTypeId=${et.id}`,
  });
  assert.deepEqual(holidaySlots.json(), []);

  // Снимаем праздник, оставляем перерыв и буфер
  await app.inject({
    method: 'PUT',
    url: '/api/availability',
    ...auth,
    payload: {
      timezone: TZ,
      bufferMinutes: 30,
      rules: [
        { weekday, startTime: '10:00', endTime: '13:00' },
        { weekday, startTime: '14:00', endTime: '18:00' },
      ],
      exceptions: [],
    },
  });

  const slots = (
    await app.inject({
      method: 'GET',
      url: `/api/public/${SLUG}/slots?from=${day}&to=${day}&eventTypeId=${et.id}`,
    })
  ).json();
  // 10–13 → 6 слотов, 14–18 → 8 слотов
  assert.equal(slots.length, 14);

  const first = slots[0];
  await app.inject({
    method: 'POST',
    url: `/api/public/${SLUG}/bookings`,
    payload: {
      eventTypeId: et.id,
      startsAt: first.startsAt,
      guestName: 'Иван',
      guestEmail: 'ivan@example.com',
    },
  });
  const after = (
    await app.inject({
      method: 'GET',
      url: `/api/public/${SLUG}/slots?from=${day}&to=${day}&eventTypeId=${et.id}`,
    })
  ).json();
  // Буфер 30 мин блокирует и соседний слот после встречи
  assert.ok(!after.some((s) => s.startsAt === first.startsAt));
  assert.ok(!after.some((s) => s.startsAt === slots[1].startsAt));
});

test('гость: отмена и перенос по manageToken', async () => {
  const app = build();
  const day = nextWorkday();
  const types = (
    await app.inject({ method: 'GET', url: `/api/public/${SLUG}/event-types` })
  ).json();
  const et = types[0];
  const slots = (
    await app.inject({
      method: 'GET',
      url: `/api/public/${SLUG}/slots?from=${day}&to=${day}&eventTypeId=${et.id}`,
    })
  ).json();

  const created = await app.inject({
    method: 'POST',
    url: `/api/public/${SLUG}/bookings`,
    payload: {
      eventTypeId: et.id,
      startsAt: slots[0].startsAt,
      guestName: 'Иван',
      guestEmail: 'ivan@example.com',
    },
  });
  assert.equal(created.statusCode, 201);
  const token = created.json().manageToken;
  assert.ok(token);

  const view = await app.inject({ method: 'GET', url: `/api/guest/bookings/${token}` });
  assert.equal(view.statusCode, 200);
  assert.equal(view.json().guestEmail, 'ivan@example.com');

  const moved = await app.inject({
    method: 'PATCH',
    url: `/api/guest/bookings/${token}`,
    payload: { startsAt: slots[2].startsAt },
  });
  assert.equal(moved.statusCode, 200);
  assert.equal(moved.json().startsAt, slots[2].startsAt);

  const cancelled = await app.inject({
    method: 'DELETE',
    url: `/api/guest/bookings/${token}`,
  });
  assert.equal(cancelled.statusCode, 204);

  const gone = await app.inject({ method: 'GET', url: `/api/guest/bookings/${token}` });
  assert.equal(gone.json().status, 'cancelled');
});

test('уведомления: чтение и сохранение настроек', async () => {
  const app = build();
  const auth = await login(app);
  const current = await app.inject({
    method: 'GET',
    url: '/api/notification-settings',
    ...auth,
  });
  assert.equal(current.statusCode, 200);
  assert.equal(current.json().emailEnabled, true);

  const updated = await app.inject({
    method: 'PUT',
    url: '/api/notification-settings',
    ...auth,
    payload: {
      emailEnabled: true,
      telegramChatId: '12345',
      reminderHoursBefore: 12,
    },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().telegramChatId, '12345');
  assert.equal(updated.json().reminderHoursBefore, 12);
});

test('P2: Pro paywall и активация кодом', async () => {
  const app = build();
  const auth = await login(app);

  const blocked = await app.inject({
    method: 'GET',
    url: '/api/calendar-connections',
    ...auth,
  });
  assert.equal(blocked.statusCode, 403);
  assert.equal(blocked.json().code, 'forbidden');

  const bad = await app.inject({
    method: 'POST',
    url: '/api/billing/activate-pro',
    ...auth,
    payload: { code: 'wrong' },
  });
  assert.equal(bad.statusCode, 422);

  const ok = await app.inject({
    method: 'POST',
    url: '/api/billing/activate-pro',
    ...auth,
    payload: { code: 'pro-dev' },
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().owner.plan, 'pro');

  const list = await app.inject({
    method: 'GET',
    url: '/api/calendar-connections',
    ...auth,
  });
  assert.equal(list.statusCode, 200);
  assert.deepEqual(list.json(), []);
});

test('P2: Google stub sync вычитает busy из слотов', async () => {
  const app = build();
  const auth = await login(app);
  await app.inject({
    method: 'POST',
    url: '/api/billing/activate-pro',
    ...auth,
    payload: { code: 'pro-dev' },
  });

  const start = await app.inject({
    method: 'POST',
    url: '/api/calendar-connections/google/start',
    ...auth,
  });
  assert.equal(start.statusCode, 200);
  assert.match(start.json().authUrl, /stub-connect/);

  const connect = await app.inject({
    method: 'GET',
    url: '/api/calendar-connections/google/stub-connect',
    ...auth,
  });
  assert.ok([302, 301].includes(connect.statusCode));

  const connections = await app.inject({
    method: 'GET',
    url: '/api/calendar-connections',
    ...auth,
  });
  assert.equal(connections.statusCode, 200);
  assert.equal(connections.json().length, 1);
  assert.equal(connections.json()[0].kind, 'google');
});

test('P2: организация и приглашение', async () => {
  const app = build();
  const auth = await login(app);
  await app.inject({
    method: 'POST',
    url: '/api/billing/activate-pro',
    ...auth,
    payload: { code: 'pro-dev' },
  });

  const created = await app.inject({
    method: 'POST',
    url: '/api/organizations',
    ...auth,
    payload: { name: 'Студия' },
  });
  assert.equal(created.statusCode, 201);
  const orgId = created.json().id;

  const invite = await app.inject({
    method: 'POST',
    url: `/api/organizations/${orgId}/invites`,
    ...auth,
    payload: { email: 'mate@example.com' },
  });
  assert.equal(invite.statusCode, 200);
  assert.ok(invite.json().token);

  const reg = await app.inject({
    method: 'POST',
    url: '/api/owners',
    payload: {
      name: 'Коллега',
      email: 'mate@example.com',
      password: 'secret1',
      slug: 'mate',
    },
  });
  assert.equal(reg.statusCode, 201);
  const mateCookie = reg.cookies.find((c) => c.name === 'session');

  const joined = await app.inject({
    method: 'POST',
    url: '/api/organizations/join',
    cookies: { session: mateCookie.value },
    payload: { token: invite.json().token },
  });
  assert.equal(joined.statusCode, 200);
  assert.equal(joined.json().id, orgId);

  const members = await app.inject({
    method: 'GET',
    url: `/api/organizations/${orgId}/members`,
    ...auth,
  });
  assert.equal(members.statusCode, 200);
  assert.equal(members.json().length, 2);
});

test('P2: платная встреча и stub-confirm', async () => {
  const app = build();
  const auth = await login(app);
  const types = await app.inject({ method: 'GET', url: '/api/event-types', ...auth });
  const et = types.json()[0];

  const priced = await app.inject({
    method: 'PUT',
    url: `/api/event-types/${et.id}`,
    ...auth,
    payload: {
      name: et.name,
      description: et.description,
      durationMinutes: et.durationMinutes,
      priceRub: 1500,
    },
  });
  assert.equal(priced.statusCode, 200);
  assert.equal(priced.json().priceRub, 1500);

  const from = nextWorkday();
  const slots = await app.inject({
    method: 'GET',
    url: `/api/public/kirill/slots?from=${from}&to=${from}&eventTypeId=${et.id}`,
  });
  assert.ok(slots.json().length > 0);
  const slot = slots.json()[0];

  const booked = await app.inject({
    method: 'POST',
    url: '/api/public/kirill/bookings',
    payload: {
      eventTypeId: et.id,
      startsAt: slot.startsAt,
      guestName: 'Плательщик',
      guestEmail: 'pay@example.com',
    },
  });
  assert.equal(booked.statusCode, 201);
  assert.equal(booked.json().paymentStatus, 'pending');
  assert.ok(booked.json().paymentUrl);

  const paymentId = Number(booked.json().paymentUrl.split('/').pop());
  const confirmed = await app.inject({
    method: 'POST',
    url: `/api/payments/${paymentId}/stub-confirm`,
  });
  assert.equal(confirmed.statusCode, 200);
  assert.equal(confirmed.json().status, 'paid');
});

test('P2: аналитика после активации Pro', async () => {
  const app = build();
  const auth = await login(app);
  await app.inject({
    method: 'POST',
    url: '/api/billing/activate-pro',
    ...auth,
    payload: { code: 'pro-dev' },
  });

  const summary = await app.inject({
    method: 'GET',
    url: '/api/analytics?from=2026-01-01&to=2026-12-31',
    ...auth,
  });
  assert.equal(summary.statusCode, 200);
  assert.ok(Number.isInteger(summary.json().created));
  assert.equal(summary.json().byWeekday.length, 7);
});
