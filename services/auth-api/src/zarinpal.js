import { createCircuitBreaker, isTransientStatus, withRetry } from './retry.js';

const API_BASE = 'https://api.zarinpal.com/pg/v4/payment';
const SANDBOX_API_BASE = 'https://sandbox.zarinpal.com/pg/v4/payment';

function apiBase(sandbox) {
  return sandbox ? SANDBOX_API_BASE : API_BASE;
}

// One breaker per sandbox/prod pair. A dead Zarinpal should fail fast instead of turning every
// checkout into a 15s timeout stacked on top of a retry budget.
const breakers = new Map();
function breakerFor(sandbox) {
  const key = sandbox ? 'sandbox' : 'production';
  if (!breakers.has(key)) breakers.set(key, createCircuitBreaker({ name: `zarinpal:${key}` }));
  return breakers.get(key);
}

/**
 * POST to Zarinpal with a bounded retry budget.
 *
 * Only 429/5xx and network errors are retried: a 4xx here is a definite rejection (bad merchant
 * id, bad amount) and re-sending it to a payment gateway is how double charges happen.
 */
async function postJson(url, payload, { attempts = 3, breaker, log } = {}) {
  breaker?.ensureClosed();
  try {
    const body = await withRetry(async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000)
      });
      if (!response.ok) {
        const error = new Error(`Zarinpal HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.json().catch(() => ({}));
    }, { attempts, log });
    breaker?.recordSuccess();
    return body;
  } catch (error) {
    breaker?.recordFailure();
    throw error;
  }
}

/** Create a Zarinpal payment authority. Amount must be an integer in rials. */
export async function createZarinpalPayment({ merchantId, amountRials, callbackUrl, description, metadata, sandbox, attempts, log }) {
  const body = await postJson(`${apiBase(sandbox)}/request.json`, {
    merchant_id: merchantId,
    amount: amountRials,
    callback_url: callbackUrl,
    description,
    metadata
  }, { attempts, breaker: breakerFor(sandbox), log });
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
export async function verifyZarinpalPayment({ merchantId, amountRials, authority, sandbox, attempts, log }) {
  const body = await postJson(`${apiBase(sandbox)}/verify.json`, {
    merchant_id: merchantId,
    amount: amountRials,
    authority
  }, { attempts, breaker: breakerFor(sandbox), log });
  const code = body?.data?.code;
  if (code !== 100 && code !== 101) {
    throw new Error(body?.errors?.message ?? 'Zarinpal did not verify the payment');
  }
  return { refId: String(body.data.ref_id ?? ''), alreadyVerified: code === 101 };
}

export { isTransientStatus };
export const __test = { breakers };
