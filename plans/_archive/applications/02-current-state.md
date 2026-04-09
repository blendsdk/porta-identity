# Current State: Application & Client Management

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

The database schema for applications, modules, clients, and secrets was created in
RD-02 (migrations 003 and 004). A basic OIDC client-finder was created in RD-03
as a placeholder — it queries active clients but lacks proper secret verification.
The organization module (RD-04) provides the reference pattern for building new
domain modules.

### Relevant Files

| File                                    | Purpose                    | Changes Needed                            |
|-----------------------------------------|----------------------------|-------------------------------------------|
| `migrations/003_applications.sql`       | Applications + modules DDL | None — schema already correct             |
| `migrations/004_clients.sql`            | Clients + secrets DDL      | None — schema already correct             |
| `src/oidc/client-finder.ts`            | OIDC client metadata lookup | Enhance with secret verification (Argon2) |
| `src/organizations/` (all files)       | Reference module pattern    | None — used as template                   |
| `src/routes/organizations.ts`          | Reference route pattern     | None — used as template                   |
| `src/lib/audit-log.ts`                 | Generic audit log writer    | None — reused as-is                       |
| `src/middleware/super-admin.ts`        | Super-admin middleware      | None — reused as-is                       |
| `src/server.ts`                        | Koa app factory             | Mount new application + client routes     |
| `package.json`                         | Dependencies                | Add `argon2` for secret hashing           |
| `tests/unit/oidc/client-finder.test.ts`| Client finder tests        | Update for new integration                |

### Database Schema Analysis

**`applications` table** (migration 003):
- `id` UUID PK, `name` VARCHAR(255), `slug` VARCHAR(100) UNIQUE
- `description` TEXT, `status` CHECK (active/inactive/archived)
- `created_at`, `updated_at` with auto-update trigger

**`application_modules` table** (migration 003):
- `id` UUID PK, `application_id` FK → applications
- `name` VARCHAR(255), `slug` VARCHAR(100), `description` TEXT
- `status` CHECK (active/inactive)
- UNIQUE constraint on `(application_id, slug)` — per-app namespacing

**`clients` table** (migration 004):
- `id` UUID PK, `organization_id` FK, `application_id` FK
- `client_id` VARCHAR(255) UNIQUE — the OIDC public identifier
- `client_name`, `client_type` (confidential/public), `application_type` (web/native/spa)
- `redirect_uris` TEXT[], `post_logout_redirect_uris` TEXT[]
- `grant_types` TEXT[], `response_types` TEXT[], `scope` TEXT
- `token_endpoint_auth_method`, `allowed_origins` TEXT[], `require_pkce` BOOLEAN
- `status` CHECK (active/inactive/revoked)
- Indexes on `organization_id`, `application_id`, `client_id`

**`client_secrets` table** (migration 004):
- `id` UUID PK, `client_id` FK → clients.id (internal UUID, NOT the OIDC client_id)
- `secret_hash` TEXT (Argon2id hash), `label` VARCHAR(255)
- `expires_at` TIMESTAMPTZ (nullable), `status` CHECK (active/revoked)
- `last_used_at` TIMESTAMPTZ, `created_at` TIMESTAMPTZ
- Partial index on `(client_id) WHERE status = 'active'` for fast lookups

### Code Analysis — Existing Client Finder

The current `src/oidc/client-finder.ts` (from RD-03) has placeholder logic:

```typescript
// Current: Queries clients table, returns OIDC metadata.
// Missing: No secret verification — confidential clients can't authenticate.
// The file has a comment noting RD-05 will implement Argon2id verification.
export async function findClientByClientId(clientId: string): Promise<OidcClientMetadata | undefined>
```

**What needs to change**: The client-finder needs to either:
1. Use the new client service's `findForOidc()` method, OR
2. Be enhanced in-place to include secret verification via the new secret service

Decision: **Option 1** — redirect to the new client service. This keeps business logic
centralized in the clients module and avoids duplicate code.

### Code Analysis — Organization Module Pattern

The organization module (`src/organizations/`) establishes the pattern we follow:

```
types.ts         → Interfaces, row mapping function
slugs.ts         → Slug generation (from name) and validation (format + reserved words)
errors.ts        → Domain error classes (NotFound, Validation)
repository.ts    → PostgreSQL CRUD (insert, find, update, list)
cache.ts         → Redis get/set/invalidate with graceful degradation
service.ts       → Business logic composing repo + cache + validation + audit
index.ts         → Barrel export (types, service functions, errors, slug utils)
```

This pattern will be replicated for both `src/applications/` and `src/clients/`.

## Gaps Identified

### Gap 1: No Application Management Code

**Current Behavior:** Applications table exists in DB but no TypeScript code manages it.
**Required Behavior:** Full CRUD, caching, slug management, module management, audit logging.
**Fix Required:** Create `src/applications/` module following the organizations pattern.

### Gap 2: No Client Management Code

**Current Behavior:** Clients table exists in DB. Basic lookup in `client-finder.ts` only.
**Required Behavior:** Full CRUD, caching, OIDC metadata mapping, audit logging.
**Fix Required:** Create `src/clients/` module with service, repository, cache, types.

### Gap 3: No Secret Management

**Current Behavior:** `client_secrets` table exists but no code manages it. No Argon2id dependency.
**Required Behavior:** Secret generation, hashing, verification, revocation, expiry.
**Fix Required:** Add `argon2` dependency. Create crypto utilities and secret service.

### Gap 4: Client Finder Lacks Secret Verification

**Current Behavior:** `findClientByClientId` returns client metadata but doesn't verify secrets.
Confidential clients effectively can't authenticate at the token endpoint.
**Required Behavior:** Provider's `findClient` should use the new client service which
includes proper secret verification.
**Fix Required:** Update client-finder to delegate to the clients module.

### Gap 5: No Admin API Routes

**Current Behavior:** No routes for managing applications or clients.
**Required Behavior:** Super-admin API routes for application CRUD, client CRUD, secret management.
**Fix Required:** Create route handlers, mount in server.

## Dependencies

### Internal Dependencies

- `src/organizations/` — Clients reference organizations by `organization_id`
- `src/lib/database.ts` — PostgreSQL pool (via `getPool()`)
- `src/lib/redis.ts` — Redis client (via `getRedis()`)
- `src/lib/audit-log.ts` — Audit log writer (reused)
- `src/middleware/super-admin.ts` — Authorization middleware (reused)

### External Dependencies

- `argon2` — **NEW** — For Argon2id secret hashing (native binding, well-maintained)
- `node:crypto` — For `randomBytes()` client ID and secret generation (built-in)
- Existing: `pg`, `ioredis`, `zod`, `@koa/router`, `koa`

## Risks and Concerns

| Risk                          | Likelihood | Impact | Mitigation                                          |
|-------------------------------|------------|--------|-----------------------------------------------------|
| Argon2 native build issues    | Low        | Medium | Use `argon2` npm package (pre-built binaries for most platforms) |
| Secret verification perf      | Low        | Low    | Max ~5 active secrets per client; Argon2id is async  |
| Client-finder refactor breaks | Medium     | High   | Update existing tests, verify OIDC flow still works  |
| Large scope (3 entities)      | Medium     | Medium | Split into 7 phases with clear boundaries            |
