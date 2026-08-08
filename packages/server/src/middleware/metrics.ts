/**
 * Prometheus metrics middleware.
 *
 * Provides two Koa middleware functions:
 *   - `metricsCounter()` — increments an HTTP request counter per response
 *   - `metricsHandler()` — serves the Prometheus text format at GET /metrics
 *
 * Uses a dedicated `prom-client` Registry so default Node.js metrics
 * (CPU, memory, event loop lag, GC, file descriptors) are collected
 * automatically alongside the HTTP counter.
 *
 * Only mounted when `config.metricsEnabled === true`. When disabled,
 * GET /metrics returns 404 (no route registered).
 *
 * Security note: the /metrics endpoint is unauthenticated by design
 * (standard Prometheus scraping model). Operators must restrict access
 * via network policy or reverse proxy.
 */

import type { Middleware } from 'koa';
import client from 'prom-client';

// ---------------------------------------------------------------------------
// Registry — one per process, isolated from any global default registry.
// ---------------------------------------------------------------------------
const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

// ---------------------------------------------------------------------------
// HTTP request counter — low-cardinality labels only (no user IDs, no PII).
// `route` uses the matched koa-router pattern (e.g. "/api/admin/organizations/:id")
// so label cardinality stays bounded regardless of path parameter values.
// ---------------------------------------------------------------------------
const httpRequests = new client.Counter({
  name: 'porta_http_requests_total',
  help: 'Total HTTP requests by method, route pattern, and status code',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

/**
 * Middleware that increments the `porta_http_requests_total` counter
 * after every response. Should be mounted early in the middleware stack
 * so it captures all downstream responses.
 *
 * @returns Koa middleware
 */
export function metricsCounter(): Middleware {
  return async (ctx, next) => {
    await next();
    // koa-router sets ctx._matchedRoute to the pattern string (e.g. "/health").
    // Fall back to "unknown" for routes not matched by koa-router (e.g. OIDC provider).
    const route =
      typeof ctx._matchedRoute === 'string' ? ctx._matchedRoute : 'unknown';
    httpRequests.inc({
      method: ctx.method,
      route,
      status: String(ctx.status),
    });
  };
}

/**
 * Request handler that returns all collected metrics in Prometheus text format.
 * Mount at `GET /metrics` when metrics are enabled.
 *
 * @returns Koa middleware
 */
export function metricsHandler(): Middleware {
  return async (ctx) => {
    ctx.set('Content-Type', registry.contentType);
    ctx.body = await registry.metrics();
  };
}

/**
 * Reset all metrics — used in tests to avoid counter bleed between test cases.
 * NOT for production use.
 */
export function resetMetrics(): void {
  registry.resetMetrics();
}
