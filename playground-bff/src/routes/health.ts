/**
 * Health Route
 *
 * Simple health check endpoint for readiness probes.
 * Used by the startup script to know when the BFF server is ready.
 */

import type Router from '@koa/router';

/**
 * Register the health check route.
 *
 * @param router - Koa router instance
 */
export function createHealthRoutes(router: Router): void {
  router.get('/health', (ctx) => {
    ctx.body = {
      status: 'ok',
      service: 'bff-playground',
      timestamp: new Date().toISOString(),
    };
  });
}
