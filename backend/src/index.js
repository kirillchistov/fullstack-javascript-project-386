import { buildApp } from './app.js';
import { processReminders } from './notifications.js';

// PORT задаётся платформой деплоя; 0.0.0.0 обязателен внутри контейнера
const port = Number(process.env.PORT ?? 5001);
const host = process.env.HOST ?? '0.0.0.0';

const app = buildApp({
  logger: { transport: undefined, level: 'info' },
  databasePath: process.env.DATABASE_PATH,
});

try {
  await app.listen({ port, host });
  // Напоминания о встречах — раз в минуту (email/Telegram dry-run без SMTP/токена)
  const tick = () => {
    processReminders(app.store).catch((err) => app.log.error(err));
  };
  tick();
  setInterval(tick, 60_000);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
