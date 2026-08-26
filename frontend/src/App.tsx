import { Alert, AppShell, Button, Container, Group, Loader, Text, Title } from '@mantine/core';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { isDemo } from './api/client';
import { useAuth } from './auth';
import BookingPage from './pages/BookingPage';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import OwnerBookingsPage from './pages/OwnerBookingsPage';
import AvailabilityPage from './pages/AvailabilityPage';
import EventTypesPage from './pages/EventTypesPage';
import type { ReactNode } from 'react';

function RequireOwner({ children }: { children: ReactNode }) {
  const { owner, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }
  if (!owner) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return children;
}

export default function App() {
  const { owner, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Container size="lg" h="100%">
          <Group h="100%" justify="space-between">
            <Group gap="lg">
              <Title order={3}>
                <Text
                  component={Link}
                  to="/"
                  inherit
                  c="blue.7"
                  style={{ textDecoration: 'none' }}
                >
                  Запись на звонок
                </Text>
              </Title>
              {owner && (
                <>
                  <Button component={Link} to={`/u/${owner.slug}`} variant="subtle" size="compact-sm">
                    Моя страница
                  </Button>
                  <Button component={Link} to="/admin" variant="subtle" size="compact-sm">
                    Встречи
                  </Button>
                  <Button
                    component={Link}
                    to="/admin/event-types"
                    variant="subtle"
                    size="compact-sm"
                  >
                    Типы встреч
                  </Button>
                  <Button
                    component={Link}
                    to="/admin/availability"
                    variant="subtle"
                    size="compact-sm"
                  >
                    Доступность
                  </Button>
                </>
              )}
            </Group>
            <Group>
              {owner ? (
                <>
                  <Text size="sm" c="dimmed">
                    {owner.name}
                  </Text>
                  <Button variant="default" size="compact-sm" onClick={handleLogout}>
                    Выйти
                  </Button>
                </>
              ) : (
                <>
                  <Button component={Link} to="/register" variant="subtle" size="compact-sm">
                    Регистрация
                  </Button>
                  <Button component={Link} to="/login" variant="default" size="compact-sm">
                    Войти
                  </Button>
                </>
              )}
            </Group>
          </Group>
        </Container>
      </AppShell.Header>

      <AppShell.Main>
        <Container size="lg">
          {isDemo && (
            <Alert color="yellow" mb="md">
              Демо-версия: сервер эмулируется в браузере, данные сохраняются только в
              вашем localStorage. Для входа владельца подойдут любые email и пароль
              (slug демо — kirill).
            </Alert>
          )}
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/u/:slug" element={<BookingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/admin"
              element={
                <RequireOwner>
                  <OwnerBookingsPage />
                </RequireOwner>
              }
            />
            <Route
              path="/admin/event-types"
              element={
                <RequireOwner>
                  <EventTypesPage />
                </RequireOwner>
              }
            />
            <Route
              path="/admin/availability"
              element={
                <RequireOwner>
                  <AvailabilityPage />
                </RequireOwner>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
