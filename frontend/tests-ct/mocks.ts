import dayjs from 'dayjs';
import type { Page } from 'playwright-core';
import type { Booking, EventType, Slot } from '../src/api/client';

/**
 * Моки API для компонентных тестов: запросы перехватываются на уровне сети
 * (page.route), поэтому компоненты работают с настоящим fetch-клиентом
 * по контракту, но без бэкенда.
 */

export const eventTypes: EventType[] = [
  {
    id: 1,
    name: 'Вводный звонок',
    description: 'Знакомство и обсуждение задачи',
    durationMinutes: 30,
  },
  {
    id: 2,
    name: 'Консультация',
    description: 'Разбор вопросов по проекту',
    durationMinutes: 30,
  },
];

/** Слоты на дату (YYYY-MM-DD) в указанное локальное время */
export function slotsFor(date: string, times: string[]): Slot[] {
  return times.map((time) => {
    const startsAt = dayjs(`${date}T${time}`);
    return {
      startsAt: startsAt.toISOString(),
      endsAt: startsAt.add(30, 'minute').toISOString(),
    };
  });
}

export async function mockEventTypes(page: Page): Promise<void> {
  await page.route('**/api/event-types', (route) => route.fulfill({ json: eventTypes }));
}

/**
 * GET /api/slots: отвечает слотами на запрошенную дату (?from=...).
 * Возвращает счётчик запросов — чтобы проверять перезагрузку списка.
 */
export async function mockSlots(
  page: Page,
  times: string[] = ['10:00', '10:30', '11:00'],
): Promise<{ requests: number }> {
  const state = { requests: 0 };
  await page.route('**/api/slots**', (route) => {
    state.requests += 1;
    const from =
      new URL(route.request().url()).searchParams.get('from') ?? dayjs().format('YYYY-MM-DD');
    return route.fulfill({ json: slotsFor(from, times) });
  });
  return state;
}

/** POST /api/bookings: 201 с бронью из тела запроса либо 409 «слот занят» */
export async function mockCreateBooking(
  page: Page,
  { conflict = false }: { conflict?: boolean } = {},
): Promise<void> {
  await page.route('**/api/bookings', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    if (conflict) {
      return route.fulfill({
        status: 409,
        json: { code: 'slot_unavailable', message: 'Слот уже занят или находится в прошлом' },
      });
    }
    const body = route.request().postDataJSON() as {
      eventTypeId: number;
      startsAt: string;
      guestName: string;
      guestEmail: string;
      comment?: string;
    };
    const booking: Booking = {
      id: 1,
      eventTypeId: body.eventTypeId,
      startsAt: body.startsAt,
      endsAt: dayjs(body.startsAt).add(30, 'minute').toISOString(),
      guestName: body.guestName,
      guestEmail: body.guestEmail,
      comment: body.comment,
      status: 'active',
      createdAt: dayjs().toISOString(),
    };
    return route.fulfill({ status: 201, json: booking });
  });
}

const RU_MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/** aria-label кнопки дня в календаре Mantine (локаль ru): «23 июля 2026» */
export function dayAriaLabel(date: dayjs.Dayjs): string {
  return `${date.date()} ${RU_MONTHS_GENITIVE[date.month()]} ${date.year()}`;
}
