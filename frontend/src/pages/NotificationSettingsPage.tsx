import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  NumberInput,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api } from '../api/client';

export default function NotificationSettingsPage() {
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [telegramChatId, setTelegramChatId] = useState('');
  const [reminderHoursBefore, setReminderHoursBefore] = useState(24);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.GET('/api/notification-settings').then(({ data, error }) => {
      setLoading(false);
      if (error || !data) {
        notifications.show({ color: 'red', message: error?.message || 'Ошибка загрузки' });
        return;
      }
      setEmailEnabled(data.emailEnabled);
      setTelegramChatId(data.telegramChatId ?? '');
      setReminderHoursBefore(data.reminderHoursBefore);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const { data, error } = await api.PUT('/api/notification-settings', {
      body: {
        emailEnabled,
        telegramChatId: telegramChatId.trim() || undefined,
        reminderHoursBefore: Number(reminderHoursBefore) || 24,
      },
    });
    setSaving(false);
    if (error || !data) {
      notifications.show({ color: 'red', message: error?.message || 'Не удалось сохранить' });
      return;
    }
    setEmailEnabled(data.emailEnabled);
    setTelegramChatId(data.telegramChatId ?? '');
    setReminderHoursBefore(data.reminderHoursBefore);
    notifications.show({ color: 'green', message: 'Настройки уведомлений сохранены' });
  };

  if (loading) return null;

  return (
    <Stack gap="lg" maw={520}>
      <div>
        <Title order={2}>Уведомления</Title>
        <Text c="dimmed">
          Email гостю и вам при брони, отмене, переносе и напоминании. Telegram — только вам
          (нужен TELEGRAM_BOT_TOKEN на сервере).
        </Text>
      </div>

      <Card withBorder>
        <Stack>
          <Switch
            label="Email-уведомления"
            checked={emailEnabled}
            onChange={(e) => setEmailEnabled(e.currentTarget.checked)}
          />
          <TextInput
            label="Telegram chat id"
            description="Узнать можно у @userinfobot после старта диалога с вашим ботом"
            placeholder="123456789"
            value={telegramChatId}
            onChange={(e) => setTelegramChatId(e.currentTarget.value)}
          />
          <NumberInput
            label="Напоминание за N часов"
            min={1}
            max={168}
            value={reminderHoursBefore}
            onChange={(v) => setReminderHoursBefore(typeof v === 'number' ? v : Number(v) || 24)}
          />
          <Button loading={saving} onClick={handleSave}>
            Сохранить
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
}
