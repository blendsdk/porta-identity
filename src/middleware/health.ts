import type { Middleware } from 'koa';
import { getPool } from '../lib/database.js';
import { getRedis } from '../lib/redis.js';

export function healthCheck(): Middleware {
  return async (ctx) => {
    const checks: Record<string, string> = { server: 'ok' };
    let healthy = true;

    // Check PostgreSQL
    try {
      const pool = getPool();
      await pool.query('SELECT 1');
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
      healthy = false;
    }

    // Check Redis
    try {
      const redis = getRedis();
      await redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
      healthy = false;
    }

    ctx.status = healthy ? 200 : 503;
    ctx.body = {
      status: healthy ? 'healthy' : 'unhealthy',
      checks,
      timestamp: new Date().toISOString(),
    };
  };
}
