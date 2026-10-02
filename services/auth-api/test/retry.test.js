import test from 'node:test';
import assert from 'node:assert/strict';
import {
  backoffDelayMs,
  createCircuitBreaker,
  isTransientError,
  isTransientStatus,
  withRetry
} from '../src/retry.js';
import { createRateLimiter } from '../src/ratelimit.js';

test('retry: only transient outcomes are classified as retryable', () => {
  assert.equal(isTransientStatus(429), true);
  assert.equal(isTransientStatus(503), true);
  assert.equal(isTransientStatus(500), true);
  // A 4xx is a definite answer from the provider; re-sending it to a payment gateway is how
  // double charges happen.
  assert.equal(isTransientStatus(400), false);
  assert.equal(isTransientStatus(401), false);
  assert.equal(isTransientStatus(409), false);
  assert.equal(isTransientStatus(0), false);

  assert.equal(isTransientError(Object.assign(new Error('x'), { code: 'ECONNRESET' })), true);
  assert.equal(isTransientError(Object.assign(new Error('x'), { name: 'TimeoutError' })), true);
  assert.equal(isTransientError(Object.assign(new Error('x'), { name: 'AbortError' })), true);
  assert.equal(isTransientError(Object.assign(new Error('x'), { code: 'EAI_AGAIN' })), true);
  assert.equal(isTransientError(Object.assign(new Error('x'), { code: 'ERR_INVALID_ARG' })), false);
  assert.equal(isTransientError(new Error('plain')), false);
  assert.equal(isTransientError(null), false);
});

test('retry: succeeds on the first attempt without sleeping', async () => {
  let calls = 0;
  const result = await withRetry(async () => { calls += 1; return 'ok'; }, { attempts: 3 });
  assert.equal(result, 'ok');
  assert.equal(calls, 1);
});

test('retry: recovers from a transient failure and reports the attempt index', async () => {
  const seen = [];
  const result = await withRetry(async (attempt) => {
    seen.push(attempt);
    if (attempt < 2) {
      const error = new Error('gateway 503');
      error.status = 503;
      throw error;
    }
    return 'recovered';
  }, { attempts: 3, baseDelayMs: 1, maxDelayMs: 2 });
  assert.equal(result, 'recovered');
  assert.deepEqual(seen, [0, 1, 2]);
});

test('retry: does not retry a definite rejection', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => {
      calls += 1;
      const error = new Error('bad merchant id');
      error.status = 400;
      throw error;
    }, { attempts: 5, baseDelayMs: 1 }),
    /bad merchant id/
  );
  assert.equal(calls, 1, 'a 4xx must be surfaced immediately, never re-sent');
});

test('retry: gives up after the budget and throws the last error', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => {
      calls += 1;
      throw Object.assign(new Error(`attempt ${calls}`), { code: 'ECONNRESET' });
    }, { attempts: 3, baseDelayMs: 1, maxDelayMs: 2 }),
    /attempt 3/
  );
  assert.equal(calls, 3);
});

test('retry: backoff is jittered and never exceeds the cap', () => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const delay = backoffDelayMs(attempt, { baseDelayMs: 200, maxDelayMs: 2_000, factor: 2 }, () => 0.999);
    assert.ok(delay <= 2_000, `attempt ${attempt} exceeded the cap: ${delay}`);
    assert.ok(delay >= 0);
  }
  // random() === 0 must yield 0 so full jitter is genuinely full-jitter.
  assert.equal(backoffDelayMs(5, { baseDelayMs: 200, maxDelayMs: 2_000, factor: 2 }, () => 0), 0);
  // The ceiling grows with the attempt number until the cap binds.
  assert.ok(
    backoffDelayMs(0, { baseDelayMs: 200, maxDelayMs: 2_000, factor: 2 }, () => 1)
    < backoffDelayMs(3, { baseDelayMs: 200, maxDelayMs: 2_000, factor: 2 }, () => 1)
  );
});

test('circuit breaker: opens after the threshold and fails fast', () => {
  let clock = 1_000;
  const breaker = createCircuitBreaker({ name: 'test', threshold: 2, resetMs: 500, now: () => clock });
  assert.equal(breaker.state, 'closed');
  breaker.recordFailure();
  assert.equal(breaker.state, 'closed', 'one failure is not enough to open');
  breaker.recordFailure();
  assert.equal(breaker.state, 'open');
  assert.throws(() => breaker.ensureClosed(), /circuit open/);

  // Half-open after the reset window: exactly one probe is allowed through.
  clock += 500;
  assert.equal(breaker.state, 'half-open');
  assert.doesNotThrow(() => breaker.ensureClosed());

  // A successful probe closes it again and clears the failure count.
  breaker.recordSuccess();
  assert.equal(breaker.state, 'closed');
  assert.equal(breaker.failures, 0);
});

test('rate limiter: allows up to the limit, then rejects with a retry-after', () => {
  let clock = 0;
  const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => clock });

  const first = limiter.take('user-a');
  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 2);
  assert.equal(first.limit, 3);

  assert.equal(limiter.take('user-a').remaining, 1);
  assert.equal(limiter.take('user-a').remaining, 0);

  const blocked = limiter.take('user-a');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterSeconds, 60);
});

test('rate limiter: buckets are per key and expire with the window', () => {
  let clock = 0;
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => clock });
  assert.equal(limiter.take('user-a').allowed, true);
  // A second caller must not inherit the first caller's budget.
  assert.equal(limiter.take('user-b').allowed, true);
  assert.equal(limiter.take('user-a').allowed, false);

  clock += 60_000;
  // One take, inspected once: with limit 1 a second take in the same window is correctly blocked.
  const afterRoll = limiter.take('user-a');
  assert.equal(afterRoll.allowed, true, 'the window must roll over');
  assert.equal(afterRoll.remaining, 0);
  assert.equal(afterRoll.retryAfterSeconds, 0);
  assert.equal(limiter.take('user-a').allowed, false, 'the fresh window still holds the limit');
});

test('rate limiter: sweep drops only expired buckets', () => {
  let clock = 0;
  const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, now: () => clock });
  limiter.take('stale');
  clock += 61_000;
  limiter.take('fresh');
  assert.equal(limiter.size, 2);
  assert.equal(limiter.sweep(), 1, 'the expired bucket must be removed');
  limiter.reset();
  assert.equal(limiter.size, 0);
});
