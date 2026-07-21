import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Все запросы /api проксируются на отдельно запущенный сервер:
// Prism-мок контракта (npm run api:mock в корне) или реальный бэкенд.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:5001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
