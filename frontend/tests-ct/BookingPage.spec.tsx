import { expect, test } from '@playwright/experimental-ct-react';
import dayjs from 'dayjs';
import { BookingScreen } from './fixtures';
import { dayAriaLabel, mockCreateBooking, mockEventTypes, mockPublicOwner, mockSlots } from './mocks';

test.beforeEach(async ({ page }) => {
  await mockPublicOwner(page);
  await mockEventTypes(page);
});

test('показывает типы событий и свободные слоты из API', async ({ page, mount }) => {
  await mockSlots(page);
  const component = await mount(<BookingScreen />);

  await expect(component.getByText('Запись к Кирилл Чистов')).toBeVisible();
  await expect(component.getByText('Вводный звонок')).toBeVisible();
  await expect(component.getByText('Консультация')).toBeVisible();
  for (const time of ['10:00', '10:30', '11:00']) {
    await expect(component.getByRole('button', { name: time, exact: true })).toBeVisible();
  }
});

test('нет свободных слотов — понятное сообщение вместо пустой сетки', async ({ page, mount }) => {
  await mockSlots(page, []);
  const component = await mount(<BookingScreen />);

  await expect(component.getByText(/свободных слотов нет/)).toBeVisible();
  await expect(component.getByRole('button', { name: 'Продолжить' })).toBeDisabled();
});

test('выбор слота открывает форму, «Назад» возвращает к списку', async ({ page, mount }) => {
  await mockSlots(page);
  const component = await mount(<BookingScreen />);

  await component.getByRole('button', { name: '10:00', exact: true }).click();
  await component.getByRole('button', { name: 'Продолжить' }).click();

  await expect(component.getByText('Ваши данные')).toBeVisible();
  await expect(component.getByRole('button', { name: 'Забронировать' })).toBeDisabled();

  await component.getByRole('button', { name: 'Назад' }).click();
  await expect(component.getByText(/^Свободные слоты на /)).toBeVisible();
});

test('смена даты на шаге формы возвращает к списку слотов', async ({ page, mount }) => {
  await mockSlots(page);
  const component = await mount(<BookingScreen />);

  await component.getByRole('button', { name: '10:00', exact: true }).click();
  await component.getByRole('button', { name: 'Продолжить' }).click();
  await expect(component.getByText('Ваши данные')).toBeVisible();

  await component.getByLabel(dayAriaLabel(dayjs().add(1, 'day')), { exact: true }).click();

  await expect(component.getByText(/^Свободные слоты на /)).toBeVisible();
  await expect(component.getByText('Ваши данные')).toHaveCount(0);
});

test('смена типа события на шаге формы возвращает к списку слотов', async ({ page, mount }) => {
  await mockSlots(page);
  const component = await mount(<BookingScreen />);

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
  const component = await mount(<BookingScreen />);

  await component.getByRole('button', { name: '10:30', exact: true }).click();
  await component.getByRole('button', { name: 'Продолжить' }).click();
  await component.getByLabel('Имя').fill('Иван Петров');
  await component.getByLabel('Email').fill('ivan@example.com');
  await component.getByRole('button', { name: 'Забронировать' }).click();

  await expect(component.getByText('Встреча забронирована')).toBeVisible();
  await expect(component.getByText(/ivan@example\.com/)).toBeVisible();
});

test('409 при бронировании: уведомление, возврат к списку и перезагрузка слотов', async ({
  page,
  mount,
}) => {
  const slotsState = await mockSlots(page);
  await mockCreateBooking(page, { conflict: true });
  const component = await mount(<BookingScreen />);

  await component.getByRole('button', { name: '10:00', exact: true }).click();
  await component.getByRole('button', { name: 'Продолжить' }).click();
  await component.getByLabel('Имя').fill('Иван Петров');
  await component.getByLabel('Email').fill('ivan@example.com');
  const requestsBefore = slotsState.requests;
  await component.getByRole('button', { name: 'Забронировать' }).click();

  await expect(
    page.getByText('Этот слот уже занят. Пожалуйста, выберите другое время.'),
  ).toBeVisible();
  await expect(component.getByText(/^Свободные слоты на /)).toBeVisible();
  expect(slotsState.requests).toBeGreaterThan(requestsBefore);
});
