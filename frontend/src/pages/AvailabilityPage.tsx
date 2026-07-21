import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Button,
  Card,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { TimeInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { api, type AvailabilityRule } from '../api/client';

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
  const [rules, setRules] = useState<AvailabilityRule[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.GET('/api/availability').then(({ data, error }) => {
      if (error) {
        notifications.show({ color: 'red', message: error.message });
        setRules([]);
        return;
      }
      setTimezone(data.timezone);
      setRules(data.rules);
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

  const handleSave = async () => {
    if (!rules) return;
    setSaving(true);
    const { data, error } = await api.PUT('/api/availability', {
      body: { timezone, rules },
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
    setRules(data.rules);
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
          Недельное расписание, из которого вычисляются свободные слоты по 30 минут.
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

          <Text fw={600} mt="sm">
            Правила
          </Text>
          {rules.length === 0 && (
            <Text c="dimmed" size="sm">
              Правил пока нет — гости не увидят ни одного слота. Добавьте хотя бы одно.
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

          <Group justify="space-between" mt="md">
            <Button variant="default" onClick={addRule}>
              Добавить правило
            </Button>
            <Button loading={saving} onClick={handleSave} disabled={!timezone.trim()}>
              Сохранить
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
