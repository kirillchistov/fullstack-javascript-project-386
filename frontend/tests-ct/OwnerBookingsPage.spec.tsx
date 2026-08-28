import { expect, test } from '@playwright/experimental-ct-react';
import dayjs from 'dayjs';
import OwnerBookingsPage from '../src/pages/OwnerBookingsPage';
import type { Booking } from '../src/api/client';

const booking: Booking = {
  id: 1,
  eventTypeId: 1,
  eventTypeName: 'Вводный звонок',
  startsAt: dayjs().add(1, 'day').hour(10).minute(0).second(0).millisecond(0).toISOString(),
  endsAt: dayjs().add(1, 'day').hour(10).minute(30).second(0).millisecond(0).toISOString(),
  guestName: 'Иван Петров',
  guestEmail: 'ivan@example.com',
  comment: 'Обсудить проект',
  status: 'active',
  paymentStatus: 'none',
  createdAt: dayjs().toISOString(),
};

test('пустой список — сообщение вместо таблицы', async ({ page, mount }) => {
  await page.route('**/api/bookings', (route) => route.fulfill({ json: [] }));
  const component = await mount(<OwnerBookingsPage />);

  await expect(component.getByText('Пока нет ни одной встречи')).toBeVisible();
});

test('встреча показана с данными гостя и статусом', async ({ page, mount }) => {
  await page.route('**/api/bookings', (route) => route.fulfill({ json: [booking] }));
  const component = await mount(<OwnerBookingsPage />);

  const row = component.getByRole('row').filter({ hasText: 'Иван Петров' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Иван Петров');
  await expect(row).toContainText('Вводный звонок');
  await expect(row).toContainText('ivan@example.com');
  await expect(row).toContainText('Обсудить проект');
  await expect(row).toContainText('Активна');
  await expect(row.getByRole('button', { name: 'Отменить' })).toBeVisible();
});

test('отмена встречи: уведомление и обновление списка', async ({ page, mount }) => {
  let cancelled = false;
  await page.route('**/api/bookings', (route) =>
    route.fulfill({ json: cancelled ? [] : [booking] }),
  );
  await page.route('**/api/bookings/1', (route) => {
    cancelled = true;
    return route.fulfill({ status: 204 });
  });
  const component = await mount(<OwnerBookingsPage />);

  await component.getByRole('button', { name: 'Отменить' }).click();

  await expect(page.getByText('Встреча отменена, слот снова свободен')).toBeVisible();
  await expect(component.getByText('Пока нет ни одной встречи')).toBeVisible();
});
