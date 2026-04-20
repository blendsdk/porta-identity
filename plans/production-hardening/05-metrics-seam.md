# Metrics Seam (Phase C)

> **Document**: 05-metrics-seam.md
> **Parent**: [Index](00-index.md)

## Overview

Minimal `prom-client` seam so operators can start scraping Prometheus-compatible metrics today, without committing to the full RD-11 observability story. Default off; must be explicitly enabled.

## Scope

- One `prom-client` `Registry` per process.
- `collectDefaultMetrics()` (process CPU, memory, event loop lag, GC, fd count).
- One `Counter` labelled `{ method, route, status }` incremented per HTTP response.
- `GET /metrics` returns `registry.metrics()` as `text/plain; version=0.0.4`.
- Mounted ONLY when `config.metricsEnabled === true`.

## Implementation

### `src/middleware/metrics.ts` (new)

```ts
import type { Middleware } from 'koa';
import client from 'prom-client';

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

const httpRequests = new client.Counter({
  name: 'porta_http_requests_total',
  help: 'HTTP requests by method/route/status',
  labelNames: ['method','route','status'] as const,
  registers: [registry],
});

export function metricsCounter(): Middleware {
  return async (ctx, next) => {
    await next();
    const route = ctx._matchedRoute ?? 'unknown'; // koa-router sets this
    httpRequests.inc({
      method: ctx.method,
      route: typeof route === 'string' ? route : 'unknown',
      status: String(ctx.status),
    });
  };
}

export function metricsHandler(): Middleware {
  return async (ctx) => {
    ctx.set('Content-Type', registry.contentType);
    ctx.body = await registry.metrics();
  };
}
```

### `src/server.ts`

```ts
if (config.metricsEnabled) {
  app.use(metricsCounter());
  router.get('/metrics', metricsHandler());
}
```

## Operational notes

- `/metrics` is **unauthenticated** by design (Prometheus scraping model). When enabled, operators must:
  - Bind to an internal-only interface, OR
  - Front with a reverse proxy that restricts access, OR
  - Use a separate metrics port (can be added later).
- Document this in RD-17 (CONFIG.md) so the operator understands the trade-off.
- The counter labels are all low-cardinality. No user IDs, no token IDs, no emails.

## Testing Requirements

### Integration

- `tests/integration/metrics.test.ts`:
  - With `METRICS_ENABLED=false` → GET `/metrics` returns 404
  - With `METRICS_ENABLED=true` → GET `/metrics` returns 200 + `Content-Type: text/plain`, body contains `porta_http_requests_total`
  - After firing a GET `/health`, the counter for `{method=GET,route=/health,status=200}` is incremented

### Dependencies

- Add `prom-client` to `dependencies` in `package.json` (pin current stable, e.g. `15.x`).
