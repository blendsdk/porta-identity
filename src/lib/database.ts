import { Pool } from 'pg';
import { config } from '../config/index.js';
import { logger } from './logger.js';

let pool: Pool | null = null;

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
  return pool;
}

export async function disconnectDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database disconnected');
  }
}
