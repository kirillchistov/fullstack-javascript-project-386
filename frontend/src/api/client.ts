import createClient from 'openapi-fetch';
import type { components, paths } from './schema';
import { demoFetch } from './demo';

/** Демо-сборка для GitHub Pages: API эмулируется в браузере (см. demo.ts) */
export const isDemo = import.meta.env.VITE_DEMO === 'true';

// Единственная точка обращения к API. Все пути и типы — из контракта
// (src/api/schema.d.ts генерируется из docs/api/openapi.yaml, см. npm run api:types).
export const api = createClient<paths>({
  baseUrl: '/',
  credentials: 'include',
  fetch: isDemo ? demoFetch : undefined,
});

export type Owner = components['schemas']['Owner'];
export type EventType = components['schemas']['EventType'];
export type Availability = components['schemas']['Availability'];
export type AvailabilityRule = components['schemas']['AvailabilityRule'];
export type Slot = components['schemas']['Slot'];
export type Booking = components['schemas']['Booking'];
export type BookingCreate = components['schemas']['BookingCreate'];
