import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import jwt from 'jsonwebtoken';

/**
 * Integration lane for the money path. These tests need a real PostgreSQL because the routes
 * under test are almost entirely SQL: advisory locks, SELECT ... FOR UPDATE, FOR UPDATE SKIP
 * LOCKED and the double-entry ledger cannot be exercised against a fake client.
 *
 * They are skipped unless AUDIT_DATABASE_URL points at a disposable database. Run them with:
 *   docker run -d -p 55432:5432 -e POSTGRES_PASSWORD=pw -e POSTGRES_USER=oosta postgres:16
 *   AUDIT_DATABASE_URL=postgres://oosta:pw@127.0.0.1:55432/postgres npm test
 *
 * The database named in AUDIT_DATABASE_URL is dropped and recreated, so never point it at
 * anything that matters.
 */
const DATABASE_URL = process.env.AUDIT_DATABASE_URL;
const DBNAME = 'oosta_integration_test';

const skip = { skip: !DATABASE_URL && 'set AUDIT_DATABASE_URL to a disposable database to run the integration lane' };

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

const ENV = {
  HOST: '127.0.0.1',
  JWT_SECRET: 'integration-only-jwt-secret-with-sufficient-entropy',
  OTP_PEPPER: 'integration-only-otp-pepper-with-sufficient-entropy',
  KAVENEGAR_API_KEY: 'integration-key',
  KAVENEGAR_TEMPLATE: 'OOSTA_TEST',
  ALLOWED_ORIGINS: 'https://app.oosta.test',
  OTP_DEV_LOG_CODE: 'true',
  FEATURE_NEW_BOOKINGS: 'true',
  FEATURE_TECHNICIAN_MATCHING: 'true',
  FEATURE_ESCROW_RELEASE: 'true',
  FEATURE_PAYMENTS: 'false',
  FEATURE_AI_DIAGNOSIS: 'false'
};

