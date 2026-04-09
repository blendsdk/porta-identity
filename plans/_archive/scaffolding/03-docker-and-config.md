# Docker & Configuration: Project Scaffolding

> **Document**: 03-docker-and-config.md
> **Parent**: [Index](00-index.md)

## Overview

Set up Docker Compose for local development infrastructure and the environment-based configuration system with zod validation.

## Docker Compose

### Services

```yaml
# docker/docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    environment:
      POSTGRES_DB: porta
      POSTGRES_USER: porta
      POSTGRES_PASSWORD: porta_dev
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U porta"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "${REDIS_PORT:-6379}:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  mailhog:
    image: mailhog/mailhog
    ports:
      - "${MAILHOG_SMTP_PORT:-1025}:1025"
      - "${MAILHOG_UI_PORT:-8025}:8025"

volumes:
  postgres_data:
```

## Environment Variables

### `.env.example`

```bash
# Server
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://porta:porta_dev@localhost:5432/porta

# Redis
REDIS_URL=redis://localhost:6379

# OIDC
ISSUER_BASE_URL=http://localhost:3000

# Email (MailHog for dev)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@porta.local

# Logging
LOG_LEVEL=debug

# Encryption (for future TOTP secrets — RD-12)
# ENCRYPTION_KEY=
```

## Configuration System

### Schema (`src/config/schema.ts`)

```typescript
import { z } from 'zod';

export const configSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().int().positive().default(3000),
  host: z.string().default('0.0.0.0'),
  databaseUrl: z.string().min(1, 'DATABASE_URL is required'),
  redisUrl: z.string().min(1, 'REDIS_URL is required'),
  issuerBaseUrl: z.string().url('ISSUER_BASE_URL must be a valid URL'),
  smtp: z.object({
    host: z.string().min(1, 'SMTP_HOST is required'),
    port: z.coerce.number().default(587),
    user: z.string().optional(),
    pass: z.string().optional(),
    from: z.string().min(1, 'SMTP_FROM is required'),
  }),
  logLevel: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

export type AppConfig = z.infer<typeof configSchema>;
```

### Loader (`src/config/index.ts`)

```typescript
import dotenv from 'dotenv';
import { configSchema, type AppConfig } from './schema.js';

dotenv.config();

function loadConfig(): AppConfig {
  const result = configSchema.safeParse({
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    host: process.env.HOST,
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    issuerBaseUrl: process.env.ISSUER_BASE_URL,
    smtp: {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM,
    },
    logLevel: process.env.LOG_LEVEL,
  });

  if (!result.success) {
    console.error('❌ Invalid configuration:');
    for (const issue of result.error.issues) {
      console.error(`   ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
```

## Error Handling

| Error Case | Handling Strategy |
|-----------|-------------------|
| Missing required env var | Fail fast with clear error listing all missing vars |
| Invalid env var format | Fail fast with zod error message |
| `.env` file not found | No error (vars come from env or Docker) |

## Testing Requirements

- Unit test: config loader with valid env vars
- Unit test: config loader fails with missing DATABASE_URL
- Unit test: config loader fails with invalid PORT
- Docker Compose: verify all 3 services start and are healthy
