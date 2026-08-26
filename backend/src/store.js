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
          'INSERT INTO availability (owner_id, timezone, rules_json) VALUES (?, ?, ?)',
        ).run(ownerId, 'Europe/Moscow', JSON.stringify(rules));
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
        .prepare(
          'SELECT * FROM event_types WHERE owner_id = ? ORDER BY id',
        )
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
      const row = db.prepare('SELECT * FROM availability WHERE owner_id = ?').get(ownerId);
      if (!row) {
        return { timezone: 'Europe/Moscow', rules: [] };
      }
      return {
        timezone: row.timezone,
        rules: JSON.parse(row.rules_json),
      };
    },

    setAvailability(ownerId, availability) {
      db.prepare(
        `INSERT INTO availability (owner_id, timezone, rules_json)
         VALUES (?, ?, ?)
         ON CONFLICT(owner_id) DO UPDATE SET
           timezone = excluded.timezone,
           rules_json = excluded.rules_json`,
      ).run(ownerId, availability.timezone, JSON.stringify(availability.rules));
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
      const result = db
        .prepare(
          `INSERT INTO bookings (
             owner_id, event_type_id, starts_at, ends_at,
             guest_name, guest_email, comment, status, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
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
        );
      return mapBooking(
        db.prepare('SELECT * FROM bookings WHERE id = ?').get(Number(result.lastInsertRowid)),
      );
    },

    cancelBooking(ownerId, id) {
      const result = db
        .prepare(
          `UPDATE bookings SET status = 'cancelled'
           WHERE owner_id = ? AND id = ? AND status = 'active'`,
        )
        .run(ownerId, id);
      return result.changes > 0;
    },
  };
}
