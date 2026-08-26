import dayjs from 'dayjs';
import type { Page } from 'playwright-core';
import type { Booking, EventType, Slot } from '../src/api/client';

export const SLUG = 'kirill';

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
    durationMinutes: 60,
  },
];

export function slotsFor(date: string, times: string[], durationMinutes = 30): Slot[] {
  return times.map((time) => {
    const startsAt = dayjs(`${date}T${time}`);
    return {
      startsAt: startsAt.toISOString(),
      endsAt: startsAt.add(durationMinutes, 'minute').toISOString(),
    };
  });
}

export async function mockPublicOwner(page: Page, slug = SLUG): Promise<void> {
  await page.route(`**/api/public/${slug}`, (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      json: {
        id: 1,
        name: 'Кирилл Чистов',
        slug,
        timezone: 'Europe/Moscow',
      },
    });
  });
}

export async function mockEventTypes(page: Page, slug = SLUG): Promise<void> {
  await page.route(`**/api/public/${slug}/event-types`, (route) =>
    route.fulfill({ json: eventTypes }),
  );
}

export async function mockSlots(
  page: Page,
  times: string[] = ['10:00', '10:30', '11:00'],
  slug = SLUG,
): Promise<{ requests: number }> {
  const state = { requests: 0 };
  await page.route(`**/api/public/${slug}/slots**`, (route) => {
    state.requests += 1;
    const from =
      new URL(route.request().url()).searchParams.get('from') ?? dayjs().format('YYYY-MM-DD');
    return route.fulfill({ json: slotsFor(from, times) });
  });
  return state;
}

export async function mockCreateBooking(
  page: Page,
  { conflict = false, slug = SLUG }: { conflict?: boolean; slug?: string } = {},
): Promise<void> {
  await page.route(`**/api/public/${slug}/bookings`, (route) => {
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
    return route.fulfill({ status: 201, json: { ...booking, manageToken: 'demo-token' } });
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

export function dayAriaLabel(date: dayjs.Dayjs): string {
  return `${date.date()} ${RU_MONTHS_GENITIVE[date.month()]} ${date.year()}`;
}
