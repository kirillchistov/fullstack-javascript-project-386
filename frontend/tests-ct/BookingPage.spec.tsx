import { expect, test } from '@playwright/experimental-ct-react';
import dayjs from 'dayjs';
import BookingPage from '../src/pages/BookingPage';
import { dayAriaLabel, mockCreateBooking, mockEventTypes, mockSlots } from './mocks';

test.beforeEach(async ({ page }) => {
  await mockEventTypes(page);
});

test('показывает типы событий и свободные слоты из API', async ({ page, mount }) => {
  await mockSlots(page);
  const component = await mount(<BookingPage />);

  await expect(component.getByText('Вводный звонок')).toBeVisible();
  await expect(component.getByText('Консультация')).toBeVisible();
  for (const time of ['10:00', '10:30', '11:00']) {
    await expect(component.getByRole('button', { name: time, exact: true })).toBeVisible();
  }
});

test('нет свободных слотов — понятное сообщение вместо пустой сетки', async ({ page, mount }) => {
  await mockSlots(page, []);
  const component = await mount(<BookingPage />);

  await expect(component.getByText(/свободных слотов нет/)).toBeVisible();
  await expect(component.getByRole('button', { name: 'Продолжить' })).toBeDisabled();
});

test('выбор слота открывает форму, «Назад» возвращает к списку', async ({ page, mount }) => {
  await mockSlots(page);
  const component = await mount(<BookingPage />);

  await component.getByRole('button', { name: '10:00', exact: true }).click();
  await component.getByRole('button', { name: 'Продолжить' }).click();

  await expect(component.getByText('Ваши данные')).toBeVisible();
  await expect(component.getByText(/Вводный звонок, .*10:00–10:30/)).toBeVisible();
  // Без имени и email бронирование недоступно
  await expect(component.getByRole('button', { name: 'Забронировать' })).toBeDisabled();

  await component.getByRole('button', { name: 'Назад' }).click();
  await expect(component.getByText(/^Свободные слоты на /)).toBeVisible();
});

/**
 * Регресс: раньше смена даты из формы оставляла правую карточку пустой
 * (step === 'form' без selectedSlot) — пользователь не мог продолжить.
 */
test('смена даты на шаге формы возвращает к списку слотов', async ({ page, mount }) => {
  await mockSlots(page);
  const component = await mount(<BookingPage />);

  await component.getByRole('button', { name: '10:00', exact: true }).click();
  await component.getByRole('button', { name: 'Продолжить' }).click();
  await expect(component.getByText('Ваши данные')).toBeVisible();

  await component.getByLabel(dayAriaLabel(dayjs().add(1, 'day')), { exact: true }).click();

  await expect(component.getByText(/^Свободные слоты на /)).toBeVisible();
  await expect(component.getByText('Ваши данные')).toHaveCount(0);
  await expect(component.getByRole('button', { name: '10:00', exact: true })).toBeVisible();
});

test('смена типа события на шаге формы возвращает к списку слотов', async ({ page, mount }) => {
  await mockSlots(page);
  const component = await mount(<BookingPage />);

  await component.getByRole('button', { name: '10:00', exact: true }).click();
  await component.getByRole('button', { name: 'Продолжить' }).click();
  await expect(component.getByText('Ваши данные')).toBeVisible();

  await component.getByText('Консультация').click();

  await expect(component.getByText(/^Свободные слоты на /)).toBeVisible();
  await expect(component.getByText('Ваши данные')).toHaveCount(0);
});

test('успешное бронирование показывает подтверждение с данными', async ({ page, mount }) => {
  await mockSlots(page);
  await mockCreateBooking(page);
  const component = await mount(<BookingPage />);

  await component.getByRole('button', { name: '10:30', exact: true }).click();
  await component.getByRole('button', { name: 'Продолжить' }).click();
  await component.getByLabel('Имя').fill('Иван Петров');
  await component.getByLabel('Email').fill('ivan@example.com');
  await component.getByRole('button', { name: 'Забронировать' }).click();

  await expect(component.getByText('Встреча забронирована')).toBeVisible();
  await expect(component.getByText(/10:30/)).toBeVisible();
  await expect(component.getByText(/ivan@example\.com/)).toBeVisible();
});

test('409 при бронировании: уведомление, возврат к списку и перезагрузка слотов', async ({
  page,
  mount,
}) => {
  const slotsState = await mockSlots(page);
  await mockCreateBooking(page, { conflict: true });
  const component = await mount(<BookingPage />);

  await component.getByRole('button', { name: '10:00', exact: true }).click();
  await component.getByRole('button', { name: 'Продолжить' }).click();
  await component.getByLabel('Имя').fill('Иван Петров');
  await component.getByLabel('Email').fill('ivan@example.com');
  const requestsBefore = slotsState.requests;
  await component.getByRole('button', { name: 'Забронировать' }).click();

  // Уведомление рендерится в портале — ищем на странице, а не в компоненте
  await expect(page.getByText('Этот слот уже занят. Пожалуйста, выберите другое время.')).toBeVisible();
  await expect(component.getByText(/^Свободные слоты на /)).toBeVisible();
  await expect(component.getByText('Ваши данные')).toHaveCount(0);
  expect(slotsState.requests).toBeGreaterThan(requestsBefore);
});
