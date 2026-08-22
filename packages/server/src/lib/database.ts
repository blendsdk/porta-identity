import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { config } from '../config/index.js';
import { logger } from './logger.js';

let pool: Pool | null = null;

/** Request-owned transaction state shared by repository calls in one asynchronous flow. */
interface DatabaseTransactionState {
  readonly client: PoolClient;
  readonly afterCommit: Array<() => Promise<void>>;
}

const transactionStorage = new AsyncLocalStorage<DatabaseTransactionState>();

export async function connectDatabase(): Promise<Pool> {
  pool = new Pool({ connectionString: config.databaseUrl });

  // Verify connectivity
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
  logger.info('Database connected');

  return pool;
}

export function getPool(): Pool {
  if (!pool) throw new Error('Database not connected. Call connectDatabase() first.');
  const state = transactionStorage.getStore();
  if (!state) return pool;

  return new Proxy(pool, {
    get(target, property, receiver) {
      if (property === 'query') return state.client.query.bind(state.client);
      return Reflect.get(target, property, receiver);
    },
  });
}

/** Return the client for the current request transaction, when one exists. */
export function getDatabaseTransactionClient(): PoolClient | null {
  return transactionStorage.getStore()?.client ?? null;
}

/**
 * Delay a cache or other external side effect until the current database transaction commits.
 *
 * Outside a transaction the effect runs immediately. Post-commit failures are logged without
 * revising the already-authoritative database result.
 */
export async function afterDatabaseCommit(effect: () => Promise<void>): Promise<void> {
  const state = transactionStorage.getStore();
  if (!state) {
    await effect();
    return;
  }
  state.afterCommit.push(effect);
}

/**
 * Execute a callback in one request-owned PostgreSQL transaction.
 *
 * Repository calls which obtain the pool through {@link getPool} automatically use the same
 * client. Nested callers reuse the existing transaction instead of creating unsafe savepoints.
 */
export async function runDatabaseTransaction<T>(work: () => Promise<T>): Promise<T> {
  if (transactionStorage.getStore()) return work();
  if (!pool) throw new Error('Database not connected. Call connectDatabase() first.');

  const client = await pool.connect();
  const state: DatabaseTransactionState = { client, afterCommit: [] };
  let committed = false;
  let released = false;
  try {
    await client.query('BEGIN');
    const result = await transactionStorage.run(state, work);
    await client.query('COMMIT');
    committed = true;
    for (const effect of state.afterCommit) {
      try {
        await effect();
      } catch {
        logger.warn({ event: 'post-commit-side-effect-failed' }, 'Post-commit side effect failed');
      }
    }
    return result;
  } catch (error) {
    if (!committed) {
      try {
        await client.query('ROLLBACK');
      } catch {
        client.release(new Error('Database rollback failed'));
        released = true;
        throw error;
      }
    }
    throw error;
  } finally {
    if (!released) client.release();
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database disconnected');
  }
}
