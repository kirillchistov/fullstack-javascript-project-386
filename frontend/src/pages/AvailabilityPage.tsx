import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Button,
  Card,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DateInput, TimeInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import dayjs from 'dayjs';
import { api, type AvailabilityException, type AvailabilityRule, type DayInterval } from '../api/client';

const WEEKDAYS = [
  { value: '1', label: 'Понедельник' },
  { value: '2', label: 'Вторник' },
  { value: '3', label: 'Среда' },
  { value: '4', label: 'Четверг' },
  { value: '5', label: 'Пятница' },
  { value: '6', label: 'Суббота' },
  { value: '7', label: 'Воскресенье' },
];

export default function AvailabilityPage() {
  const [timezone, setTimezone] = useState('');
  const [bufferMinutes, setBufferMinutes] = useState(0);
  const [rules, setRules] = useState<AvailabilityRule[] | null>(null);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.GET('/api/availability').then(({ data, error }) => {
      if (error) {
        notifications.show({ color: 'red', message: error.message });
        setRules([]);
        return;
      }
      setTimezone(data.timezone);
      setBufferMinutes(data.bufferMinutes ?? 0);
      setRules(data.rules);
      setExceptions(data.exceptions ?? []);
    });
  }, []);

  const updateRule = (index: number, patch: Partial<AvailabilityRule>) => {
    setRules((prev) =>
      prev ? prev.map((r, i) => (i === index ? { ...r, ...patch } : r)) : prev,
    );
  };

  const addRule = () => {
    setRules((prev) => [...(prev ?? []), { weekday: 1, startTime: '10:00', endTime: '18:00' }]);
  };

  const removeRule = (index: number) => {
    setRules((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  };

  const addException = () => {
    setExceptions((prev) => [
      ...prev,
      { date: dayjs().add(1, 'day').format('YYYY-MM-DD'), intervals: [] },
    ]);
  };

  const updateException = (index: number, patch: Partial<AvailabilityException>) => {
    setExceptions((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };

  const addExceptionInterval = (index: number) => {
    setExceptions((prev) =>
      prev.map((e, i) =>
        i === index
          ? {
              ...e,
              intervals: [...e.intervals, { startTime: '10:00', endTime: '14:00' }],
            }
          : e,
      ),
    );
  };

  const updateExceptionInterval = (
    exIndex: number,
    intIndex: number,
    patch: Partial<DayInterval>,
  ) => {
    setExceptions((prev) =>
      prev.map((e, i) =>
        i === exIndex
          ? {
              ...e,
              intervals: e.intervals.map((iv, j) => (j === intIndex ? { ...iv, ...patch } : iv)),
            }
          : e,
      ),
    );
  };

  const handleSave = async () => {
    if (!rules) return;
    setSaving(true);
    const { data, error } = await api.PUT('/api/availability', {
      body: {
        timezone,
        bufferMinutes: Number(bufferMinutes) || 0,
        rules,
        exceptions,
      },
    });
    setSaving(false);

    if (error) {
      const details =
        'errors' in error && error.errors?.length
          ? error.errors.map((e) => `${e.field}: ${e.message}`).join('; ')
          : error.message;
      notifications.show({ color: 'red', title: 'Не удалось сохранить', message: details });
      return;
    }
    setTimezone(data.timezone);
    setBufferMinutes(data.bufferMinutes);
    setRules(data.rules);
    setExceptions(data.exceptions);
    notifications.show({ color: 'green', message: 'Расписание доступности сохранено' });
  };

  if (rules === null) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Доступность</Title>
        <Text c="dimmed">
          Недельные окна, перерывы (несколько интервалов в один день), буфер между встречами и
          исключения (праздники / отпуск).
        </Text>
      </div>

      <Card withBorder>
        <Stack>
          <TextInput
            label="Часовой пояс"
            description="IANA-идентификатор, например Europe/Moscow"
            value={timezone}
            onChange={(e) => setTimezone(e.currentTarget.value)}
            maw={320}
          />
          <NumberInput
            label="Буфер между встречами (мин)"
            description="Время до и после каждой встречи, когда новые слоты не предлагаются"
            min={0}
            max={120}
            step={15}
            value={bufferMinutes}
            onChange={(v) => setBufferMinutes(typeof v === 'number' ? v : Number(v) || 0)}
            maw={280}
          />

          <Text fw={600} mt="sm">
            Недельные правила
          </Text>
          <Text size="sm" c="dimmed">
            Перерыв: добавьте два правила в один день, например 10:00–13:00 и 14:00–18:00.
          </Text>
          {rules.length === 0 && (
            <Text c="dimmed" size="sm">
              Правил пока нет — гости не увидят ни одного слота.
            </Text>
          )}
          {rules.map((rule, index) => (
            <Group key={index} align="flex-end" gap="sm">
              <Select
                label="День недели"
                data={WEEKDAYS}
                value={String(rule.weekday)}
                onChange={(v) => v && updateRule(index, { weekday: Number(v) })}
                allowDeselect={false}
                w={180}
              />
              <TimeInput
                label="С"
                value={rule.startTime}
                onChange={(e) => updateRule(index, { startTime: e.currentTarget.value })}
                w={110}
              />
              <TimeInput
                label="До"
                value={rule.endTime}
                onChange={(e) => updateRule(index, { endTime: e.currentTarget.value })}
                w={110}
              />
              <ActionIcon
                color="red"
                variant="light"
                size="lg"
                mb={2}
                onClick={() => removeRule(index)}
                aria-label="Удалить правило"
              >
                ✕
              </ActionIcon>
            </Group>
          ))}
          <Button variant="default" onClick={addRule} w="fit-content">
            Добавить правило
          </Button>
        </Stack>
      </Card>

      <Card withBorder>
        <Stack>
          <Text fw={600}>Исключения (праздники и особые дни)</Text>
          <Text size="sm" c="dimmed">
            Без интервалов — весь день недоступен. С интервалами — работа только в них.
          </Text>
          {exceptions.map((ex, index) => (
            <Stack key={index} gap="xs" p="sm" style={{ border: '1px solid #eee', borderRadius: 8 }}>
              <Group align="flex-end">
                <DateInput
                  label="Дата"
                  value={ex.date}
                  onChange={(v) =>
                    updateException(index, {
                      date: typeof v === 'string' ? v : dayjs(v).format('YYYY-MM-DD'),
                    })
                  }
                  valueFormat="YYYY-MM-DD"
                  w={180}
                />
                <Button
                  variant="light"
                  size="compact-sm"
                  onClick={() => addExceptionInterval(index)}
                >
                  Добавить интервал
                </Button>
                <Button
                  color="red"
                  variant="light"
                  size="compact-sm"
                  onClick={() => setExceptions((prev) => prev.filter((_, i) => i !== index))}
                >
                  Удалить день
                </Button>
              </Group>
              {ex.intervals.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Весь день выходной
                </Text>
              ) : (
                ex.intervals.map((iv, j) => (
                  <Group key={j} align="flex-end">
                    <TimeInput
                      label="С"
                      value={iv.startTime}
                      onChange={(e) =>
                        updateExceptionInterval(index, j, { startTime: e.currentTarget.value })
                      }
                      w={110}
                    />
                    <TimeInput
                      label="До"
                      value={iv.endTime}
                      onChange={(e) =>
                        updateExceptionInterval(index, j, { endTime: e.currentTarget.value })
                      }
                      w={110}
                    />
                    <ActionIcon
                      color="red"
                      variant="light"
                      onClick={() =>
                        updateException(index, {
                          intervals: ex.intervals.filter((_, k) => k !== j),
                        })
                      }
                    >
                      ✕
                    </ActionIcon>
                  </Group>
                ))
              )}
            </Stack>
          ))}
          <Button variant="default" onClick={addException} w="fit-content">
            Добавить исключение
          </Button>
        </Stack>
      </Card>

      <Group justify="flex-end">
        <Button loading={saving} onClick={handleSave} disabled={!timezone.trim()}>
          Сохранить
        </Button>
      </Group>
    </Stack>
  );
}
