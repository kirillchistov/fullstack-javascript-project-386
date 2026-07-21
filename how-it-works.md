# Как устроен проект Call Calendar (Draft)

Документ описывает архитектуру приложения и помогает быстро ориентироваться в коде.

## Обзор

- «Запись на звонок» — это сервис бронирования времени по мотивам [Cal.com](https://cal.com/) (сервиса, где пользователь публикует доступные интервалы, а другой человек выбирает свободное время и бронирует встречу).

NPM-пакет: `@hexlet/code`  
Точка входа: `server/plugin.js` — экспортирует async-функцию, которую поднимает `fastify-cli`.

## Ключевые модули

| Модуль | Файл | Назначение |
|--------|------|------------|
| Точка входа | `server/plugin.js` | Fastify-плагин (экспорт для тестов и `main` в package.json) |
| Запуск сервера | `server/index.js` | Production-старт через `npm start` (Render) |
| Маршруты | `server/routes/*.js` | HTTP-обработчики (welcome, users, session) |
| Шаблоны | `server/views/**/*.pug` | HTML-разметка страниц |
| Локализация | `server/locales/en.js`, `server/locales/ru.js` | Тексты интерфейса (i18next, default: `en`) |
| Модели | `server/models/*.cjs` | Objection-модели (User и базовая модель) |
| Миграции | `server/migrations/` | Схема БД через Knex |
| Конфиг БД | `knexfile.js` | SQLite (dev/test), PostgreSQL (production) |
| Фронтенд | `src/index.js` | Сборка Bootstrap CSS/JS в `dist/` через Webpack |
| Method override | `server/lib/methodOverride.js` | POST + `_method` для logout (совместимость с Fastify 5) |
| Деплой | `render.yaml` | Blueprint для Render (web + PostgreSQL) |

## Конфигурация (12-factor)

Секреты и настройки хранятся в **переменных окружения**, не в репозитории:

- `SESSION_KEY` — ключ шифрования сессии
- `DATABASE_URL` — строка подключения PostgreSQL (на Render задаётся автоматически)
- `PORT` — порт сервера (Render задаёт сам; локально по умолчанию 5001)
- `NODE_ENV` — режим (`development` / `production` / `test`)

Локально значения загружаются из `.env` через [dotenv](https://www.npmjs.com/package/dotenv) (см. `.env.example`).

Язык интерфейса по умолчанию — **English** (`server/plugin.js` → `i18next.init({ lng: 'en' })`). Русские тексты для демо лежат в `server/locales/ru.js`.

## Схема: запрос главной страницы

```mermaid
sequenceDiagram
    participant Browser as Браузер
    participant Fastify as Fastify (server/plugin.js)
    participant Routes as server/routes/welcome.js
    participant View as server/views/welcome/index.pug
    participant Static as dist/ (main.css, main.js)

    Browser->>Fastify: GET /
    Fastify->>Routes: обработчик root
    Routes->>View: reply.render('welcome/index')
    View-->>Browser: HTML + ссылки на /assets/*
    Browser->>Static: GET /assets/main.css, main.js
    Static-->>Browser: стили и Bootstrap JS
```

## Поток запуска локально

```mermaid
flowchart TD
    A[make setup] --> B[npm install]
    B --> C[.env из .env.example]
    C --> D[knex migrate:latest]
    D --> E[npm run build → dist/]
    E --> F[make start]
    F --> G[fastify start server/plugin.js]
    G --> H[http://localhost:5001/]
```

## Поток деплоя на Render

```mermaid
flowchart LR
    GitHub[Git push] --> Render[Render Web Service]
    Render --> Build[npm install + webpack + migrate]
    Build --> Start[npm start на 0.0.0.0:PORT]
    Start --> PG[(PostgreSQL Free)]
    PG --> App[Task Manager в production]
```

Render требует привязку к `0.0.0.0` (не `localhost`) — это настроено в `package.json` → `scripts.start`.

## Структура каталогов

```
.
├── server/
│   ├── plugin.js          # точка входа Fastify
│   ├── routes/            # маршруты
│   ├── views/             # Pug-шаблоны
│   ├── models/            # Objection-модели
│   ├── migrations/        # миграции Knex
│   ├── locales/           # i18n
│   └── helpers/           # хелперы для шаблонов
├── src/                   # исходники фронтенда (webpack)
├── dist/                  # собранные ассеты (не в git)
├── __tests__/             # Jest-тесты
├── knexfile.js
├── webpack.config.js
├── render.yaml
└── package.json           # name: @hexlet/code, main: server/plugin.js
```

## Что проверять после изменений

1. `make setup && make start` — главная отдаёт 200 и текст «Привет от Хекслета!»
2. `make test` — проходят тесты из `__tests__/`
3. `curl -I http://localhost:5001/` — статус 200
4. После деплоя — health check `/` на Render и работа PostgreSQL (миграции в build)

## Полезные ссылки

- [The Twelve-Factor App (ru)](https://12factor.net/ru/)
- [Render: PostgreSQL](https://render.com/docs/postgresql-creating-connecting)
- [Deploy Node Fastify on Render](https://render.com/docs/deploy-node-fastify-app)
