import "@typespec/http";
import "./models.tsp";

using Http;

namespace CallCalendar;

/** Cookie-сессия владельца. Гостевые эндпоинты авторизации не требуют. */
alias OwnerSession = ApiKeyAuth<ApiKeyLocation.cookie, "session">;

// ---------------------------------------------------------------------------
// Регистрация владельца
// ---------------------------------------------------------------------------

@tag("Owners")
@route("/api/owners")
namespace OwnerRoutes {
  /**
   * Регистрация нового владельца календаря.
   * При успехе устанавливается сессионная cookie (как при входе).
   * 409 — email или slug уже заняты.
   */
  @post
  op register(@body body: OwnerCreate): {
    @statusCode statusCode: 201;
    @body session: Session;
  } | AlreadyExistsError | ValidationError;
}

// ---------------------------------------------------------------------------
// Сессия владельца
// ---------------------------------------------------------------------------

/** Учётные данные владельца для входа */
model SessionCreate {
  @format("email")
  email: string;

  @minLength(1)
  password: string;
}

/** Активная сессия */
model Session {
  owner: Owner;
}

@tag("Session")
@route("/api/session")
namespace SessionRoutes {
  /** Вход владельца. Устанавливает сессионную cookie. */
  @post
  op login(@body credentials: SessionCreate): Session | UnauthorizedError | ValidationError;

  /** Текущая сессия (проверка «я залогинен?») */
  @useAuth(OwnerSession)
  @get
  op current(): Session | UnauthorizedError;

  /** Выход владельца. Удаляет сессию. */
  @useAuth(OwnerSession)
  @delete
  op logout(): {
    @statusCode statusCode: 204;
  };
}

// ---------------------------------------------------------------------------
// Публичные эндпоинты гостя (по slug владельца)
// ---------------------------------------------------------------------------

@tag("Guest")
@route("/api/public/{slug}")
namespace PublicRoutes {
  /** Публичный профиль владельца для страницы /u/{slug} */
  @get
  op getOwner(@path slug: string): OwnerPublic | NotFoundError;

  /** Типы событий этого владельца */
  @get
  @route("/event-types")
  op listEventTypes(@path slug: string): EventType[] | NotFoundError;

  /**
   * Свободные слоты за период [from, to] для выбранного типа события.
   * Длина слота = durationMinutes типа. Горизонт — 14 дней включая сегодня.
   * Даты from/to интерпретируются в таймзоне владельца.
   */
  @get
  @route("/slots")
  op listSlots(
    @path slug: string,

    /** Тип события: определяет длительность слота */
    @query eventTypeId: int32,

    /** Начало периода, YYYY-MM-DD */
    @query from: plainDate,

    /** Конец периода, YYYY-MM-DD */
    @query to: plainDate,
  ): Slot[] | NotFoundError | ValidationError;

  /**
   * Гость создаёт бронирование на свободный слот владельца.
   * 409 — слот занят (пересечение с другой бронью), в прошлом, вне расписания
   * или дальше горизонта бронирования (14 дней).
   */
  @post
  @route("/bookings")
  op createBooking(@path slug: string, @body booking: BookingCreate): {
    @statusCode statusCode: 201;
    @body booking: Booking;
  } | NotFoundError | ConflictError | ValidationError;
}

// ---------------------------------------------------------------------------
// Типы событий владельца (CRUD)
// ---------------------------------------------------------------------------

@tag("Owner")
@route("/api/event-types")
@useAuth(OwnerSession)
namespace OwnerEventTypeRoutes {
  /** Список своих типов событий */
  @get
  op list(): EventType[] | UnauthorizedError;

  /** Создать тип события */
  @post
  op create(@body body: EventTypeWrite): {
    @statusCode statusCode: 201;
    @body eventType: EventType;
  } | UnauthorizedError | ValidationError;

  /** Обновить тип события */
  @put
  @route("/{id}")
  op update(@path id: int32, @body body: EventTypeWrite): EventType | UnauthorizedError | NotFoundError | ValidationError;

  /** Удалить тип события (если нет активных будущих броней) */
  @delete
  @route("/{id}")
  op remove(@path id: int32): {
    @statusCode statusCode: 204;
  } | UnauthorizedError | NotFoundError | ValidationError;
}

// ---------------------------------------------------------------------------
// Бронирования владельца
// ---------------------------------------------------------------------------

@tag("Owner")
@route("/api/bookings")
@useAuth(OwnerSession)
namespace OwnerBookingRoutes {
  /** Владелец смотрит список предстоящих встреч (только активные, от текущего момента) */
  @get
  op list(): Booking[] | UnauthorizedError;

  /** Владелец отменяет встречу (перевод в статус cancelled, слот снова свободен) */
  @delete
  @route("/{id}")
  op cancel(@path id: int32): {
    @statusCode statusCode: 204;
  } | UnauthorizedError | NotFoundError;
}

// ---------------------------------------------------------------------------
// Доступность владельца
// ---------------------------------------------------------------------------

@tag("Owner")
@route("/api/availability")
@useAuth(OwnerSession)
namespace AvailabilityRoutes {
  /** Текущие настройки доступности */
  @get
  op getAvailability(): Availability | UnauthorizedError;

  /**
   * Полная замена настроек доступности.
   * Интервалы каждого правила должны быть кратны 15 минутам и не пересекаться в рамках дня.
   */
  @put
  op updateAvailability(@body availability: Availability): Availability | UnauthorizedError | ValidationError;
}
