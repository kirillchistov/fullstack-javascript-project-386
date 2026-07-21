import { Alert, AppShell, Button, Container, Group, Loader, Text, Title } from '@mantine/core';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { isDemo } from './api/client';
import { useAuth } from './auth';
import BookingPage from './pages/BookingPage';
import LoginPage from './pages/LoginPage';
import OwnerBookingsPage from './pages/OwnerBookingsPage';
import AvailabilityPage from './pages/AvailabilityPage';
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
              <Button component={Link} to="/" variant="subtle" size="compact-sm">
                Бронирование
              </Button>
              {owner && (
                <>
                  <Button component={Link} to="/admin" variant="subtle" size="compact-sm">
                    Встречи
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
                <Button component={Link} to="/login" variant="default" size="compact-sm">
                  Я владелец
                </Button>
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
              вашем localStorage. Для входа владельца подойдут любые email и пароль.
            </Alert>
          )}
          <Routes>
            <Route path="/" element={<BookingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/admin"
              element={
                <RequireOwner>
                  <OwnerBookingsPage />
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
