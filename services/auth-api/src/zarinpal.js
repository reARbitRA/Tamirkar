const API_BASE = 'https://api.zarinpal.com/pg/v4/payment';
const SANDBOX_API_BASE = 'https://sandbox.zarinpal.com/pg/v4/payment';

function apiBase(sandbox) {
  return sandbox ? SANDBOX_API_BASE : API_BASE;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Zarinpal HTTP ${response.status}`);
  return body;
}

/** Create a Zarinpal payment authority. Amount must be an integer in rials. */
export async function createZarinpalPayment({ merchantId, amountRials, callbackUrl, description, metadata, sandbox }) {
  const body = await postJson(`${apiBase(sandbox)}/request.json`, {
    merchant_id: merchantId,
    amount: amountRials,
    callback_url: callbackUrl,
    description,
    metadata
  });
  if (body?.data?.code !== 100 || !body?.data?.authority) {
    throw new Error(body?.errors?.message ?? 'Zarinpal did not create a payment authority');
  }
  const authority = body.data.authority;
  return {
    authority,
    paymentUrl: `${sandbox ? 'https://sandbox.zarinpal.com' : 'https://www.zarinpal.com'}/pg/StartPay/${authority}`
  };
}

/** Verify after the customer returns to our callback. Do not trust callback query data alone. */
export async function verifyZarinpalPayment({ merchantId, amountRials, authority, sandbox }) {
  const body = await postJson(`${apiBase(sandbox)}/verify.json`, {
    merchant_id: merchantId,
    amount: amountRials,
    authority
  });
  const code = body?.data?.code;
  if (code !== 100 && code !== 101) {
    throw new Error(body?.errors?.message ?? 'Zarinpal did not verify the payment');
  }
  return { refId: String(body.data.ref_id ?? ''), alreadyVerified: code === 101 };
}
