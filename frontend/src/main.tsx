import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import App from './App';
import { AuthProvider } from './auth';
import { isDemo } from './api/client';

dayjs.locale('ru');

// На GitHub Pages нет серверных перезаписей путей, поэтому в демо — hash-роутинг
const Router = isDemo ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider>
      <DatesProvider settings={{ locale: 'ru', firstDayOfWeek: 1 }}>
        <Notifications position="top-right" />
        <Router>
          <AuthProvider>
            <App />
          </AuthProvider>
        </Router>
      </DatesProvider>
    </MantineProvider>
  </StrictMode>,
);
