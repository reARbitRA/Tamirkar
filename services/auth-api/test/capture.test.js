import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, rmSync } from 'node:fs';
import net from 'node:net';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

/**
 * The Zarinpal capture path, executed.
 *
 * Until this file existed, the 85/15 split, the escrow hold and the `payment_capture` ledger event
 * had never actually run: `sandbox.zarinpal.com` is unreachable from the audit sandbox, so every
 * claim about them was read off the source. This lane preloads `test/zarinpal-stub.mjs` into the
 * server process with `node --import`, which intercepts only the two Zarinpal endpoints. Everything
 * else - PostgreSQL, the routes, the double-entry ledger, the state machine - is real.
 *
 * Skipped unless AUDIT_DATABASE_URL points at a disposable database, same as integration.test.js.
 */
const DATABASE_URL = process.env.AUDIT_DATABASE_URL;
const DBNAME = 'oosta_capture_test';
const skip = { skip: !DATABASE_URL && 'set AUDIT_DATABASE_URL to a disposable database to run the capture lane' };

const JWT_SECRET = 'capture-only-jwt-secret-with-sufficient-entropy';
const ENV = {
  HOST: '127.0.0.1',
  JWT_SECRET,
  OTP_PEPPER: 'capture-only-otp-pepper-with-sufficient-entropy',
  KAVENEGAR_API_KEY: 'capture-key',
  KAVENEGAR_TEMPLATE: 'OOSTA_TEST',
  ALLOWED_ORIGINS: 'https://app.oosta.test',
  OTP_DEV_LOG_CODE: 'true',
  FEATURE_NEW_BOOKINGS: 'true',
  FEATURE_TECHNICIAN_MATCHING: 'true',
  FEATURE_ESCROW_RELEASE: 'true',
  FEATURE_PAYMENTS: 'true',
  FEATURE_AI_DIAGNOSIS: 'false',
  ZARINPAL_MERCHANT_ID: 'stub-merchant-id',
  ZARINPAL_SANDBOX: 'true',
  PAYMENT_CALLBACK_BASE_URL: 'https://api.oosta.test'
};

const STUB = new URL('./zarinpal-stub.mjs', import.meta.url).pathname;
const STUB_AUTHORITY = 'STUBAUTHORITY0000000001';
const STUB_REF_ID = 'STUB-REF-1';
const STUB_LOG = new URL('../.zarinpal-stub-log.json', import.meta.url).pathname;

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer(); s.unref();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

async function prepareDatabase() {
  const pg = (await import('pg')).default;
  const admin = new pg.Client({ connectionString: DATABASE_URL });
  await admin.connect();
  await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [DBNAME]);
  await admin.query(`DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DBNAME}`);
  await admin.end();
  const url = new URL(DATABASE_URL);
  url.pathname = `/${DBNAME}`;
  return { url: url.toString(), pg };
}

async function run(child, env) {
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  return { code: await new Promise((r) => child.once('exit', r)), out };
}

/** Boots the real server with the Zarinpal stub preloaded, against a fresh database. */
async function boot(t, extraEnv = {}) {
  const { url, pg } = await prepareDatabase();
  const cwd = new URL('..', import.meta.url);
  const env = {
    ...process.env, ...ENV, ...extraEnv, DATABASE_URL: url,
    NODE_OPTIONS: `--import ${STUB}`,
    ZARINPAL_STUB_AUTHORITY: STUB_AUTHORITY,
    ZARINPAL_STUB_REF_ID: STUB_REF_ID,
    ZARINPAL_STUB_LOG: STUB_LOG
  };
  if (existsSync(STUB_LOG)) rmSync(STUB_LOG);

  const migrate = spawn(process.execPath, ['src/migrate.js'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const mig = await run(migrate, env);
  assert.equal(mig.code, 0, `migrate failed: ${mig.out}`);

  const pool = new pg.Pool({ connectionString: url, max: 5 });
  const port = await freePort();
  const child = spawn(process.execPath, ['src/server.js'], { cwd, env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  await Promise.race([
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`API did not start: ${out.slice(-1500)}`)), 20000);
      const check = () => { if (out.includes('Server listening')) { clearTimeout(timer); resolve(); } };
      child.stdout.on('data', check); child.stderr.on('data', check);
      child.once('exit', (c) => { clearTimeout(timer); reject(new Error(`API exited (${c}): ${out.slice(-1500)}`)); });
    }),
    once(child, 'error').then(([e]) => Promise.reject(e))
  ]);
  t.after(async () => { child.kill('SIGTERM'); await pool.end(); });

  const base = `http://127.0.0.1:${port}`;
  const headers = (tok) => ({ 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) });
  return {
    base, pool, out: () => out,
    GET: (path, tok) => fetch(`${base}${path}`, { headers: tok ? { authorization: `Bearer ${tok}` } : {} }),
    POST: (path, tok, body = {}, extraHeaders = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { ...headers(tok), ...extraHeaders }, body: JSON.stringify(body) }),
    token: (sub, role) => jwt.sign({ sub, role }, JWT_SECRET, { algorithm: 'HS256', expiresIn: 3600, issuer: 'oosta-auth-api', audience: 'oosta-android' })
  };
}

