import { Alert, Button, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth';

/** Pro-фичи: календарный sync, команда, серии, аналитика */
export default function ProGate({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { owner } = useAuth();
  if (owner?.plan === 'pro') return children;

  return (
    <Stack gap="md">
      <Title order={2}>{title}</Title>
      <Alert color="blue" title="Доступно на тарифе Pro">
        <Text mb="sm">
          Активируйте Pro в разделе «Биллинг» (код-заглушка <code>pro-dev</code>), чтобы
          пользоваться этой функцией.
        </Text>
        <Button component={Link} to="/admin/billing" size="compact-sm">
          Перейти к биллингу
        </Button>
      </Alert>
    </Stack>
  );
}