test('order lifecycle, escrow completion gate, dispute freeze and refund', skip, async (t) => {
  const { url, pg } = await prepareDatabase();
  const migrate = spawn(process.execPath, ['src/migrate.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, ...ENV, DATABASE_URL: url }, stdio: ['ignore', 'pipe', 'pipe'] });
  let migOut = '';
  migrate.stdout.on('data', (d) => { migOut += d; }); migrate.stderr.on('data', (d) => { migOut += d; });
  assert.equal(await new Promise((r) => migrate.once('exit', r)), 0, `migrate failed: ${migOut}`);

  const pool = new pg.Pool({ connectionString: url, max: 5 });
  const port = await freePort();
  const child = spawn(process.execPath, ['src/server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, ...ENV, PORT: String(port), DATABASE_URL: url }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
  await Promise.race([
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`API did not start: ${out.slice(-1500)}`)), 15000);
      const check = () => { if (out.includes('Server listening')) { clearTimeout(timer); resolve(); } };
      child.stdout.on('data', check); child.stderr.on('data', check);
      child.once('exit', (c) => { clearTimeout(timer); reject(new Error(`API exited (${c}): ${out.slice(-1500)}`)); });
    }),
    once(child, 'error').then(([e]) => Promise.reject(e))
  ]);
  t.after(async () => { child.kill('SIGTERM'); await pool.end(); });

  const base = `http://127.0.0.1:${port}`;
  const H = (tok) => ({ 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) });
  const POST = (u, tok, body = {}) => fetch(u, { method: 'POST', headers: H(tok), body: JSON.stringify(body) });
  const token = (sub, role) => jwt.sign({ sub, role }, ENV.JWT_SECRET, { algorithm: 'HS256', expiresIn: 3600, issuer: 'oosta-auth-api', audience: 'oosta-android' });

  const custId = '11111111-1111-4111-8111-111111111111';
  const techId = '22222222-2222-4222-8222-222222222222';
  const opId = '33333333-3333-4333-8333-333333333333';
  await pool.query(`INSERT INTO users (id, phone_e164, role) VALUES ($1,'+989111111111','customer'),($2,'+989222222222','technician'),($3,'+989333333333','operator')`, [custId, techId, opId]);
  await pool.query(`INSERT INTO technician_profiles (user_id, verification_status) VALUES ($1,'approved') ON CONFLICT (user_id) DO UPDATE SET verification_status='approved'`, [techId]);
  const cust = token(custId, 'customer'), tech = token(techId, 'technician'), op = token(opId, 'operator');

  // order -> quote -> accept
  const order = await (await POST(`${base}/v1/orders`, cust, { category: 'یخچال', problem_description: 'یخچال سرمایش ندارد' })).json();
  assert.equal(order.status, 'submitted');
  const quote = await (await POST(`${base}/v1/orders/${order.id}/quotes`, tech, { labor_tomans: 510000, parts_tomans: 90000, warranty_days: 90, line_items: [{ name: 'ترموستات' }] })).json();
  assert.equal(quote.total_tomans, 600000);
  await POST(`${base}/v1/quotes/${quote.id}/accept`, cust);

  // a paid intent plus a due hold, standing in for the Zarinpal callback
  const intentId = '44444444-4444-4444-8444-444444444444';
  await pool.query(`INSERT INTO payment_intents (id, customer_id, technician_id, provider, amount_tomans, amount_rials, description, idempotency_key, status, quote_id, paid_at) VALUES ($1,$2,$3,'zarinpal',600000,6000000,'it','it-key-1','paid',$4,NOW())`, [intentId, custId, techId, quote.id]);
  await pool.query(`UPDATE quotes SET status='paid' WHERE id=$1`, [quote.id]);
  await pool.query(`UPDATE service_orders SET status='paid' WHERE id=$1`, [order.id]);
  await pool.query(`INSERT INTO escrow_holds (id, payment_intent_id, customer_id, technician_id, amount_tomans, release_after, status) VALUES (gen_random_uuid(),$1,$2,$3,90000,NOW() - INTERVAL '1 day','held')`, [intentId, custId, techId]);

  // THE REGRESSION THIS FILE EXISTS FOR: time alone must not pay the technician.
  const gated = await (await POST(`${base}/v1/admin/escrows/release-due`, op)).json();
  assert.equal(gated.released, 0, 'a hold on a non-completed order must not release');

  // evidence is refused before payment, accepted after
  const early = await POST(`${base}/v1/orders/${order.id}/evidence`, tech, { phase: 'before', object_reference: 'oss://oosta/x-before.jpg', object_hash: 'sha256:' + 'b'.repeat(64) });
  assert.equal(early.status, 201, 'evidence is allowed once the order is paid');

  await POST(`${base}/v1/orders/${order.id}/start`, tech);
  const incomplete = await POST(`${base}/v1/orders/${order.id}/complete`, tech);
  assert.equal(incomplete.status, 409, 'completion requires both evidence phases');
  await POST(`${base}/v1/orders/${order.id}/evidence`, tech, { phase: 'after', object_reference: 'oss://oosta/x-after.jpg', object_hash: 'sha256:' + 'c'.repeat(64) });
  const complete = await POST(`${base}/v1/orders/${order.id}/complete`, tech);
  assert.equal((await complete.json()).status, 'completed');

  const released = await (await POST(`${base}/v1/admin/escrows/release-due`, op)).json();
  assert.equal(released.released, 1, 'a completed order with a due hold must release');
  const again = await (await POST(`${base}/v1/admin/escrows/release-due`, op)).json();
  assert.equal(again.released, 0, 'release must be idempotent');

  // dispute on a fresh paid order freezes the hold and claws the payable back
  const order2 = await (await POST(`${base}/v1/orders`, cust, { category: 'لباسشویی', problem_description: 'دیگ گرم نمی‌شود' })).json();
  const quote2 = await (await POST(`${base}/v1/orders/${order2.id}/quotes`, tech, { labor_tomans: 400000, parts_tomans: 200000, warranty_days: 30, line_items: [{ name: 'المنت' }] })).json();
  await POST(`${base}/v1/quotes/${quote2.id}/accept`, cust);
  const intent2 = '55555555-5555-4555-8555-555555555555';
  await pool.query(`INSERT INTO payment_intents (id, customer_id, technician_id, provider, amount_tomans, amount_rials, description, idempotency_key, status, quote_id, paid_at) VALUES ($1,$2,$3,'zarinpal',600000,6000000,'it2','it-key-2','paid',$4,NOW())`, [intent2, custId, techId, quote2.id]);
  await pool.query(`UPDATE quotes SET status='paid' WHERE id=$1`, [quote2.id]);
  await pool.query(`UPDATE service_orders SET status='paid' WHERE id=$1`, [order2.id]);
  const hold2 = await pool.query(`INSERT INTO escrow_holds (id, payment_intent_id, customer_id, technician_id, amount_tomans, release_after, status) VALUES (gen_random_uuid(),$1,$2,$3,90000,NOW() - INTERVAL '1 day','held') RETURNING id`, [intent2, custId, techId]);

  const disputed = await (await POST(`${base}/v1/orders/${order2.id}/dispute`, cust, { reason: 'دستگاه پس از تعمیر کار نمی‌کند' })).json();
  assert.equal(disputed.status, 'disputed');
  assert.equal(disputed.holds_frozen, 1);
  const frozen = await pool.query(`SELECT status FROM escrow_holds WHERE id=$1`, [hold2.rows[0].id]);
  assert.equal(frozen.rows[0].status, 'frozen');
  const freeze = await pool.query(`SELECT p.account, p.direction, p.amount_tomans FROM ledger_entries e JOIN ledger_postings p ON p.entry_id=e.id WHERE e.event_type='dispute_freeze'`);
  assert.equal(freeze.rows.length, 2);
  assert.equal(Number(freeze.rows.find((r) => r.account === 'technician_payable').amount_tomans), 510000, 'the technician 85% must be clawed back');

  const refund = await POST(`${base}/v1/admin/escrows/${hold2.rows[0].id}/refund`, op, { reason: 'بازپرداخت کامل پس از بررسی' });
  assert.equal(refund.status, 200);
  assert.equal((await POST(`${base}/v1/admin/escrows/${hold2.rows[0].id}/refund`, op, { reason: 'تکرار بازپرداخت' })).status, 409);

  const balance = await pool.query(`SELECT COALESCE(SUM(CASE WHEN direction='debit' THEN amount_tomans ELSE -amount_tomans END),0) AS net FROM ledger_postings`);
  assert.equal(Number(balance.rows[0].net), 0, 'the ledger must balance after capture, release, freeze and refund');

  // tenancy: an unrelated customer must not read another customer's order
  const intruder = token('66666666-6666-4666-8666-666666666666', 'customer');
  await pool.query(`INSERT INTO users (id, phone_e164, role) VALUES ('66666666-6666-4666-8666-666666666666','+989666666666','customer') ON CONFLICT DO NOTHING`);
  assert.equal((await fetch(`${base}/v1/orders/${order.id}`, { headers: H(intruder) })).status, 404);
});

