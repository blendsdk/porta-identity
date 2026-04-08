# Current State: Database Schema & Migrations

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

The project has a basic PostgreSQL connection pool from RD-01 (Project Scaffolding). There is **no migration system**, **no schema**, and **no seed data** yet. The database connection is used only for the health check endpoint (`SELECT 1`).

### Relevant Files

| File | Purpose | Changes Needed |
|------|---------|---------------|
| `src/lib/database.ts` | PostgreSQL pool (connect, getPool, disconnect) | No changes — migrations use their own connection |
| `src/config/schema.ts` | Zod config schema with `DATABASE_URL` | No changes — `DATABASE_URL` already defined |
| `src/config/index.ts` | Config loader (dotenv + zod parse) | No changes |
| `docker/docker-compose.yml` | PostgreSQL 16-alpine, Redis 7-alpine, MailHog | No changes — DB already configured |
| `.env.example` | `DATABASE_URL=postgresql://porta:porta_dev@localhost:5432/porta` | No changes |
| `package.json` | Dependencies and scripts | Add `node-pg-migrate` dependency and migration scripts |
| `src/middleware/health.ts` | Health check using `getPool()` | No changes |

### Code Analysis

#### Database Connection (`src/lib/database.ts`)

```typescript
import { Pool } from 'pg';
import { config } from '../config/index.js';
import { logger } from './logger.js';

let pool: Pool | null = null;

export async function connectDatabase(): Promise<Pool> {
  pool = new Pool({ connectionString: config.databaseUrl });
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

**Key observations:**
- Uses `pg.Pool` with `connectionString` from config
- No connection pool sizing (min/max) — uses `pg` defaults
- No migration awareness — just raw pool

#### Config Schema (`src/config/schema.ts`)

```typescript
export const configSchema = z.object({
  // ...
  databaseUrl: z.string().min(1, 'DATABASE_URL is required'),
  // ...
});
```

`DATABASE_URL` is already validated and available via `config.databaseUrl`.

#### Docker Compose (`docker/docker-compose.yml`)

```yaml
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
```

PostgreSQL 16 is already running with database `porta`, user `porta`, password `porta_dev`.

#### Package.json Scripts (current)

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "verify": "yarn lint && yarn build && yarn test"
    // ... no migration scripts
  }
}
```

## Gaps Identified

### Gap 1: No Migration System

**Current Behavior:** No way to create, run, or rollback database schema changes.
**Required Behavior:** `node-pg-migrate` installed with CLI commands for migrate, rollback, create, and status.
**Fix Required:** Install `node-pg-migrate`, configure it, add yarn scripts.

### Gap 2: No Schema

**Current Behavior:** Empty database (PostgreSQL starts with default `porta` database, no application tables).
**Required Behavior:** 19 tables with full schema, indexes, constraints, and relationships.
**Fix Required:** Create 10 migration files (001–010) with complete DDL.

### Gap 3: No Seed Data

**Current Behavior:** No development data.
**Required Behavior:** Super-admin organization, default system configuration values.
**Fix Required:** Create seed migration (011) with development data inserts.

### Gap 4: No Migration Runner Utility

**Current Behavior:** No programmatic way to run migrations from the application.
**Required Behavior:** A utility module that can run migrations programmatically (useful for tests and startup).
**Fix Required:** Create `src/lib/migrator.ts` wrapping `node-pg-migrate`.

## Dependencies

### Internal Dependencies

- `src/config/schema.ts` — `DATABASE_URL` already defined and validated
- `src/lib/database.ts` — Existing pool (not used by migrations directly, but coexists)
- `docker/docker-compose.yml` — PostgreSQL 16 already configured

### External Dependencies (New)

| Package | Version | Purpose |
|---------|---------|---------|
| `node-pg-migrate` | latest | SQL-based migration tool with CLI |

**Note:** `node-pg-migrate` uses `pg` (already installed as a dependency) for its database connection.

### Downstream Dependencies (Future RDs)

| RD | What it needs from RD-02 |
|----|--------------------------|
| RD-03 (OIDC Core) | `oidc_payloads` table, `signing_keys` table |
| RD-04 (Organizations) | `organizations` table |
| RD-05 (Apps & Clients) | `applications`, `application_modules`, `clients`, `client_secrets` tables |
| RD-06 (Users) | `users` table, token tables |
| RD-08 (RBAC) | `roles`, `permissions`, `role_permissions`, `user_roles`, `custom_claim_*` tables |
| RD-09 (CLI) | All tables (CLI manages all entities) |
| RD-12 (2FA) | `users` table (will add 2FA columns in a future migration) |

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Migration ordering breaks FK constraints | Low | High | Careful dependency ordering in migration numbering |
| `pgcrypto`/`citext` extensions not available | Low | High | Using `postgres:16-alpine` which includes contrib modules |
| Seed data conflicts on re-run | Medium | Low | Seed migration uses `INSERT ... ON CONFLICT DO NOTHING` |
| Large migration files hard to review | Medium | Low | Each migration is one logical unit (1–2 tables max) |
| `node-pg-migrate` version compatibility | Low | Medium | Pin to latest stable, test in CI |
