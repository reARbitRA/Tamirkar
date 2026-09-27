import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadConfig } from './config.js';

const config = loadConfig();
const directory = fileURLToPath(new URL('../db/', import.meta.url));
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 1 });

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const files = (await fs.readdir(directory)).filter((file) => /^\d+_.*\.sql$/.test(file)).sort();
  for (const filename of files) {
    const known = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [filename]);
    if (known.rows[0]) continue;
    const sql = await fs.readFile(path.join(directory, filename), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
      await client.query('COMMIT');
      console.log(`Applied migration ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
