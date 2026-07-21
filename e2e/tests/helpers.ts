import { expect, type Page } from '@playwright/test';

/**
 * Расписание сида бэкенда: Пн–Пт 10:00–18:00 (Europe/Moscow).
 * Тесты всегда выбирают ближайший будний день в будущем,
 * чтобы на дате гарантированно были свободные слоты.
 */
export function nextWorkday(): Date {
  const date = new Date();
  do {
    date.setDate(date.getDate() + 1);
  } while (date.getDay() === 0 || date.getDay() === 6);
  return date;
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
export function dayAriaLabel(date: Date): string {
  return `${date.getDate()} ${RU_MONTHS_GENITIVE[date.getMonth()]} ${date.getFullYear()}`;
}

/** Выбрать дату в календаре: перелистнуть месяц при необходимости и кликнуть день */
export async function selectDate(page: Page, date: Date): Promise<void> {
  const today = new Date();
  const monthsAhead =
    (date.getFullYear() - today.getFullYear()) * 12 + (date.getMonth() - today.getMonth());
  for (let i = 0; i < monthsAhead; i += 1) {
    await page.locator('button[data-direction="next"]').click();
  }
  await page.getByLabel(dayAriaLabel(date)).click();
}

export const slotButtons = (page: Page) =>
  page.getByRole('button', { name: /^\d{2}:\d{2}$/ });

/**
 * Полный путь гостя до подтверждения брони.
 * Возвращает время (HH:MM) забронированного слота.
 */
export async function bookFirstFreeSlot(
  page: Page,
  guest: { name: string; email: string; comment?: string },
  date: Date,
): Promise<string> {
  await page.goto('/');
  await selectDate(page, date);

  const slot = slotButtons(page).first();
  await expect(slot).toBeVisible();
  const slotTime = (await slot.textContent()) ?? '';
  await slot.click();

  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.getByLabel('Имя').fill(guest.name);
  await page.getByLabel('Email').fill(guest.email);
  if (guest.comment) {
    await page.getByLabel('Комментарий').fill(guest.comment);
  }
  await page.getByRole('button', { name: 'Забронировать', exact: true }).click();

  await expect(page.getByText('Встреча забронирована')).toBeVisible();
  return slotTime;
}

/** Вход владельца (сид бэкенда: owner@example.com / secret) */
export async function loginAsOwner(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill('owner@example.com');
  await page.getByLabel('Пароль').fill('secret');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('heading', { name: 'Предстоящие встречи' })).toBeVisible();
}

/** Уникальные данные гостя, чтобы тесты не пересекались. Email — латиницей (format: email). */
export function uniqueGuest(prefix: string) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return {
    name: `${prefix} ${id}`,
    email: `guest-${id}@example.com`,
  };
}
