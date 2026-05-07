/**
 * Health check route for the BFF server.
 *
 * `GET /health` — Returns BFF uptime, Porta server URL, and reachability.
 * Checks Porta server reachability by calling its `/health` endpoint
 * with a 3-second timeout.
 *
 * @module routes/health
 */

import Router from '@koa/router';

/** BFF process start time for uptime calculation. */
const startTime = Date.now();

/**
 * Create the health check router.
 *
 * @param serverUrl - Porta server base URL to check reachability.
 * @returns Koa router with the `/health` endpoint.
 */
export function createHealthRoutes(serverUrl: string): Router {
  const router = new Router();

  router.get('/health', async (ctx) => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);

    // Check Porta server reachability (3s timeout)
    let portaReachable = false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${serverUrl}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      portaReachable = res.ok;
    } catch {
      portaReachable = false;
    }

    ctx.status = portaReachable ? 200 : 503;
    ctx.body = {
      status: portaReachable ? 'ok' : 'degraded',
      uptime,
      server: serverUrl,
      portaReachable,
    };
  });

  return router;
}
