# Koa Server & Middleware: Project Scaffolding

> **Document**: 04-koa-server-and-middleware.md
> **Parent**: [Index](00-index.md)

## Overview

Create the Koa application with core middleware (error handling, request logging, health check) and graceful shutdown handling.

## Server Setup (`src/server.ts`)

```typescript
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import Router from '@koa/router';
import { requestLogger } from './middleware/request-logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthCheck } from './middleware/health.js';
import { logger } from './lib/logger.js';

export function createApp(): Koa {
  const app = new Koa();

  // Middleware stack (order matters)
  app.use(errorHandler());
  app.use(requestLogger());
  app.use(bodyParser());

  // Health check route
  const router = new Router();
  router.get('/health', healthCheck());
  app.use(router.routes());
  app.use(router.allowedMethods());

  return app;
}
```

## Entry Point (`src/index.ts`)

```typescript
import { createApp } from './server.js';
import { config } from './config/index.js';
import { logger } from './lib/logger.js';
import { connectDatabase, disconnectDatabase } from './lib/database.js';
import { connectRedis, disconnectRedis } from './lib/redis.js';

async function main() {
  // Connect to infrastructure
  await connectDatabase();
  await connectRedis();

  // Create and start server
  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    logger.info({ port: config.port, host: config.host }, 'Server started');
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    server.close(async () => {
      await disconnectDatabase();
      await disconnectRedis();
      logger.info('Server shut down gracefully');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal(err, 'Failed to start server');
  process.exit(1);
});
```

## Middleware

### Error Handler (`src/middleware/error-handler.ts`)

```typescript
import type { Middleware } from 'koa';
import { logger } from '../lib/logger.js';

export function errorHandler(): Middleware {
  return async (ctx, next) => {
    try {
      await next();
    } catch (err: unknown) {
      const error = err as Error & { status?: number; expose?: boolean };
      ctx.status = error.status || 500;
      ctx.body = {
        error: error.expose ? error.message : 'Internal Server Error',
        status: ctx.status,
      };

      if (ctx.status >= 500) {
        logger.error({ err, method: ctx.method, url: ctx.url }, 'Unhandled error');
      }
    }
  };
}
```

### Request Logger (`src/middleware/request-logger.ts`)

```typescript
import type { Middleware } from 'koa';
import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';

export function requestLogger(): Middleware {
  return async (ctx, next) => {
    const requestId = randomUUID();
    ctx.state.requestId = requestId;
    ctx.set('X-Request-Id', requestId);

    const start = Date.now();
    await next();
    const duration = Date.now() - start;

    logger.info({
      requestId,
      method: ctx.method,
      url: ctx.url,
      status: ctx.status,
      duration,
    }, `${ctx.method} ${ctx.url} ${ctx.status} ${duration}ms`);
  };
}
```

### Health Check (`src/middleware/health.ts`)

```typescript
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
```

## Graceful Shutdown Flow

```
SIGTERM/SIGINT received
  → Stop accepting new connections (server.close())
  → Wait for in-flight requests (handled by server.close callback)
  → Disconnect database pool
  → Disconnect Redis client
  → Exit with code 0
  → If timeout (10s) → Force exit with code 1
```

## Testing Requirements

- Unit test: error handler catches errors and returns correct status/body
- Unit test: request logger adds X-Request-Id header
- Integration test: health check returns 200 when DB and Redis are up
- Integration test: health check returns 503 when DB or Redis is down
- Integration test: graceful shutdown completes cleanly
