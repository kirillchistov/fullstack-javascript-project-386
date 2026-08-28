import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useSearchParams } from 'react-router-dom';
import { api, type components } from '../api/client';
import ProGate from './ProGate';

type Organization = components['schemas']['Organization'];
type OrganizationMember = components['schemas']['OrganizationMember'];

export default function TeamPage() {
  return (
    <ProGate title="Команда">
      <TeamInner />
    </ProGate>
  );
}

function TeamInner() {
  const [params] = useSearchParams();
  const joinToken = params.get('token');
  const [orgs, setOrgs] = useState<Organization[] | null>(null);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const loadOrgs = () => {
    api.GET('/api/organizations').then(({ data }) => {
      setOrgs(data ?? []);
      if (data && data.length > 0 && !selected) setSelected(data[0]);
    });
  };

  useEffect(() => {
    loadOrgs();
    if (joinToken) {
      api.POST('/api/organizations/join', { body: { token: joinToken } }).then(({ data, error }) => {
        if (error) notifications.show({ color: 'red', message: error.message });
        else {
          notifications.show({ color: 'green', message: `Вы в организации «${data?.name}»` });
          loadOrgs();
        }
      });
    }
  }, []);

  useEffect(() => {
    if (!selected) {
      setMembers([]);
      return;
    }
    api
      .GET('/api/organizations/{id}/members', { params: { path: { id: selected.id } } })
      .then(({ data }) => setMembers(data ?? []));
  }, [selected?.id]);

  const createOrg = async () => {
    const { data, error } = await api.POST('/api/organizations', {
      body: { name: name.trim() },
    });
    if (error) {
      notifications.show({ color: 'red', message: error.message });
      return;
    }
    setName('');
    setSelected(data ?? null);
    loadOrgs();
  };

  const invite = async () => {
    if (!selected) return;
    const { data, error } = await api.POST('/api/organizations/{id}/invites', {
      params: { path: { id: selected.id } },
      body: { email: inviteEmail.trim() },
    });
    if (error) {
      notifications.show({ color: 'red', message: error.message });
      return;
    }
    setInviteLink(data?.joinPath ?? null);
    setInviteEmail('');
  };

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Команда</Title>
        <Text c="dimmed">
          Организация с участниками — у каждого свой публичный slug `/u/…`. Без общего
          пула слотов (round-robin вне MVP).
        </Text>
      </div>

      <Card withBorder>
        <Stack>
          <Text fw={600}>Создать организацию</Text>
          <Group align="flex-end">
            <TextInput
              label="Название"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button disabled={!name.trim()} onClick={createOrg}>
              Создать
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder>
        {orgs === null ? (
          <Loader />
        ) : orgs.length === 0 ? (
          <Text c="dimmed">Организаций пока нет</Text>
        ) : (
          <Stack>
            <Group>
              {orgs.map((o) => (
                <Button
                  key={o.id}
                  variant={selected?.id === o.id ? 'filled' : 'light'}
                  size="compact-sm"
                  onClick={() => setSelected(o)}
                >
                  {o.name}
                </Button>
              ))}
            </Group>
            {selected && (
              <>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Имя</Table.Th>
                      <Table.Th>Slug</Table.Th>
                      <Table.Th>Роль</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {members.map((m) => (
                      <Table.Tr key={m.ownerId}>
                        <Table.Td>{m.name}</Table.Td>
                        <Table.Td>/u/{m.slug}</Table.Td>
                        <Table.Td>{m.role}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
                <Group align="flex-end">
                  <TextInput
                    label="Пригласить по email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.currentTarget.value)}
                    style={{ flex: 1 }}
                  />
                  <Button disabled={!inviteEmail.trim()} onClick={invite}>
                    Пригласить
                  </Button>
                </Group>
                {inviteLink && (
                  <Text size="sm">
                    Ссылка для коллеги: <code>{inviteLink}</code>
                  </Text>
                )}
              </>
            )}
          </Stack>
        )}
      </Card>
    </Stack>
  );
}
