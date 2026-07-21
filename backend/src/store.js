import crypto from 'node:crypto';

/**
 * Хранилище в памяти (по требованиям шага 4 БД не нужна).
 * Весь доступ к данным идёт через этот модуль, поэтому замена
 * на настоящую БД не потребует переписывать роуты.
 */
export function createStore() {
  const owner = {
    id: 1,
    name: process.env.OWNER_NAME ?? 'Кирилл Чистов',
    email: process.env.OWNER_EMAIL ?? 'owner@example.com',
  };
  const ownerPassword = process.env.OWNER_PASSWORD ?? 'secret';

  const eventTypes = [
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

  let availability = {
    timezone: process.env.OWNER_TIMEZONE ?? 'Europe/Moscow',
    rules: [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      startTime: '10:00',
      endTime: '18:00',
    })),
  };

  const bookings = [];
  let nextBookingId = 1;

  const sessions = new Set();

  return {
    owner,

    checkCredentials(email, password) {
      return email === owner.email && password === ownerPassword;
    },

    createSession() {
      const token = crypto.randomUUID();
      sessions.add(token);
      return token;
    },
    hasSession(token) {
      return Boolean(token) && sessions.has(token);
    },
    destroySession(token) {
      sessions.delete(token);
    },

    getEventTypes() {
      return eventTypes;
    },
    findEventType(id) {
      return eventTypes.find((et) => et.id === id) ?? null;
    },

    getAvailability() {
      return availability;
    },
    setAvailability(next) {
      availability = next;
      return availability;
    },

    getBookings() {
      return bookings;
    },
    getActiveBookings() {
      return bookings.filter((b) => b.status === 'active');
    },
    findActiveBooking(id) {
      return bookings.find((b) => b.id === id && b.status === 'active') ?? null;
    },
    createBooking(data) {
      const booking = {
        id: nextBookingId,
        status: 'active',
        createdAt: new Date().toISOString(),
        ...data,
      };
      nextBookingId += 1;
      bookings.push(booking);
      return booking;
    },
    cancelBooking(booking) {
      booking.status = 'cancelled';
    },
  };
}
