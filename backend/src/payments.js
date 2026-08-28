/**
 * Одноразовые платежи за встречу: YooKassa или stub без ключей.
 */

function publicBase() {
  return (process.env.PUBLIC_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
}

function yookassaConfigured() {
  return Boolean(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY);
}

/**
 * @param {{ paymentId: number, amountRub: number, description: string, returnUrl?: string }} opts
 */
export async function createPaymentConfirmation(opts) {
  const { paymentId, amountRub, description, returnUrl } = opts;
  if (!yookassaConfigured()) {
    return {
      provider: 'stub',
      providerPaymentId: `stub-${paymentId}`,
      confirmationUrl: `${publicBase()}/pay/stub/${paymentId}`,
    };
  }

  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secret = process.env.YOOKASSA_SECRET_KEY;
  const auth = Buffer.from(`${shopId}:${secret}`).toString('base64');
  const body = {
    amount: { value: amountRub.toFixed(2), currency: 'RUB' },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: returnUrl ?? `${publicBase()}/pay/return`,
    },
    description: description.slice(0, 128),
    metadata: { paymentId: String(paymentId) },
  };

  const response = await fetch('https://api.yookassa.ru/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Idempotence-Key': `cc-pay-${paymentId}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(`YooKassa: ${response.status} ${text}`);
    err.code = 'validation_error';
    throw err;
  }

  const data = await response.json();
  return {
    provider: 'yookassa',
    providerPaymentId: data.id,
    confirmationUrl: data.confirmation?.confirmation_url ?? `${publicBase()}/pay/return`,
  };
}

export function isYookassaConfigured() {
  return yookassaConfigured();
}

/** Код активации Pro (заглушка подписки) */
export function isValidProCode(code) {
  const expected = process.env.BILLING_PRO_CODE ?? 'pro-dev';
  return typeof code === 'string' && code === expected;
}
