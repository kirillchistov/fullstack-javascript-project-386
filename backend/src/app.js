import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import addFormats from 'ajv-formats';
import dayjs from 'dayjs';
import { componentSchemas, ref } from './contract.js';
import { openDatabase } from './db.js';
import { createStore } from './store.js';
import {
  computeFreeSlots,
  isFreeSlot,
  validateAvailability,
  validateDurationMinutes,
} from './slots.js';
import { notifyBookingEvent } from './notifications.js';
import { fetchIcsBusy } from './ics.js';
import { createPaymentConfirmation, isValidProCode } from './payments.js';

const SESSION_COOKIE = 'session';

function publicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
}

function slotBusyArgs(store, ownerId) {
  const availability = store.getAvailability(ownerId);
  const activeBookings = store.getActiveBookings(ownerId);
  const fromIso = new Date().toISOString();
  const toIso = new Date(Date.now() + 16 * 86400000).toISOString();
  const externalBusy = store.getBusyBlocks(ownerId, fromIso, toIso);
  return { availability, activeBookings, externalBusy };
}

function publicGuestBooking(view) {
  if (!view) return null;
  const {
    _ownerId: _o,
    _eventTypeId: _e,
    _manageToken: _t,
    ...rest
  } = view;
  return rest;
}

async function notifyForOwnerBooking(store, owner, bookingRow, kind) {
  const eventType = store.findEventType(owner.id, bookingRow.eventTypeId ?? bookingRow.event_type_id);
  if (!eventType) return;
  const availability = store.getAvailability(owner.id);
  const settings = store.getNotificationSettings(owner.id);
  await notifyBookingEvent({
    kind,
    booking: {
      startsAt: bookingRow.startsAt ?? bookingRow.starts_at,
      endsAt: bookingRow.endsAt ?? bookingRow.ends_at,
      guestName: bookingRow.guestName ?? bookingRow.guest_name,
      guestEmail: bookingRow.guestEmail ?? bookingRow.guest_email,
      comment: bookingRow.comment,
      manageToken: bookingRow.manageToken ?? bookingRow.manage_token,
    },
    owner,
    eventType,
    availability,
    settings,
  });
}

/**
 * @param {{ logger?: boolean | object, databasePath?: string }} [options]
 */
