import "@typespec/http";

using Http;

namespace CallCalendar;

// ---------------------------------------------------------------------------
// Доменные сущности
// ---------------------------------------------------------------------------

/** Владелец календаря. В MVP владелец один, создаётся при инициализации приложения. */
model Owner {
  id: int32;

  /** Отображаемое имя, показывается гостю на странице бронирования */
  name: string;

  @format("email")
  email: string;
}

/** Тип события — то, на что гость записывается (например, «Вводный звонок») */
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
model Availability {
  /** Часовой пояс владельца, IANA-идентификатор (например, Europe/Moscow) */
  timezone: string;

  rules: AvailabilityRule[];
}

/**
 * Свободный 30-минутный слот. Вычисляется на лету из правил доступности
 * за вычетом активных бронирований — в базе не хранится.
 */
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
