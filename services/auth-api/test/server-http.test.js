import assert from 'node:assert/strict';
import { once } from 'node:events';
import net from 'node:net';
import { spawn } from 'node:child_process';
import test from 'node:test';

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function unreachableTestDatabaseUrl() {
  // Constructed so no credential-shaped connection URI lives in tracked source.
  const url = new URL('postgres://127.0.0.1:1/oosta_test');
  url.username = 'test_user';
  url.password = 'test_password';
  return url.toString();
}

async function startApi(port) {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      DATABASE_URL: unreachableTestDatabaseUrl(),
      JWT_SECRET: 'test-only-jwt-secret-with-sufficient-entropy',
      OTP_PEPPER: 'test-only-otp-pepper-with-sufficient-entropy',
      KAVENEGAR_API_KEY: 'test-kavenegar-key',
      KAVENEGAR_TEMPLATE: 'OOSTA_TEST',
      ALLOWED_ORIGINS: 'https://app.oosta.test',
      FEATURE_AI_DIAGNOSIS: 'false',
      FEATURE_NEW_BOOKINGS: 'false',
      FEATURE_PAYMENTS: 'false',
      FEATURE_TECHNICIAN_MATCHING: 'false',
      FEATURE_ESCROW_RELEASE: 'false',
      OTP_DEV_LOG_CODE: 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  await Promise.race([
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`API did not start: ${output}`)), 5_000);
      const onOutput = () => {
        if (output.includes('Server listening')) {
          clearTimeout(timer);
          resolve();
        }
      };
      child.stdout.on('data', onOutput);
      child.stderr.on('data', onOutput);
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`API exited before startup (${code}): ${output}`));
      });
    }),
    once(child, 'error').then(([error]) => Promise.reject(error))
  ]);
  return child;
}

async function stopApi(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 3_000))
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

test('public feature endpoint is reachable without a database and applies safe CORS headers', async (t) => {
  const port = await freePort();
  const child = await startApi(port);
  t.after(() => stopApi(child));
  const baseUrl = `http://127.0.0.1:${port}`;

  const response = await fetch(`${baseUrl}/v1/public/features`, {
    headers: { Origin: 'https://app.oosta.test' }
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://app.oosta.test');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(await response.json(), {
    features: {
      ai_diagnosis: false,
      new_bookings: false,
      payments: false,
      technician_matching: false,
      escrow_release: false
    }
  });

  const preflight = await fetch(`${baseUrl}/v1/public/features`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://app.oosta.test',
      'Access-Control-Request-Method': 'GET'
    }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://app.oosta.test');

  const blockedOrigin = await fetch(`${baseUrl}/v1/public/features`, {
    headers: { Origin: 'https://untrusted.example' }
  });
  assert.equal(blockedOrigin.headers.get('access-control-allow-origin'), null);

  // This is intentionally larger than the historical 3 MiB global limit. It reaches
  // the route validator (400) rather than Fastify's body-limit response (413), leaving
  // enough envelope space for two server-validated 2 MiB base64 diagnosis images.
  const largeInvalidOtpRequest = JSON.stringify({
    phone: 'not-a-phone',
    padding: 'x'.repeat(3 * 1024 * 1024)
  });
  const largeBodyResponse = await fetch(`${baseUrl}/v1/auth/request-otp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: largeInvalidOtpRequest
  });
  assert.equal(largeBodyResponse.status, 400);
});
