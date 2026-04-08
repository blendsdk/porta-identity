# Migration System: Database Schema & Migrations

> **Document**: 03-migration-system.md
> **Parent**: [Index](00-index.md)

## Overview

Set up `node-pg-migrate` as the SQL-based migration tool for Porta v5. This includes installing the package, configuring it to use `DATABASE_URL`, adding yarn scripts for migration management, and creating a programmatic migration runner utility for use in tests and application startup.

## Architecture

### Current Architecture

No migration system exists. The database is a bare PostgreSQL instance with no application tables.

### Proposed Architecture

```
Package.json scripts (yarn migrate, yarn migrate:rollback, etc.)
        │
        ▼
  node-pg-migrate CLI
        │
        ▼
  migrations/*.sql files (sequential, numbered)
        │
        ▼
  PostgreSQL (tracks state in pgmigrations table)
```

Additionally, a programmatic wrapper (`src/lib/migrator.ts`) allows running migrations from TypeScript code (e.g., in integration tests).

## Implementation Details

### 1. Install `node-pg-migrate`

```bash
yarn add node-pg-migrate
```

**Why runtime dependency (not devDependency)?** The migrator utility (`src/lib/migrator.ts`) may be used at application startup in production to auto-run pending migrations. Additionally, `node-pg-migrate` is lightweight and has no heavy dependencies beyond `pg` (already installed).

### 2. Package.json Scripts

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "migrate": "node-pg-migrate up --migrations-dir migrations --migration-file-language sql",
    "migrate:rollback": "node-pg-migrate down --migrations-dir migrations --migration-file-language sql --count 1",
    "migrate:status": "node-pg-migrate status --migrations-dir migrations --migration-file-language sql",
    "migrate:create": "node-pg-migrate create --migrations-dir migrations --migration-file-language sql"
  }
}
```

**Configuration details:**
- `--migrations-dir migrations` — Looks for migration files in `migrations/` at project root
- `--migration-file-language sql` — Uses `.sql` files (not JavaScript)
- `node-pg-migrate` reads `DATABASE_URL` from environment automatically (via dotenv or shell)
- The `down` command with `--count 1` rolls back exactly one migration

### 3. Migration File Format

Each `.sql` file uses `node-pg-migrate`'s SQL format with `-- Up Migration` and `-- Down Migration` markers:

```sql
-- Up Migration

CREATE TABLE example (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Down Migration

DROP TABLE IF EXISTS example;
```

### 4. Migration Directory Structure

```
migrations/
├── 001_extensions.sql           # Enable pgcrypto, citext
├── 002_organizations.sql        # Organizations table
├── 003_applications.sql         # Applications + application_modules
├── 004_clients.sql              # Clients + client_secrets
├── 005_users.sql                # Users + magic_link_tokens + password_reset_tokens + invitation_tokens
├── 006_roles_permissions.sql    # Roles + permissions + role_permissions + user_roles
├── 007_custom_claims.sql        # Custom claim definitions + values
├── 008_config.sql               # System config + signing keys
├── 009_audit_log.sql            # Audit log
├── 010_oidc_adapter.sql         # OIDC payloads (node-oidc-provider)
└── 011_seed.sql                 # Development seed data
```

### 5. Programmatic Migration Runner (`src/lib/migrator.ts`)

A utility that runs migrations programmatically using `node-pg-migrate`'s API:

```typescript
import { default as migrate, RunnerOption } from 'node-pg-migrate';
import { config } from '../config/index.js';
import { logger } from './logger.js';

/**
 * Run all pending database migrations.
 *
 * Uses node-pg-migrate's programmatic API to execute migrations
 * from the `migrations/` directory. This is useful for:
 * - Integration test setup (run migrations before tests)
 * - Application startup (auto-migrate in development)
 *
 * @param direction - 'up' to apply pending migrations, 'down' to rollback
 * @param count - Number of migrations to run (undefined = all pending)
 */
export async function runMigrations(
  direction: 'up' | 'down' = 'up',
  count?: number
): Promise<void> {
  const options: RunnerOption = {
    databaseUrl: config.databaseUrl,
    migrationsTable: 'pgmigrations',
    dir: 'migrations',
    direction,
    count: count ?? Infinity,
    log: (msg: string) => logger.debug({ migration: true }, msg),
    // Use SQL files
    decamelize: false,
  };

  await migrate(options);
  logger.info({ direction, count }, 'Migrations complete');
}
```

**Note:** The exact API shape of `node-pg-migrate`'s programmatic interface should be verified during implementation. The above is the expected pattern based on the library's documentation.

### 6. Updated `updated_at` Trigger Function

Create a reusable trigger function in the extensions migration that automatically updates `updated_at` on row modification:

```sql
-- In 001_extensions.sql
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Each table that has `updated_at` will attach this trigger:

```sql
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON table_name
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();
```

## Integration Points

### With Existing Code

- **`src/lib/database.ts`** — The migrator uses its own connection (via `databaseUrl` config), independent of the application pool. No changes needed to `database.ts`.
- **`src/config/index.ts`** — `DATABASE_URL` is already loaded and validated.
- **`package.json`** — New scripts added alongside existing scripts. The existing `verify` script remains unchanged (lint + build + test).

### With Future Code

- **RD-03 (OIDC Core)** — Will use `oidc_payloads` and `signing_keys` tables
- **RD-09 (CLI)** — Will add CLI commands that call migration scripts
- **Integration tests** — Will use `runMigrations()` to set up/teardown test databases

## Error Handling

| Error Case | Handling Strategy |
|------------|-------------------|
| `DATABASE_URL` not set | `node-pg-migrate` CLI exits with connection error; config validation catches this at app startup |
| Migration fails mid-execution | `node-pg-migrate` rolls back the failed migration automatically (transactional) |
| Duplicate migration run | `pgmigrations` table tracks applied migrations; re-running is a no-op |
| Database doesn't exist | Docker Compose creates the `porta` database on first start |

## Testing Requirements

- Integration test: Run all migrations up on a fresh database, verify tables exist
- Integration test: Run all migrations down, verify tables are dropped
- Integration test: Run migrations up, then down, then up again (idempotency)
- Unit test: Verify migration files are well-formed SQL (basic syntax check)
