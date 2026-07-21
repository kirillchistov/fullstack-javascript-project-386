import "@typespec/http";
import "@typespec/openapi";
import "./models.tsp";
import "./routes.tsp";

using Http;

/**
 * Call Calendar — сервис «Запись на звонок».
 *
 * API-контракт (Design First): этот файл и соседние .tsp — единственный
 * источник истины. Из них компилируется docs/api/openapi.yaml, по которому
 * независимо реализуются бэкенд (Fastify) и фронтенд (React).
 *
 * Сценарии:
 * - Гость: смотрит типы событий и свободные слоты, бронирует звонок.
 * - Владелец: входит по логину/паролю, настраивает правила доступности,
 *   смотрит и отменяет предстоящие встречи.
 */
@service(#{ title: "Call Calendar API" })
@OpenAPI.info(#{ version: "0.1.0" })
@server("http://localhost:5001", "Локальный сервер разработки")
namespace CallCalendar;
