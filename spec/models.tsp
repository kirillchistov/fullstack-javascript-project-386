import "@typespec/http";

using Http;

namespace CallCalendar;

enum Plan {
  free,
  pro,
}

// ---------------------------------------------------------------------------
// Доменные сущности
// ---------------------------------------------------------------------------

/**
 * Владелец календаря. Создаётся через регистрацию; публичная страница —
 * /u/{slug} на фронтенде и /api/public/{slug} в API.
 */
@example(#{
  id: 1,
  name: "Кирилл Чистов",
  email: "owner@example.com",
  slug: "kirill",
  plan: Plan.free,
})
model Owner {
  id: int32;

  /** Отображаемое имя, показывается гостю на странице бронирования */
  name: string;

  @format("email")
  email: string;

  /**
   * Публичный идентификатор в URL: латиница, цифры, дефис;
   * 2–32 символа, начинается и заканчивается буквой или цифрой.
   */
  @pattern("^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$")
  slug: string;

  /** Тариф: free или pro (команда, sync, аналитика, серии) */
  plan: Plan;
}

/** Публичный профиль владельца для гостевой страницы бронирования */
@example(#{
  id: 1,
  name: "Кирилл Чистов",
  slug: "kirill",
  timezone: "Europe/Moscow",
})
model OwnerPublic {
  id: int32;
  name: string;
  slug: string;

  /** IANA-таймзона владельца (в ней заданы правила доступности) */
  timezone: string;
}

/** Данные регистрации нового владельца */
model OwnerCreate {
  @minLength(1)
  name: string;

  @format("email")
  email: string;

  @minLength(6)
  password: string;

  @pattern("^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$")
  slug: string;
}

/** Тип события — то, на что гость записывается (например, «Вводный звонок») */
@example(#{
  id: 1,
  name: "Вводный звонок",
  description: "Знакомство и обсуждение задачи",
  durationMinutes: 30,
  priceRub: 0,
})
model EventType {
  id: int32;

  name: string;

  description?: string;

  /**
   * Длительность встречи в минутах: 15–240, кратно 15.
   * От неё зависят длина слота и шаг сетки при вычислении свободного времени.
   */
  @minValue(15)
  @maxValue(240)
  durationMinutes: int32;

  /** Цена в рублях; 0 — бесплатно */
  @minValue(0)
  priceRub: int32;
}

/** Создание / обновление типа события владельцем */
model EventTypeWrite {
  @minLength(1)
  name: string;

  description?: string;

  @minValue(15)
  @maxValue(240)
  durationMinutes: int32;

  @minValue(0)
  priceRub?: int32;
}

/**
 * Правило доступности: повторяющийся недельный интервал,
 * в котором владелец готов принимать звонки (например, Пн 10:00–18:00).
 * Перерыв внутри дня = два непересекающихся правила в один weekday.
 */
model AvailabilityRule {
  /** День недели по ISO 8601: 1 — понедельник … 7 — воскресенье */
  @minValue(1)
  @maxValue(7)
  weekday: int32;

  /** Начало интервала, локальное время владельца в формате HH:MM */
  @pattern("^([01][0-9]|2[0-3]):[0-5][0-9]$")
  startTime: string;

  /** Конец интервала, локальное время владельца в формате HH:MM */
  @pattern("^([01][0-9]|2[0-3]):[0-5][0-9]$")
  endTime: string;
}

/** Интервал времени в пределах одного календарного дня (локальное время владельца) */
model DayInterval {
  @pattern("^([01][0-9]|2[0-3]):[0-5][0-9]$")
  startTime: string;

  @pattern("^([01][0-9]|2[0-3]):[0-5][0-9]$")
  endTime: string;
}

/**
 * Исключение из недельного расписания на конкретную дату
 * (праздник, отпуск, особый день приёма).
 * Пустой `intervals` — день полностью недоступен.
 */
model AvailabilityException {
  /** Дата YYYY-MM-DD в календаре владельца */
  date: plainDate;

  /** Рабочие интервалы в этот день; [] = выходной */
  intervals: DayInterval[];
}

/** Настройки доступности владельца */
@example(#{
  timezone: "Europe/Moscow",
  bufferMinutes: 15,
  rules: #[
    #{ weekday: 1, startTime: "10:00", endTime: "13:00" },
    #{ weekday: 1, startTime: "14:00", endTime: "18:00" }
  ],
  exceptions: #[
    #{ date: plainDate.fromISO("2026-01-01"), intervals: #[] }
  ],
})
model Availability {
  /** Часовой пояс владельца, IANA-идентификатор (например, Europe/Moscow) */
  timezone: string;

  /**
   * Буфер до и после каждой активной встречи (минуты, кратно 15).
   * В это время новые слоты не предлагаются.
   */
  @minValue(0)
  @maxValue(120)
  bufferMinutes: int32;

  rules: AvailabilityRule[];

  /** Праздники, отпуска и разовые переопределения дней */
  exceptions: AvailabilityException[];
}

