### Hexlet tests and linter status:
[![Actions Status](https://github.com/kirillchistov/fullstack-javascript-project-386/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/kirillchistov/fullstack-javascript-project-386/actions)


## Call Calendar

- «Запись на звонок» — это сервис бронирования времени по мотивам [Cal.com](https://cal.com/) (сервиса, где пользователь публикует доступные интервалы, а другой человек выбирает свободное время и бронирует встречу). 
- У нашего приложения тот же базовый сценарий: владелец публикует доступное время для встреч, а другой пользователь выбирает свободный слот и записывается на звонок.
- Пользователь видит свободные слоты по 30 минут, может выбрать время и оформить запись, а владелец календаря — посмотреть список предстоящих встреч.

## Пример
- Пример того, что может получиться:
- [скриншот 1](https://ru.hexlet.io/rails/active_storage/blobs/proxy/eyJfcmFpbHMiOnsiZGF0YSI6NDAyNjksInB1ciI6ImJsb2JfaWQifX0=--d1fb43edbbf1ea48f6aff43a25afaeb9607064be/01-home.png).
- [скриншот 2](https://ru.hexlet.io/rails/active_storage/blobs/proxy/eyJfcmFpbHMiOnsiZGF0YSI6NDAyNzAsInB1ciI6ImJsb2JfaWQifX0=--0f2aba7342f8e0c41e57654f9e42a97168c992ac/02-book-catalog.png)
- [скриншот 3](https://ru.hexlet.io/rails/active_storage/blobs/proxy/eyJfcmFpbHMiOnsiZGF0YSI6NDAyNzEsInB1ciI6ImJsb2JfaWQifX0=--92dd20c775a06903f40568b5d0b46d445f95e050/03-book-event-type.png)

## Демо

- [Демо на GitHub Pages](https://kirillchistov.github.io/fullstack-javascript-project-386/) — упрощённая версия: API эмулируется прямо в браузере (слоты вычисляются из правил доступности, брони живут в localStorage). Для входа владельца подойдут любые email и пароль.
- Деплой автоматический: workflow [deploy-pages.yml](./.github/workflows/deploy-pages.yml) собирает `npm run build:demo` при пуше в `main` (в настройках репозитория Pages должен быть переключён на «GitHub Actions»).
- [Задеплоенное полное приложение]() — здесь появится ссылка после деплоя бэкенда

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

Данные владельца для входа задаются переменными окружения `OWNER_EMAIL` / `OWNER_PASSWORD` / `OWNER_NAME` / `OWNER_TIMEZONE` (по умолчанию `owner@example.com` / `secret`, Москва). Хранилище — в памяти: после перезапуска сервера данные сбрасываются (по требованиям шага 4 БД не используется).

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
cd backend && npm test   # бизнес-правила API: конфликты слотов, авторизация, валидация
```

## Сборка фронтенда

```bash
cd frontend && npm run build        # проверка типов + прод-сборка в frontend/dist
cd frontend && npm run build:demo   # демо-сборка для GitHub Pages (VITE_DEMO=true, base-путь репозитория)
cd frontend && npm run preview:demo # локальный предпросмотр демо-сборки
```


## Шаги и задачи

### Шаг 7
- [ ] 
### Шаг 6
- [ ] 
### Шаг 5
- [ ] 
### Шаг 4
- [x] Выбрать стек для бэк-энда — Fastify + in-memory (store.js) (обоснование в [project-spec.md](./project-spec.md)).
- [x] Реализовать API по спецификации контракта — [backend/](./backend/): Fastify, схемы валидации берутся напрямую из [docs/api/openapi.yaml](./docs/api/openapi.yaml).
- [x] Бизнес-правила бронирования на бэкенде: слоты вычисляются из правил доступности в таймзоне владельца, бронировать можно только свободный будущий слот.
- [x] Обработка занятого слота — `409 slot_unavailable` (повторное бронирование, прошлое время, вне расписания).
- [x] Хранилище в памяти ([backend/src/store.js](./backend/src/store.js)) — по требованиям шага БД не нужна; данные сбрасываются при перезапуске.
- [x] Тесты бизнес-правил: `cd backend && npm test` (node:test + fastify.inject, 10 сценариев).
- [x] Результат: рабочий бэкенд, фронтенд работает с ним через тот же прокси без единого изменения кода.Выбрать стек для бэк-



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
- [how-it-works.md](./how-it-works.md) — архитектура проекта и схема взаимодействия клиент–сервер ()
