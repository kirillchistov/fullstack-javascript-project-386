import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export const SLOT_MINUTES = 30;

/** Максимальный период запроса слотов, чтобы не считать бесконечные диапазоны */
export const MAX_RANGE_DAYS = 62;

/**
 * Свободные 30-минутные слоты за период [from, to] (даты в таймзоне владельца).
 * Правила доступности разворачиваются в слоты, из них вычитаются
 * активные бронирования и прошедшее время. Возвращает UTC ISO-интервалы.
 */
export function computeFreeSlots({ availability, activeBookings, from, to, now = dayjs() }) {
  const { timezone: tz, rules } = availability;
  const bookedStarts = new Set(activeBookings.map((b) => Date.parse(b.startsAt)));
  const slots = [];

  for (
    let day = dayjs.tz(from, tz);
    !day.isAfter(dayjs.tz(to, tz), 'day');
    day = day.add(1, 'day')
  ) {
    const isoWeekday = ((day.day() + 6) % 7) + 1;
    for (const rule of rules) {
      if (rule.weekday !== isoWeekday) continue;
      const dayStr = day.format('YYYY-MM-DD');
      let cursor = dayjs.tz(`${dayStr}T${rule.startTime}`, tz);
      const end = dayjs.tz(`${dayStr}T${rule.endTime}`, tz);
      while (cursor.add(SLOT_MINUTES, 'minute').valueOf() <= end.valueOf()) {
        if (cursor.isAfter(now) && !bookedStarts.has(cursor.valueOf())) {
          slots.push({
            startsAt: cursor.toISOString(),
            endsAt: cursor.add(SLOT_MINUTES, 'minute').toISOString(),
          });
        }
        cursor = cursor.add(SLOT_MINUTES, 'minute');
      }
    }
  }

  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Проверка, что момент startsAt — свободный слот (для бронирования) */
export function isFreeSlot({ availability, activeBookings, startsAt, now = dayjs() }) {
  const start = dayjs(startsAt);
  if (!start.isValid() || !start.isAfter(now)) return false;

  const dayInOwnerTz = start.tz(availability.timezone).format('YYYY-MM-DD');
  const slots = computeFreeSlots({
    availability,
    activeBookings,
    from: dayInOwnerTz,
    to: dayInOwnerTz,
    now,
  });
  return slots.some((s) => Date.parse(s.startsAt) === start.valueOf());
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
    if ((end - start) % SLOT_MINUTES !== 0) {
      errors.push({ field: `rules[${i}]`, message: 'Интервал должен быть кратен 30 минутам' });
    }
  });

  // Пересечения интервалов в рамках одного дня недели
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
