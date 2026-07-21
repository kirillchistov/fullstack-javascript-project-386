import { buildApp } from './app.js';

// PORT задаётся платформой деплоя; 0.0.0.0 обязателен внутри контейнера
const port = Number(process.env.PORT ?? 5001);
const host = process.env.HOST ?? '0.0.0.0';

const app = buildApp({
  logger: { transport: undefined, level: 'info' },
});

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
