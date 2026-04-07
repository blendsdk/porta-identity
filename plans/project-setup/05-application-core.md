# Application Core: Project Setup

> **Document**: 05-application-core.md
> **Parent**: [Index](00-index.md)

## Overview

The application core consists of four components: configuration loader (reads and validates all env vars), structured JSON logger, Koa HTTP server with graceful shutdown, and a health check endpoint. Together these form the runnable server foundation.

## Configuration Loader

### `src/config/schema.ts` — Zod Schema

Defines the Zod schema for all environment variables. Exports the inferred TypeScript type.

```typescript
import { z } from 'zod';

/**
 * Zod schema for all Porta environment variables.
 * Reads from process.env, applies defaults, validates types.
 * See OPERATIONS.md §Environment Variables Reference for full docs.
 */
export const configSchema = z.object({
  // Server
  NODE_ENV: z.enum(['production', 'development', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  ISSUER: z.string().url(),
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),

  // Database
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(20),

  // Redis
  REDIS_URL: z.string().min(1),

  // Security
  KEY_ENCRYPTION_KEY: z.string().length(64, 'Must be 32 bytes (64 hex chars)'),
  COOKIE_SECRETS: z.string().min(1).transform(v => v.split(',')),

  // SMTP
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  SMTP_FROM: z.string().min(1),

  // Token Lifetimes (seconds)
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(3600),
  ID_TOKEN_TTL: z.coerce.number().int().positive().default(3600),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(2592000),
  SESSION_TTL: z.coerce.number().int().positive().default(1209600),
  INTERACTION_TTL: z.coerce.number().int().positive().default(600),
  MAGIC_LINK_TTL: z.coerce.number().int().positive().default(900),
  INVITATION_TTL: z.coerce.number().int().positive().default(259200),
  PASSWORD_RESET_TTL: z.coerce.number().int().positive().default(3600),
  EMAIL_VERIFY_TTL: z.coerce.number().int().positive().default(86400),
  KEY_ROTATION_OVERLAP: z.coerce.number().int().positive().default(86400),

  // i18n
  DEFAULT_LOCALE: z.enum(['en', 'nl']).default('en'),

  // Features
  SELF_REGISTRATION_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  HIBP_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Signing Keys
  SIGNING_ALGORITHM: z.enum(['RS256', 'ES256']).default('RS256'),
  KEY_ROTATION_INTERVAL: z.coerce.number().int().positive().default(7776000),

  // Bootstrap
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
  BOOTSTRAP_API_KEY_NAME: z.string().optional(),
  BOOTSTRAP_ADMIN_REDIRECT_URI: z.string().url().default('http://localhost:3000/callback'),
});

/** Validated configuration type — inferred from the Zod schema */
export type Config = z.infer<typeof configSchema>;
```

### `src/config/index.ts` — Loader

```typescript
import { configSchema, type Config } from './schema.js';

/**
 * Load and validate configuration from environment variables.
 * Throws a descriptive error if required vars are missing or invalid.
 *
 * @returns Validated Config object with proper types and defaults applied
 * @throws ZodError with details of all validation failures
 */
export function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map(issue => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  return result.data;
}
```

**Key decisions:**
- `safeParse` + manual error formatting — provides all errors at once (not just the first)
- `z.coerce.number()` — env vars are always strings; coerce handles the conversion
- Boolean env vars use `z.enum(['true', 'false']).transform()` — explicit, no magic
- Bootstrap vars are optional (only needed on first run)
- `COOKIE_SECRETS` is transformed from comma-separated string to string array

## Structured JSON Logger

### `src/utils/logger.ts`

```typescript
/** Log levels from most to least verbose */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Numeric priority for log level comparison */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** Structured log entry matching OPERATIONS.md §Structured Log Schema */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: 'porta';
  [key: string]: unknown;
}

/**
 * Create a structured JSON logger.
 * Outputs one JSON object per line to stdout.
 * Matches the log schema defined in OPERATIONS.md §Structured Log Schema.
 *
 * @param minLevel - Minimum log level to output (from LOG_LEVEL env var)
 * @returns Logger with debug, info, warn, error methods
 */
export function createLogger(minLevel: LogLevel = 'info') {
  const minPriority = LOG_LEVEL_PRIORITY[minLevel];

  function log(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
    if (LOG_LEVEL_PRIORITY[level] < minPriority) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: 'porta',
      ...extra,
    };

    // Use stderr for errors, stdout for everything else
    const output = level === 'error' ? process.stderr : process.stdout;
    output.write(JSON.stringify(entry) + '\n');
  }

  return {
    debug: (msg: string, extra?: Record<string, unknown>) => log('debug', msg, extra),
    info: (msg: string, extra?: Record<string, unknown>) => log('info', msg, extra),
    warn: (msg: string, extra?: Record<string, unknown>) => log('warn', msg, extra),
    error: (msg: string, extra?: Record<string, unknown>) => log('error', msg, extra),
  };
}

/** Logger type (return type of createLogger) */
export type Logger = ReturnType<typeof createLogger>;
```

