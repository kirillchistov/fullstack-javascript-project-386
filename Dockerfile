# Один образ: Fastify-бэкенд отдаёт API и собранный фронтенд.
# Приложение слушает порт из переменной окружения PORT (по умолчанию 5001).

# --- Сборка фронтенда ------------------------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Продакшен-образ -------------------------------------------------------
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci --omit=dev

# Контракт нужен бэкенду в рантайме: из него загружаются схемы валидации
COPY docs/api/openapi.yaml docs/api/openapi.yaml
COPY backend/src backend/src
COPY --from=frontend /build/frontend/dist public

ENV STATIC_DIR=/app/public
EXPOSE 5001

CMD ["node", "backend/src/index.js"]
