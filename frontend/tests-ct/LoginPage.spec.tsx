import { expect, test } from '@playwright/experimental-ct-react';
import { LoginScreen } from './fixtures';

test.beforeEach(async ({ page }) => {
  // AuthProvider проверяет сессию при монтировании — гость не залогинен
  await page.route('**/api/session', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 401,
        json: { code: 'unauthorized', message: 'Требуется вход владельца' },
      });
    }
    return route.fallback();
  });
});

test('кнопка «Войти» недоступна, пока поля не заполнены', async ({ mount }) => {
  const component = await mount(<LoginScreen />);

  const submit = component.getByRole('button', { name: 'Войти' });
  await expect(submit).toBeDisabled();
  await component.getByLabel('Email').fill('owner@example.com');
  await expect(submit).toBeDisabled();
  await component.getByLabel('Пароль').fill('secret');
  await expect(submit).toBeEnabled();
});

test('неверный пароль — ошибка из API показана в форме', async ({ page, mount }) => {
  await page.route('**/api/session', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 401,
        json: { code: 'unauthorized', message: 'Неверный email или пароль' },
      });
    }
    return route.fallback();
  });
  const component = await mount(<LoginScreen />);

  await component.getByLabel('Email').fill('owner@example.com');
  await component.getByLabel('Пароль').fill('wrong');
  await component.getByRole('button', { name: 'Войти' }).click();

  await expect(component.getByText('Неверный email или пароль')).toBeVisible();
  await expect(component.getByRole('heading', { name: 'Вход для владельца' })).toBeVisible();
});

test('успешный вход ведёт в кабинет владельца', async ({ page, mount }) => {
  await page.route('**/api/session', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        json: { owner: { id: 1, name: 'Кирилл Чистов', email: 'owner@example.com' } },
      });
    }
    return route.fallback();
  });
  const component = await mount(<LoginScreen />);

  await component.getByLabel('Email').fill('owner@example.com');
  await component.getByLabel('Пароль').fill('secret');
  await component.getByRole('button', { name: 'Войти' }).click();

  await expect(component.getByText('Экран кабинета владельца')).toBeVisible();
});
