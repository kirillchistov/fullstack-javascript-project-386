import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';

import { beforeMount } from '@playwright/experimental-ct-react/hooks';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';

dayjs.locale('ru');

// Те же провайдеры, что в src/main.tsx, чтобы компоненты вели себя как в приложении.
// Роутер и AuthProvider добавляются точечно в тестах, где они нужны.
beforeMount(async ({ App }) => (
  <MantineProvider>
    <DatesProvider settings={{ locale: 'ru', firstDayOfWeek: 1 }}>
      <Notifications position="top-right" />
      <App />
    </DatesProvider>
  </MantineProvider>
));
