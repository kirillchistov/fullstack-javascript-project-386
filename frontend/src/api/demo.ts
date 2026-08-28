import dayjs from 'dayjs';
import type { Availability, Booking, BookingCreate, EventType, Owner } from './client';

/**
 * Демо-бэкенд для GitHub Pages: реализует API-контракт прямо в браузере.
 * Слоты вычисляются из правил доступности (в часовом поясе браузера —
 * упрощение демо), брони и настройки сохраняются в localStorage.
 */

const STORAGE_KEY = 'call-calendar-demo-v4';

const OWNER: Owner = {
  id: 1,
  name: 'Кирилл Чистов',
  email: 'owner@example.com',
  slug: 'kirill',
  plan: 'free',
};

type DemoBooking = Booking & { manageToken: string };

type DemoState = {
  availability: Availability;
  eventTypes: EventType[];
  bookings: DemoBooking[];
  nextBookingId: number;
  nextEventTypeId: number;
  loggedIn: boolean;
  owners: Array<Owner & { password: string }>;
  notificationSettings: {
    emailEnabled: boolean;
    telegramChatId?: string;
    reminderHoursBefore: number;
  };
};

const defaultState = (): DemoState => ({
  availability: {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow',
    bufferMinutes: 0,
    rules: [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      startTime: '10:00',
      endTime: '18:00',
    })),
    exceptions: [],
  },
  eventTypes: [
    {
      id: 1,
      name: 'Вводный звонок',
      description: 'Знакомство и обсуждение задачи',
      durationMinutes: 30,
      priceRub: 0,
    },
    {
      id: 2,
      name: 'Консультация',
      description: 'Разбор вопросов по проекту',
      durationMinutes: 60,
      priceRub: 0,
    },
  ],
  bookings: [],
  nextBookingId: 1,
  nextEventTypeId: 3,
  loggedIn: false,
  owners: [{ ...OWNER, password: 'secret' }],
  notificationSettings: {
    emailEnabled: true,
    reminderHoursBefore: 24,
  },
});

function loadState(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      return {
        ...defaultState(),
        ...parsed,
        availability: {
          ...defaultState().availability,
          ...parsed.availability,
          bufferMinutes: parsed.availability?.bufferMinutes ?? 0,
          exceptions: parsed.availability?.exceptions ?? [],
        },
      };
    }
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

