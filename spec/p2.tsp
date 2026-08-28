import "@typespec/http";
import "./models.tsp";

using Http;

namespace CallCalendar;

// ---------------------------------------------------------------------------
// P2: тариф, команда, sync календарей, серии, аналитика, оплата
// ---------------------------------------------------------------------------

enum CalendarConnectionKind {
  google,
  ics,
}

/** Подключённый источник занятости (busy) */
model CalendarConnection {
  id: int32;
  kind: CalendarConnectionKind;
  /** Для ICS — URL; для Google — email календаря или "primary" */
  label: string;
  lastSyncedAt?: utcDateTime;
}

model IcsConnectionCreate {
  @minLength(1)
  url: string;

  @minLength(1)
  label: string;
}

model GoogleAuthStart {
  /** URL для OAuth-редиректа пользователя в Google */
  authUrl: string;
}

enum OrgRole {
  owner,
  member,
}

model Organization {
  id: int32;
  name: string;
  /** Владелец-создатель организации */
  ownerId: int32;
}

model OrganizationMember {
  ownerId: int32;
  name: string;
  email: string;
  slug: string;
  role: OrgRole;
}

model OrganizationCreate {
  @minLength(1)
  name: string;
}

model OrganizationInviteCreate {
  @format("email")
  email: string;
}

model OrganizationInvite {
  token: string;
  /** Ссылка для принявшего приглашение (фронт /team/join?token=) */
  joinPath: string;
}

model OrganizationJoin {
  @minLength(1)
  token: string;
}

/** Серия повторяющихся встреч (тьютор ↔ ученик), еженедельно */
model BookingSeries {
  id: int32;
  eventTypeId: int32;
  guestName: string;

  @format("email")
  guestEmail: string;

  comment?: string;
  /** Первый старт серии, UTC */
  startsAt: utcDateTime;
  /** Число встреч в серии (1–52) */
  @minValue(1)
  @maxValue(52)
  count: int32;
  /** Созданные брони (id) */
  bookingIds: int32[];
}

model BookingSeriesCreate {
  eventTypeId: int32;

  @minLength(1)
  guestName: string;

  @format("email")
  guestEmail: string;

  comment?: string;
  startsAt: utcDateTime;

  @minValue(1)
  @maxValue(52)
  count: int32;
}

model AnalyticsSummary {
  from: plainDate;
  to: plainDate;
  created: int32;
  cancelled: int32;
  /** Активные будущие на момент запроса */
  upcoming: int32;
  /** Число броней по ISO-дню недели 1..7 */
  byWeekday: int32[];
}

model PaymentInfo {
  id: int32;
  bookingId: int32;
  amountRub: int32;
  status: PaymentStatus;
  /** URL оплаты (YooKassa или stub) */
  confirmationUrl: string;
}

/** Ручная активация Pro (заглушка подписки) */
model ActivatePro {
  /**
   * Код активации. Совпадает с BILLING_PRO_CODE или "pro-dev"
   * в development без переменной.
   */
  @minLength(1)
  code: string;
}

/** 403 — нужна подписка Pro */
@error
model ForbiddenError {
  @statusCode statusCode: 403;
  code: "forbidden";
  message: string;
}
