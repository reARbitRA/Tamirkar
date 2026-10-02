// Route smoke test — hits EVERY route registered in src/server.js against a real PostgreSQL and
// asserts that none of them returns a 5xx for a plausible (even if rejected) request.
//
// Why this exists separately from e2e.mjs: e2e.mjs walks the journeys, so a route that no journey
// needs is never called. `/v1/payments/zarinpal/callback` — the route that moves real money — was
// in exactly that gap: zero references in e2e.mjs. A 500 there is uncaught and would only surface
// in production, on the one request a paying customer cannot retry.
//
// The assertion is deliberately weak on purpose. This does NOT check that each route does the right
// thing (that is what e2e.mjs and test/ are for). It checks the narrower, cheaper property that no
// route can crash the request. A 400/401/403/404/409/422/429/502/503 is fine — those are handled
// outcomes. Only 5xx counts as a failure, because a 5xx means an exception escaped the handler.
//
// Run: node audit/harness/smoke.mjs
// Connection defaults match audit/harness/start_pg.sh; override with SMOKE_DATABASE_ADMIN_URL for a
// differently-configured server (CI uses a password-authenticated service container on 5432).
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

const API = new URL('../../services/auth-api', import.meta.url).pathname.replace(/\/$/, '');
// Admin connection used only to drop/create the throwaway database. Everything else goes through
// SMOKE_DATABASE_URL, which points at the created database.
const ADMIN_URL = process.env.SMOKE_DATABASE_ADMIN_URL ?? 'postgres://oosta@127.0.0.1:55432/postgres';
const PGHOST = process.env.SMOKE_PGHOST ?? '127.0.0.1';
const PGPORT = process.env.SMOKE_PGPORT ?? '55432';
const DBNAME = 'oosta_smoke';
const ENV_BASE = {
  HOST: '127.0.0.1',
  JWT_SECRET: 'audit-only-jwt-secret-with-sufficient-entropy-0123456789',
  OTP_PEPPER: 'audit-only-otp-pepper-with-sufficient-entropy-0123456789',
  KAVENEGAR_API_KEY: 'audit-kavenegar-key',
  KAVENEGAR_TEMPLATE: 'OOSTA_AUDIT',
  ALLOWED_ORIGINS: 'https://app.oosta.test',
  OTP_DEV_LOG_CODE: 'true',
  FEATURE_AI_DIAGNOSIS: 'false',
  FEATURE_NEW_BOOKINGS: 'true',
  FEATURE_PAYMENTS: 'true',
  FEATURE_TECHNICIAN_MATCHING: 'true',
  FEATURE_ESCROW_RELEASE: 'true',
  ZARINPAL_MERCHANT_ID: 'audit-merchant-id',
  ZARINPAL_SANDBOX: 'true',
  PAYMENT_CALLBACK_BASE_URL: 'https://api.oosta.test'
};

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer(); s.unref();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

async function resetDatabase() {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [DBNAME]);
  await admin.query(`DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DBNAME}`);
  await admin.end();
}

async function migrate(databaseUrl) {
  const child = spawn(process.execPath, ['src/migrate.js'], {
    cwd: API, env: { ...process.env, DATABASE_URL: databaseUrl, ...ENV_BASE }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
  return { code: await new Promise((r) => child.once('exit', r)), out };
}

async function startApi(port, databaseUrl) {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: API, env: { ...process.env, ...ENV_BASE, PORT: String(port), DATABASE_URL: databaseUrl }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; }); child.stderr.on('data', (d) => { output += d; });
  await Promise.race([
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`API did not start: ${output.slice(-1500)}`)), 15000);
      const check = () => { if (output.includes('Server listening')) { clearTimeout(timer); resolve(); } };
      child.stdout.on('data', check); child.stderr.on('data', check);
      child.once('exit', (c) => { clearTimeout(timer); reject(new Error(`API exited early (${c}): ${output.slice(-1500)}`)); });
    }),
    once(child, 'error').then(([e]) => Promise.reject(e))
  ]);
  return { child, output: () => output };
}

const j = async (res) => { const t = await res.text(); try { return JSON.parse(t); } catch { return t; } };

