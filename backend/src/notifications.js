import nodemailer from 'nodemailer';

/**
 * Уведомления: email (SMTP) + Telegram Bot API.
 * Без SMTP_URL / TELEGRAM_BOT_TOKEN сообщения пишутся в лог (удобно для тестов и dev).
 *
 * Переменные:
 * - PUBLIC_BASE_URL — база ссылок для гостя (по умолчанию http://localhost:5173)
 * - SMTP_URL — например smtp://user:pass@smtp.example.com:587
 * - EMAIL_FROM — From: (по умолчанию Call Calendar <noreply@localhost>)
 * - TELEGRAM_BOT_TOKEN — токен бота @BotFather
 */

const publicBase = () =>
  (process.env.PUBLIC_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');

let transporterPromise = null;

async function getTransporter() {
  if (!process.env.SMTP_URL) return null;
  if (!transporterPromise) {
    transporterPromise = nodemailer.createTransport(process.env.SMTP_URL);
  }
  return transporterPromise;
}

async function sendEmail({ to, subject, text }) {
  const from = process.env.EMAIL_FROM || 'Call Calendar <noreply@localhost>';
  const transporter = await getTransporter();
  if (!transporter) {
    console.info(`[email:dry-run] to=${to} subject=${subject}\n${text}`);
    return { dryRun: true };
  }
  await transporter.sendMail({ from, to, subject, text });
  return { dryRun: false };
}

async function sendTelegram(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) {
    if (chatId) console.info(`[telegram:dry-run] chat=${chatId}\n${text}`);
    return { dryRun: true };
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API ${res.status}: ${body}`);
  }
  return { dryRun: false };
}

function manageUrl(token) {
  return `${publicBase()}/b/${token}`;
}

function formatWhen(iso, timezone) {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: timezone,
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * @param {object} opts
 * @param {'created'|'cancelled'|'rescheduled'|'reminder'} opts.kind
 * @param {object} opts.booking — поля startsAt, endsAt, guestName, guestEmail, manageToken?
 * @param {object} opts.owner — id, name, email, slug
 * @param {object} opts.eventType — name, durationMinutes
 * @param {object} opts.availability — timezone
 * @param {object} opts.settings — emailEnabled, telegramChatId?, reminderHoursBefore
 */
export async function notifyBookingEvent({
  kind,
  booking,
  owner,
  eventType,
  availability,
  settings,
}) {
  const when = formatWhen(booking.startsAt, availability.timezone);
  const link = booking.manageToken ? manageUrl(booking.manageToken) : null;

  const titles = {
    created: 'Встреча забронирована',
    cancelled: 'Встреча отменена',
    rescheduled: 'Встреча перенесена',
    reminder: 'Напоминание о встрече',
  };
  const title = titles[kind] || 'Уведомление о встрече';

  const guestLines = [
    `${title}`,
    `${eventType.name} · ${eventType.durationMinutes} мин`,
    `С ${owner.name}: ${when} (${availability.timezone})`,
    link ? `Управление записью: ${link}` : null,
  ].filter(Boolean);

  const ownerLines = [
    `${title}`,
    `${eventType.name} с ${booking.guestName} <${booking.guestEmail}>`,
    `Когда: ${when} (${availability.timezone})`,
    booking.comment ? `Комментарий: ${booking.comment}` : null,
  ].filter(Boolean);

  const tasks = [];

  if (settings.emailEnabled !== false) {
    tasks.push(
      sendEmail({
        to: booking.guestEmail,
        subject: `${title}: ${eventType.name}`,
        text: guestLines.join('\n'),
      }),
    );
    tasks.push(
      sendEmail({
        to: owner.email,
        subject: `${title}: ${booking.guestName}`,
        text: ownerLines.join('\n'),
      }),
    );
  }

  if (settings.telegramChatId) {
    tasks.push(sendTelegram(settings.telegramChatId, ownerLines.join('\n')));
  }

  await Promise.allSettled(tasks);
}

/** Фоновый проход напоминаний (вызывать из index.js) */
export async function processReminders(store) {
  const due = store.listDueReminders();
  for (const row of due) {
    try {
      await notifyBookingEvent({
        kind: 'reminder',
        booking: {
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          guestName: row.guest_name,
          guestEmail: row.guest_email,
          comment: row.comment,
          manageToken: row.manage_token,
        },
        owner: {
          id: row.owner_id,
          name: row.owner_name,
          email: row.owner_email,
          slug: row.owner_slug,
        },
        eventType: {
          name: row.event_type_name,
          durationMinutes: row.duration_minutes,
        },
        availability: store.getAvailability(row.owner_id),
        settings: {
          emailEnabled: Boolean(row.email_enabled),
          telegramChatId: row.telegram_chat_id || undefined,
          reminderHoursBefore: row.reminder_hours_before,
        },
      });
      store.markReminderSent(row.id);
    } catch (error) {
      console.error('reminder failed', row.id, error);
    }
  }
}
