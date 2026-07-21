import "@typespec/http";
import "./models.tsp";

using Http;

namespace CallCalendar;

/** Cookie-сессия владельца. Гостевые эндпоинты авторизации не требуют. */
alias OwnerSession = ApiKeyAuth<ApiKeyLocation.cookie, "session">;

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
// Публичные эндпоинты гостя
// ---------------------------------------------------------------------------

@tag("Guest")
@route("/api/event-types")
namespace EventTypeRoutes {
  /** Список типов событий, на которые можно записаться */
  @get
  op list(): EventType[];
}

@tag("Guest")
@route("/api/slots")
namespace SlotRoutes {
  /**
   * Свободные слоты за период [from, to] включительно.
   * Слоты вычисляются из правил доступности за вычетом активных бронирований;
   * слоты в прошлом не возвращаются.
   */
  @get
  op list(
    /** Начало периода, YYYY-MM-DD */
    @query from: plainDate,

    /** Конец периода, YYYY-MM-DD */
    @query to: plainDate,
  ): Slot[] | ValidationError;
}

// ---------------------------------------------------------------------------
// Бронирования
// ---------------------------------------------------------------------------

@route("/api/bookings")
namespace BookingRoutes {
  /**
   * Гость создаёт бронирование на свободный слот.
   * 409 — слот уже занят или находится в прошлом.
   */
  @tag("Guest")
  @post
  op create(@body booking: BookingCreate): {
    @statusCode statusCode: 201;
    @body booking: Booking;
  } | ConflictError | ValidationError;

  /** Владелец смотрит список предстоящих встреч (только активные, от текущего момента) */
  @tag("Owner")
  @useAuth(OwnerSession)
  @get
  op list(): Booking[] | UnauthorizedError;

  /** Владелец отменяет встречу (перевод в статус cancelled, слот снова свободен) */
  @tag("Owner")
  @useAuth(OwnerSession)
  @delete
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
   * Интервалы каждого правила должны быть кратны 30 минутам и не пересекаться в рамках дня.
   */
  @put
  op updateAvailability(@body availability: Availability): Availability | UnauthorizedError | ValidationError;
}
