import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadConfig } from './config.js';

/**
 * Forward/backward migration runner.
 *
 *   node src/migrate.js            apply every unapplied migration (up)
 *   node src/migrate.js up         same
 *   node src/migrate.js down [N]   roll back the N most recent migrations (default 1)
 *   node src/migrate.js status     list applied and pending migrations
 *
 * Rollback is deliberately explicit and refuses to run unless CONFIRM_DESTRUCTIVE_ROLLBACK=yes:
 * every down script drops tables, and an operator who typos this on a production database should
 * get a refusal rather than a rolled-back escrow ledger.
 */

const config = loadConfig();
const directory = fileURLToPath(new URL('../db/', import.meta.url));
const downDirectory = path.join(directory, 'down');
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 1 });

const [command = 'up', countArg] = process.argv.slice(2);

async function ensureRegistry() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

async function upFiles() {
  return (await fs.readdir(directory)).filter((file) => /^\d+_.*\.sql$/.test(file)).sort();
}

async function appliedSet() {
  const { rows } = await pool.query('SELECT filename FROM schema_migrations ORDER BY applied_at ASC, filename ASC');
  return rows.map((row) => row.filename);
}

async function runSql(filename, sql) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    if (command === 'down') {
      await client.query('DELETE FROM schema_migrations WHERE filename = $1', [filename]);
    } else {
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    }
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

try {
  await ensureRegistry();

  if (command === 'status') {
    const applied = await appliedSet();
    const files = await upFiles();
    for (const filename of files) {
      console.log(`${applied.includes(filename) ? 'applied' : 'pending'}  ${filename}`);
    }
  } else if (command === 'down') {
    if (process.env.CONFIRM_DESTRUCTIVE_ROLLBACK !== 'yes') {
      console.error('Refusing to roll back: every down migration drops tables.');
      console.error('Re-run with CONFIRM_DESTRUCTIVE_ROLLBACK=yes after taking a restore point.');
      process.exitCode = 4;
    } else {
      const count = Math.max(1, Number.parseInt(String(countArg ?? 1), 10) || 1);
      const applied = await appliedSet();
      // Roll back newest first so foreign keys from later migrations are gone before their targets.
      const targets = [...applied].reverse().slice(0, count);
      if (targets.length === 0) console.log('Nothing to roll back.');
      for (const filename of targets) {
        const downName = `${filename.replace(/\.sql$/, '')}.down.sql`;
        const downPath = path.join(downDirectory, downName);
        try {
          const sql = await fs.readFile(downPath, 'utf8');
          await runSql(filename, sql);
          console.log(`Rolled back ${filename}`);
        } catch (error) {
          if (error.code === 'ENOENT') {
            console.error(`No down migration for ${filename} (expected ${downName})`);
            process.exitCode = 5;
            break;
          }
          throw error;
        }
      }
    }
  } else if (command === 'up') {
    const applied = new Set(await appliedSet());
    for (const filename of await upFiles()) {
      if (applied.has(filename)) continue;
      const sql = await fs.readFile(path.join(directory, filename), 'utf8');
      await runSql(filename, sql);
      console.log(`Applied migration ${filename}`);
    }
  } else {
    console.error(`Unknown command: ${command} (use up | down [N] | status)`);
    process.exitCode = 2;
  }
} finally {
  await pool.end();
}
