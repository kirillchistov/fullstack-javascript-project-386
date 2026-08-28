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
          plan: row.plan === 'pro' ? 'pro' : 'free',
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
          priceRub: row.price_rub ?? 0,
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
          paymentStatus: row.payment_status ?? 'none',
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

  const mapCalendarConnection = (row) =>
    row
      ? {
          id: row.id,
          kind: row.kind,
          label: row.label,
          ...(row.last_synced_at ? { lastSyncedAt: row.last_synced_at } : {}),
        }
      : null;

  const mapPayment = (row) =>
    row
      ? {
          id: row.id,
          bookingId: row.booking_id,
          amountRub: row.amount_rub,
          status: row.status,
          confirmationUrl: row.confirmation_url,
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

    setOwnerPlan(ownerId, plan) {
      db.prepare('UPDATE owners SET plan = ? WHERE id = ?').run(plan, ownerId);
      return this.findOwnerById(ownerId);
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
            `INSERT INTO owners (name, email, slug, password_hash, created_at, plan)
             VALUES (?, ?, ?, ?, ?, 'free')`,
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
          `INSERT INTO event_types (owner_id, name, description, duration_minutes, price_rub)
           VALUES (?, ?, ?, ?, 0)`,
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

    createEventType(ownerId, { name, description, durationMinutes, priceRub }) {
      const result = db
        .prepare(
          `INSERT INTO event_types (owner_id, name, description, duration_minutes, price_rub)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(ownerId, name, description ?? null, durationMinutes, priceRub ?? 0);
      return this.findEventType(ownerId, Number(result.lastInsertRowid));
    },

    updateEventType(ownerId, id, { name, description, durationMinutes, priceRub }) {
      const current = this.findEventType(ownerId, id);
      if (!current) return null;
      const result = db
        .prepare(
          `UPDATE event_types
           SET name = ?, description = ?, duration_minutes = ?, price_rub = ?
           WHERE owner_id = ? AND id = ?`,
        )
        .run(
          name,
          description ?? null,
          durationMinutes,
          priceRub !== undefined ? priceRub : current.priceRub,
          ownerId,
          id,
        );
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
      const paymentStatus = data.paymentStatus ?? 'none';
      const result = db
        .prepare(
          `INSERT INTO bookings (
             owner_id, event_type_id, starts_at, ends_at,
             guest_name, guest_email, comment, status, created_at, manage_token,
             payment_status, series_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
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
          paymentStatus,
          data.seriesId ?? null,
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
        paymentStatus: row.payment_status ?? 'none',
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

    // --- P2: busy / calendars ---------------------------------------------

    listCalendarConnections(ownerId) {
      return db
        .prepare(
          `SELECT * FROM calendar_connections WHERE owner_id = ? ORDER BY id`,
        )
        .all(ownerId)
        .map(mapCalendarConnection);
    },

    findCalendarConnection(ownerId, id) {
      return mapCalendarConnection(
        db
          .prepare(
            `SELECT * FROM calendar_connections WHERE owner_id = ? AND id = ?`,
          )
          .get(ownerId, id),
      );
    },

    getCalendarConnectionRow(ownerId, id) {
      return db
        .prepare(
          `SELECT * FROM calendar_connections WHERE owner_id = ? AND id = ?`,
        )
        .get(ownerId, id);
    },

    createCalendarConnection(ownerId, { kind, label, config }) {
      const result = db
        .prepare(
          `INSERT INTO calendar_connections
             (owner_id, kind, label, config_json, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          ownerId,
          kind,
          label,
          JSON.stringify(config ?? {}),
          new Date().toISOString(),
        );
      return this.findCalendarConnection(ownerId, Number(result.lastInsertRowid));
    },

    deleteCalendarConnection(ownerId, id) {
      const result = db
        .prepare(`DELETE FROM calendar_connections WHERE owner_id = ? AND id = ?`)
        .run(ownerId, id);
      return result.changes > 0;
    },

    replaceBusyBlocks(ownerId, connectionId, blocks) {
      db.prepare(`DELETE FROM busy_blocks WHERE connection_id = ?`).run(connectionId);
      const insert = db.prepare(
        `INSERT INTO busy_blocks (owner_id, connection_id, starts_at, ends_at)
         VALUES (?, ?, ?, ?)`,
      );
      for (const b of blocks) {
        insert.run(ownerId, connectionId, b.startsAt, b.endsAt);
      }
      const now = new Date().toISOString();
      db.prepare(
        `UPDATE calendar_connections SET last_synced_at = ? WHERE id = ?`,
      ).run(now, connectionId);
      return this.findCalendarConnection(ownerId, connectionId);
    },

    getBusyBlocks(ownerId, fromIso, toIso) {
      return db
        .prepare(
          `SELECT starts_at AS startsAt, ends_at AS endsAt FROM busy_blocks
           WHERE owner_id = ?
             AND ends_at > ?
             AND starts_at < ?
           ORDER BY starts_at`,
        )
        .all(ownerId, fromIso, toIso)
        .map((r) => ({ startsAt: r.startsAt, endsAt: r.endsAt }));
    },

    // --- P2: organizations ------------------------------------------------

    listOrganizationsForOwner(ownerId) {
      return db
        .prepare(
          `SELECT o.* FROM organizations o
           JOIN organization_members m ON m.org_id = o.id
           WHERE m.owner_id = ?
           ORDER BY o.id`,
        )
        .all(ownerId)
        .map((row) => ({
          id: row.id,
          name: row.name,
          ownerId: row.owner_id,
        }));
    },

    findOrganization(id) {
      const row = db.prepare('SELECT * FROM organizations WHERE id = ?').get(id);
      return row
        ? { id: row.id, name: row.name, ownerId: row.owner_id }
        : null;
    },

    isOrgMember(orgId, ownerId) {
      return Boolean(
        db
          .prepare(
            `SELECT 1 FROM organization_members WHERE org_id = ? AND owner_id = ?`,
          )
          .get(orgId, ownerId),
      );
    },

    createOrganization(ownerId, name) {
      const now = new Date().toISOString();
      const result = db
        .prepare(
          `INSERT INTO organizations (name, owner_id, created_at) VALUES (?, ?, ?)`,
        )
        .run(name, ownerId, now);
      const orgId = Number(result.lastInsertRowid);
      db.prepare(
        `INSERT INTO organization_members (org_id, owner_id, role) VALUES (?, ?, 'owner')`,
      ).run(orgId, ownerId);
      return this.findOrganization(orgId);
    },

    listOrganizationMembers(orgId) {
      return db
        .prepare(
          `SELECT o.id AS owner_id, o.name, o.email, o.slug, m.role
           FROM organization_members m
           JOIN owners o ON o.id = m.owner_id
           WHERE m.org_id = ?
           ORDER BY m.role DESC, o.id`,
        )
        .all(orgId)
        .map((row) => ({
          ownerId: row.owner_id,
          name: row.name,
          email: row.email,
          slug: row.slug,
          role: row.role,
        }));
    },

    createOrganizationInvite(orgId, email) {
      const token = crypto.randomUUID();
      db.prepare(
        `INSERT INTO organization_invites (token, org_id, email, created_at)
         VALUES (?, ?, ?, ?)`,
      ).run(token, orgId, email, new Date().toISOString());
      return {
        token,
        joinPath: `/team/join?token=${token}`,
      };
    },

    joinOrganization(owner, token) {
      const invite = db
        .prepare('SELECT * FROM organization_invites WHERE token = ?')
        .get(token);
      if (!invite) {
        const err = new Error('Приглашение не найдено');
        err.code = 'not_found';
        throw err;
      }
      if (invite.email.toLowerCase() !== owner.email.toLowerCase()) {
        const err = new Error('Приглашение выдано на другой email');
        err.code = 'validation_error';
        throw err;
      }
      if (!this.isOrgMember(invite.org_id, owner.id)) {
        db.prepare(
          `INSERT INTO organization_members (org_id, owner_id, role) VALUES (?, ?, 'member')`,
        ).run(invite.org_id, owner.id);
      }
      db.prepare('DELETE FROM organization_invites WHERE token = ?').run(token);
      return this.findOrganization(invite.org_id);
    },

    // --- P2: booking series -----------------------------------------------

    listBookingSeries(ownerId) {
      return db
        .prepare(
          `SELECT * FROM booking_series WHERE owner_id = ? ORDER BY id DESC`,
        )
        .all(ownerId)
        .map((row) => this.mapSeries(row));
    },

    mapSeries(row) {
      if (!row) return null;
      const bookingIds = db
        .prepare(
          `SELECT id FROM bookings WHERE series_id = ? ORDER BY starts_at`,
        )
        .all(row.id)
        .map((b) => b.id);
      return {
        id: row.id,
        eventTypeId: row.event_type_id,
        guestName: row.guest_name,
        guestEmail: row.guest_email,
        ...(row.comment ? { comment: row.comment } : {}),
        startsAt: row.starts_at,
        count: row.count,
        bookingIds,
      };
    },

    findBookingSeries(ownerId, id) {
      return this.mapSeries(
        db
          .prepare(`SELECT * FROM booking_series WHERE owner_id = ? AND id = ?`)
          .get(ownerId, id),
      );
    },

    createBookingSeriesRecord(ownerId, data) {
      const result = db
        .prepare(
          `INSERT INTO booking_series
             (owner_id, event_type_id, guest_name, guest_email, comment, starts_at, count, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          ownerId,
          data.eventTypeId,
          data.guestName,
          data.guestEmail,
          data.comment ?? null,
          data.startsAt,
          data.count,
          new Date().toISOString(),
        );
      return Number(result.lastInsertRowid);
    },

    cancelBookingSeries(ownerId, id) {
      const series = this.findBookingSeries(ownerId, id);
      if (!series) return false;
      db.prepare(
        `UPDATE bookings SET status = 'cancelled'
         WHERE series_id = ? AND status = 'active' AND starts_at > ?`,
      ).run(id, new Date().toISOString());
      return true;
    },

    // --- P2: analytics ----------------------------------------------------

    getAnalyticsSummary(ownerId, from, to) {
      const fromIso = `${from}T00:00:00.000Z`;
      const toExclusive = new Date(Date.parse(`${to}T00:00:00.000Z`) + 86400000).toISOString();
      const created = db
        .prepare(
          `SELECT COUNT(*) AS c FROM bookings
           WHERE owner_id = ? AND created_at >= ? AND created_at < ?`,
        )
        .get(ownerId, fromIso, toExclusive).c;
      const cancelled = db
        .prepare(
          `SELECT COUNT(*) AS c FROM bookings
           WHERE owner_id = ? AND status = 'cancelled'
             AND created_at >= ? AND created_at < ?`,
        )
        .get(ownerId, fromIso, toExclusive).c;
      const upcoming = db
        .prepare(
          `SELECT COUNT(*) AS c FROM bookings
           WHERE owner_id = ? AND status = 'active' AND starts_at > ?`,
        )
        .get(ownerId, new Date().toISOString()).c;

      const byWeekday = [0, 0, 0, 0, 0, 0, 0];
      const rows = db
        .prepare(
          `SELECT starts_at FROM bookings
           WHERE owner_id = ? AND created_at >= ? AND created_at < ?`,
        )
        .all(ownerId, fromIso, toExclusive);
      for (const r of rows) {
        const d = new Date(r.starts_at);
        // JS: 0=Sun … convert to ISO 1=Mon … 7=Sun
        const iso = ((d.getUTCDay() + 6) % 7) + 1;
        byWeekday[iso - 1] += 1;
      }

      return {
        from,
        to,
        created,
        cancelled,
        upcoming,
        byWeekday,
      };
    },

    // --- P2: payments -----------------------------------------------------

    createPaymentRecord({ bookingId, amountRub, status, provider, providerPaymentId, confirmationUrl }) {
      const result = db
        .prepare(
          `INSERT INTO payments
             (booking_id, amount_rub, status, provider, provider_payment_id, confirmation_url, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          bookingId,
          amountRub,
          status,
          provider,
          providerPaymentId ?? null,
          confirmationUrl,
          new Date().toISOString(),
        );
      return mapPayment(
        db.prepare('SELECT * FROM payments WHERE id = ?').get(Number(result.lastInsertRowid)),
      );
    },

    updatePaymentDetails(paymentId, { provider, providerPaymentId, confirmationUrl, status }) {
      db.prepare(
        `UPDATE payments
         SET provider = COALESCE(?, provider),
             provider_payment_id = COALESCE(?, provider_payment_id),
             confirmation_url = COALESCE(?, confirmation_url),
             status = COALESCE(?, status)
         WHERE id = ?`,
      ).run(
        provider ?? null,
        providerPaymentId ?? null,
        confirmationUrl ?? null,
        status ?? null,
        paymentId,
      );
      return this.findPayment(paymentId);
    },

    findPayment(id) {
      return mapPayment(db.prepare('SELECT * FROM payments WHERE id = ?').get(id));
    },

    findPaymentByBooking(bookingId) {
      return mapPayment(
        db
          .prepare(`SELECT * FROM payments WHERE booking_id = ? ORDER BY id DESC LIMIT 1`)
          .get(bookingId),
      );
    },

    markPaymentPaid(paymentId) {
      const payment = this.findPayment(paymentId);
      if (!payment) return null;
      db.prepare(`UPDATE payments SET status = 'paid' WHERE id = ?`).run(paymentId);
      db.prepare(
        `UPDATE bookings SET payment_status = 'paid' WHERE id = ?`,
      ).run(payment.bookingId);
      return this.findPayment(paymentId);
    },

    findPaymentByProviderId(providerPaymentId) {
      return mapPayment(
        db
          .prepare(`SELECT * FROM payments WHERE provider_payment_id = ?`)
          .get(providerPaymentId),
      );
    },
  };
}
