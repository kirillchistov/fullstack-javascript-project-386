import dayjs from 'dayjs';
import type { Availability, Booking, BookingCreate, EventType } from './client';

/**
 * Демо-бэкенд для GitHub Pages: реализует API-контракт прямо в браузере.
 * Слоты вычисляются из правил доступности (в часовом поясе браузера —
 * упрощение демо), брони и настройки сохраняются в localStorage.
 */

const STORAGE_KEY = 'call-calendar-demo';

const OWNER = { id: 1, name: 'Кирилл Чистов', email: 'owner@example.com' };

const EVENT_TYPES: EventType[] = [
  {
    id: 1,
    name: 'Вводный звонок',
    description: 'Знакомство и обсуждение задачи',
    durationMinutes: 30,
  },
  {
    id: 2,
    name: 'Консультация',
    description: 'Разбор вопросов по проекту',
    durationMinutes: 30,
  },
];

type DemoState = {
  availability: Availability;
  bookings: Booking[];
  nextBookingId: number;
  loggedIn: boolean;
};

const defaultState = (): DemoState => ({
  availability: {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow',
    rules: [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      startTime: '10:00',
      endTime: '18:00',
    })),
  },
  bookings: [],
  nextBookingId: 1,
  loggedIn: false,
});

function loadState(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultState(), ...(JSON.parse(raw) as DemoState) };
  } catch {
    // повреждённое состояние — начинаем заново
  }
  return defaultState();
}

let state = loadState();

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const unauthorized = () =>
  json({ code: 'unauthorized', message: 'Требуется вход владельца' }, 401);

function computeSlots(from: string, to: string) {
  const slots: { startsAt: string; endsAt: string }[] = [];
  const now = dayjs();
  const bookedStarts = new Set(
    state.bookings
      .filter((b) => b.status === 'active')
      .map((b) => dayjs(b.startsAt).valueOf()),
  );

  for (
    let day = dayjs(from);
    !day.isAfter(dayjs(to), 'day');
    day = day.add(1, 'day')
  ) {
    const isoWeekday = ((day.day() + 6) % 7) + 1;
    for (const rule of state.availability.rules) {
      if (rule.weekday !== isoWeekday) continue;
      let cursor = dayjs(`${day.format('YYYY-MM-DD')}T${rule.startTime}`);
      const end = dayjs(`${day.format('YYYY-MM-DD')}T${rule.endTime}`);
      while (cursor.add(30, 'minute').valueOf() <= end.valueOf()) {
        const startsAt = cursor;
        if (startsAt.isAfter(now) && !bookedStarts.has(startsAt.valueOf())) {
          slots.push({
            startsAt: startsAt.toISOString(),
            endsAt: startsAt.add(30, 'minute').toISOString(),
          });
        }
        cursor = cursor.add(30, 'minute');
      }
    }
  }
  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export async function demoFetch(input: Request): Promise<Response> {
  const url = new URL(input.url);
  const path = url.pathname;
  const method = input.method.toUpperCase();

  // Небольшая задержка, чтобы были видны состояния загрузки
  await new Promise((resolve) => setTimeout(resolve, 150));

  if (path === '/api/event-types' && method === 'GET') {
    return json(EVENT_TYPES);
  }

  if (path === '/api/slots' && method === 'GET') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (!from || !to) {
      return json({ code: 'validation_error', message: 'Укажите период from/to' }, 422);
    }
    return json(computeSlots(from, to));
  }

  if (path === '/api/bookings' && method === 'POST') {
    const body = (await input.json()) as BookingCreate;
    const startsAt = dayjs(body.startsAt);
    const isFree =
      startsAt.isAfter(dayjs()) &&
      computeSlots(startsAt.format('YYYY-MM-DD'), startsAt.format('YYYY-MM-DD')).some(
        (s) => dayjs(s.startsAt).valueOf() === startsAt.valueOf(),
      );
    if (!isFree) {
      return json(
        { code: 'slot_unavailable', message: 'Слот уже занят или находится в прошлом' },
        409,
      );
    }
    const booking: Booking = {
      id: state.nextBookingId,
      eventTypeId: body.eventTypeId,
      startsAt: startsAt.toISOString(),
      endsAt: startsAt.add(30, 'minute').toISOString(),
      guestName: body.guestName,
      guestEmail: body.guestEmail,
      comment: body.comment,
      status: 'active',
      createdAt: dayjs().toISOString(),
    };
    state.nextBookingId += 1;
    state.bookings.push(booking);
    save();
    return json(booking, 201);
  }

  if (path === '/api/bookings' && method === 'GET') {
    if (!state.loggedIn) return unauthorized();
    const upcoming = state.bookings
      .filter((b) => b.status === 'active' && dayjs(b.startsAt).isAfter(dayjs()))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return json(upcoming);
  }

  const cancelMatch = path.match(/^\/api\/bookings\/(\d+)$/);
  if (cancelMatch && method === 'DELETE') {
    if (!state.loggedIn) return unauthorized();
    const id = Number(cancelMatch[1]);
    const booking = state.bookings.find((b) => b.id === id && b.status === 'active');
    if (!booking) {
      return json({ code: 'not_found', message: 'Встреча не найдена' }, 404);
    }
    booking.status = 'cancelled';
    save();
    return new Response(null, { status: 204 });
  }

  if (path === '/api/session' && method === 'POST') {
    // Демо: подходят любые email и пароль
    state.loggedIn = true;
    save();
    return json({ owner: OWNER });
  }

  if (path === '/api/session' && method === 'GET') {
    return state.loggedIn ? json({ owner: OWNER }) : unauthorized();
  }

  if (path === '/api/session' && method === 'DELETE') {
    state.loggedIn = false;
    save();
    return new Response(null, { status: 204 });
  }

  if (path === '/api/availability' && method === 'GET') {
    if (!state.loggedIn) return unauthorized();
    return json(state.availability);
  }

  if (path === '/api/availability' && method === 'PUT') {
    if (!state.loggedIn) return unauthorized();
    state.availability = (await input.json()) as Availability;
    save();
    return json(state.availability);
  }

  return json({ code: 'not_found', message: 'Неизвестный маршрут' }, 404);
}
