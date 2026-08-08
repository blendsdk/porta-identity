/**
 * Readiness probe handler — GET /ready.
 *
 * Separate from /health (liveness): /health confirms the server process
 * is alive; /ready confirms the server can actually serve requests by
 * checking that both PostgreSQL and Redis are reachable within a timeout.
 *
 * Kubernetes / ECS maps:
 *   - livenessProbe  → GET /health
 *   - readinessProbe → GET /ready
 *
 * Returns 200 + { status: 'ready', checks } when both backends are healthy,
 * or 503 + { status: 'not_ready', checks } when either is degraded.
 */

import type { Middleware } from 'koa';
import { getPool } from '../lib/database.js';
import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

/** Maximum time (ms) to wait for each backend check before failing. */
const TIMEOUT_MS = 2000;

/**
 * Race a promise against a timeout. Rejects with a descriptive error
 * if the promise doesn't resolve within `TIMEOUT_MS`.
 */
function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timeout after ${TIMEOUT_MS}ms`)),
        TIMEOUT_MS,
      ),
    ),
  ]);
}

/**
 * Create the readiness probe middleware.
 *
 * Both DB and Redis are checked concurrently with individual timeouts.
 * A single failure makes the overall probe return 503.
 */
export function readyHandler(): Middleware {
  return async (ctx) => {
    const checks: Record<string, { ok: boolean; error?: string }> = {};

    // Run both checks concurrently — one failure doesn't block the other
    const [dbResult, redisResult] = await Promise.allSettled([
      withTimeout(getPool().query('SELECT 1'), 'db'),
      withTimeout(getRedis().ping(), 'redis'),
    ]);

    checks.db =
      dbResult.status === 'fulfilled'
        ? { ok: true }
        : { ok: false, error: String(dbResult.reason) };

    checks.redis =
      redisResult.status === 'fulfilled'
        ? { ok: true }
        : { ok: false, error: String(redisResult.reason) };

    const ready = checks.db.ok && checks.redis.ok;

    if (!ready) {
      logger.warn({ event: 'ready.degraded', checks }, 'readiness probe failed');
    }

    ctx.status = ready ? 200 : 503;
    ctx.body = { status: ready ? 'ready' : 'not_ready', checks };
  };
}
