import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api, type components } from '../api/client';
import ProGate from './ProGate';

type CalendarConnection = components['schemas']['CalendarConnection'];

export default function CalendarsPage() {
  return (
    <ProGate title="Синхронизация календарей">
      <CalendarsInner />
    </ProGate>
  );
}

function CalendarsInner() {
  const [items, setItems] = useState<CalendarConnection[] | null>(null);
  const [icsUrl, setIcsUrl] = useState('');
  const [icsLabel, setIcsLabel] = useState('Apple / ICS');
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.GET('/api/calendar-connections').then(({ data, error }) => {
      if (error) {
        notifications.show({ color: 'red', message: error.message });
        setItems([]);
      } else {
        setItems(data ?? []);
      }
    });
  };

  useEffect(load, []);

  const connectGoogle = async () => {
    const { data, error } = await api.POST('/api/calendar-connections/google/start');
    if (error || !data?.authUrl) {
      notifications.show({ color: 'red', message: error?.message || 'Не удалось начать OAuth' });
      return;
    }
    window.location.href = data.authUrl;
  };

  const connectIcs = async () => {
    setSaving(true);
    const { error } = await api.POST('/api/calendar-connections/ics', {
      body: { url: icsUrl.trim(), label: icsLabel.trim() || 'ICS' },
    });
    setSaving(false);
    if (error) {
      notifications.show({ color: 'red', message: error.message });
      return;
    }
    setIcsUrl('');
    notifications.show({ color: 'green', message: 'ICS подключён' });
    load();
  };

  const sync = async (id: number) => {
    const { error } = await api.POST('/api/calendar-connections/{id}/sync', {
      params: { path: { id } },
    });
    if (error) {
      notifications.show({ color: 'red', message: error.message });
      return;
    }
    notifications.show({ color: 'green', message: 'Синхронизация выполнена' });
    load();
  };

  const remove = async (id: number) => {
    const { error } = await api.DELETE('/api/calendar-connections/{id}', {
      params: { path: { id } },
    });
    if (error) {
      notifications.show({ color: 'red', message: error.message });
      return;
    }
    load();
  };

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Синхронизация календарей</Title>
        <Text c="dimmed">
          Занятость из Google (OAuth или stub) и ICS/URL вычитается из свободных слотов.
        </Text>
      </div>

      <Card withBorder>
        {items === null ? (
          <Loader />
        ) : items.length === 0 ? (
          <Text c="dimmed">Подключений пока нет</Text>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Источник</Table.Th>
                <Table.Th>Тип</Table.Th>
                <Table.Th>Синхронизация</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>{c.label}</Table.Td>
                  <Table.Td>{c.kind}</Table.Td>
                  <Table.Td>{c.lastSyncedAt ?? '—'}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Button size="compact-sm" variant="light" onClick={() => sync(c.id)}>
                        Sync
                      </Button>
                      <Button size="compact-sm" color="red" variant="light" onClick={() => remove(c.id)}>
                        Удалить
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      <Card withBorder>
        <Stack>
          <Text fw={600}>Google Calendar</Text>
          <Button onClick={connectGoogle}>Подключить Google</Button>
        </Stack>
      </Card>

      <Card withBorder>
        <Stack>
          <Text fw={600}>ICS / URL (Apple Calendar и др.)</Text>
          <TextInput label="Название" value={icsLabel} onChange={(e) => setIcsLabel(e.currentTarget.value)} />
          <TextInput
            label="URL календаря"
            placeholder="https://…"
            value={icsUrl}
            onChange={(e) => setIcsUrl(e.currentTarget.value)}
          />
          <Button loading={saving} disabled={!icsUrl.trim()} onClick={connectIcs}>
            Подключить ICS
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
}