/** Drives login -> approved technician -> order -> accepted quote, returning the ids a payment needs. */
async function acceptedQuote(api) {
  const phone = '09121110001';
  await api.POST('/v1/auth/request-otp', null, { phone });
  const code = (api.out().match(/"code":"(\d{6})"/) || [])[1];
  assert.ok(code, 'no OTP code in server log');
  const verified = await (await api.POST('/v1/auth/verify-otp', null, { phone, code })).json();
  const custToken = verified.access_token;

  const applied = await (await api.POST('/v1/technicians/apply', custToken, {})).json();
  const techToken = applied.access_token;
  const kyc = await (await api.POST('/v1/technicians/kyc', techToken, {
    document_reference: 'oss://oosta-kyc/capture.jpg', document_hash: 'sha256:' + 'a'.repeat(64)
  })).json();

  const opId = 'aaaaaaaa-0000-4000-8000-0000000000c1';
  await api.pool.query(`INSERT INTO users (id, phone_e164, role) VALUES ($1,'+989000000011','operator')
                        ON CONFLICT (phone_e164) DO UPDATE SET role='operator', is_active=TRUE`, [opId]);
  await api.POST(`/v1/admin/kyc/${kyc.id}/decision`, api.token(opId, 'operator'), { status: 'approved', reason: 'capture lane approval' });

  const order = await (await api.POST('/v1/orders', custToken, { category: 'یخچال', problem_description: 'سرمایش ندارد' })).json();
  const quote = await (await api.POST(`/v1/orders/${order.id}/quotes`, techToken, {
    labor_tomans: 500000, parts_tomans: 300000, warranty_days: 90,
    line_items: [{ name: 'ترموستات', tier: 'grade_a', price_tomans: 300000 }]
  })).json();
  const accepted = await api.POST(`/v1/quotes/${quote.id}/accept`, custToken, {});
  const acceptedBody = await accepted.text();
  assert.equal(accepted.status, 200, `accept failed: ${acceptedBody}`);
  return { custToken, order, quote, totalTomans: 800000 };
}

/** signCallbackState: HMAC-SHA256 over `zarinpal-callback:<intentId>` with JWT_SECRET, base64url. */
const signState = (intentId) => crypto.createHmac('sha256', JWT_SECRET).update(`zarinpal-callback:${intentId}`).digest('base64url');

