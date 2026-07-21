import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import dayjs from 'dayjs';
import { api, type Booking } from '../api/client';

export default function OwnerBookingsPage() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const load = () => {
    api.GET('/api/bookings').then(({ data, error }) => {
      if (error) {
        notifications.show({ color: 'red', message: error.message });
        setBookings([]);
      } else {
        setBookings(data ?? []);
      }
    });
  };

  useEffect(load, []);

  const handleCancel = async (id: number) => {
    setCancellingId(id);
    const { error, response } = await api.DELETE('/api/bookings/{id}', {
      params: { path: { id } },
    });
    setCancellingId(null);

    if (error && response.status !== 404) {
      notifications.show({ color: 'red', message: error.message });
      return;
    }
    notifications.show({ color: 'green', message: 'Встреча отменена, слот снова свободен' });
    load();
  };

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Предстоящие встречи</Title>
        <Text c="dimmed">Забронированные звонки. Отменённая встреча освобождает слот.</Text>
      </div>

      <Card withBorder>
        {bookings === null ? (
          <Group justify="center" py="lg">
            <Loader />
          </Group>
        ) : bookings.length === 0 ? (
          <Text c="dimmed" py="md" ta="center">
            Пока нет ни одной встречи
          </Text>
        ) : (
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Дата и время</Table.Th>
                <Table.Th>Гость</Table.Th>
                <Table.Th>Комментарий</Table.Th>
                <Table.Th>Статус</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {bookings.map((b) => (
                <Table.Tr key={b.id}>
                  <Table.Td>
                    <Text fw={500}>{dayjs(b.startsAt).format('D MMMM YYYY')}</Text>
                    <Text size="sm" c="dimmed">
                      {dayjs(b.startsAt).format('HH:mm')}–{dayjs(b.endsAt).format('HH:mm')}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text>{b.guestName}</Text>
                    <Text size="sm" c="dimmed">
                      {b.guestEmail}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c={b.comment ? undefined : 'dimmed'}>
                      {b.comment ?? '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {b.status === 'active' ? (
                      <Badge color="green" variant="light">
                        Активна
                      </Badge>
                    ) : (
                      <Badge color="gray" variant="light">
                        Отменена
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {b.status === 'active' && (
                      <Button
                        color="red"
                        variant="light"
                        size="compact-sm"
                        loading={cancellingId === b.id}
                        onClick={() => handleCancel(b.id)}
                      >
                        Отменить
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>
    </Stack>
  );
}
