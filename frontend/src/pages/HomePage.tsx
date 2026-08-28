import { useState } from 'react';
import { Button, Card, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import { Link, useNavigate } from 'react-router-dom';
import { CallpalLogo } from '../components/CallpalLogo';
import { useAuth } from '../auth';

export default function HomePage() {
  const { owner } = useAuth();
  const navigate = useNavigate();
  const [slug, setSlug] = useState('');

  return (
    <Stack gap="xl" py="md">
      <div>
        <CallpalLogo iconSize={48} />
        <Title order={2} mt="sm">
          Запись на звонок
        </Title>
        <Text c="dimmed" maw={560}>
          Владелец публикует свободное время по ссылке /u/имя — гость выбирает слот без
          переписки «когда вам удобно?».
        </Text>
      </div>

      {owner ? (
        <Card withBorder maw={480}>
          <Stack>
            <Text>
              Вы вошли как <b>{owner.name}</b>. Ваша публичная ссылка:
            </Text>
            <Text component={Link} to={`/u/${owner.slug}`} c="blue">
              /u/{owner.slug}
            </Text>
            <Group>
              <Button component={Link} to="/admin">
                Кабинет
              </Button>
              <Button component={Link} to="/admin/event-types" variant="light">
                Типы встреч
              </Button>
            </Group>
          </Stack>
        </Card>
      ) : (
        <Card withBorder maw={480}>
          <Stack>
            <Text fw={600}>Открыть календарь владельца</Text>
            <TextInput
              label="Публичный адрес (slug)"
              placeholder="kirill"
              value={slug}
              onChange={(e) => setSlug(e.currentTarget.value.trim().toLowerCase())}
            />
            <Button disabled={!slug} onClick={() => navigate(`/u/${slug}`)}>
              Перейти к записи
            </Button>
            <Text size="sm" c="dimmed">
              Пример сида:{' '}
              <Text span component={Link} to="/u/kirill" c="blue">
                /u/kirill
              </Text>
              . Нет аккаунта?{' '}
              <Text span component={Link} to="/register" c="blue">
                Зарегистрироваться
              </Text>
            </Text>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
