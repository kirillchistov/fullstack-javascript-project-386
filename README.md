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

## Пример
- [Задеплоенное приложение]() — здесь добавлю ссылку после деплоя

## Установка

```bash
cp .env.example .env   # если ещё не создан
npm install --legacy-peer-deps
make setup
```


Команда скопирует `.env.example` в `.env`, установит зависимости, выполнит миграции и соберёт фронтенд.

## Запуск

```bash
make setup
make start
```

Или напрямую:

```bash
npm run start:dev
```

Приложение доступно на [http://localhost:5001](http://localhost:5001) (порт задаётся в `.env`, по умолчанию 5001).

## Разработка

С hot-reload backend и webpack watch в одном терминале:

```bash
make develop
```

## Тесты

```bash
make test
```


## Шаги и задачи

### Шаг 7
- [ ] 
### Шаг 6
- [ ] 
### Шаг 5
- [ ] 
### Шаг 4
- [ ] 
### Шаг 3
- [ ] 

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
