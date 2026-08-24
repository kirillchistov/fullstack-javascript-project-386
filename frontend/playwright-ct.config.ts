import { defineConfig, devices } from '@playwright/experimental-ct-react';

/**
 * Компонентные тесты: React-компоненты монтируются в реальном Chromium,
 * а запросы к API перехватываются в тестах (page.route) — бэкенд не нужен.
 * Полные интеграционные сценарии — в ../e2e.
 */
export default defineConfig({
  testDir: './tests-ct',
  timeout: 15_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'on-first-retry',
    ctPort: 3100,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
