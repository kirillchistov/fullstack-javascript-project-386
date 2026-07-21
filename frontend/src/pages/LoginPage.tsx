import { useState } from 'react';
import { Alert, Button, Card, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useLocation, useNavigate } from 'react-router-dom';
import { isDemo } from '../api/client';
import { useAuth } from '../auth';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const message = await login(email, password);
    setSubmitting(false);
    if (message) {
      setError(message);
      return;
    }
    navigate(from, { replace: true });
  };

  return (
    <Stack align="center" py="xl">
      <Card withBorder w="100%" maw={400} component="form" onSubmit={handleSubmit}>
        <Stack>
          <div>
            <Title order={3}>Вход для владельца</Title>
            <Text size="sm" c="dimmed">
              Управление доступностью и встречами
            </Text>
          </div>
          {isDemo && (
            <Alert color="blue">Демо-режим: введите любые email и пароль</Alert>
          )}
          {error && <Alert color="red">{error}</Alert>}
          <TextInput
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
          <PasswordInput
            label="Пароль"
            required
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
          <Button type="submit" loading={submitting} disabled={!email || !password}>
            Войти
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
}
