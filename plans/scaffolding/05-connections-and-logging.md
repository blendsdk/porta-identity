# Connections & Logging: Project Scaffolding

> **Document**: 05-connections-and-logging.md
> **Parent**: [Index](00-index.md)

## Overview

Set up the PostgreSQL connection pool, Redis client, and structured pino logger.

## PostgreSQL (`src/lib/database.ts`)

```typescript
import { Pool } from 'pg';
import { config } from '../config/index.js';
import { logger } from './logger.js';

let pool: Pool | null = null;

export async function connectDatabase(): Promise<Pool> {
  pool = new Pool({ connectionString: config.databaseUrl });

  // Verify connectivity
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
  logger.info('Database connected');

  return pool;
}

export function getPool(): Pool {
  if (!pool) throw new Error('Database not connected. Call connectDatabase() first.');
  return pool;
}

export async function disconnectDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database disconnected');
  }
}
```

## Redis (`src/lib/redis.ts`)

```typescript
import Redis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from './logger.js';

let redis: Redis | null = null;

export async function connectRedis(): Promise<Redis> {
  redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  await redis.connect();
  logger.info('Redis connected');

  redis.on('error', (err) => {
    logger.error({ err }, 'Redis error');
  });

  return redis;
}

export function getRedis(): Redis {
  if (!redis) throw new Error('Redis not connected. Call connectRedis() first.');
  return redis;
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info('Redis disconnected');
  }
}
```

## Logger (`src/lib/logger.ts`)

```typescript
import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isTest ? 'silent' : 'info'),
  transport: !isProduction
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});
```

### Logger Notes

- **Production**: Raw JSON to stdout (no pino-pretty)
- **Development**: Pretty-printed with colors
- **Test**: Silent by default (suppress log noise in tests)
- Logger is created BEFORE config loads (no config dependency — uses process.env directly)

## Testing Requirements

- Unit test: logger exports a pino instance
- Integration test: connectDatabase succeeds with valid DATABASE_URL
- Integration test: connectDatabase fails with invalid DATABASE_URL
- Integration test: connectRedis succeeds with valid REDIS_URL
- Integration test: getPool throws if not connected
- Integration test: getRedis throws if not connected
