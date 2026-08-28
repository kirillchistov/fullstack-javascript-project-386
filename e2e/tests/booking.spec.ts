import { expect, test } from '@playwright/test';
import {
  bookFirstFreeSlot,
  dayButton,
  loginAsOwner,
  nextWorkday,
  openMonth,
  selectDate,
  slotButtons,
  uniqueGuest,
  workdayAfter,
} from './helpers';

/**
 * Сценарий 1 (основной): гость бронирует звонок от начала до конца.
 * Полный путь: типы событий -> дата -> слот -> форма -> подтверждение.
 */
test('гость бронирует звонок: полный путь до подтверждения', async ({ page }) => {
  await page.goto('/u/kirill');

  await expect(page.getByRole('heading', { name: /Запись к / })).toBeVisible();
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
  await expect(page.getByText(new RegExp(slotTime))).toBeVisible();
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
    await p.goto('/u/kirill');
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
  await page.goto('/u/kirill');
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

/**
 * Сценарий 6 (регресс): смена даты на шаге формы возвращает к выбору слота.
 * Раньше правая карточка оставалась пустой (step === 'form' без selectedSlot),
 * пользователь терял кнопку «Назад» и не мог продолжить без перезагрузки.
 */
test('смена даты на шаге формы возвращает к выбору слота', async ({ page }) => {
  const date1 = nextWorkday();
  const date2 = workdayAfter(date1);

  await page.goto('/u/kirill');
  await selectDate(page, date1);
  await slotButtons(page).first().click();
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page.getByText('Ваши данные')).toBeVisible();

  // Меняем дату, не выходя из формы
  await selectDate(page, date2, date1);

  // Правая карточка не пустая: снова показан список слотов
  await expect(page.getByText(/^Свободные слоты на /)).toBeVisible();
  await expect(page.getByText('Ваши данные')).toHaveCount(0);
  await expect(slotButtons(page).first()).toBeVisible();

  // Путь можно пройти до конца без перезагрузки страницы
  const guest = uniqueGuest('Регресс');
  await slotButtons(page).first().click();
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.getByLabel('Имя').fill(guest.name);
  await page.getByLabel('Email').fill(guest.email);
  await page.getByRole('button', { name: 'Забронировать', exact: true }).click();
  await expect(page.getByText('Встреча забронирована')).toBeVisible();
});

/**
 * Сценарий 7 (регресс): смена типа события на шаге формы
 * тоже возвращает к выбору слота, а не оставляет пустую карточку.
 */
test('смена типа события на шаге формы возвращает к выбору слота', async ({ page }) => {
  await page.goto('/u/kirill');
  await selectDate(page, nextWorkday());
  await slotButtons(page).first().click();
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page.getByText('Ваши данные')).toBeVisible();

  await page.getByText('Консультация').click();

  await expect(page.getByText(/^Свободные слоты на /)).toBeVisible();
  await expect(page.getByText('Ваши данные')).toHaveCount(0);
});

/**
 * Сценарий 8: горизонт бронирования — даты дальше 14 дней недоступны.
 */
test('даты дальше горизонта 14 дней недоступны в календаре', async ({ page }) => {
  await page.goto('/u/kirill');
  await expect(slotButtons(page).first().or(page.getByText(/свободных слотов нет/))).toBeVisible();

  const beyond = new Date();
  beyond.setDate(beyond.getDate() + 14); // первый день за горизонтом (сегодня + 13 — последний доступный)

  const sameMonth = beyond.getMonth() === new Date().getMonth();
  if (!sameMonth) {
    const nextButton = page.locator('button[data-direction="next"]');
    if (await nextButton.isDisabled()) {
      return; // навигация к следующему месяцу закрыта — даты за горизонтом недостижимы
    }
    await openMonth(page, beyond);
  }
  await expect(dayButton(page, beyond)).toBeDisabled();
});
