# Current State: Organization Management

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

The database schema for organizations is fully in place from RD-02. The `organizations`
table has all required columns including branding fields, locale, status, and the
super-admin flag. A partial unique index enforces that only one super-admin org can exist.
The seed migration creates the `porta-admin` super-admin organization.

The tenant resolver middleware from RD-03 provides basic organization lookup by slug,
but it only supports active organizations, queries the database directly (no cache),
and returns 404 for all non-active states (no differentiation between suspended and archived).

### Relevant Files

| File                                     | Purpose                           | Changes Needed                                      |
|------------------------------------------|-----------------------------------|-----------------------------------------------------|
| `migrations/002_organizations.sql`       | Organizations table schema        | None — schema is complete                           |
| `migrations/009_audit_log.sql`           | Audit log table schema            | None — schema is complete                           |
| `migrations/011_seed.sql`                | Super-admin org seed data         | None — porta-admin org already seeded               |
| `src/middleware/tenant-resolver.ts`      | Tenant resolution middleware      | Add Redis cache, differentiate suspended vs archived |
| `src/server.ts`                          | Koa app factory                   | Mount organization management API routes            |
| `src/lib/database.ts`                    | PostgreSQL pool (getPool)         | None — will use getPool() in repository             |
| `src/lib/redis.ts`                       | Redis client (getRedis)           | None — will use getRedis() in cache layer           |
| `src/lib/logger.ts`                      | Pino logger                       | None — will use logger in new modules               |
| `src/config/index.ts`                    | Config loader                     | None — will use config in new modules               |
| `tests/unit/middleware/tenant-resolver.test.ts` | Tenant resolver tests      | Update for new cache + status logic                 |

### Code Analysis

#### Organizations Table (migration 002)

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
    default_locale  VARCHAR(10) DEFAULT 'en',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique index — only one super-admin row allowed
CREATE UNIQUE INDEX idx_organizations_super_admin
    ON organizations (is_super_admin) WHERE is_super_admin = TRUE;
```

All columns required by RD-04 already exist. No schema migration needed.

#### Audit Log Table (migration 009)

```sql
CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type      VARCHAR(100) NOT NULL,
    event_category  VARCHAR(50) NOT NULL,
    description     TEXT,
    metadata        JSONB DEFAULT '{}',
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The audit_log table is ready for use. We will create a generic audit log writer service.

#### Current Tenant Resolver (src/middleware/tenant-resolver.ts)

The existing middleware:
- Extracts `orgSlug` from route params
- Queries DB directly: `SELECT ... WHERE slug = $1 AND status = 'active'`
- Returns 404 for everything that's not active
- Sets `ctx.state.organization` (only id, slug, name, status)
- Sets `ctx.state.issuer`

**Gaps:**
1. No Redis caching — every request hits the database
2. No differentiation between suspended (403) and archived (404)
3. Limited fields returned — doesn't include branding, locale, isSuperAdmin
4. The Organization type (`TenantOrganization`) only has 4 fields

#### Current Server (src/server.ts)

The server currently mounts:
- Global middleware: errorHandler, requestLogger, bodyParser
- Health route: `GET /health`
- OIDC routes: `/:orgSlug/*` with tenantResolver + oidc-provider

Organization management API routes will be mounted separately on `/api/admin/organizations`.

#### Existing Code Patterns

The codebase uses **functional style** — standalone exported functions, not classes:
- `getPool()` for database access
- `getRedis()` for Redis access
- `logger` for logging
- Direct SQL queries via `pool.query()`

The test pattern uses:
- `vi.mock()` for module mocking
- Helper functions like `mockPool()` and `createMockCtx()`
- `describe/it/expect` blocks with clear descriptions

## Gaps Identified

### Gap 1: No Organization Service Layer

**Current:** No business logic layer for organization operations.
**Required:** Full CRUD service with validation, status lifecycle, branding management.
**Fix:** Create `src/organizations/service.ts` with all required operations.

### Gap 2: No Redis Caching for Organization Lookups

**Current:** Tenant resolver queries DB directly on every request.
**Required:** Redis cache with 5-minute TTL, invalidation on writes.
**Fix:** Create `src/organizations/cache.ts` and update tenant resolver.

### Gap 3: No Status Differentiation in Tenant Resolver

**Current:** Returns 404 for all non-active orgs (same error for suspended and archived).
**Required:** Suspended → 403, Archived → 404.
**Fix:** Update tenant resolver to fetch all statuses and differentiate response.

### Gap 4: No Audit Logging

**Current:** No audit log writer service.
**Required:** All org operations logged to `audit_log` table.
**Fix:** Create `src/lib/audit-log.ts` generic service.

### Gap 5: No API Routes for Organization Management

**Current:** No HTTP API for creating/managing organizations.
**Required:** RESTful API endpoints under `/api/admin/organizations`.
**Fix:** Create `src/routes/organizations.ts` with Koa router.

### Gap 6: No Super-Admin Authorization Middleware

**Current:** No middleware to check if the requesting organization is super-admin.
**Required:** Middleware that checks `ctx.state.organization.isSuperAdmin`.
**Fix:** Create `src/middleware/super-admin.ts`.

## Dependencies

### Internal Dependencies

- `src/lib/database.ts` — PostgreSQL pool (existing, no changes)
- `src/lib/redis.ts` — Redis client (existing, no changes)
- `src/lib/logger.ts` — Logger (existing, no changes)
- `src/config/index.ts` — Config (existing, no changes)
- `src/middleware/error-handler.ts` — Error handling (existing, no changes)

### External Dependencies

- No new npm packages required — all functionality built with existing dependencies
- `pg` for database queries
- `ioredis` for Redis cache
- `zod` for input validation
- `@koa/router` for API routes
- `koa-bodyparser` already installed for request body parsing

## Risks and Concerns

| Risk                                  | Likelihood | Impact | Mitigation                                                |
|---------------------------------------|------------|--------|-----------------------------------------------------------|
| Tenant resolver change breaks OIDC    | Low        | High   | Comprehensive test updates, same ctx.state contract       |
| Cache invalidation race conditions    | Low        | Medium | Always invalidate on write, short TTL (5 min)             |
| Slug collision during concurrent creates | Low     | Low    | Database UNIQUE constraint is the ultimate guard          |
| Audit log write failures blocking ops | Low        | Medium | Fire-and-forget pattern for audit writes                  |
