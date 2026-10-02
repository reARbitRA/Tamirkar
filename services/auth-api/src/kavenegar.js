import { createCircuitBreaker, withRetry } from './retry.js';

const breaker = createCircuitBreaker({ name: 'kavenegar' });

/**
 * Sends a one-time code through Kavenegar Verify Lookup.
 * The secret stays in this service's environment; Android never receives it.
 *
 * A transient Kavenegar failure previously surfaced as a login-time 500: one network blip and the
 * customer could not sign in at all. Transient failures (429/5xx/network) now get a bounded
 * retry; a definite rejection still fails immediately, because retrying an invalid receptor just
 * delays the error the user needs to see.
 */
export async function sendKavenegarOtp({ apiKey, template, receptor, token, attempts = 3, log }) {
  const url = `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/verify/lookup.json`;
  const form = new URLSearchParams({ receptor, token, template });
  breaker.ensureClosed();
  try {
    const payload = await withRetry(async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) {
        const error = new Error(`Kavenegar HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.json().catch(() => ({}));
    }, { attempts, log });

    if (payload?.return?.status !== 200) {
      // A provider-level rejection, not a transport failure: never retried.
      throw new Error(payload?.return?.message || 'Kavenegar rejected the request');
    }
    breaker.recordSuccess();
    return String(payload.entries?.[0]?.messageid ?? 'accepted');
  } catch (error) {
    breaker.recordFailure();
    throw error;
  }
}

export const __test = { breaker };
