// ARBITER-MVP audit harness — executes the auth-api against a REAL PostgreSQL
// so every SQL statement in src/server.js is actually run, not just read.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import pg from 'pg';
import jwt from 'jsonwebtoken';

const API = '/home/user/Tamirkar/services/auth-api';
const PGHOST = '127.0.0.1', PGPORT = 55432;
const DBNAME = 'oosta_audit';
const ENV_BASE = {
  HOST: '127.0.0.1',
  JWT_SECRET: 'audit-only-jwt-secret-with-sufficient-entropy-0123456789',
  OTP_PEPPER: 'audit-only-otp-pepper-with-sufficient-entropy-0123456789',
  KAVENEGAR_API_KEY: 'audit-kavenegar-key',
  KAVENEGAR_TEMPLATE: 'OOSTA_AUDIT',
  ALLOWED_ORIGINS: 'https://app.oosta.test',
  OTP_DEV_LOG_CODE: 'true',
  FEATURE_AI_DIAGNOSIS: process.env.AUDIT_AI ?? 'false',
  FEATURE_NEW_BOOKINGS: process.env.AUDIT_BOOKINGS ?? 'true',
  FEATURE_PAYMENTS: process.env.AUDIT_PAYMENTS ?? 'true',
  FEATURE_TECHNICIAN_MATCHING: process.env.AUDIT_MATCHING ?? 'true',
  FEATURE_ESCROW_RELEASE: process.env.AUDIT_ESCROW ?? 'true',
  // Set AUDIT_ZARINPAL_MERCHANT_ID to a real sandbox merchant id to turn J5 from PARTIAL into a
  // genuine end-to-end payment walk. Without it the placeholder id fails at the provider and the
  // harness records the degraded-but-correct 502 path instead of pretending it passed.
  ZARINPAL_MERCHANT_ID: process.env.AUDIT_ZARINPAL_MERCHANT_ID || 'audit-merchant-id',
  ZARINPAL_SANDBOX: process.env.AUDIT_ZARINPAL_SANDBOX ?? 'true',
  PAYMENT_CALLBACK_BASE_URL: process.env.AUDIT_CALLBACK_BASE_URL || 'https://api.oosta.test'
};

const results = [];
function rec(id, journey, status, detail) {
  results.push({ id, journey, status, detail });
  console.log(`${status.padEnd(6)} ${id.padEnd(8)} ${journey.padEnd(6)} ${detail}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer(); s.unref();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

async function resetDatabase() {
  const admin = new pg.Client({ host: PGHOST, port: PGPORT, user: 'oosta', database: 'postgres' });
  await admin.connect();
  await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [DBNAME]);
  await admin.query(`DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DBNAME}`);
  await admin.end();
}

async function migrate(databaseUrl) {
  const child = spawn(process.execPath, ['src/migrate.js'], { cwd: API, env: { ...process.env, DATABASE_URL: databaseUrl, ...ENV_BASE }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
  const code = await new Promise((r) => child.once('exit', r));
  return { code, out };
}

async function startApi(port, databaseUrl) {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: API, env: { ...process.env, ...ENV_BASE, PORT: String(port), DATABASE_URL: databaseUrl }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; }); child.stderr.on('data', (d) => { output += d; });
  await Promise.race([
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`API did not start: ${output.slice(-2000)}`)), 15000);
      const check = () => { if (output.includes('Server listening')) { clearTimeout(timer); resolve(); } };
      child.stdout.on('data', check); child.stderr.on('data', check);
      child.once('exit', (c) => { clearTimeout(timer); reject(new Error(`API exited early (${c}): ${output.slice(-2000)}`)); });
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
  rec('MIG', 'setup', mig.code === 0 ? 'PASS' : 'FAIL', `migrate.js exit=${mig.code} :: ${mig.out.trim().replace(/\n/g, ' | ').slice(0, 200)}`);
  if (mig.code !== 0) process.exit(1);

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
  const port = await freePort();
  const api = await startApi(port, databaseUrl);
  const base = `http://127.0.0.1:${port}`;
  rec('BOOT', 'setup', 'PASS', `src/server.js booted against real postgres:${PGPORT}, listening on 127.0.0.1:${port}`);

  const H = (tok) => ({ 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) });
