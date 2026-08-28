### Hexlet tests and linter status:
[![Actions Status](https://github.com/kirillchistov/fullstack-javascript-project-386/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/kirillchistov/fullstack-javascript-project-386/actions)


## Call Calendar

- «Запись на звонок» — это сервис бронирования времени по мотивам [Cal.com](https://cal.com/) (сервиса, где пользователь публикует доступные интервалы, а другой человек выбирает свободное время и бронирует встречу). 
- У нашего приложения тот же базовый сценарий: владелец публикует доступное время для встреч по ссылке `/u/{slug}`, а гость выбирает свободный слот (время в своём часовом поясе) и записывается на звонок.
- Длительность слота задаётся типом встречи; владелец регистрируется, настраивает типы и расписание, смотрит и отменяет предстоящие встречи.

## Пример
- Пример того, что может получиться:
- [скриншот 1](https://ru.hexlet.io/rails/active_storage/blobs/proxy/eyJfcmFpbHMiOnsiZGF0YSI6NDAyNjksInB1ciI6ImJsb2JfaWQifX0=--d1fb43edbbf1ea48f6aff43a25afaeb9607064be/01-home.png).
- [скриншот 2](https://ru.hexlet.io/rails/active_storage/blobs/proxy/eyJfcmFpbHMiOnsiZGF0YSI6NDAyNzAsInB1ciI6ImJsb2JfaWQifX0=--0f2aba7342f8e0c41e57654f9e42a97168c992ac/02-book-catalog.png)
- [скриншот 3](https://ru.hexlet.io/rails/active_storage/blobs/proxy/eyJfcmFpbHMiOnsiZGF0YSI6NDAyNzEsInB1ciI6ImJsb2JfaWQifX0=--92dd20c775a06903f40568b5d0b46d445f95e050/03-book-event-type.png)

## Демо

- [Демо на GitHub Pages](https://kirillchistov.github.io/fullstack-javascript-project-386/) — упрощённая версия: API эмулируется прямо в браузере (слоты вычисляются из правил доступности, брони живут в localStorage). Для входа владельца подойдут любые email и пароль.
- Деплой автоматический: workflow [deploy-pages.yml](./.github/workflows/deploy-pages.yml) собирает `npm run build:demo` при пуше в `main` (в настройках репозитория Pages должен быть переключён на «GitHub Actions»).
- [Полное приложение на Render](https://call-calendar-onli.onrender.com/)

## Установка

```bash
npm install            # корень: TypeSpec + Prism
cd frontend && npm install   # фронтенд: Vite + React + Mantine
```

## Запуск

Терминал 1 — бэкенд (API по контракту, порт 5001):

```bash
cd backend
npm install
npm start        # или npm run dev — с автоперезапуском
```

Терминал 2 — dev-сервер фронтенда:

```bash
cd frontend
npm run dev
```

Интерфейс доступен на [http://localhost:5173](http://localhost:5173), запросы `/api/*` проксируются на `http://localhost:5001` (адрес можно переопределить переменной `API_PROXY_TARGET`).

Публичная страница сидового владельца: [/u/kirill](http://localhost:5173/u/kirill). Регистрация — `/register`. Вход по умолчанию: `owner@example.com` / `secret` (переменные `OWNER_EMAIL` / `OWNER_PASSWORD` / `OWNER_NAME` / `OWNER_SLUG` / `OWNER_TIMEZONE`). Данные в SQLite (`DATABASE_PATH`, по умолчанию `backend/data/call-calendar.sqlite`).

Уведомления (опционально): `SMTP_URL` и `EMAIL_FROM` для почты, `TELEGRAM_BOT_TOKEN` для Telegram владельцу, `PUBLIC_BASE_URL` — база ссылок в письмах и на stub-оплату (по умолчанию `http://localhost:5173`). Без SMTP/токена сообщения пишутся в лог сервера (dry-run).

P2 (опционально): `BILLING_PRO_CODE` (по умолчанию `pro-dev`) — код активации Pro; `GOOGLE_CLIENT_ID` / `GOOGLE_REDIRECT_URI` — Google OAuth (без них — stub busy); `YOOKASSA_SHOP_ID` / `YOOKASSA_SECRET_KEY` — разовые платежи (без них — `/pay/stub/{id}`); `FRONTEND_ORIGIN` — редирект после Google stub.

Вместо бэкенда можно поднять мок API из контракта (Prism) — удобно при работе только над фронтендом:

```bash
npm run api:mock   # из корня, тоже порт 5001
```

## Работа с контрактом

```bash
npm run spec:build           # spec/*.tsp -> docs/api/openapi.yaml
cd frontend && npm run api:types   # openapi.yaml -> src/api/schema.d.ts (типы клиента)
```

После любого изменения контракта выполняются обе команды — фронтенд узнаёт об изменениях через типы, несоответствия ловит компилятор TypeScript.

## Тесты

```bash
cd backend && npm test   # бизнес-правила API: конфликты слотов, горизонт, авторизация, валидация
```

Компонентные (страницы фронтенда монтируются в Chromium, API мокается на уровне сети — бэкенд не нужен):

```bash
cd frontend
npx playwright install chromium   # один раз
npm run test:ct
```

Интеграционные (e2e, реальный браузер, фронтенд + бэкенд поднимаются автоматически):

```bash
cd e2e
npm install
npx playwright install chromium   # один раз
npm test
```

Тест-кейсы и сценарии зафиксированы в [docs/e2e-scenarios.md](./docs/e2e-scenarios.md). В CI ([ci.yml](./.github/workflows/ci.yml)) прогоняются: формат коммитов, актуальность контракта, тесты бэкенда, линт и сборка фронтенда, компонентные тесты, e2e.

## Docker и деплой

Один образ: Fastify отдаёт и API, и собранный фронтенд. Приложение слушает порт из переменной окружения `PORT` (по умолчанию 5001) на `0.0.0.0`.

```bash
docker build -t call-calendar .
docker run --rm -e PORT=8080 -p 8080:8080 call-calendar
# UI:  http://localhost:8080
# API: http://localhost:8080/api/event-types
```

Деплой на Render — по блюпринту [render.yaml](./render.yaml):

1. В [дашборде Render](https://dashboard.render.com/): New → Blueprint → выбрать этот репозиторий.
2. Задать секрет `OWNER_PASSWORD` (пароль владельца календаря) при создании.
3. Render соберёт образ по `Dockerfile` и передаст порт через `PORT` автоматически; healthcheck — `/api/event-types`.

Запасной вариант — Railway: New Project → Deploy from GitHub repo, платформа сама найдёт `Dockerfile` и подставит `PORT`; в Variables добавить `OWNER_PASSWORD`.

После деплоя добавить публичную ссылку в раздел «Демо».

## Коммиты и релизы

Коммиты — по [Conventional Commits](https://www.conventionalcommits.org/ru/v1.0.0/) (`feat:`, `fix:`, `docs:` …); соглашение, включая правила для ИИ-агентов, зафиксировано в [AGENTS.md](./AGENTS.md). Формат проверяется в CI (job `commitlint`, конфиг — [.commitlintrc.json](./.commitlintrc.json)). По этим коммитам [release-please](https://github.com/googleapis/release-please) ([workflow](./.github/workflows/release-please.yml)) автоматически поддерживает release-PR с changelog и semver-версией; мёрдж release-PR создаёт GitHub Release и тег.

Историю до внедрения соглашения не переписываем: release-please учитывает только коммиты после последнего релиза, поэтому первый release-PR появится после первого `fix:`/`feat:`-коммита. При необходимости стартовую версию можно задать явно футером `Release-As: 0.1.0` в любом коммите.

## Сборка фронтенда

```bash
cd frontend && npm run build        # проверка типов + прод-сборка в frontend/dist
cd frontend && npm run build:demo   # демо-сборка для GitHub Pages (VITE_DEMO=true, base-путь репозитория)
cd frontend && npm run preview:demo # локальный предпросмотр демо-сборки
```


## Шаги и задачи

### Шаг 9 (ветка sprint11 P1)
- [x] Контракт API 0.3.0 
- [x] Кастомное расписание с перерывами и исключениями (/admin/availability)
- [x] Буфер (0-120 / 15) и гостевое управление
- [x] Уведомления без SMTP_URL/TG_BOT_TOKEN
- [x] Напоминания — фоновый тик раз в минуту (reminderHoursBefore).

### Шаг 8 (ветка sprint11 P0)
- [x] Добавили docs/backlog.md
- [x] Контракт API 0.2.0 
- [x] Регистрация / аккаунты
- [x] Публичная ссылка (/u/:slug)
- [x] Несколько типов встреч (15-240 мин.)
- [x] Хранилище SQLite
- [x] Таймзоны

### Шаг 7 (по мотивам ревью)
- [x] Горизонт дат от бэкенда: 62/60 дней вместо 14. Лимит нигде не зафиксирован в контракте. Фикс: закрепить горизонт 14 дней в контракте (описания в spec/routes.tsp), на бэкенде обрезать вычисление слотов горизонтом, на фронте maxDate = сегодня + 13.
- [x] Все ошибки возвращают 500. Причина в setErrorHandler: он различает только error.validation (422), для остальных - игнорирует error.statusCode и шлёт 500. Фикс: пробрасывать statusCode для 4xx в формате ошибок контракта, 500 оставить только для внутренних ошибок (с логированием).
- [x] Коммиты без разметки. Было в AGENTS.md, но нигде не проверялось. Фикс: commitlint в CI. Историю не стал переписывать: первый release-PR появится после первого fix:/feat.
- [x] Пустая карточка при смене даты в форме. Причина: состояние шага (step === 'form') и данные (selectedSlot) были рассинхронизированы — loadSlots очищал слот, но шаг не возвращал. Фикс: смена даты или типа события всегда возвращают step в 'pick' (в onChange календаря и в клике по типу).
- [x] E2E-тесты и покрытие unit-тестами через PlayWright

### Шаг 6
- [x] Собрать Docker-образ приложения — [Dockerfile](./Dockerfile) (multi-stage: сборка фронтенда → продакшен-образ с Fastify, который раздаёт API и статику).
- [x] Запуск в контейнере по переменной окружения `PORT` (проверено локально с `PORT=8080`: UI, SPA-роуты, API, бронирование).
- [x] Подготовить деплой на Render — [render.yaml](./render.yaml) (Docker-runtime, healthcheck, free plan); запасной вариант Railway описан в README.
- [x] Задеплоить и добавить публичную ссылку в раздел «Демо» (нужен аккаунт Render/Railway — см. «Docker и деплой»).Собрать Docker-образ приложения.

### Шаг 5
- [x] Описать и зафиксировать основные пользовательские сценарии — [docs/e2e-scenarios.md](./docs/e2e-scenarios.md).
- [x] Подготовить интеграционные тесты — Playwright + TypeScript, 5 сценариев в [e2e/tests/booking.spec.ts](./e2e/tests/booking.spec.ts), включая основной путь бронирования и конфликт «слот уже занят».
- [x] Настроить запуск тестов в CI — [ci.yml](./.github/workflows/ci.yml): контракт, бэкенд, фронтенд, e2e.
- [x] Договориться о формате коммитов Conventional Commits (в т.ч. для агентов) — [AGENTS.md](./AGENTS.md).
- [x] Подключить release-please — [release-please.yml](./.github/workflows/release-please.yml).
- [x] Убедиться после мёрджа в main, что release-please создаёт/обновляет release-PR с changelog и версией.Описать и зафиксировать основные пользовательские сценарии для проверки.


### Шаг 4
- [x] Выбрать стек для бэк-энда — Fastify + in-memory (store.js) (обоснование в [project-spec.md](./project-spec.md)).
- [x] Реализовать API по спецификации контракта — [backend/](./backend/): Fastify, схемы валидации берутся напрямую из [docs/api/openapi.yaml](./docs/api/openapi.yaml).
- [x] Бизнес-правила бронирования на бэкенде: слоты вычисляются из правил доступности в таймзоне владельца, бронировать можно только свободный будущий слот.
- [x] Обработка занятого слота — `409 slot_unavailable` (повторное бронирование, прошлое время, вне расписания).
- [x] Хранилище в памяти ([backend/src/store.js](./backend/src/store.js)) — по требованиям шага БД не нужна; данные сбрасываются при перезапуске.
- [x] Тесты бизнес-правил: `cd backend && npm test` (node:test + fastify.inject, 10 сценариев).
- [x] Результат: рабочий бэкенд, фронтенд работает с ним через тот же прокси без единого изменения кода.

### Шаг 3
- [x] Выбрать стек для фронт-энда — TypeScript + Vite + React + [Mantine](https://mantine.dev/) (обоснование в [project-spec.md](./project-spec.md)).
- [x] Реализовать страницы интерфейса — бронирование для гостя, вход, встречи и доступность для владельца ([frontend/src/pages](./frontend/src/pages)).
- [x] Подключить интерфейс к API по контракту — типизированный клиент [openapi-fetch](https://openapi-ts.dev/openapi-fetch/) с типами, сгенерированными из `openapi.yaml`; для разработки — мок-сервер [Prism](https://stoplight.io/open-source/prism) (`npm run api:mock`).
- [x] Результат: появился UI приложения.

### Шаг 2
- [x] С помощью [TypeSpec](https://typespec.io/) описать доменные сущности: владелец, тип события, слот, бронирование и публичный сценарий гостя — [spec/models.tsp](./spec/models.tsp).
- [x] Подготовить TypeSpec-спецификацию, которая фиксирует API-контракт — [spec/routes.tsp](./spec/routes.tsp), компилируется в [docs/api/openapi.yaml](./docs/api/openapi.yaml) командой `npm run spec:build`.
- [x] Проверить, что спецификация покрывает сценарии владельца и гостя — трассировка сценариев в [project-spec.md](./project-spec.md#5-трассировка-сценариев-на-контракт).
- [x] Выбрать, описать и обосновать архитектурное решение для проекта в [project-spec.md](./project-spec.md).

### Шаг 1
- [x] Подключиться к GitHub и [создать репозиторий](https://github.com/kirillchistov/fullstack-javascript-project-386)
- [x] Посмотреть описание и [пример проекта](https://cal.com/)
- [x] Подготовить рабочее окружение к разработке

## Документация

- [project-spec.md](./project-spec.md) — архитектурное решение, доменная модель, трассировка сценариев на API-контракт
- [spec/](./spec/) — TypeSpec-исходники API-контракта (источник истины)
- [docs/api/openapi.yaml](./docs/api/openapi.yaml) — скомпилированный OpenAPI 3 контракт (генерируется, руками не редактируется)
- [docs/backlog.md](./docs/backlog.md) — сегменты аудитории, JTBD, монетизация и приоритизированный бэклог после MVP
- [docs/e2e-scenarios.md](./docs/e2e-scenarios.md) — реестр тест-кейсов (e2e, компонентные, юнит)
- [how-it-works.md](./how-it-works.md) — архитектура проекта и схема взаимодействия клиент–сервер
- [AGENTS.md](./AGENTS.md) — Design First и Conventional Commits для людей и ИИ-агентов
