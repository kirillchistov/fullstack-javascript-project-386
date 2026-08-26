import { useState } from 'react';
import { Alert, Button, Card, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth';

export default function RegisterPage() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { data, error: apiError, response } = await api.POST('/api/owners', {
      body: {
        name,
        email,
        password,
        slug: slug.trim().toLowerCase(),
      },
    });
    setSubmitting(false);
    if (apiError || !data) {
      setError(
        response.status === 409
          ? apiError?.message || 'Email или адрес ссылки уже заняты'
          : apiError?.message || 'Не удалось зарегистрироваться',
      );
      return;
    }
    await refresh();
    navigate('/admin', { replace: true });
  };

  return (
    <Stack align="center" py="xl">
      <Card withBorder w="100%" maw={420} component="form" onSubmit={handleSubmit}>
        <Stack>
          <div>
            <Title order={3}>Регистрация владельца</Title>
            <Text size="sm" c="dimmed">
              После регистрации появится публичная ссылка /u/{slug || '…'}
            </Text>
          </div>
          {error && <Alert color="red">{error}</Alert>}
          <TextInput
            label="Имя"
            required
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
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
            description="Не меньше 6 символов"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
          <TextInput
            label="Публичный адрес (slug)"
            required
            description="Латиница, цифры и дефис; будет в ссылке /u/…"
            value={slug}
            onChange={(e) => setSlug(e.currentTarget.value.toLowerCase())}
          />
          <Button
            type="submit"
            loading={submitting}
            disabled={!name || !email || password.length < 6 || !slug}
          >
            Создать аккаунт
          </Button>
          <Text size="sm" c="dimmed">
            Уже есть аккаунт?{' '}
            <Text span component={Link} to="/login" c="blue">
              Войти
            </Text>
          </Text>
        </Stack>
      </Card>
    </Stack>
  );
}