test('a successful Zarinpal callback captures 85/15, holds escrow and balances the ledger', skip, async (t) => {
  const api = await boot(t);
  const { custToken, quote, totalTomans } = await acceptedQuote(api);

  // 1. start the payment through the real route; the stub answers request.json
  const start = await api.POST('/v1/payments/zarinpal/start', custToken, { quote_id: quote.id }, { 'idempotency-key': 'capture-idem-key-00001' });
  const startBody = await start.text();
  assert.equal(start.status, 201, `start failed: ${startBody}`);
  const started = JSON.parse(startBody);
  assert.equal(started.status, 'pending');
  assert.ok(started.checkout_url.includes(STUB_AUTHORITY), `checkout_url missing the authority: ${started.checkout_url}`);

  const intentRow = await api.pool.query(`SELECT * FROM payment_intents WHERE id = $1`, [started.id]);
  const intent = intentRow.rows[0];
  assert.equal(Number(intent.amount_tomans), totalTomans);
  assert.equal(Number(intent.amount_rials), totalTomans * 10, 'tomans must convert to rials only at the provider boundary');

  // 2. the gateway redirects back. Without a validly signed state this must be refused.
  const forged = await api.GET(`/v1/payments/zarinpal/callback?Authority=${STUB_AUTHORITY}&Status=OK&state=forged`);
  assert.equal(forged.status, 400, 'a forged state token must not capture a payment');

  // 3. the real callback, with a state this server actually minted
  const ok = await api.GET(`/v1/payments/zarinpal/callback?Authority=${STUB_AUTHORITY}&Status=OK&state=${signState(intent.id)}`);
  assert.equal(ok.status, 200, `callback failed: ${await ok.text()}`);

  // 4. the capture: 85% technician, 15% escrow, and nothing else
  const expectedEscrow = Math.floor(totalTomans * 0.15);
  const expectedPayable = totalTomans - expectedEscrow;
  assert.equal(expectedEscrow, 120000);
  assert.equal(expectedPayable, 680000);

  const postings = await api.pool.query(
    `SELECT p.account, p.direction, p.amount_tomans FROM ledger_postings p
     JOIN ledger_entries e ON e.id = p.entry_id
     WHERE e.event_type = 'payment_capture' ORDER BY p.account, p.direction`
  );
  const byKey = Object.fromEntries(postings.rows.map((r) => [`${r.account}:${r.direction}`, Number(r.amount_tomans)]));
  assert.deepEqual(byKey, {
    'escrow_liability:credit': expectedEscrow,
    'gateway_clearing:debit': totalTomans,
    'technician_payable:credit': expectedPayable
  }, `capture split is wrong: ${JSON.stringify(byKey)}`);

  const balance = await api.pool.query(
    `SELECT COALESCE(SUM(CASE WHEN direction='debit' THEN amount_tomans ELSE -amount_tomans END),0)::int AS net FROM ledger_postings`
  );
  assert.equal(balance.rows[0].net, 0, 'the ledger must balance after a capture');

  // 5. escrow hold created, order and quote advanced, provider reference stored
  const hold = await api.pool.query(`SELECT amount_tomans, status, release_after FROM escrow_holds WHERE payment_intent_id = $1`, [intent.id]);
  assert.equal(hold.rows.length, 1, 'exactly one escrow hold per capture');
  assert.equal(Number(hold.rows[0].amount_tomans), expectedEscrow);
  assert.equal(hold.rows[0].status, 'held');
  assert.ok(new Date(hold.rows[0].release_after) > new Date(), 'the hold must not be due immediately');

  const after = await api.pool.query(
    `SELECT i.status AS intent_status, i.provider_ref_id, o.status AS order_status, q.status AS quote_status
     FROM payment_intents i JOIN quotes q ON q.id = i.quote_id JOIN service_orders o ON o.id = q.order_id WHERE i.id = $1`, [intent.id]);
  assert.equal(after.rows[0].intent_status, 'paid');
  assert.equal(after.rows[0].provider_ref_id, STUB_REF_ID);
  assert.equal(after.rows[0].order_status, 'paid');
  assert.equal(after.rows[0].quote_status, 'paid');

  // 6. replaying the same redirect must not capture twice
  const replay = await api.GET(`/v1/payments/zarinpal/callback?Authority=${STUB_AUTHORITY}&Status=OK&state=${signState(intent.id)}`);
  assert.equal(replay.status, 200, 'a replayed redirect is still a success to the customer');
  const afterReplay = await api.pool.query(`SELECT COUNT(*)::int AS n FROM ledger_entries WHERE event_type = 'payment_capture'`);
  assert.equal(afterReplay.rows[0].n, 1, 'the capture must be idempotent');
  const holdsAfter = await api.pool.query(`SELECT COUNT(*)::int AS n FROM escrow_holds WHERE payment_intent_id = $1`, [intent.id]);
  assert.equal(holdsAfter.rows[0].n, 1, 'a replay must not create a second hold');

  // 7. the outbound contract: amount went to the gateway in rials, with our merchant id
  const calls = JSON.parse((await import('node:fs')).readFileSync(STUB_LOG, 'utf8'));
  const req = calls.find((c) => c.call === 'request');
  const ver = calls.find((c) => c.call === 'verify');
  assert.equal(req.amountRials, totalTomans * 10);
  assert.equal(req.merchantId, 'stub-merchant-id');
  assert.ok(req.callbackUrl.includes(`state=${signState(intent.id)}`), 'the callback URL must carry the signed state');
  assert.equal(ver.authority, STUB_AUTHORITY);
  assert.equal(ver.amountRials, totalTomans * 10, 'verify must present the stored amount, not whatever the callback claimed');
});

test('a failed Zarinpal verification leaves the payment uncaptured and the ledger empty', skip, async (t) => {
  // code 100/101 mean success; anything else is a rejection the handler must turn into a 502.
  const api = await boot(t, { ZARINPAL_STUB_VERIFY_CODE: '-1' });
  const { custToken, quote } = await acceptedQuote(api);

  const start = await api.POST('/v1/payments/zarinpal/start', custToken, { quote_id: quote.id }, { 'idempotency-key': 'capture-idem-key-00002' });
  const startBody = await start.text();
  assert.equal(start.status, 201, `start failed: ${startBody}`);
  const started = JSON.parse(startBody);
  const intent = (await api.pool.query(`SELECT id FROM payment_intents WHERE id = $1`, [started.id])).rows[0];

  const bad = await api.GET(`/v1/payments/zarinpal/callback?Authority=${STUB_AUTHORITY}&Status=OK&state=${signState(intent.id)}`);
  const badBody = await bad.text();
  assert.equal(bad.status, 502, `a rejected verification must surface as 502, not as a capture: ${badBody}`);

  const state = await api.pool.query(
    `SELECT i.status AS intent_status,
            (SELECT COUNT(*)::int FROM ledger_entries) AS entries,
            (SELECT COUNT(*)::int FROM escrow_holds) AS holds
     FROM payment_intents i WHERE i.id = $1`, [intent.id]);
  assert.equal(state.rows[0].intent_status, 'pending', 'the intent must not advance to paid');
  assert.equal(state.rows[0].entries, 0, 'no ledger entry may be written for an unverified payment');
  assert.equal(state.rows[0].holds, 0, 'no escrow hold may exist for an unverified payment');
});