export function buildApp({ logger = false, databasePath } = {}) {
  const app = Fastify({
    logger,
    ajv: {
      plugins: [addFormats],
    },
  });

  app.register(cookie);

  const staticDir = process.env.STATIC_DIR;
  if (staticDir && fs.existsSync(staticDir)) {
    app.register(fastifyStatic, { root: path.resolve(staticDir) });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ code: 'not_found', message: 'Маршрут не найден' });
    });
  }

  const db = openDatabase(databasePath ?? process.env.DATABASE_PATH);
  const store = createStore(db);
  app.decorate('store', store);
  app.addHook('onClose', async () => {
    store.close();
  });

  for (const schema of componentSchemas()) {
    app.addSchema(schema);
  }

  const unauthorized = (reply) =>
    reply.code(401).send({ code: 'unauthorized', message: 'Требуется вход владельца' });

  const requireOwner = (request, reply, done) => {
    const owner = store.getSessionOwner(request.cookies[SESSION_COOKIE]);
    if (!owner) {
      unauthorized(reply);
      return;
    }
    request.owner = owner;
    done();
  };

  const forbiddenPro = (reply) =>
    reply.code(403).send({
      code: 'forbidden',
      message: 'Функция доступна на тарифе Pro. Активируйте Pro в разделе Биллинг.',
    });

  const requirePro = (request, reply, done) => {
    if (request.owner?.plan !== 'pro') {
      forbiddenPro(reply);
      return;
    }
    done();
  };

  const setSessionCookie = (reply, token) => {
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    });
  };

  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      reply.code(422).send({
        code: 'validation_error',
        message: 'Некорректные данные запроса',
        errors: error.validation.map((v) => ({
          field: v.instancePath.replace(/^\//, '') || String(v.params.missingProperty ?? ''),
          message: v.message ?? 'invalid',
        })),
      });
      return;
    }

    const statusCode =
      Number.isInteger(error.statusCode) && error.statusCode >= 400 ? error.statusCode : 500;

    if (statusCode >= 500) {
      request.log?.error?.(error);
      reply.code(500).send({ code: 'internal_error', message: 'Внутренняя ошибка сервера' });
      return;
    }

    reply.code(statusCode).send({
      code: 'bad_request',
      message: error.message || 'Некорректный запрос',
    });
  });

  // --- Регистрация --------------------------------------------------------

  app.post('/api/owners', { schema: { body: ref('OwnerCreate') } }, (request, reply) => {
    try {
      const owner = store.createOwner(request.body);
      const token = store.createSession(owner.id);
      setSessionCookie(reply, token);
      return reply.code(201).send({ owner });
    } catch (error) {
      if (error.code === 'already_exists') {
        return reply.code(409).send({
          code: 'already_exists',
          message: error.message || 'Email или slug уже заняты',
        });
      }
      throw error;
    }
  });

  // --- Сессия -------------------------------------------------------------

  app.post('/api/session', { schema: { body: ref('SessionCreate') } }, (request, reply) => {
    const owner = store.checkCredentials(request.body.email, request.body.password);
    if (!owner) {
      return reply
        .code(401)
        .send({ code: 'unauthorized', message: 'Неверный email или пароль' });
    }
    const token = store.createSession(owner.id);
    setSessionCookie(reply, token);
    return { owner };
  });

  app.get('/api/session', (request, reply) => {
    const owner = store.getSessionOwner(request.cookies[SESSION_COOKIE]);
    if (!owner) return unauthorized(reply);
    return { owner };
  });

  app.delete('/api/session', (request, reply) => {
    store.destroySession(request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    reply.code(204).send();
  });

  // --- Публичные эндпоинты гостя ------------------------------------------

  app.get('/api/public/:slug', (request, reply) => {
    const profile = store.getOwnerPublic(request.params.slug);
    if (!profile) {
      return reply.code(404).send({ code: 'not_found', message: 'Владелец не найден' });
    }
    return profile;
  });

  app.get('/api/public/:slug/event-types', (request, reply) => {
    const owner = store.findOwnerBySlug(request.params.slug);
    if (!owner) {
      return reply.code(404).send({ code: 'not_found', message: 'Владелец не найден' });
    }
    return store.listEventTypes(owner.id);
  });

  app.get(
    '/api/public/:slug/slots',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['from', 'to', 'eventTypeId'],
          properties: {
            from: { type: 'string', format: 'date' },
            to: { type: 'string', format: 'date' },
            eventTypeId: { type: 'integer' },
          },
        },
      },
    },
    (request, reply) => {
      const owner = store.findOwnerBySlug(request.params.slug);
      if (!owner) {
        return reply.code(404).send({ code: 'not_found', message: 'Владелец не найден' });
      }
      const { from, to, eventTypeId } = request.query;
      if (dayjs(to).isBefore(dayjs(from))) {
        return reply.code(422).send({
          code: 'validation_error',
          message: 'Начало периода (from) не может быть позже конца (to)',
        });
      }
      const eventType = store.findEventType(owner.id, Number(eventTypeId));
      if (!eventType) {
        return reply.code(422).send({
          code: 'validation_error',
          message: 'Неизвестный тип события',
          errors: [{ field: 'eventTypeId', message: 'Тип события не найден' }],
        });
      }
      return computeFreeSlots({
        ...slotBusyArgs(store, owner.id),
        from,
        to,
        durationMinutes: eventType.durationMinutes,
      });
    },
  );

  app.post(
    '/api/public/:slug/bookings',
    { schema: { body: ref('BookingCreate') } },
    async (request, reply) => {
      const owner = store.findOwnerBySlug(request.params.slug);
      if (!owner) {
        return reply.code(404).send({ code: 'not_found', message: 'Владелец не найден' });
      }
      const { eventTypeId, startsAt, guestName, guestEmail, comment } = request.body;
      const eventType = store.findEventType(owner.id, eventTypeId);
      if (!eventType) {
        return reply.code(422).send({
          code: 'validation_error',
          message: 'Неизвестный тип события',
          errors: [{ field: 'eventTypeId', message: 'Тип события не найден' }],
        });
      }

      const free = isFreeSlot({
        ...slotBusyArgs(store, owner.id),
        startsAt,
        durationMinutes: eventType.durationMinutes,
      });
      if (!free) {
        return reply.code(409).send({
          code: 'slot_unavailable',
          message: 'Слот уже занят, находится в прошлом или вне расписания',
        });
      }

      const start = dayjs(startsAt);
      const priceRub = eventType.priceRub ?? 0;
      const paymentStatus = priceRub > 0 ? 'pending' : 'none';
      const booking = store.createBooking(owner.id, {
        eventTypeId,
        startsAt: start.toISOString(),
        endsAt: start.add(eventType.durationMinutes, 'minute').toISOString(),
        guestName,
        guestEmail,
        ...(comment !== undefined && { comment }),
        paymentStatus,
      });

      let paymentUrl;
      if (priceRub > 0) {
        const draft = store.createPaymentRecord({
          bookingId: booking.id,
          amountRub: priceRub,
          status: 'pending',
          provider: 'pending',
          confirmationUrl: `${publicBaseUrl()}/pay/pending`,
        });
        const conf = await createPaymentConfirmation({
          paymentId: draft.id,
          amountRub: priceRub,
          description: `${eventType.name} — ${owner.name}`,
        });
        const payment = store.updatePaymentDetails(draft.id, {
          provider: conf.provider,
          providerPaymentId: conf.providerPaymentId,
          confirmationUrl: conf.confirmationUrl,
          status: 'pending',
        });
        paymentUrl = payment.confirmationUrl;
      }

      await notifyForOwnerBooking(store, owner, booking, 'created');
      return reply.code(201).send({
        ...booking,
        ...(paymentUrl ? { paymentUrl } : {}),
      });
    },
  );

  // --- Гость: управление по секретному токену -----------------------------

  app.get('/api/guest/bookings/:token', (request, reply) => {
    const view = store.getGuestBooking(request.params.token);
    if (!view) {
      return reply.code(404).send({ code: 'not_found', message: 'Встреча не найдена' });
    }
    return publicGuestBooking(view);
  });

  app.delete('/api/guest/bookings/:token', async (request, reply) => {
    const before = store.getGuestBooking(request.params.token);
    if (!before || before.status !== 'active') {
      return reply.code(404).send({ code: 'not_found', message: 'Встреча не найдена' });
    }
    const cancelled = store.cancelBookingByToken(request.params.token);
    const owner = store.findOwnerById(before._ownerId);
    if (owner && cancelled) {
      await notifyForOwnerBooking(
        store,
        owner,
        {
          ...cancelled,
          manageToken: cancelled.manage_token,
          eventTypeId: cancelled.event_type_id,
        },
        'cancelled',
      );
    }
    reply.code(204).send();
  });

  app.patch(
    '/api/guest/bookings/:token',
    { schema: { body: ref('BookingReschedule') } },
    async (request, reply) => {
      const current = store.getGuestBooking(request.params.token);
      if (!current || current.status !== 'active') {
        return reply.code(404).send({ code: 'not_found', message: 'Встреча не найдена' });
      }
      const owner = store.findOwnerById(current._ownerId);
      const eventType = store.findEventType(current._ownerId, current._eventTypeId);
      if (!owner || !eventType) {
        return reply.code(404).send({ code: 'not_found', message: 'Встреча не найдена' });
      }

      const { startsAt } = request.body;
      const free = isFreeSlot({
        ...slotBusyArgs(store, owner.id),
        activeBookings: store.getActiveBookingsExcept(owner.id, current.id),
        startsAt,
        durationMinutes: eventType.durationMinutes,
      });
      if (!free) {
        return reply.code(409).send({
          code: 'slot_unavailable',
          message: 'Слот уже занят, находится в прошлом или вне расписания',
        });
      }

      const start = dayjs(startsAt);
      const updated = store.rescheduleBookingByToken(request.params.token, {
        startsAt: start.toISOString(),
        endsAt: start.add(eventType.durationMinutes, 'minute').toISOString(),
      });
      await notifyForOwnerBooking(
        store,
        owner,
        {
          startsAt: updated.startsAt,
          endsAt: updated.endsAt,
          guestName: updated.guestName,
          guestEmail: updated.guestEmail,
          comment: updated.comment,
          manageToken: updated._manageToken,
          eventTypeId: current._eventTypeId,
        },
        'rescheduled',
      );
      return publicGuestBooking(updated);
    },
  );

  // --- Типы событий владельца ----------------------------------------------

  app.get('/api/event-types', { preHandler: requireOwner }, (request) =>
    store.listEventTypes(request.owner.id),
  );

  app.post(
    '/api/event-types',
    { preHandler: requireOwner, schema: { body: ref('EventTypeWrite') } },
    (request, reply) => {
      const durationError = validateDurationMinutes(request.body.durationMinutes);
      if (durationError) {
        return reply.code(422).send({
          code: 'validation_error',
          message: durationError,
          errors: [{ field: 'durationMinutes', message: durationError }],
        });
      }
      const eventType = store.createEventType(request.owner.id, request.body);
      return reply.code(201).send(eventType);
    },
  );

  app.put(
    '/api/event-types/:id',
    {
      preHandler: requireOwner,
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'integer' } },
        },
        body: ref('EventTypeWrite'),
      },
    },
    (request, reply) => {
      const durationError = validateDurationMinutes(request.body.durationMinutes);
      if (durationError) {
        return reply.code(422).send({
          code: 'validation_error',
          message: durationError,
          errors: [{ field: 'durationMinutes', message: durationError }],
        });
      }
      const eventType = store.updateEventType(request.owner.id, request.params.id, request.body);
      if (!eventType) {
        return reply.code(404).send({ code: 'not_found', message: 'Тип события не найден' });
      }
      return eventType;
    },
  );

  app.delete(
    '/api/event-types/:id',
    {
      preHandler: requireOwner,
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'integer' } },
        },
      },
    },
    (request, reply) => {
      try {
        const ok = store.deleteEventType(request.owner.id, request.params.id);
        if (!ok) {
          return reply.code(404).send({ code: 'not_found', message: 'Тип события не найден' });
        }
        reply.code(204).send();
      } catch (error) {
        if (error.code === 'validation_error') {
          return reply.code(422).send({
            code: 'validation_error',
            message: error.message,
          });
        }
        throw error;
      }
    },
  );

  // --- Бронирования владельца ---------------------------------------------

  app.get('/api/bookings', { preHandler: requireOwner }, (request) => {
    const now = dayjs();
    return store
      .getActiveBookings(request.owner.id)
      .filter((b) => dayjs(b.startsAt).isAfter(now))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  });

  app.delete(
    '/api/bookings/:id',
    {
      preHandler: requireOwner,
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'integer' } },
        },
      },
    },
    async (request, reply) => {
      const cancelled = store.cancelBooking(request.owner.id, request.params.id);
      if (!cancelled) {
        return reply.code(404).send({ code: 'not_found', message: 'Встреча не найдена' });
      }
      await notifyForOwnerBooking(store, request.owner, cancelled, 'cancelled');
      reply.code(204).send();
    },
  );

  // --- Доступность --------------------------------------------------------

  app.get('/api/availability', { preHandler: requireOwner }, (request) =>
    store.getAvailability(request.owner.id),
  );

  app.put(
    '/api/availability',
    { preHandler: requireOwner, schema: { body: ref('Availability') } },
    (request, reply) => {
      const errors = validateAvailability(request.body);
      if (errors.length > 0) {
        return reply.code(422).send({
          code: 'validation_error',
          message: 'Некорректные правила доступности',
          errors,
        });
      }
      return store.setAvailability(request.owner.id, request.body);
    },
  );

  // --- Уведомления --------------------------------------------------------

  app.get('/api/notification-settings', { preHandler: requireOwner }, (request) =>
    store.getNotificationSettings(request.owner.id),
  );

  app.put(
    '/api/notification-settings',
    { preHandler: requireOwner, schema: { body: ref('NotificationSettings') } },
    (request, reply) => {
      const { reminderHoursBefore } = request.body;
      if (
        !Number.isInteger(reminderHoursBefore) ||
        reminderHoursBefore < 1 ||
        reminderHoursBefore > 168
      ) {
        return reply.code(422).send({
          code: 'validation_error',
          message: 'reminderHoursBefore: целое число от 1 до 168',
          errors: [{ field: 'reminderHoursBefore', message: '1–168 часов' }],
        });
      }
      return store.setNotificationSettings(request.owner.id, request.body);
    },
  );

  // --- P2: биллинг --------------------------------------------------------

  app.post(
    '/api/billing/activate-pro',
    { preHandler: requireOwner, schema: { body: ref('ActivatePro') } },
    (request, reply) => {
      if (!isValidProCode(request.body.code)) {
        return reply.code(422).send({
          code: 'validation_error',
          message: 'Неверный код активации Pro',
          errors: [{ field: 'code', message: 'Неверный код' }],
        });
      }
      const owner = store.setOwnerPlan(request.owner.id, 'pro');
      return { owner };
    },
  );

  // --- P2: calendar connections -------------------------------------------

  app.get(
    '/api/calendar-connections',
    { preHandler: [requireOwner, requirePro] },
    (request) => store.listCalendarConnections(request.owner.id),
  );

  app.post(
    '/api/calendar-connections/ics',
    {
      preHandler: [requireOwner, requirePro],
      schema: { body: ref('IcsConnectionCreate') },
    },
    async (request, reply) => {
      const { url, label } = request.body;
      try {
        new URL(url);
      } catch {
        return reply.code(422).send({
          code: 'validation_error',
          message: 'Некорректный URL ICS',
          errors: [{ field: 'url', message: 'Ожидается http(s) URL' }],
        });
      }
      const connection = store.createCalendarConnection(request.owner.id, {
        kind: 'ics',
        label,
        config: { url },
      });
      try {
        const busy = await fetchIcsBusy(url);
        store.replaceBusyBlocks(request.owner.id, connection.id, busy);
      } catch (error) {
        store.deleteCalendarConnection(request.owner.id, connection.id);
        return reply.code(422).send({
          code: 'validation_error',
          message: error.message || 'Не удалось загрузить ICS',
        });
      }
      return reply
        .code(201)
        .send(store.findCalendarConnection(request.owner.id, connection.id));
    },
  );

  app.post(
    '/api/calendar-connections/google/start',
    { preHandler: [requireOwner, requirePro] },
    (request) => {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        return {
          authUrl: `${publicBaseUrl()}/api/calendar-connections/google/stub-connect`,
        };
      }
      const redirectUri =
        process.env.GOOGLE_REDIRECT_URI ??
        `${publicBaseUrl()}/api/calendar-connections/google/callback`;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/calendar.freebusy',
        access_type: 'offline',
        prompt: 'consent',
        state: String(request.owner.id),
      });
      return {
        authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      };
    },
  );

  app.get(
    '/api/calendar-connections/google/stub-connect',
    { preHandler: [requireOwner, requirePro] },
    (request, reply) => {
      const existing = store
        .listCalendarConnections(request.owner.id)
        .find((c) => c.kind === 'google');
      if (!existing) {
        const connection = store.createCalendarConnection(request.owner.id, {
          kind: 'google',
          label: 'Google Calendar (stub)',
          config: { mode: 'stub' },
        });
        // Демо-занятость: ближайший будний 12:00–13:00 UTC+0 на 7 дней
        const blocks = [];
        for (let i = 1; i <= 7; i += 1) {
          const day = dayjs().add(i, 'day').startOf('day').add(12, 'hour');
          if (day.day() === 0 || day.day() === 6) continue;
          blocks.push({
            startsAt: day.toISOString(),
            endsAt: day.add(1, 'hour').toISOString(),
          });
        }
        store.replaceBusyBlocks(request.owner.id, connection.id, blocks);
      }
      const frontend = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
      return reply.redirect(`${frontend}/admin/calendars?connected=1`);
    },
  );

  app.post(
    '/api/calendar-connections/:id/sync',
    {
      preHandler: [requireOwner, requirePro],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'integer' } },
        },
      },
    },
    async (request, reply) => {
      const row = store.getCalendarConnectionRow(request.owner.id, request.params.id);
      if (!row) {
        return reply.code(404).send({ code: 'not_found', message: 'Подключение не найдено' });
      }
      const config = JSON.parse(row.config_json || '{}');
      if (row.kind === 'ics') {
        try {
          const busy = await fetchIcsBusy(config.url);
          return store.replaceBusyBlocks(request.owner.id, row.id, busy);
        } catch (error) {
          return reply.code(422).send({
            code: 'validation_error',
            message: error.message || 'Ошибка sync ICS',
          });
        }
      }
      // Google stub: оставляем/обновляем демо-блоки
      if (config.mode === 'stub' || !process.env.GOOGLE_CLIENT_ID) {
        const blocks = [];
        for (let i = 1; i <= 7; i += 1) {
          const day = dayjs().add(i, 'day').startOf('day').add(12, 'hour');
          if (day.day() === 0 || day.day() === 6) continue;
          blocks.push({
            startsAt: day.toISOString(),
            endsAt: day.add(1, 'hour').toISOString(),
          });
        }
        return store.replaceBusyBlocks(request.owner.id, row.id, blocks);
      }
      return reply.code(422).send({
        code: 'validation_error',
        message: 'Google FreeBusy требует refresh token (полный OAuth callback)',
      });
    },
  );

  app.delete(
    '/api/calendar-connections/:id',
    {
      preHandler: [requireOwner, requirePro],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'integer' } },
        },
      },
    },
    (request, reply) => {
      const ok = store.deleteCalendarConnection(request.owner.id, request.params.id);
      if (!ok) {
        return reply.code(404).send({ code: 'not_found', message: 'Подключение не найдено' });
      }
      reply.code(204).send();
    },
  );

  // --- P2: organizations --------------------------------------------------

  app.get('/api/organizations', { preHandler: requireOwner }, (request) =>
    store.listOrganizationsForOwner(request.owner.id),
  );

  app.post(
    '/api/organizations',
    {
      preHandler: [requireOwner, requirePro],
      schema: { body: ref('OrganizationCreate') },
    },
    (request, reply) => {
      const org = store.createOrganization(request.owner.id, request.body.name);
      return reply.code(201).send(org);
    },
  );

  app.get(
    '/api/organizations/:id/members',
    {
      preHandler: [requireOwner, requirePro],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'integer' } },
        },
      },
    },
    (request, reply) => {
      const org = store.findOrganization(request.params.id);
      if (!org || !store.isOrgMember(org.id, request.owner.id)) {
        return reply.code(404).send({ code: 'not_found', message: 'Организация не найдена' });
      }
      return store.listOrganizationMembers(org.id);
    },
  );

  app.post(
    '/api/organizations/:id/invites',
    {
      preHandler: [requireOwner, requirePro],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'integer' } },
        },
        body: ref('OrganizationInviteCreate'),
      },
    },
    (request, reply) => {
      const org = store.findOrganization(request.params.id);
      if (!org || org.ownerId !== request.owner.id) {
        return reply.code(404).send({ code: 'not_found', message: 'Организация не найдена' });
      }
      return store.createOrganizationInvite(org.id, request.body.email);
    },
  );

  app.post(
    '/api/organizations/join',
    { preHandler: requireOwner, schema: { body: ref('OrganizationJoin') } },
    (request, reply) => {
      try {
        return store.joinOrganization(request.owner, request.body.token);
      } catch (error) {
        if (error.code === 'not_found') {
          return reply.code(404).send({ code: 'not_found', message: error.message });
        }
        if (error.code === 'validation_error') {
          return reply.code(422).send({
            code: 'validation_error',
            message: error.message,
          });
        }
        throw error;
      }
    },
  );

  // --- P2: booking series -------------------------------------------------

  app.get(
    '/api/booking-series',
    { preHandler: [requireOwner, requirePro] },
    (request) => store.listBookingSeries(request.owner.id),
  );

  app.post(
    '/api/booking-series',
    {
      preHandler: [requireOwner, requirePro],
      schema: { body: ref('BookingSeriesCreate') },
    },
    (request, reply) => {
      const { eventTypeId, guestName, guestEmail, comment, startsAt, count } = request.body;
      const eventType = store.findEventType(request.owner.id, eventTypeId);
      if (!eventType) {
        return reply.code(422).send({
          code: 'validation_error',
          message: 'Неизвестный тип события',
          errors: [{ field: 'eventTypeId', message: 'Тип события не найден' }],
        });
      }

      const starts = [];
      for (let i = 0; i < count; i += 1) {
        starts.push(dayjs(startsAt).add(i, 'week'));
      }

      const busyBase = slotBusyArgs(store, request.owner.id);
      for (const start of starts) {
        const free = isFreeSlot({
          ...busyBase,
          startsAt: start.toISOString(),
          durationMinutes: eventType.durationMinutes,
        });
        if (!free) {
          return reply.code(409).send({
            code: 'slot_unavailable',
            message: `Слот ${start.toISOString()} недоступен для серии`,
          });
        }
      }

      // Проверяем пересечения внутри серии
      for (let i = 0; i < starts.length; i += 1) {
        for (let j = i + 1; j < starts.length; j += 1) {
          const a0 = starts[i].valueOf();
          const a1 = starts[i].add(eventType.durationMinutes, 'minute').valueOf();
          const b0 = starts[j].valueOf();
          const b1 = starts[j].add(eventType.durationMinutes, 'minute').valueOf();
          if (a0 < b1 && b0 < a1) {
            return reply.code(409).send({
              code: 'slot_unavailable',
              message: 'Встречи серии пересекаются',
            });
          }
        }
      }

      const seriesId = store.createBookingSeriesRecord(request.owner.id, {
        eventTypeId,
        guestName,
        guestEmail,
        comment,
        startsAt: dayjs(startsAt).toISOString(),
        count,
      });

      for (const start of starts) {
        store.createBooking(request.owner.id, {
          eventTypeId,
          startsAt: start.toISOString(),
          endsAt: start.add(eventType.durationMinutes, 'minute').toISOString(),
          guestName,
          guestEmail,
          ...(comment !== undefined && { comment }),
          seriesId,
          paymentStatus: 'none',
        });
      }

      return reply.code(201).send(store.findBookingSeries(request.owner.id, seriesId));
    },
  );

  app.delete(
    '/api/booking-series/:id',
    {
      preHandler: [requireOwner, requirePro],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'integer' } },
        },
      },
    },
    (request, reply) => {
      const ok = store.cancelBookingSeries(request.owner.id, request.params.id);
      if (!ok) {
        return reply.code(404).send({ code: 'not_found', message: 'Серия не найдена' });
      }
      reply.code(204).send();
    },
  );

  // --- P2: analytics ------------------------------------------------------

  app.get(
    '/api/analytics',
    {
      preHandler: [requireOwner, requirePro],
      schema: {
        querystring: {
          type: 'object',
          required: ['from', 'to'],
          properties: {
            from: { type: 'string', format: 'date' },
            to: { type: 'string', format: 'date' },
          },
        },
      },
    },
    (request, reply) => {
      const { from, to } = request.query;
      if (dayjs(to).isBefore(dayjs(from))) {
        return reply.code(422).send({
          code: 'validation_error',
          message: 'from не может быть позже to',
        });
      }
      return store.getAnalyticsSummary(request.owner.id, from, to);
    },
  );

  // --- P2: payments -------------------------------------------------------

  app.get('/api/payments/:id', (request, reply) => {
    const payment = store.findPayment(Number(request.params.id));
    if (!payment) {
      return reply.code(404).send({ code: 'not_found', message: 'Платёж не найден' });
    }
    return payment;
  });

  app.post('/api/payments/:id/stub-confirm', (request, reply) => {
    const payment = store.findPayment(Number(request.params.id));
    if (!payment) {
      return reply.code(404).send({ code: 'not_found', message: 'Платёж не найден' });
    }
    if (payment.status === 'paid') return payment;
    return store.markPaymentPaid(payment.id);
  });

  app.post('/api/payments/yookassa/webhook', async (request, reply) => {
    const event = request.body;
    const object = event?.object;
    if (object?.status === 'succeeded' && object?.id) {
      const payment = store.findPaymentByProviderId(object.id);
      if (payment) store.markPaymentPaid(payment.id);
      else if (object.metadata?.paymentId) {
        store.markPaymentPaid(Number(object.metadata.paymentId));
      }
    }
    return reply.code(200).send({});
  });

  return app;
}