**Key decisions:**
- Custom implementation (not Pino/Winston) — minimal, no dependencies, full schema control
- Matches OPERATIONS.md structured log schema exactly
- `service: 'porta'` always included per spec
- Errors go to stderr, everything else to stdout
- Log level filtering via numeric priority comparison

## Koa Server

### `src/app/server.ts`

```typescript
import Koa from 'koa';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import type { Server } from 'node:http';
import type { Config } from '../config/index.js';
import type { Logger } from '../utils/logger.js';

/**
 * Create and configure the Koa application.
 * Sets up middleware, routes, and error handling.
 * Does NOT start listening — that's done by the caller.
 *
 * @param config - Validated configuration
 * @param logger - Structured logger instance
 * @returns Configured Koa application
 */
export function createApp(config: Config, logger: Logger): Koa {
  const app = new Koa();

  // Trust proxy if configured (for X-Forwarded-* headers behind load balancer)
  app.proxy = config.TRUST_PROXY;

  // Global error handler
  app.on('error', (err: Error) => {
    logger.error('Unhandled application error', {
      error: {
        name: err.name,
        message: err.message,
        stack: config.NODE_ENV === 'development' ? err.stack : undefined,
      },
    });
  });

  // Body parser
  app.use(bodyParser({ enableTypes: ['json'] }));

  // Health check route
  const router = new Router();
  router.get('/health', (ctx) => {
    ctx.status = 200;
    ctx.body = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '5.0.0',
      checks: {
        // Stubs — real checks added in Plan 2 when DB/Redis are wired
        database: { status: 'not_configured' },
        redis: { status: 'not_configured' },
      },
    };
  });

  app.use(router.routes());
  app.use(router.allowedMethods());

  return app;
}

/**
 * Start the HTTP server with graceful shutdown support.
 * Handles SIGTERM and SIGINT for clean process termination.
 *
 * @param app - Configured Koa application
 * @param port - Port to listen on
 * @param logger - Logger instance
 * @returns HTTP server instance
 */
export function startServer(app: Koa, port: number, logger: Logger): Server {
  const server = app.listen(port, () => {
    logger.info('Server started', { port });
  });

  // Graceful shutdown handler
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

    // Force exit after 10 seconds if graceful shutdown fails
    setTimeout(() => {
      logger.error('Forced shutdown — graceful shutdown timed out');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}
```

### `src/index.ts` — Entry Point

```typescript
import { loadConfig } from './config/index.js';
import { createLogger } from './utils/logger.js';
import { createApp, startServer } from './app/server.js';

/**
 * Application entry point.
 * Loads config, creates logger, builds Koa app, starts server.
 */
function main(): void {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);

  logger.info('Porta v5 starting...', {
    env: config.NODE_ENV,
    issuer: config.ISSUER,
  });

  const app = createApp(config, logger);
  startServer(app, config.PORT, logger);
}

main();
```

## Integration Points

| Component | Depends On | Used By |
| --------- | ---------- | ------- |
| Config loader | `process.env`, Zod | Everything — server, logger, future services |
| Logger | Config (LOG_LEVEL) | Server, middleware, future services |
| Server (Koa) | Config, Logger | Entry point (`src/index.ts`) |
| Health endpoint | None (stubs) | Load balancer, Docker health check, monitoring |

## Error Handling

| Error Case | Handling Strategy |
| ---------- | ----------------- |
| Config validation fails | Throws descriptive error listing all issues; process exits before server starts |
| Unhandled Koa error | Global `app.on('error')` logs structured error, does NOT crash the process |
| SIGTERM / SIGINT | Graceful shutdown: stop accepting connections, close server, exit 0 |
| Graceful shutdown timeout | Force exit after 10s with exit code 1 |
