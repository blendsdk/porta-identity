# Database Schema: Client Login Methods

> **Document**: 03-database-schema.md
> **Parent**: [Index](00-index.md)

## Overview

This document specifies the database schema changes for the feature: a new migration `014_login_methods.sql` that adds two columns — one on `organizations` and one on `clients` — to support the organization-default / client-override inheritance model.

## Architecture

### Current Schema

**`organizations` table** (after migration 002 + RD-12 two-factor):

```sql
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) NOT NULL UNIQUE,
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'suspended', 'archived')),
    is_super_admin  BOOLEAN NOT NULL DEFAULT FALSE,
    branding_logo_url       TEXT,
    branding_favicon_url    TEXT,
    branding_primary_color  VARCHAR(7),
    branding_company_name   VARCHAR(255),
    branding_custom_css     TEXT,
    default_locale          VARCHAR(10) DEFAULT 'en',
    two_factor_policy       VARCHAR(20) NOT NULL DEFAULT 'optional',  -- added by 012
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**`clients` table** (after migration 004):

```sql
CREATE TABLE clients (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    application_id      UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    client_id           VARCHAR(255) NOT NULL UNIQUE,
    client_name         VARCHAR(255) NOT NULL,
    client_type         VARCHAR(20) NOT NULL CHECK (client_type IN ('confidential', 'public')),
    application_type    VARCHAR(20) NOT NULL DEFAULT 'web' CHECK (application_type IN ('web', 'native', 'spa')),
    redirect_uris       TEXT[] NOT NULL DEFAULT '{}',
    post_logout_redirect_uris TEXT[] DEFAULT '{}',
    grant_types         TEXT[] NOT NULL DEFAULT '{authorization_code}',
    response_types      TEXT[] NOT NULL DEFAULT '{code}',
    scope               TEXT NOT NULL DEFAULT 'openid profile email',
    token_endpoint_auth_method VARCHAR(50) NOT NULL DEFAULT 'client_secret_post',
    allowed_origins     TEXT[] NOT NULL DEFAULT '{}',
    require_pkce        BOOLEAN NOT NULL DEFAULT TRUE,
    status              VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'revoked')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Proposed Changes

Add one column to each table. No new tables, no new indexes (login methods are not a query target), no FK changes.

## Implementation Details

### Migration File: `migrations/014_login_methods.sql`

```sql
-- Up Migration

-- Organizations: default login methods for all clients in the org
ALTER TABLE organizations
    ADD COLUMN default_login_methods TEXT[] NOT NULL
        DEFAULT ARRAY['password', 'magic_link']::TEXT[];

COMMENT ON COLUMN organizations.default_login_methods IS
    'Default authentication methods available for all clients in this org. Clients may override via clients.login_methods. Values: password, magic_link (extensible — sso/passkey in future).';

-- Clients: per-client override of org default. NULL = inherit from org.
ALTER TABLE clients
    ADD COLUMN login_methods TEXT[] DEFAULT NULL;

COMMENT ON COLUMN clients.login_methods IS
    'Authentication methods for this client. NULL = inherit from organizations.default_login_methods. Non-null must be non-empty.';

-- Down Migration

ALTER TABLE clients DROP COLUMN IF EXISTS login_methods;
ALTER TABLE organizations DROP COLUMN IF EXISTS default_login_methods;
```

### Semantic Rules

| Field                                   | Nullable | Empty allowed | Default                            |
| --------------------------------------- | -------- | ------------- | ---------------------------------- |
| `organizations.default_login_methods`   | NO       | NO            | `{'password', 'magic_link'}`       |
| `clients.login_methods`                 | YES      | NO *          | `NULL`                             |

*An empty array (`{}`) is **invalid** for clients. The semantics are:
- `NULL` → "inherit from org"
- `{a, b, …}` (non-empty) → "override with these methods"

Since we do not add a DB-level CHECK (we want future-proof `TEXT[]` for sso/passkey later), this constraint is enforced at the **service layer**. Applications cannot directly INSERT into the DB through any supported path — all writes go through `insertClient()` / `updateClient()` which call the service validation.

### Why No CHECK Constraint on Values?

