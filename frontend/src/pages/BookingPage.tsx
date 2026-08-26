import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { Link, useParams } from 'react-router-dom';
import { api, type BookingCreated, type EventType, type OwnerPublic, type Slot } from '../api/client';

dayjs.extend(utc);
dayjs.extend(timezone);

type Step = 'pick' | 'form' | 'done';

const guestTimezone =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow';

export default function BookingPage() {
  const { slug = '' } = useParams();
  const [owner, setOwner] = useState<OwnerPublic | null>(null);
  const [ownerError, setOwnerError] = useState<string | null>(null);

  const [eventTypes, setEventTypes] = useState<EventType[] | null>(null);
  const [selectedType, setSelectedType] = useState<EventType | null>(null);

  const today = useMemo(() => dayjs().format('YYYY-MM-DD'), []);
  const [date, setDate] = useState<string | null>(today);

  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const [step, setStep] = useState<Step>('pick');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState<BookingCreated | null>(null);

  useEffect(() => {
    if (!slug) return;
    setOwnerError(null);
    api.GET('/api/public/{slug}', { params: { path: { slug } } }).then(({ data, error, response }) => {
      if (error || !data) {
        setOwner(null);
        setOwnerError(
          response.status === 404 ? 'Календарь не найден' : error?.message || 'Ошибка загрузки',
        );
        return;
      }
      setOwner(data);
    });
    api.GET('/api/public/{slug}/event-types', { params: { path: { slug } } }).then(({ data }) => {
      setEventTypes(data ?? []);
      if (data && data.length > 0) setSelectedType(data[0]);
    });
  }, [slug]);

  const loadSlots = (day: string, eventType: EventType) => {
    setSlotsLoading(true);
    setSelectedSlot(null);
    api
      .GET('/api/public/{slug}/slots', {
        params: {
          path: { slug },
          query: { from: day, to: day, eventTypeId: eventType.id },
        },
      })
      .then(({ data, error }) => {
        if (error) {
          notifications.show({ color: 'red', message: error.message });
          setSlots([]);
        } else {
          setSlots(data ?? []);
        }
      })
      .finally(() => setSlotsLoading(false));
  };

  useEffect(() => {
    if (!date || !selectedType || !owner) {
      setSlots(null);
      return;
    }
    loadSlots(date, selectedType);
  }, [date, selectedType?.id, owner?.slug]);

  const handleSubmit = async () => {
    if (!selectedType || !selectedSlot || !slug) return;
    setSubmitting(true);
    const { data, error, response } = await api.POST('/api/public/{slug}/bookings', {
      params: { path: { slug } },
      body: {
        eventTypeId: selectedType.id,
        startsAt: selectedSlot.startsAt,
        guestName,
        guestEmail,
        comment: comment || undefined,
      },
    });
    setSubmitting(false);

    if (error) {
      const message =
        response.status === 409
          ? 'Этот слот уже занят. Пожалуйста, выберите другое время.'
          : error.message || 'Не удалось создать бронирование';
      notifications.show({ color: 'red', title: 'Ошибка', message });
      if (response.status === 409) {
        setStep('pick');
        if (date) loadSlots(date, selectedType);
      }
      return;
    }

    setBooking(data);
    setStep('done');
  };

  if (ownerError) {
    return (
      <Alert color="red" title="Не удалось открыть календарь">
        {ownerError}
      </Alert>
    );
  }

  if (!owner || eventTypes === null) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (step === 'done' && booking && selectedType) {
    return (
      <Stack align="center" py="xl">
        <Alert color="green" title="Встреча забронирована" maw={480} w="100%">
          <Stack gap={4}>
            <Text>
              <b>{selectedType.name}</b> — {selectedType.durationMinutes} минут
            </Text>
            <Text>
              {dayjs(booking.startsAt).tz(guestTimezone).format('D MMMM YYYY, HH:mm')} (
              {guestTimezone})
            </Text>
            <Text c="dimmed">Подтверждение отправлено на {booking.guestEmail}</Text>
            {booking.manageToken && (
              <Text size="sm">
                Отменить или перенести:{' '}
                <Text span component={Link} to={`/b/${booking.manageToken}`} c="blue">
                  открыть управление встречей
                </Text>
              </Text>
            )}
          </Stack>
        </Alert>
        <Button
          variant="light"
          onClick={() => {
            setStep('pick');
            setBooking(null);
            setGuestName('');
            setGuestEmail('');
            setComment('');
            if (date && selectedType) loadSlots(date, selectedType);
          }}
        >
          Забронировать ещё одну встречу
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Запись к {owner.name}</Title>
        <Text c="dimmed">
          Свободные слоты. Время показано в вашем поясе ({guestTimezone}
          {owner.timezone !== guestTimezone ? `; у владельца — ${owner.timezone}` : ''}).
        </Text>
      </div>

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="md">
            <Card withBorder>
              <Text fw={600} mb="sm">
                Тип события
              </Text>
              {eventTypes.length === 0 ? (
                <Text c="dimmed" size="sm">
                  Нет доступных типов событий
                </Text>
              ) : (
                <Stack gap="xs">
                  {eventTypes.map((et) => (
                    <Paper
                      key={et.id}
                      withBorder
                      p="sm"
                      style={{ cursor: 'pointer' }}
                      bg={selectedType?.id === et.id ? 'blue.0' : undefined}
                      onClick={() => {
                        setSelectedType(et);
                        setStep('pick');
                      }}
                    >
                      <Group justify="space-between">
                        <div>
                          <Text fw={500}>{et.name}</Text>
                          {et.description && (
                            <Text size="xs" c="dimmed">
                              {et.description}
                            </Text>
                          )}
                        </div>
                        <Badge variant="light">{et.durationMinutes} мин</Badge>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Card>

            <Card withBorder>
              <Text fw={600} mb="sm">
                Дата
              </Text>
              <DatePicker
                value={date}
                onChange={(value) => {
                  setDate(value);
                  setStep('pick');
                }}
                minDate={today}
                maxDate={dayjs().add(13, 'day').format('YYYY-MM-DD')}
              />
            </Card>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 8 }}>
          <Card withBorder h="100%">
            {step === 'pick' && (
              <>
                <Text fw={600} mb="sm">
                  Свободные слоты{date ? ` на ${dayjs(date).format('D MMMM')}` : ''}
                </Text>
                {slotsLoading ? (
                  <Loader size="sm" />
                ) : !slots || slots.length === 0 ? (
                  <Text c="dimmed" size="sm">
                    На выбранную дату свободных слотов нет. Попробуйте другую дату.
                  </Text>
                ) : (
                  <SimpleGrid cols={{ base: 3, sm: 4, lg: 5 }} spacing="xs">
                    {slots.map((slot) => (
                      <Button
                        key={slot.startsAt}
                        variant={selectedSlot?.startsAt === slot.startsAt ? 'filled' : 'light'}
                        onClick={() => setSelectedSlot(slot)}
                      >
                        {dayjs(slot.startsAt).tz(guestTimezone).format('HH:mm')}
                      </Button>
                    ))}
                  </SimpleGrid>
                )}
                <Group justify="flex-end" mt="lg">
                  <Button
                    disabled={!selectedSlot || !selectedType}
                    onClick={() => setStep('form')}
                  >
                    Продолжить
                  </Button>
                </Group>
              </>
            )}

            {step === 'form' && selectedSlot && selectedType && (
              <Stack>
                <div>
                  <Text fw={600}>Ваши данные</Text>
                  <Text size="sm" c="dimmed">
                    {selectedType.name},{' '}
                    {dayjs(selectedSlot.startsAt).tz(guestTimezone).format('D MMMM YYYY, HH:mm')}–
                    {dayjs(selectedSlot.endsAt).tz(guestTimezone).format('HH:mm')} ({guestTimezone})
                  </Text>
                </div>
                <TextInput
                  label="Имя"
                  required
                  value={guestName}
                  onChange={(e) => setGuestName(e.currentTarget.value)}
                />
                <TextInput
                  label="Email"
                  required
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.currentTarget.value)}
                />
                <Textarea
                  label="Комментарий"
                  description="Тема звонка, ссылки — всё, что поможет подготовиться"
                  value={comment}
                  onChange={(e) => setComment(e.currentTarget.value)}
                />
                <Group justify="space-between" mt="sm">
                  <Button variant="default" onClick={() => setStep('pick')}>
                    Назад
                  </Button>
                  <Button
                    loading={submitting}
                    disabled={!guestName.trim() || !guestEmail.trim()}
                    onClick={handleSubmit}
                  >
                    Забронировать
                  </Button>
                </Group>
              </Stack>
            )}
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
