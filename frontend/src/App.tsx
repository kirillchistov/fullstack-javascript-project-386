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
import ManageBookingPage from './pages/ManageBookingPage';
import NotificationSettingsPage from './pages/NotificationSettingsPage';
import BillingPage from './pages/BillingPage';
import CalendarsPage from './pages/CalendarsPage';
import TeamPage from './pages/TeamPage';
import SeriesPage from './pages/SeriesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import PayStubPage from './pages/PayStubPage';
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

const navLink = (to: string, label: string) => (
  <Button component={Link} to={to} variant="subtle" size="compact-sm">
    {label}
  </Button>
);

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
          <Group h="100%" justify="space-between" wrap="nowrap" gap="xs">
            <Group gap="xs" wrap="wrap">
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
                  {navLink(`/u/${owner.slug}`, 'Моя страница')}
                  {navLink('/admin', 'Встречи')}
                  {navLink('/admin/event-types', 'Типы')}
                  {navLink('/admin/availability', 'Доступность')}
                  {navLink('/admin/notifications', 'Уведомления')}
                  {navLink('/admin/calendars', 'Календари')}
                  {navLink('/admin/team', 'Команда')}
                  {navLink('/admin/series', 'Серии')}
                  {navLink('/admin/analytics', 'Аналитика')}
                  {navLink('/admin/billing', 'Биллинг')}
                </>
              )}
            </Group>
            <Group wrap="nowrap">
              {owner ? (
                <>
                  <Text size="sm" c="dimmed" visibleFrom="sm">
                    {owner.name}
                    {owner.plan === 'pro' ? ' · Pro' : ''}
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
            <Route path="/b/:token" element={<ManageBookingPage />} />
            <Route path="/pay/stub/:id" element={<PayStubPage />} />
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
            <Route
              path="/admin/notifications"
              element={
                <RequireOwner>
                  <NotificationSettingsPage />
                </RequireOwner>
              }
            />
            <Route
              path="/admin/billing"
              element={
                <RequireOwner>
                  <BillingPage />
                </RequireOwner>
              }
            />
            <Route
              path="/admin/calendars"
              element={
                <RequireOwner>
                  <CalendarsPage />
                </RequireOwner>
              }
            />
            <Route
              path="/admin/team"
              element={
                <RequireOwner>
                  <TeamPage />
                </RequireOwner>
              }
            />
            <Route
              path="/team/join"
              element={
                <RequireOwner>
                  <TeamPage />
                </RequireOwner>
              }
            />
            <Route
              path="/admin/series"
              element={
                <RequireOwner>
                  <SeriesPage />
                </RequireOwner>
              }
            />
            <Route
              path="/admin/analytics"
              element={
                <RequireOwner>
                  <AnalyticsPage />
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
