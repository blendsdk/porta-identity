/**
 * Liveness probe handler — GET /health.
 *
 * Reports whether the server process can still reach its dependencies. Or
 * container orchestration uses this as a liveness probe, so every dependency
 * check is bounded: a hung database or cache must fail the probe quickly
 * (503) instead of holding the response open.
 *
 * Returns 200 + { status: 'healthy', checks } when both backends respond, or
 * 503 + { status: 'unhealthy', checks } when either is degraded or too slow.
 */

import type { Middleware } from 'koa';
import { getPool } from '../lib/database.js';
import { getRedis } from '../lib/redis.js';
import { withTimeout } from '../lib/with-timeout.js';

/**
 * Create the liveness probe middleware.
 *
 * Both checks run concurrently under an individual timeout, so one slow
 * dependency cannot delay the other and a hang cannot keep the probe pending.
 */
export function healthCheck(): Middleware {
  return async (ctx) => {
    const checks: Record<string, string> = { server: 'ok' };

    const [dbResult, redisResult] = await Promise.allSettled([
      withTimeout(getPool().query('SELECT 1'), 'database'),
      withTimeout(getRedis().ping(), 'redis'),
    ]);

    checks.database = dbResult.status === 'fulfilled' ? 'ok' : 'error';
    checks.redis = redisResult.status === 'fulfilled' ? 'ok' : 'error';

    const healthy = dbResult.status === 'fulfilled' && redisResult.status === 'fulfilled';

    ctx.status = healthy ? 200 : 503;
    ctx.body = {
      status: healthy ? 'healthy' : 'unhealthy',
      checks,
      timestamp: new Date().toISOString(),
    };
  };
}
