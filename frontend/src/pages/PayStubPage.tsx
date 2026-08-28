import { useEffect, useState } from 'react';
import { Alert, Button, Loader, Stack, Text, Title } from '@mantine/core';
import { Link, useParams } from 'react-router-dom';
import { api, type components } from '../api/client';

type PaymentInfo = components['schemas']['PaymentInfo'];

/** Stub-страница оплаты (без реальной YooKassa) */
export default function PayStubPage() {
  const { id = '' } = useParams();
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const paymentId = Number(id);
    if (!paymentId) {
      setError('Некорректный платёж');
      return;
    }
    api.GET('/api/payments/{id}', { params: { path: { id: paymentId } } }).then(({ data, error: err }) => {
      if (err || !data) setError(err?.message || 'Платёж не найден');
      else setPayment(data);
    });
  }, [id]);

  const confirm = async () => {
    if (!payment) return;
    setConfirming(true);
    const { data, error: err } = await api.POST('/api/payments/{id}/stub-confirm', {
      params: { path: { id: payment.id } },
    });
    setConfirming(false);
    if (err || !data) {
      setError(err?.message || 'Не удалось подтвердить');
      return;
    }
    setPayment(data);
  };

  if (error) {
    return (
      <Alert color="red" title="Ошибка">
        {error}
      </Alert>
    );
  }

  if (!payment) {
    return <Loader />;
  }

  return (
    <Stack gap="md" maw={480}>
      <Title order={2}>Оплата встречи</Title>
      <Text>
        Сумма: <b>{payment.amountRub} ₽</b>
      </Text>
      <Text>
        Статус: <b>{payment.status}</b>
      </Text>
      {payment.status === 'paid' ? (
        <Alert color="green">Оплата подтверждена (stub / YooKassa).</Alert>
      ) : (
        <Button loading={confirming} onClick={confirm}>
          Оплатить (заглушка)
        </Button>
      )}
      <Button component={Link} to="/" variant="light">
        На главную
      </Button>
    </Stack>
  );
}