/**
 * Свободный слот. Вычисляется на лету из правил доступности и длительности
 * выбранного типа события за вычетом активных бронирований — в базе не хранится.
 */
@example(#{
  startsAt: utcDateTime.fromISO("2026-07-27T10:00:00Z"),
  endsAt: utcDateTime.fromISO("2026-07-27T10:30:00Z"),
})
model Slot {
  /** Начало слота, UTC */
  startsAt: utcDateTime;

  /** Конец слота, UTC (startsAt + durationMinutes типа события) */
  endsAt: utcDateTime;
}

enum BookingStatus {
  active,
  cancelled,
}

enum PaymentStatus {
  none,
  pending,
  paid,
  failed,
}

/** Бронирование для владельца (без секретного токена гостя) */
@example(#{
  id: 1,
  eventTypeId: 1,
  eventTypeName: "Вводный звонок",
  startsAt: utcDateTime.fromISO("2026-07-27T10:00:00Z"),
  endsAt: utcDateTime.fromISO("2026-07-27T10:30:00Z"),
  guestName: "Иван Петров",
  guestEmail: "ivan@example.com",
  comment: "Хочу обсудить проект",
  status: BookingStatus.active,
  paymentStatus: PaymentStatus.none,
  createdAt: utcDateTime.fromISO("2026-07-21T12:00:00Z"),
})
model Booking {
  id: int32;

  eventTypeId: int32;

  /** Название типа события на момент ответа (для списков владельца) */
  eventTypeName: string;

  startsAt: utcDateTime;

  endsAt: utcDateTime;

  guestName: string;

  @format("email")
  guestEmail: string;

  /** Комментарий гостя владельцу (тема звонка и т. п.) */
  comment?: string;

  status: BookingStatus;

  paymentStatus: PaymentStatus;

  createdAt: utcDateTime;
}

/**
 * Ответ при создании брони: обычные поля + секретный токен
 * для отмены/переноса гостем (ссылка /b/{manageToken}).
 */
model BookingCreated {
  id: int32;
  eventTypeId: int32;
  startsAt: utcDateTime;
  endsAt: utcDateTime;
  guestName: string;

  @format("email")
  guestEmail: string;

  comment?: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  createdAt: utcDateTime;

  /** Секретный токен управления встречей гостем */
  manageToken: string;

  /** URL оплаты, если тип события платный и статус pending */
  paymentUrl?: string;
}

/** Карточка встречи для гостя по секретному токену */
model GuestBooking {
  id: int32;
  eventTypeName: string;
  durationMinutes: int32;
  ownerName: string;
  ownerSlug: string;
  ownerTimezone: string;
  startsAt: utcDateTime;
  endsAt: utcDateTime;
  guestName: string;

  @format("email")
  guestEmail: string;

  comment?: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
}

/** Данные для создания бронирования гостем */
model BookingCreate {
  eventTypeId: int32;

  /** Начало выбранного слота, UTC. Должно совпадать со слотом из GET …/slots. */
  startsAt: utcDateTime;

  @minLength(1)
  guestName: string;

  @format("email")
  guestEmail: string;

  comment?: string;
}

/** Перенос встречи гостем на другой свободный слот того же типа */
model BookingReschedule {
  startsAt: utcDateTime;
}

/** Настройки уведомлений владельца */
model NotificationSettings {
  /** Письма о новых / отменённых / перенесённых встречах и напоминания */
  emailEnabled: boolean;

  /**
   * Chat id Telegram для уведомлений владельцу.
   * Пустая строка / отсутствие — Telegram выключен.
   */
  telegramChatId?: string;

  /** За сколько часов до встречи слать напоминание гостю и владельцу (1–168) */
  @minValue(1)
  @maxValue(168)
  reminderHoursBefore: int32;
}

// ---------------------------------------------------------------------------
// Модели ошибок (единый формат: code + message)
// ---------------------------------------------------------------------------

/** Ошибка одного поля при валидации */
model FieldError {
  field: string;
  message: string;
}

/** 401 — нет активной сессии владельца или неверные учётные данные */
@error
model UnauthorizedError {
  @statusCode statusCode: 401;
  code: "unauthorized";
  message: string;
}

/** 404 — ресурс не найден */
@error
model NotFoundError {
  @statusCode statusCode: 404;
  code: "not_found";
  message: string;
}

/** 409 — конфликт: слот уже занят или находится в прошлом */
@error
model ConflictError {
  @statusCode statusCode: 409;
  code: "slot_unavailable";
  message: string;
}

/** 409 — email или slug уже заняты при регистрации */
@error
model AlreadyExistsError {
  @statusCode statusCode: 409;
  code: "already_exists";
  message: string;
}

/** 422 — ошибка валидации входных данных */
@error
model ValidationError {
  @statusCode statusCode: 422;
  code: "validation_error";
  message: string;
  errors?: FieldError[];
}
