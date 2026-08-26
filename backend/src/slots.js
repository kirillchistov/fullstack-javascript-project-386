import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

/** Базовая кратность интервалов доступности и длительности типов событий */
export const GRID_MINUTES = 15;

/** Горизонт бронирования: слоты доступны на 14 дней вперёд, включая сегодняшний */
export const BOOKING_HORIZON_DAYS = 14;

/** @deprecated используйте GRID_MINUTES */
export const SLOT_MINUTES = GRID_MINUTES;

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function toMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function normalizeAvailability(availability) {
  return {
    timezone: availability.timezone,
    bufferMinutes: Number.isInteger(availability.bufferMinutes)
      ? availability.bufferMinutes
      : 0,
    rules: availability.rules ?? [],
    exceptions: availability.exceptions ?? [],
  };
}

/** Интервалы работы на календарный день (с учётом исключений) */
export function intervalsForDay(availability, dayStr) {
  const { rules, exceptions } = normalizeAvailability(availability);
  const exception = exceptions.find((e) => e.date === dayStr);
  if (exception) {
    return exception.intervals ?? [];
  }
  const day = dayjs(dayStr);
  const isoWeekday = ((day.day() + 6) % 7) + 1;
  return rules
    .filter((r) => r.weekday === isoWeekday)
    .map((r) => ({ startTime: r.startTime, endTime: r.endTime }));
}

/**
 * Свободные слоты длительностью durationMinutes.
 * Учитывает исключения (праздники/особые дни) и буфер вокруг активных броней.
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

  const avail = normalizeAvailability(availability);
  const { timezone: tz, bufferMinutes } = avail;
  const bufferMs = bufferMinutes * 60 * 1000;

  const blocked = activeBookings.map((b) => ({
    start: Date.parse(b.startsAt) - bufferMs,
    end: Date.parse(b.endsAt) + bufferMs,
  }));
  const slots = [];

  const todayInTz = dayjs.tz(now.toISOString(), tz).startOf('day');
  const horizonEnd = todayInTz.add(BOOKING_HORIZON_DAYS - 1, 'day');

  let start = dayjs.tz(from, tz);
  if (start.isBefore(todayInTz, 'day')) start = todayInTz;
  let finish = dayjs.tz(to, tz);
  if (finish.isAfter(horizonEnd, 'day')) finish = horizonEnd;

  for (let day = start; !day.isAfter(finish, 'day'); day = day.add(1, 'day')) {
    const dayStr = day.format('YYYY-MM-DD');
    const intervals = intervalsForDay(avail, dayStr);
    for (const interval of intervals) {
      let cursor = dayjs.tz(`${dayStr}T${interval.startTime}`, tz);
      const end = dayjs.tz(`${dayStr}T${interval.endTime}`, tz);
      while (cursor.add(durationMinutes, 'minute').valueOf() <= end.valueOf()) {
        const slotStart = cursor.valueOf();
        const slotEnd = cursor.add(durationMinutes, 'minute').valueOf();
        const conflict = blocked.some((b) => overlaps(slotStart, slotEnd, b.start, b.end));
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

export function isFreeSlot({
  availability,
  activeBookings,
  startsAt,
  durationMinutes,
  now = dayjs(),
}) {
  const start = dayjs(startsAt);
  if (!start.isValid() || !start.isAfter(now)) return false;

  const dayInOwnerTz = start.tz(normalizeAvailability(availability).timezone).format('YYYY-MM-DD');
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

function validateIntervals(intervals, fieldPrefix, errors) {
  intervals.forEach((interval, i) => {
    const start = toMinutes(interval.startTime);
    const end = toMinutes(interval.endTime);
    if (end <= start) {
      errors.push({
        field: `${fieldPrefix}[${i}]`,
        message: 'Конец интервала должен быть позже начала',
      });
    }
    if ((end - start) % GRID_MINUTES !== 0) {
      errors.push({
        field: `${fieldPrefix}[${i}]`,
        message: `Интервал должен быть кратен ${GRID_MINUTES} минутам`,
      });
    }
  });
  for (let i = 0; i < intervals.length; i += 1) {
    for (let j = i + 1; j < intervals.length; j += 1) {
      const [aStart, aEnd] = [
        toMinutes(intervals[i].startTime),
        toMinutes(intervals[i].endTime),
      ];
      const [bStart, bEnd] = [
        toMinutes(intervals[j].startTime),
        toMinutes(intervals[j].endTime),
      ];
      if (aStart < bEnd && bStart < aEnd) {
        errors.push({
          field: `${fieldPrefix}[${j}]`,
          message: `Интервал пересекается с интервалом ${i + 1}`,
        });
      }
    }
  }
}

/**
 * Валидация правил доступности, буфера и исключений.
 */
export function validateAvailability(raw) {
  const availability = normalizeAvailability(raw);
  const errors = [];

  try {
    Intl.DateTimeFormat(undefined, { timeZone: availability.timezone });
  } catch {
    errors.push({ field: 'timezone', message: 'Неизвестный IANA-часовой пояс' });
  }

  if (
    !Number.isInteger(availability.bufferMinutes) ||
    availability.bufferMinutes < 0 ||
    availability.bufferMinutes > 120 ||
    availability.bufferMinutes % GRID_MINUTES !== 0
  ) {
    errors.push({
      field: 'bufferMinutes',
      message: `Буфер: 0–120 минут, кратно ${GRID_MINUTES}`,
    });
  }

  // Группируем недельные правила по дню и проверяем как интервалы
  const byWeekday = new Map();
  availability.rules.forEach((rule, i) => {
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
    if (!byWeekday.has(rule.weekday)) byWeekday.set(rule.weekday, []);
    byWeekday.get(rule.weekday).push({ ...rule, _index: i });
  });

  for (const [, dayRules] of byWeekday) {
    for (let i = 0; i < dayRules.length; i += 1) {
      for (let j = i + 1; j < dayRules.length; j += 1) {
        const [aStart, aEnd] = [
          toMinutes(dayRules[i].startTime),
          toMinutes(dayRules[i].endTime),
        ];
        const [bStart, bEnd] = [
          toMinutes(dayRules[j].startTime),
          toMinutes(dayRules[j].endTime),
        ];
        if (aStart < bEnd && bStart < aEnd) {
          errors.push({
            field: `rules[${dayRules[j]._index}]`,
            message: `Интервал пересекается с правилом ${dayRules[i]._index + 1} в тот же день`,
          });
        }
      }
    }
  }

  const seenDates = new Set();
  availability.exceptions.forEach((ex, i) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ex.date) || !dayjs(ex.date).isValid()) {
      errors.push({ field: `exceptions[${i}].date`, message: 'Ожидается дата YYYY-MM-DD' });
    }
    if (seenDates.has(ex.date)) {
      errors.push({ field: `exceptions[${i}].date`, message: 'Дата исключения уже указана' });
    }
    seenDates.add(ex.date);
    validateIntervals(ex.intervals ?? [], `exceptions[${i}].intervals`, errors);
  });

  return errors;
}
