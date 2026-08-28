import { useState } from 'react';
import { Alert, Badge, Button, Card, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api } from '../api/client';
import { useAuth } from '../auth';

export default function BillingPage() {
  const { owner, refresh } = useAuth();
  const [code, setCode] = useState('pro-dev');
  const [saving, setSaving] = useState(false);

  const activate = async () => {
    setSaving(true);
    const { data, error } = await api.POST('/api/billing/activate-pro', {
      body: { code: code.trim() },
    });
    setSaving(false);
    if (error) {
      notifications.show({ color: 'red', message: error.message });
      return;
    }
    await refresh();
    notifications.show({
      color: 'green',
      message: `Тариф: ${data?.owner.plan ?? 'pro'}`,
    });
  };

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Биллинг</Title>
        <Text c="dimmed">
          Freemium: Free — базовое бронирование; Pro — sync календарей, команда, серии,
          аналитика. Оплата подписки пока заглушка (активация кодом).
        </Text>
      </div>

      <Card withBorder>
        <Stack>
          <Text>
            Текущий тариф:{' '}
            <Badge color={owner?.plan === 'pro' ? 'green' : 'gray'}>
              {owner?.plan ?? 'free'}
            </Badge>
          </Text>
          {owner?.plan === 'pro' ? (
            <Alert color="green">Pro уже активен.</Alert>
          ) : (
            <>
              <TextInput
                label="Код активации Pro"
                description="По умолчанию pro-dev (или BILLING_PRO_CODE на сервере)"
                value={code}
                onChange={(e) => setCode(e.currentTarget.value)}
              />
              <Button loading={saving} onClick={activate} disabled={!code.trim()}>
                Активировать Pro
              </Button>
            </>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
