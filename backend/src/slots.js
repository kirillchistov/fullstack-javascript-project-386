import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

/** Базовая кратность интервалов доступности и длительности типов событий */
export const GRID_MINUTES = 15;

/** Горизонт бронирования: слоты доступны на 14 дней вперёд, включая сегодняшний */
export const BOOKING_HORIZON_DAYS = 14;

/** @deprecated используйте GRID_MINUTES; оставлено для совместимости импортов */
export const SLOT_MINUTES = GRID_MINUTES;

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Свободные слоты длительностью durationMinutes за период [from, to]
 * (даты в таймзоне владельца). Шаг сетки = durationMinutes.
 * Из кандидатов вычитаются интервалы, пересекающиеся с активными бронями.
 * Период обрезается горизонтом: [сегодня, сегодня + 13 дней] в TZ владельца.
 */
export function computeFreeSlots({
  availability,
  activeBookings,
  from,
  to,
  durationMinutes,
  now = dayjs(),
}) {
  if (!Number.isInteger(durationMinutes) || durationMinutes < GRID_MINUTES) {
    return [];
  }

  const { timezone: tz, rules } = availability;
  const booked = activeBookings.map((b) => ({
    start: Date.parse(b.startsAt),
    end: Date.parse(b.endsAt),
  }));
  const slots = [];

  const todayInTz = dayjs.tz(now.toISOString(), tz).startOf('day');
  const horizonEnd = todayInTz.add(BOOKING_HORIZON_DAYS - 1, 'day');

  let start = dayjs.tz(from, tz);
  if (start.isBefore(todayInTz, 'day')) start = todayInTz;
  let finish = dayjs.tz(to, tz);
  if (finish.isAfter(horizonEnd, 'day')) finish = horizonEnd;

  for (let day = start; !day.isAfter(finish, 'day'); day = day.add(1, 'day')) {
    const isoWeekday = ((day.day() + 6) % 7) + 1;
    for (const rule of rules) {
      if (rule.weekday !== isoWeekday) continue;
      const dayStr = day.format('YYYY-MM-DD');
      let cursor = dayjs.tz(`${dayStr}T${rule.startTime}`, tz);
      const end = dayjs.tz(`${dayStr}T${rule.endTime}`, tz);
      while (cursor.add(durationMinutes, 'minute').valueOf() <= end.valueOf()) {
        const slotStart = cursor.valueOf();
        const slotEnd = cursor.add(durationMinutes, 'minute').valueOf();
        const conflict = booked.some((b) => overlaps(slotStart, slotEnd, b.start, b.end));
        if (cursor.isAfter(now) && !conflict) {
          slots.push({
            startsAt: cursor.toISOString(),
            endsAt: cursor.add(durationMinutes, 'minute').toISOString(),
          });
        }
        cursor = cursor.add(durationMinutes, 'minute');
      }
    }
  }

  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Проверка, что startsAt — свободный слот заданной длительности */
export function isFreeSlot({
  availability,
  activeBookings,
  startsAt,
  durationMinutes,
  now = dayjs(),
}) {
  const start = dayjs(startsAt);
  if (!start.isValid() || !start.isAfter(now)) return false;

  const dayInOwnerTz = start.tz(availability.timezone).format('YYYY-MM-DD');
  const slots = computeFreeSlots({
    availability,
    activeBookings,
    from: dayInOwnerTz,
    to: dayInOwnerTz,
    durationMinutes,
    now,
  });
  return slots.some((s) => Date.parse(s.startsAt) === start.valueOf());
}

export function validateDurationMinutes(durationMinutes) {
  if (!Number.isInteger(durationMinutes)) {
    return 'Длительность должна быть целым числом минут';
  }
  if (durationMinutes < 15 || durationMinutes > 240) {
    return 'Длительность должна быть от 15 до 240 минут';
  }
  if (durationMinutes % GRID_MINUTES !== 0) {
    return `Длительность должна быть кратна ${GRID_MINUTES} минутам`;
  }
  return null;
}

/**
 * Валидация правил доступности (бизнес-правила, не выразимые в JSON Schema).
 * Возвращает список ошибок формата FieldError из контракта.
 */
export function validateAvailability({ timezone: tz, rules }) {
  const errors = [];

  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
  } catch {
    errors.push({ field: 'timezone', message: 'Неизвестный IANA-часовой пояс' });
  }

  const toMinutes = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  rules.forEach((rule, i) => {
    const start = toMinutes(rule.startTime);
    const end = toMinutes(rule.endTime);
    if (end <= start) {
      errors.push({ field: `rules[${i}]`, message: 'Конец интервала должен быть позже начала' });
    }
    if ((end - start) % GRID_MINUTES !== 0) {
      errors.push({
        field: `rules[${i}]`,
        message: `Интервал должен быть кратен ${GRID_MINUTES} минутам`,
      });
    }
  });

  for (let i = 0; i < rules.length; i += 1) {
    for (let j = i + 1; j < rules.length; j += 1) {
      if (rules[i].weekday !== rules[j].weekday) continue;
      const [aStart, aEnd] = [toMinutes(rules[i].startTime), toMinutes(rules[i].endTime)];
      const [bStart, bEnd] = [toMinutes(rules[j].startTime), toMinutes(rules[j].endTime)];
      if (aStart < bEnd && bStart < aEnd) {
        errors.push({
          field: `rules[${j}]`,
          message: `Интервал пересекается с правилом ${i + 1} в тот же день`,
        });
      }
    }
  }

  return errors;
}
