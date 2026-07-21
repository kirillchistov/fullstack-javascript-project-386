import "@typespec/http";

using Http;

namespace CallCalendar;

// ---------------------------------------------------------------------------
// Доменные сущности
// ---------------------------------------------------------------------------

/** Владелец календаря. В MVP владелец один, создаётся при инициализации приложения. */
@example(#{ id: 1, name: "Кирилл Чистов", email: "owner@example.com" })
model Owner {
  id: int32;

  /** Отображаемое имя, показывается гостю на странице бронирования */
  name: string;

  @format("email")
  email: string;
}

/** Тип события — то, на что гость записывается (например, «Вводный звонок») */
@example(#{
  id: 1,
  name: "Вводный звонок",
  description: "Знакомство и обсуждение задачи",
  durationMinutes: 30,
})
model EventType {
  id: int32;

  name: string;

  description?: string;

  /** Длительность встречи в минутах. В MVP всегда 30. */
  durationMinutes: int32 = 30;
}

/**
 * Правило доступности: повторяющийся недельный интервал,
 * в котором владелец готов принимать звонки (например, Пн 10:00–18:00).
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

/** Настройки доступности владельца: часовой пояс + набор недельных правил */
@example(#{
  timezone: "Europe/Moscow",
  rules: #[
    #{ weekday: 1, startTime: "10:00", endTime: "18:00" },
    #{ weekday: 3, startTime: "10:00", endTime: "14:00" }
  ],
})
model Availability {
  /** Часовой пояс владельца, IANA-идентификатор (например, Europe/Moscow) */
  timezone: string;

  rules: AvailabilityRule[];
}

/**
 * Свободный 30-минутный слот. Вычисляется на лету из правил доступности
 * за вычетом активных бронирований — в базе не хранится.
 */
@example(#{
  startsAt: utcDateTime.fromISO("2026-07-27T10:00:00Z"),
  endsAt: utcDateTime.fromISO("2026-07-27T10:30:00Z"),
})
model Slot {
  /** Начало слота, UTC */
  startsAt: utcDateTime;

  /** Конец слота, UTC (startsAt + 30 минут) */
  endsAt: utcDateTime;
}

enum BookingStatus {
  active,
  cancelled,
}

/** Бронирование: гость занял конкретный слот под конкретный тип события */
@example(#{
  id: 1,
  eventTypeId: 1,
  startsAt: utcDateTime.fromISO("2026-07-27T10:00:00Z"),
  endsAt: utcDateTime.fromISO("2026-07-27T10:30:00Z"),
  guestName: "Иван Петров",
  guestEmail: "ivan@example.com",
  comment: "Хочу обсудить проект",
  status: BookingStatus.active,
  createdAt: utcDateTime.fromISO("2026-07-21T12:00:00Z"),
})
model Booking {
  id: int32;

  eventTypeId: int32;

  startsAt: utcDateTime;

  endsAt: utcDateTime;

  guestName: string;

  @format("email")
  guestEmail: string;

  /** Комментарий гостя владельцу (тема звонка и т. п.) */
  comment?: string;

  status: BookingStatus;

  createdAt: utcDateTime;
}

/** Данные для создания бронирования гостем */
model BookingCreate {
  eventTypeId: int32;

  /** Начало выбранного слота, UTC. Должно совпадать со слотом из GET /api/slots. */
  startsAt: utcDateTime;

  @minLength(1)
  guestName: string;

  @format("email")
  guestEmail: string;

  comment?: string;
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

/** 422 — ошибка валидации входных данных */
@error
model ValidationError {
  @statusCode statusCode: 422;
  code: "validation_error";
  message: string;
  errors?: FieldError[];
}
