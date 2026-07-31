// Generic Postgres-compliant database client.
// Works against any Postgres-wire-compatible database (RDS, Cloud SQL,
// Supabase, Neon, CockroachDB, vanilla postgres) — configured purely via
// DATABASE_URL, no vendor-specific APIs.
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // Managed providers usually require TLS; local compose does not.
  ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  // Idle-client errors must not crash the pod.
  console.error('[db] idle client error', err.message);
});

export function query(text, params) {
  return pool.query(text, params);
}

// Run fn inside a transaction. All reward-bearing mutations go through this
// so row locks (SELECT ... FOR UPDATE) serialize concurrent requests across
// multiple pods — the DB, not pod memory, is the single source of truth.
export async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

// Readiness = "can this pod actually serve a request", which is more than
// "the database answers". A reachable but unmigrated database used to pass
// this check, so Kubernetes routed traffic to a pod that 500ed on every
// call; the schema check turns that silent failure into an unready pod.
export async function healthcheck() {
  const { rows } = await pool.query("SELECT to_regclass('public.deck_days') AS t");
  if (!rows[0].t) {
    throw new Error('schema missing — run `npm run migrate:up` (deploy-time migration job)');
  }
}

export async function closePool() {
  await pool.end();
}
