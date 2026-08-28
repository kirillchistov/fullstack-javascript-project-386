import {
  Box,
  Burger,
  Button,
  Container,
  Divider,
  Drawer,
  Group,
  Menu,
  Stack,
  Text,
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { CallpalLogo } from './CallpalLogo';

const MOBILE_MAX = '(max-width: 799px)';

const SETTINGS_LINKS = [
  { to: '/admin/event-types', label: 'Типы' },
  { to: '/admin/availability', label: 'Доступность' },
  { to: '/admin/notifications', label: 'Уведомления' },
  { to: '/admin/calendars', label: 'Календари' },
  { to: '/admin/series', label: 'Серии' },
  { to: '/admin/team', label: 'Команда' },
  { to: '/admin/analytics', label: 'Аналитика' },
  { to: '/admin/billing', label: 'Биллинг' },
] as const;

function isSettingsPath(pathname: string) {
  return SETTINGS_LINKS.some((item) => {
    if (item.to === '/admin/team' && pathname.startsWith('/team/join')) return true;
    return pathname === item.to || pathname.startsWith(`${item.to}/`);
  });
}

function NavButton({
  to,
  label,
  active,
  onClick,
}: {
  to: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Button
      component={Link}
      to={to}
      variant={active ? 'light' : 'subtle'}
      size="compact-sm"
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

function OwnerNav({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const { owner } = useAuth();
  const { pathname } = useLocation();

  if (!owner) return null;

  const settingsActive = isSettingsPath(pathname);

  if (compact) {
    return (
      <Stack gap={4}>
        <NavButton
          to={`/u/${owner.slug}`}
          label="Моя страница"
          active={pathname === `/u/${owner.slug}`}
          onClick={onNavigate}
        />
        <NavButton
          to="/admin"
          label="Встречи"
          active={pathname === '/admin'}
          onClick={onNavigate}
        />
        <Text size="xs" c="dimmed" mt="xs" mb={4} fw={600}>
          Настройки
        </Text>
        {SETTINGS_LINKS.map((item) => (
          <NavButton
            key={item.to}
            to={item.to}
            label={item.label}
            active={
              pathname === item.to ||
              (item.to === '/admin/team' && pathname.startsWith('/team/join'))
            }
            onClick={onNavigate}
          />
        ))}
      </Stack>
    );
  }

  return (
    <Group gap={4} wrap="nowrap">
      <NavButton
        to={`/u/${owner.slug}`}
        label="Моя страница"
        active={pathname === `/u/${owner.slug}`}
      />
      <NavButton to="/admin" label="Встречи" active={pathname === '/admin'} />
      <Menu trigger="click-hover" openDelay={80} closeDelay={120} withinPortal>
        <Menu.Target>
          <Button variant={settingsActive ? 'light' : 'subtle'} size="compact-sm">
            Настройки
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {SETTINGS_LINKS.map((item) => (
            <Menu.Item
              key={item.to}
              component={Link}
              to={item.to}
              style={{ fontWeight: pathname === item.to ? 600 : undefined }}
            >
              {item.label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}

function AuthActions({ onNavigate }: { onNavigate?: () => void }) {
  const { owner, logout } = useAuth();
  const navigate = useNavigate();

  if (owner) {
    return (
      <Group gap="sm" wrap="nowrap">
        <Text size="sm" c="dimmed" visibleFrom="sm" lineClamp={1}>
          {owner.name}
          {owner.plan === 'pro' ? ' · Pro' : ''}
        </Text>
        <Button
          variant="default"
          size="compact-sm"
          onClick={async () => {
            await logout();
            navigate('/');
            onNavigate?.();
          }}
        >
          Выйти
        </Button>
      </Group>
    );
  }

  return (
    <Group gap="xs" wrap="nowrap">
      <Button component={Link} to="/register" variant="subtle" size="compact-sm" onClick={onNavigate}>
        Регистрация
      </Button>
      <Button component={Link} to="/login" variant="default" size="compact-sm" onClick={onNavigate}>
        Войти
      </Button>
    </Group>
  );
}

export function AppHeader() {
  const isMobile = useMediaQuery(MOBILE_MAX) ?? false;
  const [drawerOpened, { toggle, close }] = useDisclosure(false);
  const { owner } = useAuth();

  return (
    <>
      <Container size="lg" h="100%">
        <Group h="100%" justify="space-between" wrap="nowrap" gap="sm">
          <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            {isMobile && owner && (
              <Burger opened={drawerOpened} onClick={toggle} size="sm" aria-label="Меню" />
            )}
            <CallpalLogo iconSize={isMobile ? 32 : 36} showText={!isMobile || !owner} />
            {!isMobile && <OwnerNav />}
          </Group>
          <Box style={{ flexShrink: 0 }}>
            <AuthActions />
          </Box>
        </Group>
      </Container>

      {isMobile && owner && (
        <Drawer
          opened={drawerOpened}
          onClose={close}
          title="Меню"
          position="left"
          size="xs"
          padding="md"
        >
          <Stack gap="md">
            <OwnerNav compact onNavigate={close} />
            <Divider />
            <AuthActions onNavigate={close} />
          </Stack>
        </Drawer>
      )}
    </>
  );
}
