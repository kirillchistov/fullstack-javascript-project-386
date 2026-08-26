import crypto from 'node:crypto';
import { openDatabase } from './db.js';
import { hashPassword, verifyPassword } from './passwords.js';

/**
 * Доступ к данным через SQLite. Роуты и бизнес-логика не знают про SQL.
 * @param {import('node:sqlite').DatabaseSync} [db]
 */
export function createStore(db = openDatabase()) {
  const mapOwner = (row) =>
    row
      ? {
          id: row.id,
          name: row.name,
          email: row.email,
          slug: row.slug,
        }
      : null;

  const mapEventType = (row) =>
    row
      ? {
          id: row.id,
          name: row.name,
          ...(row.description != null && row.description !== ''
            ? { description: row.description }
            : {}),
          durationMinutes: row.duration_minutes,
        }
      : null;

  const mapBooking = (row) =>
    row
      ? {
          id: row.id,
          eventTypeId: row.event_type_id,
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          guestName: row.guest_name,
          guestEmail: row.guest_email,
          ...(row.comment != null && row.comment !== '' ? { comment: row.comment } : {}),
          status: row.status,
          createdAt: row.created_at,
        }
      : null;

  const mapBookingCreated = (row) =>
    row
      ? {
          ...mapBooking(row),
          manageToken: row.manage_token,
        }
      : null;

  const mapAvailability = (row) => {
    if (!row) {
      return {
        timezone: 'Europe/Moscow',
        bufferMinutes: 0,
        rules: [],
        exceptions: [],
      };
    }
    return {
      timezone: row.timezone,
      bufferMinutes: row.buffer_minutes ?? 0,
      rules: JSON.parse(row.rules_json),
      exceptions: JSON.parse(row.exceptions_json || '[]'),
    };
  };

  return {
    close() {
      db.close();
    },

    findOwnerByEmail(email) {
      return mapOwner(
        db.prepare('SELECT * FROM owners WHERE email = ? COLLATE NOCASE').get(email),
      );
    },

    findOwnerBySlug(slug) {
      return mapOwner(
        db.prepare('SELECT * FROM owners WHERE slug = ? COLLATE NOCASE').get(slug),
      );
    },

    findOwnerById(id) {
      return mapOwner(db.prepare('SELECT * FROM owners WHERE id = ?').get(id));
    },

    getOwnerPublic(slug) {
      const owner = db
        .prepare('SELECT * FROM owners WHERE slug = ? COLLATE NOCASE')
        .get(slug);
      if (!owner) return null;
      const availability = this.getAvailability(owner.id);
      return {
        id: owner.id,
        name: owner.name,
        slug: owner.slug,
        timezone: availability.timezone,
      };
    },

    createOwner({ name, email, password, slug }) {
      const now = new Date().toISOString();
      try {
        const result = db
          .prepare(
            `INSERT INTO owners (name, email, slug, password_hash, created_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(name, email, slug, hashPassword(password), now);
        const ownerId = Number(result.lastInsertRowid);
        const rules = [1, 2, 3, 4, 5].map((weekday) => ({
          weekday,
          startTime: '10:00',
          endTime: '18:00',
        }));
        db.prepare(
          `INSERT INTO availability
             (owner_id, timezone, rules_json, buffer_minutes, exceptions_json)
           VALUES (?, ?, ?, 0, '[]')`,
        ).run(ownerId, 'Europe/Moscow', JSON.stringify(rules));
        db.prepare(
          `INSERT INTO notification_settings (owner_id, email_enabled, reminder_hours_before)
           VALUES (?, 1, 24)`,
        ).run(ownerId);
        db.prepare(
          `INSERT INTO event_types (owner_id, name, description, duration_minutes)
           VALUES (?, ?, ?, ?)`,
        ).run(ownerId, 'Вводный звонок', 'Знакомство и обсуждение задачи', 30);
        return this.findOwnerById(ownerId);
      } catch (error) {
        if (String(error.message).includes('UNIQUE')) {
          const err = new Error('Email или slug уже заняты');
          err.code = 'already_exists';
          throw err;
        }
        throw error;
      }
    },

    checkCredentials(email, password) {
      const row = db.prepare('SELECT * FROM owners WHERE email = ? COLLATE NOCASE').get(email);
      if (!row) return null;
      if (!verifyPassword(password, row.password_hash)) return null;
      return mapOwner(row);
    },

    createSession(ownerId) {
      const token = crypto.randomUUID();
      db.prepare(
        'INSERT INTO sessions (token, owner_id, created_at) VALUES (?, ?, ?)',
      ).run(token, ownerId, new Date().toISOString());
      return token;
    },

    getSessionOwner(token) {
      if (!token) return null;
      const row = db
        .prepare(
          `SELECT o.* FROM sessions s
           JOIN owners o ON o.id = s.owner_id
           WHERE s.token = ?`,
        )
        .get(token);
      return mapOwner(row);
    },

    destroySession(token) {
      if (!token) return;
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    },

    listEventTypes(ownerId) {
      return db
        .prepare('SELECT * FROM event_types WHERE owner_id = ? ORDER BY id')
        .all(ownerId)
        .map(mapEventType);
    },

    findEventType(ownerId, id) {
      return mapEventType(
        db
          .prepare('SELECT * FROM event_types WHERE owner_id = ? AND id = ?')
          .get(ownerId, id),
      );
    },

    createEventType(ownerId, { name, description, durationMinutes }) {
      const result = db
        .prepare(
          `INSERT INTO event_types (owner_id, name, description, duration_minutes)
           VALUES (?, ?, ?, ?)`,
        )
        .run(ownerId, name, description ?? null, durationMinutes);
      return this.findEventType(ownerId, Number(result.lastInsertRowid));
    },

    updateEventType(ownerId, id, { name, description, durationMinutes }) {
      const result = db
        .prepare(
          `UPDATE event_types
           SET name = ?, description = ?, duration_minutes = ?
           WHERE owner_id = ? AND id = ?`,
        )
        .run(name, description ?? null, durationMinutes, ownerId, id);
      if (result.changes === 0) return null;
      return this.findEventType(ownerId, id);
    },

    deleteEventType(ownerId, id) {
      const active = db
        .prepare(
          `SELECT COUNT(*) AS c FROM bookings
           WHERE owner_id = ? AND event_type_id = ? AND status = 'active'
             AND starts_at > ?`,
        )
        .get(ownerId, id, new Date().toISOString());
      if (active.c > 0) {
        const err = new Error('Нельзя удалить тип с активными будущими бронями');
        err.code = 'validation_error';
        throw err;
      }
      const result = db
        .prepare('DELETE FROM event_types WHERE owner_id = ? AND id = ?')
        .run(ownerId, id);
      return result.changes > 0;
    },

    getAvailability(ownerId) {
      return mapAvailability(
        db.prepare('SELECT * FROM availability WHERE owner_id = ?').get(ownerId),
      );
    },

    setAvailability(ownerId, availability) {
      db.prepare(
        `INSERT INTO availability
           (owner_id, timezone, rules_json, buffer_minutes, exceptions_json)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(owner_id) DO UPDATE SET
           timezone = excluded.timezone,
           rules_json = excluded.rules_json,
           buffer_minutes = excluded.buffer_minutes,
           exceptions_json = excluded.exceptions_json`,
      ).run(
        ownerId,
        availability.timezone,
        JSON.stringify(availability.rules),
        availability.bufferMinutes ?? 0,
        JSON.stringify(availability.exceptions ?? []),
      );
      return this.getAvailability(ownerId);
    },

    getActiveBookings(ownerId) {
      return db
        .prepare(
          `SELECT * FROM bookings
           WHERE owner_id = ? AND status = 'active'
           ORDER BY starts_at`,
        )
        .all(ownerId)
        .map(mapBooking);
    },

    /** Активные брони кроме указанной (для переноса) */
    getActiveBookingsExcept(ownerId, bookingId) {
      return db
        .prepare(
          `SELECT * FROM bookings
           WHERE owner_id = ? AND status = 'active' AND id != ?
           ORDER BY starts_at`,
        )
        .all(ownerId, bookingId)
        .map(mapBooking);
    },

    findActiveBooking(ownerId, id) {
      return mapBooking(
        db
          .prepare(
            `SELECT * FROM bookings
             WHERE owner_id = ? AND id = ? AND status = 'active'`,
          )
          .get(ownerId, id),
      );
    },

    createBooking(ownerId, data) {
      const manageToken = crypto.randomUUID();
      const result = db
        .prepare(
          `INSERT INTO bookings (
             owner_id, event_type_id, starts_at, ends_at,
             guest_name, guest_email, comment, status, created_at, manage_token
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        )
        .run(
          ownerId,
          data.eventTypeId,
          data.startsAt,
          data.endsAt,
          data.guestName,
          data.guestEmail,
          data.comment ?? null,
          new Date().toISOString(),
          manageToken,
        );
      return mapBookingCreated(
        db.prepare('SELECT * FROM bookings WHERE id = ?').get(Number(result.lastInsertRowid)),
      );
    },

    cancelBooking(ownerId, id) {
      const row = db
        .prepare(
          `SELECT * FROM bookings
           WHERE owner_id = ? AND id = ? AND status = 'active'`,
        )
        .get(ownerId, id);
      if (!row) return null;
      db.prepare(
        `UPDATE bookings SET status = 'cancelled'
         WHERE id = ?`,
      ).run(id);
      return mapBookingCreated({ ...row, status: 'cancelled' });
    },

    findBookingByManageToken(token) {
      if (!token) return null;
      const row = db.prepare('SELECT * FROM bookings WHERE manage_token = ?').get(token);
      return row ?? null;
    },

    getGuestBooking(token) {
      const row = this.findBookingByManageToken(token);
      if (!row) return null;
      const owner = this.findOwnerById(row.owner_id);
      const eventType = this.findEventType(row.owner_id, row.event_type_id);
      const availability = this.getAvailability(row.owner_id);
      if (!owner || !eventType) return null;
      return {
        id: row.id,
        eventTypeName: eventType.name,
        durationMinutes: eventType.durationMinutes,
        ownerName: owner.name,
        ownerSlug: owner.slug,
        ownerTimezone: availability.timezone,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        guestName: row.guest_name,
        guestEmail: row.guest_email,
        ...(row.comment ? { comment: row.comment } : {}),
        status: row.status,
        _ownerId: row.owner_id,
        _eventTypeId: row.event_type_id,
        _manageToken: row.manage_token,
      };
    },

    cancelBookingByToken(token) {
      const row = this.findBookingByManageToken(token);
      if (!row || row.status !== 'active') return null;
      db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`).run(row.id);
      return { ...row, status: 'cancelled' };
    },

    rescheduleBookingByToken(token, { startsAt, endsAt }) {
      const row = this.findBookingByManageToken(token);
      if (!row || row.status !== 'active') return null;
      db.prepare(
        `UPDATE bookings SET starts_at = ?, ends_at = ?, reminder_sent_at = NULL
         WHERE id = ?`,
      ).run(startsAt, endsAt, row.id);
      return this.getGuestBooking(token);
    },

    getNotificationSettings(ownerId) {
      let row = db
        .prepare('SELECT * FROM notification_settings WHERE owner_id = ?')
        .get(ownerId);
      if (!row) {
        db.prepare(
          `INSERT INTO notification_settings (owner_id, email_enabled, reminder_hours_before)
           VALUES (?, 1, 24)`,
        ).run(ownerId);
        row = db
          .prepare('SELECT * FROM notification_settings WHERE owner_id = ?')
          .get(ownerId);
      }
      return {
        emailEnabled: Boolean(row.email_enabled),
        ...(row.telegram_chat_id ? { telegramChatId: row.telegram_chat_id } : {}),
        reminderHoursBefore: row.reminder_hours_before,
      };
    },

    setNotificationSettings(ownerId, settings) {
      db.prepare(
        `INSERT INTO notification_settings
           (owner_id, email_enabled, telegram_chat_id, reminder_hours_before)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(owner_id) DO UPDATE SET
           email_enabled = excluded.email_enabled,
           telegram_chat_id = excluded.telegram_chat_id,
           reminder_hours_before = excluded.reminder_hours_before`,
      ).run(
        ownerId,
        settings.emailEnabled ? 1 : 0,
        settings.telegramChatId || null,
        settings.reminderHoursBefore,
      );
      return this.getNotificationSettings(ownerId);
    },

    /** Брони, которым пора отправить напоминание */
    listDueReminders(now = new Date()) {
      const nowIso = now.toISOString();
      const nowMs = now.getTime();
      const rows = db
        .prepare(
          `SELECT b.*, o.email AS owner_email, o.name AS owner_name, o.slug AS owner_slug,
                  et.name AS event_type_name, et.duration_minutes,
                  ns.email_enabled, ns.telegram_chat_id, ns.reminder_hours_before
           FROM bookings b
           JOIN owners o ON o.id = b.owner_id
           JOIN event_types et ON et.id = b.event_type_id
           LEFT JOIN notification_settings ns ON ns.owner_id = b.owner_id
           WHERE b.status = 'active'
             AND b.reminder_sent_at IS NULL
             AND b.starts_at > ?`,
        )
        .all(nowIso);
      return rows.filter((row) => {
        const hours = row.reminder_hours_before ?? 24;
        const startsMs = Date.parse(row.starts_at);
        return startsMs <= nowMs + hours * 60 * 60 * 1000;
      });
    },

    markReminderSent(bookingId) {
      db.prepare(
        `UPDATE bookings SET reminder_sent_at = ? WHERE id = ?`,
      ).run(new Date().toISOString(), bookingId);
    },
  };
}
