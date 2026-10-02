import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { purgeOtpChallenges } from '../src/retention.js';

/**
 * Retention lane. These run against a disposable PostgreSQL whenever AUDIT_DATABASE_URL is set,
 * and are skipped otherwise, exactly like the integration lane:
 *   AUDIT_DATABASE_URL=postgres://oosta@127.0.0.1:55432/postgres npm test
 */
const DATABASE_URL = process.env.AUDIT_DATABASE_URL;
const DBNAME = 'oosta_retention_test';
const skip = { skip: !DATABASE_URL && 'set AUDIT_DATABASE_URL to a disposable database to run the retention lane' };

const ENV = {
  JWT_SECRET: 'retention-only-jwt-secret-with-sufficient-entropy',
  OTP_PEPPER: 'retention-only-otp-pepper-with-sufficient-entropy',
  KAVENEGAR_API_KEY: 'retention-key',
  KAVENEGAR_TEMPLATE: 'OOSTA_TEST',
  OTP_DEV_LOG_CODE: 'false'
};

async function prepareDatabase() {
  const admin = new pg.Client({ connectionString: DATABASE_URL });
  await admin.connect();
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [DBNAME]
  );
  await admin.query(`DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DBNAME}`);
  await admin.end();
  const url = new URL(DATABASE_URL);
  url.pathname = `/${DBNAME}`;
  return url.toString();
}

async function migrated(t) {
  const url = await prepareDatabase();
  const cwd = new URL('..', import.meta.url);
  const migrate = spawn(process.execPath, ['src/migrate.js'], {
    cwd, env: { ...process.env, ...ENV, DATABASE_URL: url }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '';
  migrate.stdout.on('data', (d) => { out += d; });
  migrate.stderr.on('data', (d) => { out += d; });
  assert.equal(await new Promise((r) => migrate.once('exit', r)), 0, `migrate failed: ${out}`);
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  t.after(async () => { await pool.end(); });
  return pool;
}

function insert(client, { phone, status, ageDays, now }) {
  return client.query(
    `INSERT INTO otp_challenges (id, phone_e164, code_hash, status, created_at, expires_at, sent_at)
     VALUES (gen_random_uuid(), $1, $2, $3,
             $4::timestamptz - ($5 * INTERVAL '1 day'),
             $4::timestamptz - ($5 * INTERVAL '1 day') + INTERVAL '5 minutes',
             CASE WHEN $3 = 'pending' THEN $4::timestamptz - ($5 * INTERVAL '1 day') ELSE NULL END)`,
    [phone, 'c'.repeat(64), status, now, ageDays]
  );
}

test('retention removes settled challenges past the window and keeps live ones', skip, async (t) => {
  const pool = await migrated(t);
  const now = new Date();

  await insert(pool, { phone: '+989300000001', status: 'verified', ageDays: 30, now });
  await insert(pool, { phone: '+989300000002', status: 'expired', ageDays: 30, now });
  await insert(pool, { phone: '+989300000003', status: 'locked', ageDays: 30, now });
  await insert(pool, { phone: '+989300000004', status: 'failed', ageDays: 30, now });
  // Still in flight, and old: must survive, because a live login may be verifying against it.
  await insert(pool, { phone: '+989300000005', status: 'pending', ageDays: 30, now });
  await insert(pool, { phone: '+989300000006', status: 'sending', ageDays: 30, now });
  // Recent and settled: inside the window, must survive.
  await insert(pool, { phone: '+989300000007', status: 'verified', ageDays: 1, now });

  const result = await purgeOtpChallenges(pool, { olderThanDays: 7, now });
  assert.equal(result.deleted, 4, 'the four settled rows past the window must be removed');
  assert.equal(result.olderThanDays, 7);

  const { rows } = await pool.query(`SELECT phone_e164, status FROM otp_challenges ORDER BY phone_e164`);
  assert.deepEqual(
    rows.map((r) => r.status),
    ['pending', 'sending', 'verified'],
    'only the in-flight rows and the recent one may remain'
  );
  assert.deepEqual(
    rows.map((r) => r.phone_e164),
    ['+989300000005', '+989300000006', '+989300000007']
  );

  // Idempotent: a second sweep over the same window removes nothing.
  const again = await purgeOtpChallenges(pool, { olderThanDays: 7, now });
  assert.equal(again.deleted, 0, 'a second sweep must be a no-op');
});

test('retention refuses a non-positive window instead of deleting everything', skip, async (t) => {
  const pool = await migrated(t);
  await insert(pool, { phone: '+989300000008', status: 'verified', ageDays: 1, now: new Date() });
  await assert.rejects(() => purgeOtpChallenges(pool, { olderThanDays: 0 }), /positive integer/);
  await assert.rejects(() => purgeOtpChallenges(pool, { olderThanDays: 1.5 }), /positive integer/);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM otp_challenges');
  assert.equal(rows[0].n, 1, 'a rejected window must not delete anything');
});
