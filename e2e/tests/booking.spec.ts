import { expect, test } from '@playwright/test';
import {
  bookFirstFreeSlot,
  loginAsOwner,
  nextWorkday,
  selectDate,
  slotButtons,
  uniqueGuest,
} from './helpers';

/**
 * Сценарий 1 (основной): гость бронирует звонок от начала до конца.
 * Полный путь: типы событий -> дата -> слот -> форма -> подтверждение.
 */
test('гость бронирует звонок: полный путь до подтверждения', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Выберите время звонка' })).toBeVisible();
  await expect(page.getByText('Вводный звонок')).toBeVisible();

  const date = nextWorkday();
  await selectDate(page, date);

  const slot = slotButtons(page).first();
  await expect(slot).toBeVisible();
  const slotTime = (await slot.textContent()) ?? '';
  await slot.click();
  await page.getByRole('button', { name: 'Продолжить' }).click();

  const guest = uniqueGuest('Гость');
  await page.getByLabel('Имя').fill(guest.name);
  await page.getByLabel('Email').fill(guest.email);
  await page.getByLabel('Комментарий').fill('Обсудить проект');
  await page.getByRole('button', { name: 'Забронировать', exact: true }).click();

  await expect(page.getByText('Встреча забронирована')).toBeVisible();
  await expect(page.getByText(new RegExp(`, ${slotTime}$`))).toBeVisible();
  await expect(page.getByText(guest.email)).toBeVisible();
});

/**
 * Сценарий 2: забронированный слот исчезает из свободных.
 */
test('забронированный слот больше не предлагается гостям', async ({ page }) => {
  const date = nextWorkday();
  const guest = uniqueGuest('Слот');
  const slotTime = await bookFirstFreeSlot(page, guest, date);

  await page.getByRole('button', { name: 'Забронировать ещё одну встречу' }).click();
  await selectDate(page, date);

  await expect(slotButtons(page).first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: slotTime, exact: true }),
  ).toHaveCount(0);
});

/**
 * Сценарий 3: конфликт бронирования. Два гостя видят один и тот же слот,
 * первый бронирует его, второй (со устаревшим списком) получает понятную
 * ошибку «слот занят» (409 из контракта) и возвращается к выбору времени.
 */
test('второй гость получает ошибку, если слот уже занят', async ({ page, context }) => {
  const date = nextWorkday();

  // Оба гостя открывают страницу и видят один и тот же первый слот
  const pageB = await context.newPage();
  for (const p of [page, pageB]) {
    await p.goto('/');
    await selectDate(p, date);
    await expect(slotButtons(p).first()).toBeVisible();
  }
  const slotTime = (await slotButtons(page).first().textContent()) ?? '';

  // Первый гость успевает забронировать
  const guestA = uniqueGuest('Первый');
  await slotButtons(page).first().click();
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.getByLabel('Имя').fill(guestA.name);
  await page.getByLabel('Email').fill(guestA.email);
  await page.getByRole('button', { name: 'Забронировать', exact: true }).click();
  await expect(page.getByText('Встреча забронирована')).toBeVisible();

  // Второй пытается взять тот же слот из устаревшего списка
  const guestB = uniqueGuest('Второй');
  await pageB.getByRole('button', { name: slotTime, exact: true }).click();
  await pageB.getByRole('button', { name: 'Продолжить' }).click();
  await pageB.getByLabel('Имя').fill(guestB.name);
  await pageB.getByLabel('Email').fill(guestB.email);
  await pageB.getByRole('button', { name: 'Забронировать', exact: true }).click();

  await expect(pageB.getByText('Этот слот уже занят')).toBeVisible();
  // Список обновился — занятого слота в нём больше нет
  await expect(pageB.getByRole('button', { name: slotTime, exact: true })).toHaveCount(0);
});

/**
 * Сценарий 4: владелец видит бронь гостя и отменяет её,
 * слот возвращается в свободные.
 */
test('владелец видит бронь, отменяет её — слот снова свободен', async ({ page }) => {
  const date = nextWorkday();
  const guest = uniqueGuest('Клиент');
  const slotTime = await bookFirstFreeSlot(page, guest, date);

  await loginAsOwner(page);

  const row = page.getByRole('row').filter({ hasText: guest.name });
  await expect(row).toBeVisible();
  await expect(row).toContainText(guest.email);

  await row.getByRole('button', { name: 'Отменить' }).click();
  await expect(page.getByText('Встреча отменена, слот снова свободен')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: guest.name })).toHaveCount(0);

  // Слот снова доступен гостям
  await page.goto('/');
  await selectDate(page, date);
  await expect(page.getByRole('button', { name: slotTime, exact: true })).toBeVisible();
});

/**
 * Сценарий 5: доступ владельца защищён — без входа кабинет недоступен.
 */
test('кабинет владельца без входа редиректит на логин', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Вход для владельца' })).toBeVisible();
});
