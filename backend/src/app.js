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

const SESSION_COOKIE = 'session';

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
        availability: store.getAvailability(owner.id),
        activeBookings: store.getActiveBookings(owner.id),
        from,
        to,
        durationMinutes: eventType.durationMinutes,
      });
    },
  );

  app.post(
    '/api/public/:slug/bookings',
    { schema: { body: ref('BookingCreate') } },
    (request, reply) => {
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
        availability: store.getAvailability(owner.id),
        activeBookings: store.getActiveBookings(owner.id),
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
      const booking = store.createBooking(owner.id, {
        eventTypeId,
        startsAt: start.toISOString(),
        endsAt: start.add(eventType.durationMinutes, 'minute').toISOString(),
        guestName,
        guestEmail,
        ...(comment !== undefined && { comment }),
      });
      return reply.code(201).send(booking);
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
    (request, reply) => {
      const ok = store.cancelBooking(request.owner.id, request.params.id);
      if (!ok) {
        return reply.code(404).send({ code: 'not_found', message: 'Встреча не найдена' });
      }
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

  return app;
}
