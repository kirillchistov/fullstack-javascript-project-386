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
   * Учитываются буфер между встречами и исключения (праздники/отпуск).
   * Длина слота = durationMinutes типа. Горизонт — 14 дней включая сегодня.
   */
  @get
  @route("/slots")
  op listSlots(
    @path slug: string,
    @query eventTypeId: int32,
    @query from: plainDate,
    @query to: plainDate,
  ): Slot[] | NotFoundError | ValidationError;

  /**
   * Гость создаёт бронирование. В ответе — manageToken для отмены/переноса.
   * 409 — слот занят с учётом буфера, в прошлом, вне расписания или за горизонтом.
   */
  @post
  @route("/bookings")
  op createBooking(@path slug: string, @body booking: BookingCreate): {
    @statusCode statusCode: 201;
    @body booking: BookingCreated;
  } | NotFoundError | ConflictError | ValidationError;
}

// ---------------------------------------------------------------------------
// Управление встречей гостем по секретному токену
// ---------------------------------------------------------------------------

@tag("Guest")
@route("/api/guest/bookings/{token}")
namespace GuestBookingRoutes {
  /** Карточка встречи по секретной ссылке */
  @get
  op get(@path token: string): GuestBooking | NotFoundError;

  /** Отмена встречи гостем */
  @delete
  op cancel(@path token: string): {
    @statusCode statusCode: 204;
  } | NotFoundError;

  /**
   * Перенос на другой свободный слот того же типа события.
   * 409 — новый слот недоступен.
   */
  @patch
  op reschedule(@path token: string, @body body: BookingReschedule): GuestBooking | NotFoundError | ConflictError | ValidationError;
}

// ---------------------------------------------------------------------------
// Типы событий владельца (CRUD)
// ---------------------------------------------------------------------------

@tag("Owner")
@route("/api/event-types")
@useAuth(OwnerSession)
namespace OwnerEventTypeRoutes {
  @get
  op list(): EventType[] | UnauthorizedError;

  @post
  op create(@body body: EventTypeWrite): {
    @statusCode statusCode: 201;
    @body eventType: EventType;
  } | UnauthorizedError | ValidationError;

  @put
  @route("/{id}")
  op update(@path id: int32, @body body: EventTypeWrite): EventType | UnauthorizedError | NotFoundError | ValidationError;

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
  @get
  op list(): Booking[] | UnauthorizedError;

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
  @get
  op getAvailability(): Availability | UnauthorizedError;

  /**
   * Полная замена настроек доступности.
   * Правила и интервалы исключений кратны 15 минутам и не пересекаются в рамках дня.
   * Перерыв = два правила в один weekday с разрывом между ними.
   */
  @put
  op updateAvailability(@body availability: Availability): Availability | UnauthorizedError | ValidationError;
}

// ---------------------------------------------------------------------------
// Уведомления владельца
// ---------------------------------------------------------------------------

@tag("Owner")
@route("/api/notification-settings")
@useAuth(OwnerSession)
namespace NotificationSettingsRoutes {
  @get
  op get(): NotificationSettings | UnauthorizedError;

  @put
  op update(@body body: NotificationSettings): NotificationSettings | UnauthorizedError | ValidationError;
}
