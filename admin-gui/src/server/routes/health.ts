import Router from '@koa/router';
import type { Redis } from 'ioredis';
import type { BffConfig } from '../config.js';
import type { HealthStatus } from '../../shared/types.js';

/** Timestamp when the BFF server started (for uptime calculation) */
const startTime = Date.now();

/**
 * Create health check route.
 *
 * Checks:
 * 1. Redis connectivity (session store)
 * 2. Porta API reachability (upstream server)
 *
 * Returns 200 if all checks pass, 503 if any fail.
 * No authentication required — used by load balancers and monitoring.
 *
 * @param config - BFF configuration (Porta URL)
 * @param redis - Redis client instance
 * @returns Koa router for health route
 */
export function createHealthRouter(config: BffConfig, redis: Redis): Router {
  const router = new Router();

  router.get('/health', async (ctx) => {
    const checks = {
      redis: 'error' as 'ok' | 'error',
      porta: 'error' as 'ok' | 'error',
    };

    // Check Redis connectivity
    try {
      await redis.ping();
      checks.redis = 'ok';
    } catch {
      // Redis check failed — leave as 'error'
    }

    // Check Porta API reachability (5s timeout to avoid blocking)
    try {
      const response = await fetch(`${config.portaUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        checks.porta = 'ok';
      }
    } catch {
      // Porta check failed — leave as 'error'
    }

    const allOk = checks.redis === 'ok' && checks.porta === 'ok';
    const anyOk = checks.redis === 'ok' || checks.porta === 'ok';

    const status: HealthStatus = {
      status: allOk ? 'ok' : anyOk ? 'degraded' : 'error',
      checks,
      uptime: Math.floor((Date.now() - startTime) / 1000),
    };

    ctx.status = allOk ? 200 : 503;
    ctx.body = status;
  });

  return router;
}
