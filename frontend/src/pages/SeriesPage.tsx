import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import dayjs from 'dayjs';
import { api, type EventType, type components } from '../api/client';
import ProGate from './ProGate';

type BookingSeries = components['schemas']['BookingSeries'];

export default function SeriesPage() {
  return (
    <ProGate title="Серии встреч">
      <SeriesInner />
    </ProGate>
  );
}

function SeriesInner() {
  const [items, setItems] = useState<BookingSeries[] | null>(null);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [eventTypeId, setEventTypeId] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [time, setTime] = useState('10:00');
  const [count, setCount] = useState<number | string>(4);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.GET('/api/booking-series').then(({ data, error }) => {
      if (error) {
        notifications.show({ color: 'red', message: error.message });
        setItems([]);
      } else setItems(data ?? []);
    });
    api.GET('/api/event-types').then(({ data }) => {
      setEventTypes(data ?? []);
      if (data?.[0]) setEventTypeId(String(data[0].id));
    });
  };

  useEffect(load, []);

  const create = async () => {
    if (!eventTypeId || !startsAt) return;
    const [h, m] = time.split(':').map(Number);
    const start = dayjs(startsAt).hour(h).minute(m).second(0).millisecond(0);
    setSaving(true);
    const { error } = await api.POST('/api/booking-series', {
      body: {
        eventTypeId: Number(eventTypeId),
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim(),
        startsAt: start.toISOString(),
        count: Number(count),
      },
    });
    setSaving(false);
    if (error) {
      notifications.show({ color: 'red', message: error.message });
      return;
    }
    notifications.show({ color: 'green', message: 'Серия создана' });
    load();
  };

  const cancel = async (id: number) => {
    const { error } = await api.DELETE('/api/booking-series/{id}', {
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
        <Title order={2}>Серии встреч</Title>
        <Text c="dimmed">Еженедельные уроки / регулярные слоты (Pro).</Text>
      </div>

      <Card withBorder>
        {items === null ? (
          <Loader />
        ) : items.length === 0 ? (
          <Text c="dimmed">Серий пока нет</Text>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Гость</Table.Th>
                <Table.Th>Старт</Table.Th>
                <Table.Th>Встреч</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((s) => (
                <Table.Tr key={s.id}>
                  <Table.Td>
                    {s.guestName}
                    <Text size="xs" c="dimmed">
                      {s.guestEmail}
                    </Text>
                  </Table.Td>
                  <Table.Td>{dayjs(s.startsAt).format('D MMM YYYY HH:mm')}</Table.Td>
                  <Table.Td>
                    {s.bookingIds.length} / {s.count}
                  </Table.Td>
                  <Table.Td>
                    <Button color="red" variant="light" size="compact-sm" onClick={() => cancel(s.id)}>
                      Отменить будущие
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      <Card withBorder>
        <Stack>
          <Text fw={600}>Новая серия (раз в неделю)</Text>
          <Select
            label="Тип встречи"
            data={eventTypes.map((et) => ({ value: String(et.id), label: et.name }))}
            value={eventTypeId}
            onChange={(value) => setEventTypeId(value)}
          />
          <TextInput label="Имя гостя" value={guestName} onChange={(e) => setGuestName(e.currentTarget.value)} />
          <TextInput
            label="Email"
            type="email"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.currentTarget.value)}
          />
          <Group grow>
            <DateInput
              label="Первая дата"
              value={startsAt}
              onChange={(v) => setStartsAt(v)}
              minDate={dayjs().format('YYYY-MM-DD')}
            />
            <TextInput label="Время (локальное)" value={time} onChange={(e) => setTime(e.currentTarget.value)} />
            <NumberInput
              label="Число встреч"
              min={1}
              max={52}
              value={count}
              onChange={(value) => setCount(typeof value === 'number' ? value : Number(value) || 1)}
            />
          </Group>
          <Button
            loading={saving}
            disabled={!guestName.trim() || !guestEmail.trim() || !startsAt || !eventTypeId}
            onClick={create}
          >
            Создать серию
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
}
