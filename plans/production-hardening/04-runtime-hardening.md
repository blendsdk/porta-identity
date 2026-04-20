# Runtime Hardening (Phase B)

> **Document**: 04-runtime-hardening.md
> **Parent**: [Index](00-index.md)

## Overview

Four small runtime fixes:

1. `app.proxy` flipped by new `TRUST_PROXY` env.
2. New `GET /ready` readiness probe, separate from `/health` liveness.
3. Graceful shutdown awaits `server.close()` via promise wrapper.
4. Audit + confirm `error-handler.ts` never leaks stacks and OIDC cookie flags are safe on HTTPS.

## 1. `app.proxy` toggle

In `src/index.ts` / `src/server.ts`:

```ts
const app = new Koa();
app.proxy = config.trustProxy; // new, defaults to false
```

When true, Koa honours `X-Forwarded-For` / `X-Forwarded-Proto` / `X-Forwarded-Host` (already default behaviour of `koa` given `proxy = true`).

Also flip `ctx.secure` derivation → important for cookie `secure` attribute behind a TLS-terminating load balancer.

## 2. `GET /ready`

New file `src/middleware/ready.ts`:

```ts
import type { Middleware } from 'koa';
import { getPool } from '../lib/database.js';
import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

const TIMEOUT_MS = 2000;

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
    ),
  ]);
}

export function readyHandler(): Middleware {
  return async (ctx) => {
    const checks: Record<string, { ok: boolean; error?: string }> = {};
    const [dbRes, redisRes] = await Promise.allSettled([
      withTimeout(getPool().query('SELECT 1'), 'db'),
      withTimeout(getRedis().ping(), 'redis'),
    ]);
    checks.db = dbRes.status === 'fulfilled' ? { ok: true } : { ok: false, error: String(dbRes.reason) };
    checks.redis = redisRes.status === 'fulfilled' ? { ok: true } : { ok: false, error: String(redisRes.reason) };

    const ready = checks.db.ok && checks.redis.ok;
    if (!ready) logger.warn({ event: 'ready.degraded', checks }, 'readiness probe failed');
    ctx.status = ready ? 200 : 503;
    ctx.body = { status: ready ? 'ready' : 'not_ready', checks };
  };
}
```

Mount in `src/server.ts` via `router.get('/ready', readyHandler())`, mirroring how `/health` is mounted today.

`/health` is left unchanged — this plan does not touch it to avoid a backwards-compat change in the Docker health check. A follow-up plan can slim it to pure liveness.

## 3. Graceful shutdown

In `src/index.ts`:

```ts
function closeServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()));
  });
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, 'shutdown.start');
  const killSwitch = setTimeout(() => {
    logger.fatal('shutdown.timeout'); process.exit(1);
  }, 10_000);
  try {
    await closeServer();
    await disconnectRedis();
    await disconnectDatabase();
    clearTimeout(killSwitch);
    logger.info('shutdown.clean');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'shutdown.error');
    clearTimeout(killSwitch);
    process.exit(1);
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
```

## 4. Error handler + cookie audit

### `src/middleware/error-handler.ts`

Read the file, confirm:
- Production branch never includes `err.stack` in `ctx.body`.
- If it does, add a guard: `const body: any = { error: { code, message, request_id } }; if (config.nodeEnv !== 'production') body.error.stack = err.stack;`
- Add `tests/unit/middleware/error-handler.test.ts` case: thrown error → response body has no `stack` property when `NODE_ENV=production`.

### `src/oidc/configuration.ts`

Confirm cookie section sets:

```ts
cookies: {
  long:  { signed: true, httpOnly: true, sameSite: 'lax', secure },
  short: { signed: true, httpOnly: true, sameSite: 'lax', secure },
  names: { /* defaults */ },
  keys: config.cookieKeys,
},
```

where `const secure = config.issuerBaseUrl.startsWith('https://');`.
If current code sets `secure: false` or hardcodes, patch it.

## Testing Requirements

### Unit tests

- `error-handler.test.ts`: thrown error → `ctx.body.error.stack` absent in prod, present in dev.
- New `oidc-cookies.test.ts` (or extend existing): build configuration with HTTPS issuer → `cookies.long.secure === true`; with HTTP issuer → `cookies.long.secure === false`.

### Integration tests

- `tests/integration/ready.test.ts`:
  - GET `/ready` → 200 + `status:'ready'` when Docker stack up
  - Stub DB connection error → 503 + `checks.db.ok === false`
- `tests/integration/shutdown.test.ts` (optional): spawn server, fire SIGTERM, assert clean exit within 10s.

### Manual

- With `TRUST_PROXY=true` and a curl `-H "X-Forwarded-For: 9.9.9.9"`, verify audit log / request log shows `9.9.9.9` not the local IP.
