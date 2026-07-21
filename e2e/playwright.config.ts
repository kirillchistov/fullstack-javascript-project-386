import { defineConfig, devices } from '@playwright/test';

/**
 * E2E-тесты гоняются против реального стека: Fastify-бэкенд (in-memory)
 * и Vite dev-сервер фронтенда поднимаются автоматически (webServer).
 * Бэкенд один на весь прогон, поэтому тесты выполняются последовательно
 * (workers: 1) и используют уникальные данные, чтобы не мешать друг другу.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'ru-RU',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm --prefix ../backend start',
      url: 'http://localhost:5001/api/event-types',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'npm --prefix ../frontend run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