function findOwnerBySlug(slug: string) {
  return state.owners.find((o) => o.slug.toLowerCase() === slug.toLowerCase()) ?? null;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

function computeSlots(from: string, to: string, durationMinutes: number) {
  const slots: { startsAt: string; endsAt: string }[] = [];
  const now = dayjs();
  const booked = state.bookings
    .filter((b) => b.status === 'active')
    .map((b) => ({ start: dayjs(b.startsAt).valueOf(), end: dayjs(b.endsAt).valueOf() }));

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
      while (cursor.add(durationMinutes, 'minute').valueOf() <= end.valueOf()) {
        const startsAt = cursor;
        const endsAt = cursor.add(durationMinutes, 'minute');
        const conflict = booked.some((b) =>
          overlaps(startsAt.valueOf(), endsAt.valueOf(), b.start, b.end),
        );
        if (startsAt.isAfter(now) && !conflict) {
          slots.push({
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
          });
        }
        cursor = cursor.add(durationMinutes, 'minute');
      }
    }
  }
  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export async function demoFetch(input: Request): Promise<Response> {
  const url = new URL(input.url);
  const path = url.pathname;
  const method = input.method.toUpperCase();

  await new Promise((resolve) => setTimeout(resolve, 100));

  if (path === '/api/owners' && method === 'POST') {
    const body = (await input.json()) as {
      name: string;
      email: string;
      password: string;
      slug: string;
    };
    if (
      state.owners.some(
        (o) =>
          o.email.toLowerCase() === body.email.toLowerCase() ||
          o.slug.toLowerCase() === body.slug.toLowerCase(),
      )
    ) {
      return json({ code: 'already_exists', message: 'Email или slug уже заняты' }, 409);
    }
    const owner: Owner = {
      id: state.owners.length + 1,
      name: body.name,
      email: body.email,
      slug: body.slug,
      plan: 'free',
    };
    state.owners.push({ ...owner, password: body.password });
    state.loggedIn = true;
    // демо: один набор настроек на всех — упрощение
    save();
    return json({ owner }, 201);
  }

  const publicMatch = path.match(/^\/api\/public\/([^/]+)(.*)$/);
  if (publicMatch) {
    const slug = decodeURIComponent(publicMatch[1]);
    const rest = publicMatch[2] || '';
    const owner = findOwnerBySlug(slug);
    if (!owner) {
      return json({ code: 'not_found', message: 'Владелец не найден' }, 404);
    }

    if (rest === '' && method === 'GET') {
      return json({
        id: owner.id,
        name: owner.name,
        slug: owner.slug,
        timezone: state.availability.timezone,
      });
    }

    if (rest === '/event-types' && method === 'GET') {
      return json(state.eventTypes);
    }

    if (rest === '/slots' && method === 'GET') {
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const eventTypeId = Number(url.searchParams.get('eventTypeId'));
      if (!from || !to || !eventTypeId) {
        return json({ code: 'validation_error', message: 'Укажите from, to и eventTypeId' }, 422);
      }
      const et = state.eventTypes.find((t) => t.id === eventTypeId);
      if (!et) {
        return json({ code: 'validation_error', message: 'Неизвестный тип события' }, 422);
      }
      return json(computeSlots(from, to, et.durationMinutes));
    }

    if (rest === '/bookings' && method === 'POST') {
      const body = (await input.json()) as BookingCreate;
      const et = state.eventTypes.find((t) => t.id === body.eventTypeId);
      if (!et) {
        return json({ code: 'validation_error', message: 'Неизвестный тип события' }, 422);
      }
      const startsAt = dayjs(body.startsAt);
      const isFree =
        startsAt.isAfter(dayjs()) &&
        computeSlots(startsAt.format('YYYY-MM-DD'), startsAt.format('YYYY-MM-DD'), et.durationMinutes).some(
          (s) => dayjs(s.startsAt).valueOf() === startsAt.valueOf(),
        );
      if (!isFree) {
        return json(
          { code: 'slot_unavailable', message: 'Слот уже занят или находится в прошлом' },
          409,
        );
      }
      const booking: DemoBooking = {
        id: state.nextBookingId,
        eventTypeId: body.eventTypeId,
        startsAt: startsAt.toISOString(),
        endsAt: startsAt.add(et.durationMinutes, 'minute').toISOString(),
        guestName: body.guestName,
        guestEmail: body.guestEmail,
        comment: body.comment,
        status: 'active',
        paymentStatus: (et.priceRub ?? 0) > 0 ? 'pending' : 'none',
        createdAt: dayjs().toISOString(),
        manageToken: crypto.randomUUID(),
      };
      state.nextBookingId += 1;
      state.bookings.push(booking);
      save();
      return json(
        {
          ...booking,
          ...((et.priceRub ?? 0) > 0
            ? { paymentUrl: `/pay/stub/${booking.id}` }
            : {}),
        },
        201,
      );
    }
  }

  const guestMatch = path.match(/^\/api\/guest\/bookings\/([^/]+)$/);
  if (guestMatch) {
    const manageToken = decodeURIComponent(guestMatch[1]);
    const booking = state.bookings.find((b) => b.manageToken === manageToken);
    if (!booking) {
      return json({ code: 'not_found', message: 'Встреча не найдена' }, 404);
    }
    const et = state.eventTypes.find((t) => t.id === booking.eventTypeId);
    const guestView = () => ({
      id: booking.id,
      eventTypeName: et?.name ?? 'Встреча',
      durationMinutes: et?.durationMinutes ?? 30,
      ownerName: OWNER.name,
      ownerSlug: OWNER.slug,
      ownerTimezone: state.availability.timezone,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      comment: booking.comment,
      status: booking.status,
      paymentStatus: booking.paymentStatus ?? 'none',
    });

    if (method === 'GET') return json(guestView());
    if (method === 'DELETE') {
      booking.status = 'cancelled';
      save();
      return new Response(null, { status: 204 });
    }
    if (method === 'PATCH') {
      const body = (await input.json()) as { startsAt: string };
      const duration = et?.durationMinutes ?? 30;
      const start = dayjs(body.startsAt);
      booking.startsAt = start.toISOString();
      booking.endsAt = start.add(duration, 'minute').toISOString();
      save();
      return json(guestView());
    }
  }

  if (path === '/api/session' && method === 'POST') {
    const body = (await input.json()) as { email: string; password: string };
    const found = state.owners.find(
      (o) => o.email.toLowerCase() === body.email.toLowerCase() && o.password === body.password,
    );
    // демо: если не нашли — всё равно пускаем как сид
    state.loggedIn = true;
    save();
    return json({
      owner: found
        ? {
            id: found.id,
            name: found.name,
            email: found.email,
            slug: found.slug,
            plan: found.plan ?? 'free',
          }
        : OWNER,
    });
  }

  if (path === '/api/session' && method === 'GET') {
    const current = state.owners.find((o) => o.id === OWNER.id) ?? OWNER;
    return state.loggedIn
      ? json({
          owner: {
            id: current.id,
            name: current.name,
            email: current.email,
            slug: current.slug,
            plan: current.plan ?? 'free',
          },
        })
      : unauthorized();
  }

  if (path === '/api/session' && method === 'DELETE') {
    state.loggedIn = false;
    save();
    return new Response(null, { status: 204 });
  }

  if (path === '/api/event-types' && method === 'GET') {
    if (!state.loggedIn) return unauthorized();
    return json(state.eventTypes);
  }

  if (path === '/api/event-types' && method === 'POST') {
    if (!state.loggedIn) return unauthorized();
    const body = (await input.json()) as {
      name: string;
      description?: string;
      durationMinutes: number;
      priceRub?: number;
    };
    const et: EventType = {
      id: state.nextEventTypeId,
      name: body.name,
      description: body.description,
      durationMinutes: body.durationMinutes,
      priceRub: body.priceRub ?? 0,
    };
    state.nextEventTypeId += 1;
    state.eventTypes.push(et);
    save();
    return json(et, 201);
  }

  const etMatch = path.match(/^\/api\/event-types\/(\d+)$/);
  if (etMatch && method === 'DELETE') {
    if (!state.loggedIn) return unauthorized();
    const id = Number(etMatch[1]);
    state.eventTypes = state.eventTypes.filter((t) => t.id !== id);
    save();
    return new Response(null, { status: 204 });
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

  if (path === '/api/notification-settings' && method === 'GET') {
    if (!state.loggedIn) return unauthorized();
    return json(state.notificationSettings);
  }

  if (path === '/api/notification-settings' && method === 'PUT') {
    if (!state.loggedIn) return unauthorized();
    state.notificationSettings = (await input.json()) as DemoState['notificationSettings'];
    save();
    return json(state.notificationSettings);
  }

  if (path === '/api/billing/activate-pro' && method === 'POST') {
    if (!state.loggedIn) return unauthorized();
    const seed = state.owners.find((o) => o.id === OWNER.id);
    if (seed) seed.plan = 'pro';
    OWNER.plan = 'pro';
    save();
    return json({ owner: { ...OWNER, plan: 'pro' } });
  }

  const currentPlan = () =>
    state.owners.find((o) => o.id === OWNER.id)?.plan ?? OWNER.plan ?? 'free';

  if (
    path.startsWith('/api/calendar-connections') ||
    path.startsWith('/api/booking-series') ||
    path.startsWith('/api/analytics')
  ) {
    if (!state.loggedIn) return unauthorized();
    if (currentPlan() !== 'pro') {
      return json(
        { code: 'forbidden', message: 'Функция доступна на тарифе Pro' },
        403,
      );
    }
    if (path === '/api/calendar-connections' && method === 'GET') return json([]);
    if (path === '/api/booking-series' && method === 'GET') return json([]);
    if (path === '/api/analytics' && method === 'GET') {
      return json({
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
        created: state.bookings.length,
        cancelled: state.bookings.filter((b) => b.status === 'cancelled').length,
        upcoming: state.bookings.filter(
          (b) => b.status === 'active' && dayjs(b.startsAt).isAfter(dayjs()),
        ).length,
        byWeekday: [0, 0, 0, 0, 0, 0, 0],
      });
    }
    return json({ code: 'not_found', message: 'Демо: эндпоинт не реализован' }, 404);
  }

  if (path === '/api/organizations' && method === 'GET') {
    if (!state.loggedIn) return unauthorized();
    return json([]);
  }

  return json({ code: 'not_found', message: 'Неизвестный маршрут' }, 404);
}