// NOTE: Fastify's JSON parser rejects an EMPTY body when content-type is application/json (400).
// The Android client (AuthApi.post / PlatformApi / AiProviderRouter) always sends a JSON object,
// so bodyless POSTs below send '{}' to mirror real client behaviour.
const POST = (url, tok, body = {}) => fetch(url, { method: 'POST', headers: H(tok), body: JSON.stringify(body) });

  // ---------- J0 health / features ----------
  const health = await fetch(`${base}/health`);
  rec('J0.1', 'J0', health.status === 200 ? 'PASS' : 'FAIL', `GET /health -> ${health.status} ${JSON.stringify(await j(health))}`);
  const feats = await fetch(`${base}/v1/public/features`);
  rec('J0.2', 'J0', feats.status === 200 ? 'PASS' : 'FAIL', `GET /v1/public/features -> ${feats.status} ${JSON.stringify((await j(feats)).features)}`);

  // ---------- J1 OTP login ----------
  const phone = '09121234567';
  const r1 = await fetch(`${base}/v1/auth/request-otp`, { method: 'POST', headers: H(), body: JSON.stringify({ phone }) });
  const b1 = await j(r1);
  rec('J1.1', 'J1', r1.status === 202 ? 'PASS' : 'FAIL', `POST /v1/auth/request-otp (09121234567) -> ${r1.status} ${JSON.stringify(b1)}`);
  const codeMatch = api.output().match(/OTP development mode[^}]*"code":"(\d{6})"/) || api.output().match(/"code":"(\d{6})"/);
  rec('J1.2', 'J1', codeMatch ? 'PASS' : 'FAIL', `OTP code recovered from server log (OTP_DEV_LOG_CODE=true) -> ${codeMatch ? codeMatch[1] : 'NOT FOUND'}`);
  let custToken = null, custId = null;
  if (codeMatch) {
    const r2 = await fetch(`${base}/v1/auth/verify-otp`, { method: 'POST', headers: H(), body: JSON.stringify({ phone, code: codeMatch[1] }) });
    const b2 = await j(r2);
    custToken = b2?.access_token; custId = b2?.user?.id;
    rec('J1.3', 'J1', r2.status === 200 && custToken ? 'PASS' : 'FAIL', `POST /v1/auth/verify-otp -> ${r2.status} role=${b2?.user?.role} token_len=${custToken ? custToken.length : 0}`);
  }
  const r3 = await fetch(`${base}/v1/me`, { headers: H(custToken) });
  rec('J1.4', 'J1', r3.status === 200 ? 'PASS' : 'FAIL', `GET /v1/me -> ${r3.status} ${JSON.stringify(await j(r3))}`);
  const r4 = await fetch(`${base}/v1/me`, { headers: H('garbage.token.here') });
  rec('J1.5', 'J1', r4.status === 401 ? 'PASS' : 'FAIL', `GET /v1/me with bogus token -> ${r4.status} (expected 401)`);

  // ---------- J2 AI diagnosis ----------
  const r5 = await fetch(`${base}/v1/ai/diagnoses`, { method: 'POST', headers: H(custToken), body: JSON.stringify({ category: 'یخچال', symptom: 'یخچال سرمایش ندارد و صدا می‌دهد' }) });
  rec('J2.1', 'J2', r5.status === 503 ? 'PASS' : 'INFO', `POST /v1/ai/diagnoses (flag off) -> ${r5.status} ${JSON.stringify(await j(r5)).slice(0, 140)}`);
  const r5b = await fetch(`${base}/v1/ai/diagnoses`, { method: 'POST', headers: H(), body: JSON.stringify({ category: 'یخچال', symptom: 'x' }) });
  rec('J2.2', 'J2', r5b.status === 401 ? 'PASS' : 'FAIL', `POST /v1/ai/diagnoses unauthenticated -> ${r5b.status} (expected 401)`);

  // ---------- J3 device passport ----------
  // The passport now lives on the server, so this is a real create/list/read walk rather than a
  // 404 probe. J3 was BROKEN at baseline because neither /v1/devices nor /v1/orders existed.
  const r6 = await fetch(`${base}/v1/devices`, { headers: H(custToken) });
  const r6b = await fetch(`${base}/v1/orders`, { headers: H(custToken) });
  const r6c = await fetch(`${base}/v1/devices`, {
    method: 'POST', headers: H(custToken),
    body: JSON.stringify({ name: 'یخچال فریزر ساید بای ساید', category: 'refrigerator', brand: 'ال‌جی', model: 'GC-J247' })
  });
  const b6c = await j(r6c);
  const r6d = await fetch(`${base}/v1/devices`, { headers: H(custToken) });
  const b6d = await j(r6d);
  const r6e = b6c?.device ? await fetch(`${base}/v1/devices/${b6c.device.id}`, { headers: H(custToken) }) : null;
  rec('J3.1', 'J3',
    (r6.status === 200 && r6c.status === 201 && b6d?.devices?.length >= 1 && r6e?.status === 200) ? 'PASS' : 'FAIL',
    `GET /v1/devices -> ${r6.status}; POST -> ${r6c.status} id=${b6c?.device?.id ?? 'none'}; list=${b6d?.devices?.length ?? 0}; passport GET -> ${r6e?.status}; GET /v1/orders -> ${r6b.status}`);

  // ---------- J7 technician apply + KYC + admin approval ----------
  const r7 = await POST(`${base}/v1/technicians/apply`, custToken);
  const b7 = await j(r7);
  const techToken = b7?.access_token;
  rec('J7.1', 'J7', r7.status === 202 ? 'PASS' : 'FAIL', `POST /v1/technicians/apply -> ${r7.status} status=${b7?.status} new_token_role=${techToken ? jwt.decode(techToken)?.role : 'none'}`);
  const r8 = await fetch(`${base}/v1/technicians/kyc`, { method: 'POST', headers: H(techToken), body: JSON.stringify({ document_reference: 'oss://oosta-kyc/doc-0001.jpg', document_hash: 'sha256:' + 'a'.repeat(64) }) });
  const b8 = await j(r8);
  rec('J7.2', 'J7', r8.status === 201 ? 'PASS' : 'FAIL', `POST /v1/technicians/kyc -> ${r8.status} ${JSON.stringify(b8).slice(0, 120)}`);

  // operator user minted directly in the DB (no API path creates one)
  const opId = 'aaaaaaaa-0000-4000-8000-000000000001';
  await pool.query(`INSERT INTO users (id, phone_e164, role) VALUES ($1,'+989000000000','operator') ON CONFLICT (phone_e164) DO UPDATE SET role='operator', is_active=TRUE`, [opId]);
  const opToken = jwt.sign({ sub: opId, role: 'operator' }, ENV_BASE.JWT_SECRET, { algorithm: 'HS256', expiresIn: 3600, issuer: 'oosta-auth-api', audience: 'oosta-android' });
  const r9 = await fetch(`${base}/v1/admin/kyc/${b8.id}/decision`, { method: 'POST', headers: H(opToken), body: JSON.stringify({ status: 'approved', reason: 'audit harness approval' }) });
  rec('J7.3', 'J7', r9.status === 200 ? 'PASS' : 'FAIL', `POST /v1/admin/kyc/:caseId/decision -> ${r9.status} ${JSON.stringify(await j(r9))}`);

  // pre-approval quote must be refused — test with a fresh unapproved technician
  // ---------- J4 order -> quote -> accept ----------
  const r10 = await fetch(`${base}/v1/orders`, { method: 'POST', headers: H(custToken), body: JSON.stringify({ category: 'یخچال', problem_description: 'یخچال سرمایش ندارد' }) });
  const b10 = await j(r10);
  rec('J4.1', 'J4', r10.status === 201 ? 'PASS' : 'FAIL', `POST /v1/orders -> ${r10.status} ${JSON.stringify(b10)}`);
  const r11 = await fetch(`${base}/v1/orders/${b10.id}/quotes`, { method: 'POST', headers: H(techToken), body: JSON.stringify({ labor_tomans: 500000, parts_tomans: 300000, warranty_days: 90, line_items: [{ name: 'ترموستات', tier: 'grade_a', price_tomans: 300000 }] }) });
  const b11 = await j(r11);
  rec('J4.2', 'J4', r11.status === 201 ? 'PASS' : 'FAIL', `POST /v1/orders/:id/quotes (approved tech) -> ${r11.status} ${JSON.stringify(b11).slice(0, 140)}`);
  const r12 = await POST(`${base}/v1/quotes/${b11.id}/accept`, custToken);
  const b12 = await j(r12);
  rec('J4.3', 'J4', r12.status === 200 ? 'PASS' : 'FAIL', `POST /v1/quotes/:id/accept -> ${r12.status} ${JSON.stringify(b12)}`);
  const rEv0 = await POST(`${base}/v1/orders/${b10.id}/evidence`, techToken, { phase: 'before', object_reference: 'oss://oosta-ev/0001-before.jpg', object_hash: 'sha256:' + 'b'.repeat(64) });
  rec('D.1', 'J4', rEv0.status === 409 ? 'PASS' : 'FAIL', `evidence on an UNPAID order -> ${rEv0.status} (expect 409 after T-012 gating)`);

  // paid + started, then evidence is allowed and completion requires both phases
  await pool.query(`UPDATE service_orders SET status='paid' WHERE id=$1`, [b10.id]);
  const rSt = await POST(`${base}/v1/orders/${b10.id}/start`, techToken);
  const rEvB = await POST(`${base}/v1/orders/${b10.id}/evidence`, techToken, { phase: 'before', object_reference: 'oss://oosta-ev/0001-before.jpg', object_hash: 'sha256:' + 'b'.repeat(64) });
  const rEvA = await POST(`${base}/v1/orders/${b10.id}/evidence`, techToken, { phase: 'after', object_reference: 'oss://oosta-ev/0002-after.jpg', object_hash: 'sha256:' + 'c'.repeat(64) });
  rec('J4.4', 'J4', (rSt.status === 200 && rEvB.status === 201 && rEvA.status === 201) ? 'PASS' : 'FAIL',
    `start=${rSt.status} evidence before=${rEvB.status} after=${rEvA.status} (expect 200/201/201)`);

  // ---------- J3b server-backed order history (added by T-004) ----------
  const rL = await fetch(`${base}/v1/orders`, { headers: H(custToken) });
  const bL = await j(rL);
  rec('J3.2', 'J3', (rL.status === 200 && Array.isArray(bL.orders) && bL.orders.length >= 1) ? 'PASS' : 'FAIL',
    `GET /v1/orders -> ${rL.status} orders=${Array.isArray(bL.orders) ? bL.orders.length : 'n/a'}`);
  const rD = await fetch(`${base}/v1/orders/${b10.id}`, { headers: H(custToken) });
  const bD = await j(rD);
  rec('J3.3', 'J3', (rD.status === 200 && bD.order?.quotes?.length >= 1) ? 'PASS' : 'FAIL',
    `GET /v1/orders/:id -> ${rD.status} status=${bD.order?.status} quotes=${bD.order?.quotes?.length ?? 0} evidence=${bD.order?.evidence?.length ?? 0}`);
  const otherId = 'bbbbbbbb-0000-4000-8000-000000000002';
  await pool.query(`INSERT INTO users (id, phone_e164, role) VALUES ($1,'+989000000002','customer') ON CONFLICT DO NOTHING`, [otherId]);
  const otherToken = jwt.sign({ sub: otherId, role: 'customer' }, ENV_BASE.JWT_SECRET, { algorithm: 'HS256', expiresIn: 3600, issuer: 'oosta-auth-api', audience: 'oosta-android' });
  const rX = await fetch(`${base}/v1/orders/${b10.id}`, { headers: H(otherToken) });
  rec('J3.4', 'J3', rX.status === 404 ? 'PASS' : 'FAIL', `IDOR probe: unrelated customer GET /v1/orders/:id -> ${rX.status} (expect 404)`);

  // ---------- J5 payment start (Zarinpal is unreachable from this sandbox) ----------
  // restore the pre-payment state that the lifecycle walk above moved past
  await pool.query(`UPDATE service_orders SET status='awaiting_payment' WHERE id=$1`, [b10.id]);
  await pool.query(`UPDATE quotes SET status='accepted' WHERE id=$1`, [b11.id]);
  const r13 = await fetch(`${base}/v1/payments/zarinpal/start`, { method: 'POST', headers: { ...H(custToken), 'idempotency-key': 'audit-idem-key-0001' }, body: JSON.stringify({ quote_id: b11.id }) });
  const b13 = await j(r13);
  // A 200 with a payment_url is a real Zarinpal authority: J5 is then genuinely verified end to
  // end. A 502 means the provider was unreachable (placeholder merchant id or no egress), which is
  // recorded as PARTIAL rather than PASS — the intent row below still proves our side is correct.
  // The route returns 201 + checkout_url when Zarinpal issued a real authority (server.js:
  // `reply.code(201).send({ id, status: 'pending', checkout_url: payment.paymentUrl })`), and
  // 200 + checkout_url when it replays an existing pending intent. Anything else means the
  // provider was unreachable, which is recorded as PARTIAL rather than faked as PASS.
  const paymentCreated = (r13.status === 201 || r13.status === 200) && typeof b13?.checkout_url === 'string';
  rec('J5.1', 'J5', paymentCreated ? 'PASS' : 'PARTIAL',
    `POST /v1/payments/zarinpal/start -> ${r13.status} ${paymentCreated ? `authority_issued checkout_url=${b13.checkout_url}` : JSON.stringify(b13).slice(0, 160)}`);
  const intentRow = await pool.query(`SELECT id, status, amount_tomans, amount_rials, quote_id FROM payment_intents`);
  rec('J5.2', 'J5', intentRow.rows.length ? 'PASS' : 'FAIL', `payment_intents rows=${intentRow.rows.length} ${JSON.stringify(intentRow.rows[0] ?? null)}`);

  // ---------- J6 escrow release + ledger, driven against the real DB ----------
  const { postLedgerEntry } = await import(`${API}/src/ledger.js`);
  const fakeIntent = intentRow.rows[0]?.id ?? '00000000-0000-4000-8000-000000000000';
  if (intentRow.rows[0]) {
    await pool.query(`UPDATE payment_intents SET status='paid', paid_at=NOW() WHERE id=$1`, [fakeIntent]);
    await pool.query(`INSERT INTO escrow_holds (id, payment_intent_id, customer_id, technician_id, amount_tomans, release_after, status)
                      VALUES (gen_random_uuid(), $1, $2, $3, 120000, NOW() - INTERVAL '1 day', 'held')`, [fakeIntent, custId, opId]);
  }
  const r14 = await POST(`${base}/v1/admin/escrows/release-due`, opToken);
  const b14 = await j(r14);
  rec('J6.1', 'J6', (r14.status === 200 && b14.released === 0) ? 'PASS' : 'FAIL',
    `release-due on a due hold whose order is NOT completed -> ${r14.status} ${JSON.stringify(b14)} (expect released=0 after the T-001 gate)`);
  const r14b = await POST(`${base}/v1/admin/escrows/release-due`, opToken);
  const b14b = await j(r14b);
  rec('J6.2', 'J6', (b14b.released === 0) ? 'PASS' : 'FAIL', `second release-due run -> ${r14b.status} ${JSON.stringify(b14b)} (expect released=0)`);
  const led = await pool.query(`SELECT e.event_type, p.account, p.direction, p.amount_tomans FROM ledger_entries e JOIN ledger_postings p ON p.entry_id=e.id ORDER BY e.created_at, p.account`);
  rec('J6.3', 'J6', led.rows.length === 0 ? 'PASS' : 'FAIL',
    `ledger rows at this point=${led.rows.length} (expect 0: nothing may post until an order completes)`);
  const bal = await pool.query(`SELECT COALESCE(SUM(CASE WHEN direction='debit' THEN amount_tomans ELSE -amount_tomans END),0) AS net FROM ledger_postings`);
  rec('J6.4', 'J6', Number(bal.rows[0].net) === 0 ? 'PASS' : 'FAIL', `ledger balance net=${bal.rows[0].net} (expect 0)`);

  // direct ledger idempotency against real postgres
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const a = await postLedgerEntry(client, { idempotencyKey: 'payment-capture:audit-direct', eventType: 'payment_capture', postings: [{ account: 'gateway_clearing', direction: 'debit', amountTomans: 1000 }, { account: 'technician_payable', direction: 'credit', amountTomans: 850 }, { account: 'escrow_liability', direction: 'credit', amountTomans: 150 }] });
    const b = await postLedgerEntry(client, { idempotencyKey: 'payment-capture:audit-direct', eventType: 'payment_capture', postings: [{ account: 'gateway_clearing', direction: 'debit', amountTomans: 1000 }, { account: 'technician_payable', direction: 'credit', amountTomans: 850 }, { account: 'escrow_liability', direction: 'credit', amountTomans: 150 }] });
    await client.query('COMMIT');
    rec('J6.5', 'J6', (a.duplicate === false && b.duplicate === true) ? 'PASS' : 'FAIL', `postLedgerEntry real-DB idempotency first=${a.duplicate} second=${b.duplicate}`);
  } catch (e) {
    await client.query('ROLLBACK'); rec('J6.5', 'J6', 'FAIL', `postLedgerEntry threw: ${e.message}`);
  } finally { client.release(); }

  // ---------- security probes ----------
  const s1 = await fetch(`${base}/v1/orders`, { method: 'POST', headers: H(techToken), body: JSON.stringify({ category: 'یخچال', problem_description: 'تست' }) });
  rec('S.1', 'SEC', s1.status === 403 ? 'PASS' : 'FAIL', `technician creating a customer order -> ${s1.status} (expect 403 after T-009)`);
  const s2 = await POST(`${base}/v1/admin/escrows/release-due`, custToken);
  rec('S.2', 'SEC', s2.status === 403 ? 'PASS' : 'FAIL', `customer hitting admin escrow release -> ${s2.status} (expect 403)`);
  await pool.query(`UPDATE users SET is_active=FALSE WHERE id=$1`, [custId]);
  const s3 = await fetch(`${base}/v1/orders`, { method: 'POST', headers: H(custToken), body: JSON.stringify({ category: 'یخچال', problem_description: 'غیرفعال تست' }) });
  rec('S.3', 'SEC', s3.status === 401 ? 'PASS' : 'FAIL', `deactivated user holding a valid JWT -> POST /v1/orders returned ${s3.status} (expect 401 after T-003)`);
  await pool.query(`UPDATE users SET is_active=TRUE WHERE id=$1`, [custId]);
  const s4 = await fetch(`${base}/v1/orders/${b10.id}/quotes`, { method: 'POST', headers: H(opToken), body: JSON.stringify({ labor_tomans: 1, parts_tomans: 0, warranty_days: 0, line_items: [{}] }) });
  rec('S.4', 'SEC', 'INFO', `operator role posting a quote -> ${s4.status}`);

  // ---------- L: lifecycle, dispute and refund (added by T-001) ----------
  const fakeIntentId = intentRow.rows[0]?.id;
  const holdRow = await pool.query(`SELECT id, amount_tomans FROM escrow_holds LIMIT 1`);
  // reset to a clean post-payment state so the lifecycle can be walked
  await pool.query(`UPDATE service_orders SET status='paid' WHERE id=$1`, [b10.id]);
  if (holdRow.rows[0]) await pool.query(`UPDATE escrow_holds SET status='held', release_after=NOW() - INTERVAL '1 day', released_at=NULL WHERE id=$1`, [holdRow.rows[0].id]);
  const rS = await POST(`${base}/v1/orders/${b10.id}/start`, techToken);
  rec('L1.1', 'J4', rS.status === 200 ? 'PASS' : 'FAIL', `POST /v1/orders/:id/start (paid -> in_progress) -> ${rS.status} ${JSON.stringify(await j(rS))}`);
  const rC0 = await POST(`${base}/v1/orders/${b10.id}/complete`, techToken);
  const bC0 = await j(rC0);
  rec('L1.2', 'J4', rC0.status === 200 ? 'PASS' : 'FAIL', `POST /v1/orders/:id/complete with before+after evidence -> ${rC0.status} ${JSON.stringify(bC0)}`);
  // release must now succeed because the order is completed
  const rR1 = await POST(`${base}/v1/admin/escrows/release-due`, opToken);
  const bR1 = await j(rR1);
  rec('L1.3', 'J6', bR1.released === 1 ? 'PASS' : 'FAIL', `release-due on a COMPLETED order -> ${rR1.status} ${JSON.stringify(bR1)} (expect released=1)`);
  const rR1b = await POST(`${base}/v1/admin/escrows/release-due`, opToken);
  const bR1b = await j(rR1b);
  rec('L1.4', 'J6', bR1b.released === 0 ? 'PASS' : 'FAIL', `immediate re-run of release-due -> ${rR1b.status} ${JSON.stringify(bR1b)} (idempotency: expect released=0)`);

  // fresh order+payment to exercise the dispute path
  const rO2 = await POST(`${base}/v1/orders`, custToken, { category: 'لباسشویی', problem_description: 'دیگ گرم نمی‌شود' });
  const bO2 = await j(rO2);
  const rQ2 = await POST(`${base}/v1/orders/${bO2.id}/quotes`, techToken, { labor_tomans: 400000, parts_tomans: 200000, warranty_days: 30, line_items: [{ name: 'المنت', tier: 'original', price_tomans: 200000 }] });
  const bQ2 = await j(rQ2);
  await POST(`${base}/v1/quotes/${bQ2.id}/accept`, custToken);
  const intent2 = 'cccccccc-0000-4000-8000-000000000003';
  await pool.query(`INSERT INTO payment_intents (id, customer_id, technician_id, provider, amount_tomans, amount_rials, description, idempotency_key, status, quote_id, paid_at)
                    VALUES ($1,$2,$3,'zarinpal',600000,6000000,'audit',  'audit-idem-0002','paid',$4,NOW())`, [intent2, custId, opId, bQ2.id]);
  await pool.query(`UPDATE quotes SET status='paid' WHERE id=$1`, [bQ2.id]);
  await pool.query(`UPDATE service_orders SET status='paid' WHERE id=$1`, [bO2.id]);
  await pool.query(`INSERT INTO escrow_holds (id, payment_intent_id, customer_id, technician_id, amount_tomans, release_after, status)
                    VALUES (gen_random_uuid(),$1,$2,$3,90000,NOW() - INTERVAL '1 day','held')`, [intent2, custId, opId]);
  const rR2 = await POST(`${base}/v1/admin/escrows/release-due`, opToken);
  const bR2 = await j(rR2);
  rec('L2.1', 'J6', bR2.released === 0 ? 'PASS' : 'FAIL', `release-due on a PAID-but-not-completed order -> ${rR2.status} ${JSON.stringify(bR2)} (expect released=0)`);
  const rDs = await POST(`${base}/v1/orders/${bO2.id}/dispute`, custToken, { reason: 'دستگاه پس از تعمیر همچنان کار نمی‌کند' });
  const bDs = await j(rDs);
  rec('L2.2', 'J5', rDs.status === 200 && bDs.holds_frozen === 1 ? 'PASS' : 'FAIL', `POST /v1/orders/:id/dispute -> ${rDs.status} ${JSON.stringify(bDs)}`);
  const hs = await pool.query(`SELECT h.status FROM escrow_holds h JOIN payment_intents p ON p.id=h.payment_intent_id WHERE p.id=$1`, [intent2]);
  rec('L2.3', 'J5', hs.rows[0]?.status === 'frozen' ? 'PASS' : 'FAIL', `escrow_holds.status after dispute -> ${hs.rows[0]?.status} (expect frozen)`);
  const df = await pool.query(`SELECT p.account, p.direction, p.amount_tomans FROM ledger_entries e JOIN ledger_postings p ON p.entry_id=e.id WHERE e.event_type='dispute_freeze' ORDER BY p.account`);
  rec('L2.4', 'J5', df.rows.length === 2 ? 'PASS' : 'FAIL', `dispute_freeze ledger postings=${df.rows.length} ${JSON.stringify(df.rows)}`);
  const rR3 = await POST(`${base}/v1/admin/escrows/release-due`, opToken);
  const bR3 = await j(rR3);
  rec('L2.5', 'J6', bR3.released === 0 ? 'PASS' : 'FAIL', `release-due on a FROZEN hold -> ${rR3.status} ${JSON.stringify(bR3)} (expect released=0)`);
  const hold2 = await pool.query(`SELECT id FROM escrow_holds WHERE payment_intent_id=$1`, [intent2]);
  const rRf = await POST(`${base}/v1/admin/escrows/${hold2.rows[0].id}/refund`, opToken, { reason: 'بازپرداخت کامل به مشتری پس از بررسی اختلاف' });
  rec('L3.1', 'J5', rRf.status === 200 ? 'PASS' : 'FAIL', `POST /v1/admin/escrows/:holdId/refund -> ${rRf.status} ${JSON.stringify(await j(rRf))}`);
  const rRf2 = await POST(`${base}/v1/admin/escrows/${hold2.rows[0].id}/refund`, opToken, { reason: 'تکرار بازپرداخت برای تست idempotency' });
  rec('L3.2', 'J5', rRf2.status === 409 ? 'PASS' : 'FAIL', `second refund on the same hold -> ${rRf2.status} (expect 409)`);
  const bal2 = await pool.query(`SELECT COALESCE(SUM(CASE WHEN direction='debit' THEN amount_tomans ELSE -amount_tomans END),0) AS net FROM ledger_postings`);
  rec('L3.3', 'J6', Number(bal2.rows[0].net) === 0 ? 'PASS' : 'FAIL', `ledger still balanced after freeze+refund net=${bal2.rows[0].net} (expect 0)`);

  // ---------- R / O / S probes for the new hardening ----------
  const rBad = await POST(`${base}/v1/admin/kyc/not-a-uuid/decision`, opToken, { status: 'approved', reason: 'probe' });
  rec('R.1', 'RELY', rBad.status === 400 ? 'PASS' : 'FAIL', `malformed UUID path param -> ${rBad.status} (expect 400, was 500)`);
  const rM = await fetch(`${base}/metrics`);
  const mText = await rM.text();
  rec('O.1', 'OBS', (rM.status === 200 && mText.includes('oosta_http_requests_total') && mText.includes('oosta_escrow_holds_due')) ? 'PASS' : 'FAIL', `GET /metrics -> ${rM.status} lines=${mText.trim().split('\n').length} has_requests_total=${mText.includes('oosta_http_requests_total')}`);

  const counts = results.reduce((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {});
  console.log('\nSUMMARY ' + JSON.stringify(counts));
  await pool.end();
  api.child.kill('SIGTERM');
  process.exit(0);
})().catch((e) => { console.error('HARNESS_ERROR', e); process.exit(1); });
