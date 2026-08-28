import { useEffect, useState } from 'react';
import { Card, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import dayjs from 'dayjs';
import { api, type components } from '../api/client';
import ProGate from './ProGate';

type AnalyticsSummary = components['schemas']['AnalyticsSummary'];

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export default function AnalyticsPage() {
  return (
    <ProGate title="Аналитика">
      <AnalyticsInner />
    </ProGate>
  );
}

function AnalyticsInner() {
  const [from, setFrom] = useState(dayjs().subtract(30, 'day').format('YYYY-MM-DD'));
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'));
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!from || !to) return;
    setLoading(true);
    api
      .GET('/api/analytics', { params: { query: { from, to } } })
      .then(({ data, error }) => {
        if (error) {
          notifications.show({ color: 'red', message: error.message });
          setSummary(null);
        } else setSummary(data ?? null);
      })
      .finally(() => setLoading(false));
  }, [from, to]);

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Аналитика</Title>
        <Text c="dimmed">Брони за период и распределение по дням недели.</Text>
      </div>

      <Group>
        <DateInput label="С" value={from} onChange={(v) => v && setFrom(v)} />
        <DateInput label="По" value={to} onChange={(v) => v && setTo(v)} />
      </Group>

      {loading || !summary ? (
        <Loader />
      ) : (
        <Group grow align="stretch">
          <Card withBorder>
            <Text size="sm" c="dimmed">
              Создано
            </Text>
            <Title order={3}>{summary.created}</Title>
          </Card>
          <Card withBorder>
            <Text size="sm" c="dimmed">
              Отменено
            </Text>
            <Title order={3}>{summary.cancelled}</Title>
          </Card>
          <Card withBorder>
            <Text size="sm" c="dimmed">
              Предстоящие
            </Text>
            <Title order={3}>{summary.upcoming}</Title>
          </Card>
        </Group>
      )}

      {summary && (
        <Card withBorder>
          <Text fw={600} mb="sm">
            По дням недели (по startsAt)
          </Text>
          <Group>
            {summary.byWeekday.map((n, i) => (
              <Stack key={WEEKDAYS[i]} gap={2} align="center">
                <Text size="xs" c="dimmed">
                  {WEEKDAYS[i]}
                </Text>
                <Text fw={600}>{n}</Text>
              </Stack>
            ))}
          </Group>
        </Card>
      )}
    </Stack>
  );
}