| Option                                         | Pros                                    | Cons                                                          |
| ---------------------------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| `CHECK (method IN ('password', 'magic_link'))` | DB-level safety; fails fast             | Every future method (sso, passkey) requires a new migration   |
| No CHECK — validate in TypeScript              | Schema stable; adding methods is zero-downtime | DB-level rogue writes (direct SQL) could insert bad values |

We choose **no CHECK** because:
1. All writes funnel through the service layer anyway
2. The service layer validates via TypeScript union type
3. Adding `'sso'` or `'passkey'` later becomes a 1-line TS change vs. a schema migration
4. This matches the pattern used for `grant_types`, `response_types`, `redirect_uris` — none of which have value CHECKs

### Why `ARRAY['password', 'magic_link']::TEXT[]` vs. `'{password,magic_link}'`?

Both are valid Postgres syntax. We use the explicit `ARRAY[...]::TEXT[]` form because:
1. It's self-documenting and hard to typo
2. Matches the pattern used in migration 011 (seed data)
3. Easier to read in code reviews

## Integration Points

### Migration Runner

The project uses a programmatic migration runner (`src/lib/migrator.ts`) that reads SQL files from `migrations/` in numerical order. Migration 014 will be picked up automatically.

Verified via:
```bash
clear && sleep 3 && yarn test:integration -- migrations
```

### Existing Test Suite

`tests/integration/migrations.test.ts` (33 tests) validates that each migration:
1. Applies cleanly (up)
2. Reverts cleanly (down)
3. Leaves the DB in a consistent state

A new test case must be added for migration 014.

### Seed Data

`migrations/011_seed.sql` currently seeds organizations and clients for development. It does **not** need to be updated — the new columns use defaults (`{password, magic_link}` for orgs, `NULL` for clients), so seeded entities get the same behavior as before.

**Exception:** If the seed includes pre-built demo clients that should show `magic_link` only or `password` only as a demonstration, we can add those later as part of a separate "demo" task (not in this plan's scope).

## Code Examples

### Reading the Columns

```sql
-- Select with both fields
SELECT id, name, default_login_methods, two_factor_policy FROM organizations WHERE id = $1;

-- Client with inherit semantics (login_methods may be null)
SELECT id, client_id, login_methods FROM clients WHERE client_id = $1;
```

### Writing the Columns

```sql
-- Insert org (explicit or default)
INSERT INTO organizations (name, slug, default_login_methods)
    VALUES ($1, $2, ARRAY['password']::TEXT[]);

-- Update client to use inherit
UPDATE clients SET login_methods = NULL WHERE id = $1;

-- Update client to override
UPDATE clients SET login_methods = ARRAY['magic_link']::TEXT[] WHERE id = $1;
```

### pg Driver Behavior

The `pg` npm driver handles `TEXT[]` columns natively — they come back as JavaScript arrays with no parsing needed. `NULL` arrays come back as `null`. This matches how `redirect_uris`, `grant_types`, etc. already work on the client table.

## Error Handling

| Error Case                                          | Handling Strategy                                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| Migration 014 up fails (e.g., DB offline)           | Migrator rolls back, logs error, exits non-zero                                   |
| Migration 014 down fails (e.g., dependent view)     | No known dependents — DROP COLUMN should succeed. If not, error is surfaced      |
| INSERT with invalid method values (e.g., `'xyz'`)   | Service validation catches before SQL; SQL itself would accept any TEXT[]         |
| UPDATE setting `login_methods = '{}'` on client     | Service validation throws `ClientValidationError`; does not reach repository     |
| Cache hit with old shape (missing new field)        | Row mapper supplies defaults; TypeScript types enforce presence downstream       |

## Testing Requirements

- Unit tests: `tests/unit/migrations.test.ts` — SQL string validation (parses correctly, has Up/Down markers)
- Integration tests: `tests/integration/migrations.test.ts` — add a case verifying:
  1. Before migration: columns don't exist
  2. After up-migration: columns exist with correct types + defaults
  3. Seeded rows inherit the default values
  4. After down-migration: columns are gone
  5. All previous migrations still work (no ordering breakage)