(async () => {
  await resetDatabase();
  const databaseUrl = `postgres://oosta@${PGHOST}:${PGPORT}/${DBNAME}`;
  const mig = await migrate(databaseUrl);
  if (mig.code !== 0) { console.error(`migrate failed exit=${mig.code}: ${mig.out.slice(-800)}`); process.exit(1); }

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
  const port = await freePort();
  const api = await startApi(port, databaseUrl);
  const base = `http://127.0.0.1:${port}`;

  const H = (tok) => ({ 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) });

  // ---- identities ----
  const phone = '09129990001';
  await fetch(`${base}/v1/auth/request-otp`, { method: 'POST', headers: H(), body: JSON.stringify({ phone }) });
  const code = (api.output().match(/"code":"(\d{6})"/) || [])[1];
  const verify = await j(await fetch(`${base}/v1/auth/verify-otp`, { method: 'POST', headers: H(), body: JSON.stringify({ phone, code }) }));
  const custToken = verify.access_token;
  if (!custToken) { console.error('could not obtain a customer token; aborting'); api.child.kill(); process.exit(1); }

  const apply = await j(await fetch(`${base}/v1/technicians/apply`, { method: 'POST', headers: H(custToken), body: '{}' }));
  const techToken = apply.access_token;

  const opId = 'aaaaaaaa-0000-4000-8000-0000000000ff';
  await pool.query(`INSERT INTO users (id, phone_e164, role) VALUES ($1,'+989000000099','operator')
                    ON CONFLICT (phone_e164) DO UPDATE SET role='operator', is_active=TRUE`, [opId]);
  const opToken = jwt.sign({ sub: opId, role: 'operator' }, ENV_BASE.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: 3600, issuer: 'oosta-auth-api', audience: 'oosta-android' });

  // A real device, order, quote and intent so the parameterised routes are called with a UUID that
  // resolves rather than one that 404s on a parse error. Without this the smoke test would only
  // ever exercise the validation branch of each handler.
  const dev = await j(await fetch(`${base}/v1/devices`, { method: 'POST', headers: H(custToken), body: JSON.stringify({ name: 'یخچال smoke', category: 'refrigerator', brand: 'ال‌جی' }) }));
  const order = await j(await fetch(`${base}/v1/orders`, { method: 'POST', headers: H(custToken), body: JSON.stringify({ category: 'یخچال', problem_description: 'سرمایش ندارد' }) }));

  // approve the technician so quoting is reachable
  const kyc = await j(await fetch(`${base}/v1/technicians/kyc`, { method: 'POST', headers: H(techToken), body: JSON.stringify({ document_reference: 'oss://oosta-kyc/smoke.jpg', document_hash: 'sha256:' + 'a'.repeat(64) }) }));
  await fetch(`${base}/v1/admin/kyc/${kyc.id}/decision`, { method: 'POST', headers: H(opToken), body: JSON.stringify({ status: 'approved', reason: 'smoke approval' }) });

  const quote = await j(await fetch(`${base}/v1/orders/${order.id}/quotes`, {
    method: 'POST', headers: H(techToken),
    body: JSON.stringify({ labor_tomans: 500000, parts_tomans: 300000, warranty_days: 90, line_items: [{ name: 'ترموستات', tier: 'grade_a', price_tomans: 300000 }] })
  }));
  const accepted = await j(await fetch(`${base}/v1/quotes/${quote.id}/accept`, { method: 'POST', headers: H(custToken), body: JSON.stringify({ idempotency_key: 'smoke-accept-key-0001' }) }));

  // drive a payment so an intent row exists for the callback route to match against
  const pay = await fetch(`${base}/v1/payments/zarinpal/start`, {
    method: 'POST', headers: { ...H(custToken), 'idempotency-key': 'smoke-pay-key-00001' }, body: JSON.stringify({ quote_id: quote.id })
  });
  const payBody = await j(pay);
  // The provider is unreachable here, so mint the authority/state the way the handler would have.
  const intent = (await pool.query(`SELECT id FROM payment_intents ORDER BY created_at DESC LIMIT 1`)).rows[0];
  const authority = 'SMOKE-AUTHORITY-0001';
  if (intent) {
    await pool.query(`UPDATE payment_intents SET authority = $2, status = 'pending' WHERE id = $1`, [intent.id, authority]);
  }
  // signCallbackState is HMAC-SHA256(jwtSecret, `zarinpal-callback:<intentId>`) base64url, so a
  // valid state can be reproduced here. Without one the callback stops at the 400 auth check and
  // the provider-verification branch - the one that moves money - is never entered.
  const signedState = intent
    ? crypto.createHmac('sha256', ENV_BASE.JWT_SECRET).update(`zarinpal-callback:${intent.id}`).digest('base64url')
    : '';

  // ---- the route table: one plausible call per registered route ----
  const routes = [
    ['GET',    '/health',                                   null,      null],
    ['GET',    '/metrics',                                  null,      null],
    ['GET',    '/v1/public/features',                       null,      null],
    ['POST',   '/v1/auth/request-otp',                      null,      { phone: '09129990002' }],
    ['POST',   '/v1/auth/verify-otp',                       null,      { phone: '09129990002', code: '000000' }],
    ['GET',    '/v1/me',                                    custToken, null],
    ['POST',   '/v1/ai/diagnoses',                          custToken, { category: 'یخچال', symptom: 'سرمایش ندارد' }],
    ['GET',    '/v1/devices',                               custToken, null],
    ['POST',   '/v1/devices',                               custToken, { name: 'دستگاه دوم', category: 'washer', brand: 'پاکشوما' }],
    ['GET',    `/v1/devices/${dev.device.id}`,              custToken, null],
    ['GET',    '/v1/orders',                                custToken, null],
    ['POST',   '/v1/orders',                                custToken, { category: 'کولر', problem_description: 'باد گرم' }],
    ['GET',    `/v1/orders/${order.id}`,                    custToken, null],
    ['POST',   `/v1/orders/${order.id}/quotes`,             techToken, { labor_tomans: 400000, parts_tomans: 0, warranty_days: 30, line_items: [{ name: 'سرویس', tier: 'grade_a', price_tomans: 400000 }] }],
    ['POST',   `/v1/quotes/${quote.id}/accept`,             custToken, { idempotency_key: 'smoke-accept-key-0002' }],
    ['POST',   `/v1/orders/${order.id}/evidence`,           techToken, { kind: 'before', object_reference: 'oss://oosta-ev/smoke.jpg', sha256: 'a'.repeat(64) }],
    ['POST',   `/v1/orders/${order.id}/start`,              techToken, {}],
    ['POST',   `/v1/orders/${order.id}/complete`,           techToken, {}],
    ['POST',   `/v1/orders/${order.id}/dispute`,            custToken, { reason: 'کار ناقص انجام شده است' }],
    ['POST',   '/v1/technicians/apply',                     custToken, {}],
    ['POST',   '/v1/technicians/kyc',                       techToken, { document_reference: 'oss://oosta-kyc/smoke2.jpg', document_hash: 'sha256:' + 'b'.repeat(64) }],
    ['POST',   `/v1/admin/kyc/${kyc.id}/decision`,          opToken,   { status: 'approved', reason: 'smoke re-approval' }],
    ['POST',   '/v1/admin/escrows/release-due',             opToken,   {}],
    ['POST',   '/v1/admin/escrows/aaaaaaaa-0000-4000-8000-0000000000ab/refund', opToken, { reason: 'smoke refund reason', idempotency_key: 'smoke-refund-key-001' }],
    ['POST',   '/v1/payments/zarinpal/start',               custToken, { quote_id: quote.id }],
    // The route e2e.mjs never calls. Four distinct branches, because a 500 can hide behind any of
    // them: malformed authority, unmatched authority, forged state, and a real authority whose
    // provider verification fails (unreachable gateway -> 502, which is a handled outcome).
    ['GET',    '/v1/payments/zarinpal/callback?Authority=short&Status=OK', null, null],
    ['GET',    '/v1/payments/zarinpal/callback?Authority=NOSUCHAUTHORITY0001&Status=OK', null, null],
    ['GET',    `/v1/payments/zarinpal/callback?Authority=${authority}&Status=OK&state=forged`, null, null],
    ['GET',    `/v1/payments/zarinpal/callback?Authority=${authority}&Status=OK`, null, null],
    // Valid signed state -> passes authentication -> calls verifyZarinpalPayment. The gateway is
    // unreachable from this sandbox, so the correct outcome is 502, proving the branch is entered
    // and its failure is handled rather than escaping as a 500.
    ['GET',    `/v1/payments/zarinpal/callback?Authority=${authority}&Status=OK&state=${signedState}`, null, null],
    // DELETE last: it erases the account every authenticated call above depends on.
    ['DELETE', '/v1/me',                                    custToken, null]
  ];

  const rows = [];
  for (const [method, path, tok, body] of routes) {
    // Only send content-type when there IS a body. Fastify's JSON parser rejects a bodiless request
    // that declares application/json with a 400 before the handler ever runs — which would silently
    // mark a route as "exercised" when it was not. That is what DELETE /v1/me was doing here.
    const headers = tok ? { authorization: `Bearer ${tok}` } : {};
    const init = { method, headers };
    if (body) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    } else if (method === 'POST') {
      headers['content-type'] = 'application/json';
      init.body = '{}';
    }
    let res;
    try {
      res = await fetch(`${base}${path}`, init);
    } catch (error) {
      rows.push({ method, path, status: 'THROW', detail: String(error.message).slice(0, 90) });
      continue;
    }
    let detail = '';
    if (res.status >= 500) detail = JSON.stringify(await j(res)).slice(0, 160);
    rows.push({ method, path, status: res.status, detail });
  }

  // server.js returns 502 (provider failure, 3 sites) and 503 (feature_unavailable, 2 sites)
  // deliberately. Its only code(500) is the catch-all in setErrorHandler, so a 500 is the signature
  // of an exception that escaped a handler — that is the only thing this test calls a failure.
  const HANDLED_5XX = new Set([502, 503]);
  const crashed = (r) => r.status === 'THROW' || (Number(r.status) >= 500 && !HANDLED_5XX.has(Number(r.status)));
  const serverErrors = rows.filter(crashed);
  for (const r of rows) {
    const flag = crashed(r) ? 'FAIL' : 'ok  ';
    console.log(`${flag} ${r.method.padEnd(6)} ${String(r.status).padEnd(5)} ${r.path}${r.detail ? `  ${r.detail}` : ''}`);
  }

  console.log('');
  console.log(`SMOKE { "routes": ${rows.length}, "server_errors": ${serverErrors.length} }`);
  if (serverErrors.length) {
    console.log('ROUTES THAT RETURNED 5xx OR THREW:');
    for (const r of serverErrors) console.log(`  ${r.method} ${r.path} -> ${r.status} ${r.detail ?? ''}`);
  }

  api.child.kill();
  await pool.end();
  process.exit(serverErrors.length ? 1 : 0);
})().catch(async (error) => {
  console.error('SMOKE HARNESS ERROR:', error);
  process.exit(1);
});
