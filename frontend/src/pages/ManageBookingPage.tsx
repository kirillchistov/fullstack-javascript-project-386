import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { Link, useParams } from 'react-router-dom';
import { api, type GuestBooking, type Slot } from '../api/client';

dayjs.extend(utc);
dayjs.extend(timezone);

const guestTimezone =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow';

export default function ManageBookingPage() {
  const { token = '' } = useParams();
  const [booking, setBooking] = useState<GuestBooking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.GET('/api/guest/bookings/{token}', { params: { path: { token } } }).then(
      ({ data, error: err, response }) => {
        if (err || !data) {
          setError(response.status === 404 ? 'Ссылка недействительна' : err?.message || 'Ошибка');
          setBooking(null);
          return;
        }
        setBooking(data);
        setError(null);
      },
    );
  };

  useEffect(load, [token]);

  const loadSlots = async () => {
    if (!booking) return;
    setRescheduling(true);
    const day = dayjs(booking.startsAt).tz(booking.ownerTimezone).format('YYYY-MM-DD');
    // Нужен eventTypeId — получим типы владельца и найдём по имени+длительности
    const { data: types } = await api.GET('/api/public/{slug}/event-types', {
      params: { path: { slug: booking.ownerSlug } },
    });
    const et = types?.find(
      (t) => t.name === booking.eventTypeName && t.durationMinutes === booking.durationMinutes,
    );
    if (!et) {
      notifications.show({ color: 'red', message: 'Не удалось загрузить слоты' });
      return;
    }
    const { data } = await api.GET('/api/public/{slug}/slots', {
      params: {
        path: { slug: booking.ownerSlug },
        query: { from: day, to: day, eventTypeId: et.id },
      },
    });
    setSlots(data ?? []);
  };

  const handleCancel = async () => {
    setBusy(true);
    const { error: err } = await api.DELETE('/api/guest/bookings/{token}', {
      params: { path: { token } },
    });
    setBusy(false);
    if (err) {
      notifications.show({ color: 'red', message: err.message });
      return;
    }
    notifications.show({ color: 'green', message: 'Встреча отменена' });
    load();
  };

  const handleReschedule = async (startsAt: string) => {
    setBusy(true);
    const { data, error: err } = await api.PATCH('/api/guest/bookings/{token}', {
      params: { path: { token } },
      body: { startsAt },
    });
    setBusy(false);
    if (err || !data) {
      notifications.show({
        color: 'red',
        message: err?.message || 'Не удалось перенести',
      });
      return;
    }
    setBooking(data);
    setRescheduling(false);
    setSlots(null);
    notifications.show({ color: 'green', message: 'Встреча перенесена' });
  };

  if (error) {
    return (
      <Alert color="red" title="Не удалось открыть встречу">
        {error}
      </Alert>
    );
  }

  if (!booking) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  const when = dayjs(booking.startsAt).tz(guestTimezone);

  return (
    <Stack gap="lg" maw={560}>
      <div>
        <Title order={2}>Ваша встреча</Title>
        <Text c="dimmed">Управление записью по секретной ссылке</Text>
      </div>

      <Card withBorder>
        <Stack gap="xs">
          <Text fw={600}>{booking.eventTypeName}</Text>
          <Text>
            {when.format('D MMMM YYYY, HH:mm')} ({guestTimezone})
          </Text>
          <Text size="sm" c="dimmed">
            С {booking.ownerName} · {booking.durationMinutes} мин · {booking.guestName}
          </Text>
          {booking.status === 'cancelled' ? (
            <Alert color="gray">Встреча отменена</Alert>
          ) : (
            <Group mt="md">
              <Button color="red" variant="light" loading={busy} onClick={handleCancel}>
                Отменить
              </Button>
              <Button variant="default" onClick={loadSlots} disabled={busy}>
                Перенести
              </Button>
              <Button
                component={Link}
                to={`/u/${booking.ownerSlug}`}
                variant="subtle"
              >
                К календарю
              </Button>
            </Group>
          )}
        </Stack>
      </Card>

      {rescheduling && booking.status === 'active' && (
        <Card withBorder>
          <Text fw={600} mb="sm">
            Выберите новое время на {when.format('D MMMM')}
          </Text>
          {slots === null ? (
            <Loader size="sm" />
          ) : slots.length === 0 ? (
            <Text c="dimmed" size="sm">
              Свободных слотов на этот день нет
            </Text>
          ) : (
            <SimpleGrid cols={4} spacing="xs">
              {slots.map((slot) => (
                <Button
                  key={slot.startsAt}
                  variant="light"
                  loading={busy}
                  onClick={() => handleReschedule(slot.startsAt)}
                >
                  {dayjs(slot.startsAt).tz(guestTimezone).format('HH:mm')}
                </Button>
              ))}
            </SimpleGrid>
          )}
          <Button variant="subtle" mt="md" onClick={() => setRescheduling(false)}>
            Закрыть
          </Button>
        </Card>
      )}
    </Stack>
  );
}
