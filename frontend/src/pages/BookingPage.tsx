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
import { api, type Booking, type EventType, type Slot } from '../api/client';

type Step = 'pick' | 'form' | 'done';

export default function BookingPage() {
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
  const [booking, setBooking] = useState<Booking | null>(null);

  useEffect(() => {
    api.GET('/api/event-types').then(({ data }) => {
      setEventTypes(data ?? []);
      if (data && data.length > 0) {
        setSelectedType(data[0]);
      }
    });
  }, []);

  const loadSlots = (day: string) => {
    setSlotsLoading(true);
    setSelectedSlot(null);
    api
      .GET('/api/slots', { params: { query: { from: day, to: day } } })
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
    if (!date) {
      setSlots(null);
      return;
    }
    loadSlots(date);
  }, [date]);

  const handleSubmit = async () => {
    if (!selectedType || !selectedSlot) return;
    setSubmitting(true);
    const { data, error, response } = await api.POST('/api/bookings', {
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
        if (date) loadSlots(date);
      }
      return;
    }

    setBooking(data);
    setStep('done');
  };

  if (step === 'done' && booking && selectedType) {
    return (
      <Stack align="center" py="xl">
        <Alert color="green" title="Встреча забронирована" maw={480} w="100%">
          <Stack gap={4}>
            <Text>
              <b>{selectedType.name}</b> — {selectedType.durationMinutes} минут
            </Text>
            <Text>{dayjs(booking.startsAt).format('D MMMM YYYY, HH:mm')}</Text>
            <Text c="dimmed">
              Подтверждение отправлено на {booking.guestEmail}
            </Text>
          </Stack>
        </Alert>
        <Button
          variant="light"
          onClick={() => {
            setStep('pick');
            setBooking(null);
            setSelectedSlot(null);
            setGuestName('');
            setGuestEmail('');
            setComment('');
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
        <Title order={2}>Выберите время звонка</Title>
        <Text c="dimmed">Свободные слоты по 30 минут. Выберите дату и удобное время.</Text>
      </div>

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="md">
            <Card withBorder>
              <Text fw={600} mb="sm">
                Тип события
              </Text>
              {eventTypes === null ? (
                <Loader size="sm" />
              ) : eventTypes.length === 0 ? (
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
                      onClick={() => setSelectedType(et)}
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
                onChange={setDate}
                minDate={today}
                maxDate={dayjs().add(60, 'day').format('YYYY-MM-DD')}
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
                        {dayjs(slot.startsAt).format('HH:mm')}
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
                    {dayjs(selectedSlot.startsAt).format('D MMMM YYYY, HH:mm')}–
                    {dayjs(selectedSlot.endsAt).format('HH:mm')}
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
