import pg from 'pg';
import { loadConfig } from './config.js';

/**
 * Retention for the one table that grows without bound.
 *
 * Every login attempt writes an `otp_challenges` row, and nothing ever removed one, so the table
 * accumulated a hashed phone number and a timestamp per attempt forever — personal data retained
 * with no purpose beyond the five-minute code lifetime. Migration 004 even added a
 * `otp_challenges (created_at)` index "for retention lookups" without a job to use it.
 *
 * Scope note, recorded deliberately: `escrow_holds`, `ledger_entries`, `ledger_postings` and
 * `operational_audit_log` are NOT purged here. They are accounting and dispute records that both
 * parties may need and that the operator is expected to retain; deleting them would be a data-loss
 * defect, not hygiene. Only the login-challenge table is in scope.
 *
 * Rows still in flight (`pending`, `sending`) are never deleted regardless of age, because a live
 * login may still be verifying against them.
 */

export const IN_FLIGHT_STATUSES = ['pending', 'sending'];

/**
 * @param {{query: Function}} client a pg Client or Pool
 * @param {{olderThanDays?: number, statuses?: string[]}} [options]
 * @returns {Promise<{deleted: number, olderThanDays: number, at: string}>}
 */
export async function purgeOtpChallenges(client, { olderThanDays = 7, now = new Date() } = {}) {
  if (!Number.isInteger(olderThanDays) || olderThanDays < 1) {
    throw new Error('olderThanDays must be a positive integer');
  }
  const { rowCount } = await client.query(
    `DELETE FROM otp_challenges
      WHERE created_at < $2::timestamptz - ($1 * INTERVAL '1 day')
        AND status NOT IN ('pending', 'sending')`,
    [olderThanDays, now.toISOString()]
  );
  return { deleted: rowCount ?? 0, olderThanDays, at: now.toISOString() };
}

/** Runs the retention sweep once. Throws if the database rejects the statement. */
export async function runRetention({ pool, olderThanDays }) {
  const client = await pool.connect();
  try {
    return await purgeOtpChallenges(client, { olderThanDays });
  } finally {
    client.release();
  }
}

// `node src/retention.js run` — invoke from a scheduler, next to the escrow worker.
if (process.argv[1] && process.argv[1].endsWith('retention.js')) {
  const config = loadConfig();
  const olderThanDays = Number.parseInt(process.env.OTP_RETENTION_DAYS ?? '7', 10);
  if (!Number.isInteger(olderThanDays) || olderThanDays < 1) {
    console.error('OTP_RETENTION_DAYS must be a positive integer');
    process.exit(2);
  }
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 1 });
  try {
    const result = await runRetention({ pool, olderThanDays });
    console.log(JSON.stringify({ event: 'retention.otp_challenges', ...result }));
  } catch (error) {
    console.error(`retention failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
