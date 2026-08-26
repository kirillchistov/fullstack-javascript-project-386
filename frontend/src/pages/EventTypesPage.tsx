import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Group,
  Loader,
  NumberInput,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api, type EventType } from '../api/client';

export default function EventTypesPage() {
  const [items, setItems] = useState<EventType[] | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number | string>(30);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.GET('/api/event-types').then(({ data, error }) => {
      if (error) {
        notifications.show({ color: 'red', message: error.message });
        setItems([]);
      } else {
        setItems(data ?? []);
      }
    });
  };

  useEffect(load, []);

  const handleCreate = async () => {
    const duration = Number(durationMinutes);
    setSaving(true);
    const { error } = await api.POST('/api/event-types', {
      body: {
        name: name.trim(),
        description: description.trim() || undefined,
        durationMinutes: duration,
      },
    });
    setSaving(false);
    if (error) {
      notifications.show({ color: 'red', message: error.message });
      return;
    }
    setName('');
    setDescription('');
    setDurationMinutes(30);
    notifications.show({ color: 'green', message: 'Тип события создан' });
    load();
  };

  const handleDelete = async (id: number) => {
    const { error, response } = await api.DELETE('/api/event-types/{id}', {
      params: { path: { id } },
    });
    if (error && response.status !== 404) {
      notifications.show({ color: 'red', message: error.message });
      return;
    }
    notifications.show({ color: 'green', message: 'Тип удалён' });
    load();
  };

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Типы встреч</Title>
        <Text c="dimmed">
          Длительность задаёт длину слота для гостя (15–240 минут, кратно 15).
        </Text>
      </div>

      <Card withBorder>
        {items === null ? (
          <Group justify="center" py="lg">
            <Loader />
          </Group>
        ) : items.length === 0 ? (
          <Text c="dimmed" ta="center" py="md">
            Пока нет типов — создайте первый ниже
          </Text>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Название</Table.Th>
                <Table.Th>Длительность</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((et) => (
                <Table.Tr key={et.id}>
                  <Table.Td>
                    <Text fw={500}>{et.name}</Text>
                    {et.description && (
                      <Text size="sm" c="dimmed">
                        {et.description}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>{et.durationMinutes} мин</Table.Td>
                  <Table.Td>
                    <Button
                      color="red"
                      variant="light"
                      size="compact-sm"
                      onClick={() => handleDelete(et.id)}
                    >
                      Удалить
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
          <Text fw={600}>Новый тип</Text>
          <TextInput
            label="Название"
            required
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <Textarea
            label="Описание"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
          />
          <NumberInput
            label="Длительность (мин)"
            min={15}
            max={240}
            step={15}
            value={typeof durationMinutes === 'number' ? durationMinutes : Number(durationMinutes) || 30}
            onChange={(value) => setDurationMinutes(typeof value === 'number' ? value : Number(value) || 30)}
          />
          <Button
            loading={saving}
            disabled={!name.trim() || !Number(durationMinutes)}
            onClick={handleCreate}
          >
            Добавить
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
}
