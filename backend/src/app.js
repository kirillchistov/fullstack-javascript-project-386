import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import addFormats from 'ajv-formats';
import dayjs from 'dayjs';
import { componentSchemas, ref } from './contract.js';
import { createStore } from './store.js';
import {
  MAX_RANGE_DAYS,
  SLOT_MINUTES,
  computeFreeSlots,
  isFreeSlot,
  validateAvailability,
} from './slots.js';

const SESSION_COOKIE = 'session';

export function buildApp({ logger = false } = {}) {
  const app = Fastify({
    logger,
    ajv: {
      plugins: [addFormats],
    },
  });

  app.register(cookie);

  const store = createStore();
  app.decorate('store', store);

  for (const schema of componentSchemas()) {
    app.addSchema(schema);
  }

  const unauthorized = (reply) =>
    reply
      .code(401)
      .send({ code: 'unauthorized', message: 'Требуется вход владельца' });

  /** preHandler для эндпоинтов владельца (apiKey-in-cookie `session` по контракту) */
  const requireOwner = (request, reply, done) => {
    if (!store.hasSession(request.cookies[SESSION_COOKIE])) {
      unauthorized(reply);
      return;
    }
    done();
  };

  // Ошибки валидации схем — в формате ValidationError из контракта
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
    request.log?.error?.(error);
    reply.code(500).send({ code: 'internal_error', message: 'Внутренняя ошибка сервера' });
  });

  // --- Сессия владельца ---------------------------------------------------

  app.post('/api/session', { schema: { body: ref('SessionCreate') } }, (request, reply) => {
    const { email, password } = request.body;
    if (!store.checkCredentials(email, password)) {
      return reply
        .code(401)
        .send({ code: 'unauthorized', message: 'Неверный email или пароль' });
    }
    const token = store.createSession();
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    });
    return { owner: store.owner };
  });

  app.get('/api/session', (request, reply) => {
    if (!store.hasSession(request.cookies[SESSION_COOKIE])) {
      return unauthorized(reply);
    }
    return { owner: store.owner };
  });

  app.delete('/api/session', (request, reply) => {
    store.destroySession(request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    reply.code(204).send();
  });

  // --- Публичные эндпоинты гостя -------------------------------------------

  app.get('/api/event-types', () => store.getEventTypes());

  app.get(
    '/api/slots',
    {
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
      const rangeDays = dayjs(to).diff(dayjs(from), 'day');
      if (rangeDays < 0 || rangeDays > MAX_RANGE_DAYS) {
        return reply.code(422).send({
          code: 'validation_error',
          message: `Период должен быть от 1 до ${MAX_RANGE_DAYS} дней, from не позже to`,
        });
      }
      return computeFreeSlots({
        availability: store.getAvailability(),
        activeBookings: store.getActiveBookings(),
        from,
        to,
      });
    },
  );

  app.post(
    '/api/bookings',
    { schema: { body: ref('BookingCreate') } },
    (request, reply) => {
      const { eventTypeId, startsAt, guestName, guestEmail, comment } = request.body;

      if (!store.findEventType(eventTypeId)) {
        return reply.code(422).send({
          code: 'validation_error',
          message: 'Неизвестный тип события',
          errors: [{ field: 'eventTypeId', message: 'Тип события не найден' }],
        });
      }

      // Ключевое бизнес-правило: бронировать можно только свободный слот
      const free = isFreeSlot({
        availability: store.getAvailability(),
        activeBookings: store.getActiveBookings(),
        startsAt,
      });
      if (!free) {
        return reply.code(409).send({
          code: 'slot_unavailable',
          message: 'Слот уже занят, находится в прошлом или вне расписания',
        });
      }

      const start = dayjs(startsAt);
      const booking = store.createBooking({
        eventTypeId,
        startsAt: start.toISOString(),
        endsAt: start.add(SLOT_MINUTES, 'minute').toISOString(),
        guestName,
        guestEmail,
        ...(comment !== undefined && { comment }),
      });
      return reply.code(201).send(booking);
    },
  );

  // --- Эндпоинты владельца --------------------------------------------------

  app.get('/api/bookings', { preHandler: requireOwner }, () => {
    const now = dayjs();
    return store
      .getActiveBookings()
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
      const booking = store.findActiveBooking(request.params.id);
      if (!booking) {
        return reply.code(404).send({ code: 'not_found', message: 'Встреча не найдена' });
      }
      store.cancelBooking(booking);
      reply.code(204).send();
    },
  );

  app.get('/api/availability', { preHandler: requireOwner }, () => store.getAvailability());

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
      return store.setAvailability(request.body);
    },
  );

  return app;
}
