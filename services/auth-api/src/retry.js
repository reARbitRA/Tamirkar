/**
 * Bounded retry with exponential backoff and jitter for calls to third-party providers.
 *
 * Only *transient* failures are retried. A 4xx from Zarinpal or Kavenegar is a definite
 * answer, not a network hiccup, and retrying it just burns the caller's latency budget and
 * risks double-charging a payment gateway. Retry happens on: connection errors, timeouts,
 * and 5xx / 429.
 *
 * A per-provider circuit breaker sits in front so a provider that is down does not keep the
 * whole request path waiting on backoff timers.
 */

const DEFAULTS = { attempts: 3, baseDelayMs: 200, maxDelayMs: 2_000, factor: 2 };

/** Statuses that mean "the provider is unhappy right now", not "your request is wrong". */
export function isTransientStatus(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

/** Network-level errors (ECONNRESET, ETIMEDOUT, fetch aborts) are always worth one more try. */
export function isTransientError(error) {
  if (!error) return false;
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return true;
  const code = String(error.code ?? '');
  return ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'EPIPE', 'UND_ERR_SOCKET'].includes(code);
}

export function backoffDelayMs(attempt, { baseDelayMs, maxDelayMs, factor } = DEFAULTS, random = Math.random) {
  // Full jitter: uniform over [0, min(cap, base * factor^attempt)] prevents a fleet of
  // retries from re-synchronising into a thundering herd.
  const ceiling = Math.min(maxDelayMs, baseDelayMs * factor ** attempt);
  return Math.floor(random() * ceiling);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn` with bounded retries. `fn` receives the attempt index (0-based).
 * Throws the last error once the budget is exhausted.
 */
export async function withRetry(fn, options = {}) {
  const config = { ...DEFAULTS, ...options };
  const log = options.log;
  let lastError;
  for (let attempt = 0; attempt < config.attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const transient = isTransientError(error) || isTransientStatus(error?.status ?? 0);
      if (!transient || attempt === config.attempts - 1) throw error;
      const delay = backoffDelayMs(attempt, config);
      log?.warn({ attempt: attempt + 1, delay, err: error }, 'provider call failed transiently; retrying');
      await sleep(delay);
    }
  }
  throw lastError;
}

/**
 * Minimal circuit breaker: after `threshold` consecutive failures the provider is opened
 * (calls fail fast) for `resetMs`, then one probe request is allowed through.
 *
 * This keeps a dead provider from turning every user request into a 15-second timeout.
 */
export function createCircuitBreaker({ name, threshold = 5, resetMs = 30_000, now = Date.now } = {}) {
  let failures = 0;
  let openedAt = 0;
  return {
    get name() { return name; },
    get state() {
      if (failures < threshold) return 'closed';
      return now() - openedAt >= resetMs ? 'half-open' : 'open';
    },
    get failures() { return failures; },
    /** Throws when the circuit is open so the caller fails fast instead of waiting. */
    ensureClosed() {
      if (this.state === 'open') {
        const error = new Error(`${name} circuit open`);
        error.code = 'CIRCUIT_OPEN';
        throw error;
      }
    },
    recordSuccess() { failures = 0; openedAt = 0; },
    recordFailure() {
      failures += 1;
      if (failures === threshold) openedAt = now();
    }
  };
}