test('a deactivated account is rejected on every authenticated route', skip, async (t) => {
  const { url, pg } = await prepareDatabase();
  const pool = new pg.Pool({ connectionString: url, max: 3 });
  const migrate = spawn(process.execPath, ['src/migrate.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, ...ENV, DATABASE_URL: url }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((r) => migrate.once('exit', r));
  const port = await freePort();
  const child = spawn(process.execPath, ['src/server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, ...ENV, PORT: String(port), DATABASE_URL: url }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('API did not start')), 15000);
    const check = () => { if (out.includes('Server listening')) { clearTimeout(timer); resolve(); } };
    child.stdout.on('data', check); child.stderr.on('data', check);
  });
  t.after(async () => { child.kill('SIGTERM'); await pool.end(); });

  const id = '77777777-7777-4777-8777-777777777777';
  await pool.query(`INSERT INTO users (id, phone_e164, role) VALUES ($1,'+989777777777','customer')`, [id]);
  const tok = jwt.sign({ sub: id, role: 'customer' }, ENV.JWT_SECRET, { algorithm: 'HS256', expiresIn: 3600, issuer: 'oosta-auth-api', audience: 'oosta-android' });
  const base = `http://127.0.0.1:${port}`;
  const H = { 'content-type': 'application/json', authorization: `Bearer ${tok}` };

  assert.equal((await fetch(`${base}/v1/orders`, { method: 'POST', headers: H, body: JSON.stringify({ category: 'یخچال', problem_description: 'تست فعال' }) })).status, 201);
  await pool.query(`UPDATE users SET is_active=FALSE WHERE id=$1`, [id]);
  const after = await fetch(`${base}/v1/orders`, { method: 'POST', headers: H, body: JSON.stringify({ category: 'یخچال', problem_description: 'تست غیرفعال' }) });
  assert.equal(after.status, 401, 'a deactivated account must be rejected even with a valid JWT');
});
