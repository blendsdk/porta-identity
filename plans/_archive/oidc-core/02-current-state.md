# Current State: OIDC Provider Core

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists (from RD-01 + RD-02)

The project has a working Koa application with infrastructure connections, middleware, health checks, and a complete database schema with 19 tables across 11 migration files. The OIDC-specific database tables (`oidc_payloads`, `signing_keys`, `system_config`) already exist and are ready for use.

### Relevant Files

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `src/server.ts` | Koa app factory with middleware stack | Mount OIDC provider routes under `/:orgSlug` |
| `src/index.ts` | Entry point with graceful shutdown | Add signing key loading + provider initialization before server start |
| `src/config/schema.ts` | Zod config schema | Add `cookieKeys` field for OIDC cookie signing |
| `src/config/index.ts` | Config loader | Map new env vars to config |
| `src/lib/database.ts` | PostgreSQL pool (connect, getPool, disconnect) | No changes — used by PostgreSQL adapter |
| `src/lib/redis.ts` | Redis client (connect, getRedis, disconnect) | No changes — used by Redis adapter |
| `src/lib/logger.ts` | Pino logger | No changes — used for logging |
| `src/middleware/error-handler.ts` | Global Koa error handler | No changes — stays in middleware stack |
| `src/middleware/request-logger.ts` | Request logging with X-Request-Id | No changes — stays in middleware stack |
| `src/middleware/health.ts` | GET /health (DB + Redis checks) | No changes — stays mounted at `/health` |
| `migrations/008_config.sql` | `system_config` + `signing_keys` tables | No changes — tables already exist |
| `migrations/010_oidc_adapter.sql` | `oidc_payloads` table | No changes — table already exists |
| `migrations/011_seed.sql` | Seed data (super-admin org, config defaults) | No changes — TTL config values already seeded |
| `migrations/004_clients.sql` | `clients` + `client_secrets` tables | No changes — tables already exist |
| `migrations/005_users.sql` | `users` table | No changes — table already exists |
| `migrations/002_organizations.sql` | `organizations` table | No changes — table already exists |
| `package.json` | Dependencies | Add `oidc-provider` as runtime dependency |

### Code Analysis

#### Koa App Factory (`src/server.ts`)

```typescript
// Current: simple Koa app with middleware + /health route
const app = new Koa();
app.use(errorHandler());
app.use(requestLogger());
app.use(bodyParser());
const router = new Router();
router.get('/health', healthCheck());
app.use(router.routes());
app.use(router.allowedMethods());
```

The OIDC provider needs to be mounted AFTER the existing middleware but with its own routing. `node-oidc-provider` provides a Koa application (`provider.app`) that can be mounted as middleware. The provider handles its own routing for OIDC endpoints.

**Key consideration**: `node-oidc-provider`'s Koa instance should be used as a sub-application, with routes prefixed by `/:orgSlug`. The existing `/health` endpoint must remain at the root level.

#### Entry Point (`src/index.ts`)

```typescript
// Current: connect DB → connect Redis → create app → listen → shutdown handlers
await connectDatabase();
await connectRedis();
const app = createApp();
const server = app.listen(config.port, config.host, () => { ... });
```

Needs modification to:
1. Load signing keys from DB before creating the provider
2. Initialize the OIDC provider with loaded keys
3. Pass the provider to `createApp()` for mounting

#### Config Schema (`src/config/schema.ts`)

```typescript
// Current fields:
// nodeEnv, port, host, databaseUrl, redisUrl, issuerBaseUrl, smtp.*, logLevel
```

`issuerBaseUrl` already exists — this is the base URL for OIDC issuers. Needs addition of `cookieKeys` (array of strings for cookie signing). The `issuerBaseUrl` will be used as the base for constructing per-org issuers: `${issuerBaseUrl}/${orgSlug}`.

#### Database Tables Available

**`oidc_payloads`** — Generic storage for node-oidc-provider:
- Composite PK: `(id, type)`
- Columns: `id`, `type`, `payload` (JSONB), `grant_id`, `user_code`, `uid`, `expires_at`, `consumed_at`, `created_at`
- Partial indexes on `grant_id`, `user_code`, `uid`, `expires_at`

**`signing_keys`** — JWKS key pairs:
- Columns: `id` (UUID), `kid`, `algorithm`, `public_key` (PEM), `private_key` (PEM), `status` (active/retired/revoked), `activated_at`, `retired_at`, `expires_at`
- Indexes on `status`, partial index on `status = 'active'`

**`system_config`** — Key-value store for runtime settings:
- Columns: `id` (UUID), `key`, `value` (JSONB), `value_type`, `description`, `is_sensitive`
- Seeded values include: `access_token_ttl`, `id_token_ttl`, `refresh_token_ttl`, `authorization_code_ttl`, `session_ttl`, `cookie_secure`, `require_pkce`, `cors_max_age`

**`organizations`** — Tenant table:
- Columns: `id` (UUID), `name`, `slug` (unique), `status`, `is_super_admin`, branding fields
- Super-admin org seeded: slug = `porta-admin`

**`clients`** — OIDC clients:
- Columns: `id` (UUID), `organization_id`, `application_id`, `client_id` (unique), OIDC metadata (redirect_uris, grant_types, response_types, scope, etc.)
- `allowed_origins` (TEXT[]) for CORS

**`client_secrets`** — Hashed client secrets:
- Columns: `id`, `client_id` (FK → clients), `secret_hash` (Argon2id), `label`, `expires_at`, `status`

**`users`** — User accounts:
- Columns: `id` (UUID), `organization_id`, `email` (CITEXT), OIDC Standard Claims fields, status, etc.

## Gaps Identified

### Gap 1: No OIDC Provider

**Current Behavior:** The application serves only a `/health` endpoint.
**Required Behavior:** The application must serve all standard OIDC endpoints under `/{org-slug}/*`.
**Fix Required:** Install `node-oidc-provider`, create adapter implementations, configure the provider, and mount it on the Koa app.

### Gap 2: No Signing Key Management

**Current Behavior:** The `signing_keys` table exists but is empty. No code reads from it.
**Required Behavior:** ES256 signing keys must be loaded from DB at startup, converted to JWK format, and passed to the OIDC provider. A key generation utility must exist for bootstrapping.
**Fix Required:** Create `src/lib/signing-keys.ts` with load/generate/convert functions.

### Gap 3: No System Config Service

**Current Behavior:** The `system_config` table exists with seeded values but no code reads from it.
**Required Behavior:** Token TTLs and other runtime settings must be read from `system_config` with type coercion and fallback defaults.
**Fix Required:** Create `src/lib/system-config.ts` with a typed config reader.

### Gap 4: No OIDC Adapter

**Current Behavior:** The `oidc_payloads` table exists but no adapter code interacts with it.
**Required Behavior:** A PostgreSQL adapter implementing `node-oidc-provider`'s adapter interface must store/retrieve OIDC artifacts.
**Fix Required:** Create `src/oidc/postgres-adapter.ts` and `src/oidc/redis-adapter.ts`.

### Gap 5: No Multi-Tenant Routing

**Current Behavior:** All routes are at the root level (e.g., `/health`).
**Required Behavior:** OIDC endpoints must be scoped under `/{org-slug}/*` with tenant validation.
**Fix Required:** Create `src/middleware/tenant-resolver.ts` and update `src/server.ts` to mount provider with org-slug prefix.

### Gap 6: No Cookie Configuration

**Current Behavior:** The config schema has no cookie-related fields.
**Required Behavior:** OIDC cookies need signing keys and secure configuration.
**Fix Required:** Add `cookieKeys` to config schema, pass to provider configuration.

## Dependencies

### Internal Dependencies

- `src/lib/database.ts` — PostgreSQL pool for adapter queries
- `src/lib/redis.ts` — Redis client for short-lived artifact storage
- `src/config/index.ts` — Configuration values (issuerBaseUrl, cookieKeys)
- `src/lib/logger.ts` — Logging throughout OIDC modules
- `migrations/008_config.sql` — `system_config` + `signing_keys` tables
- `migrations/010_oidc_adapter.sql` — `oidc_payloads` table
- `migrations/002_organizations.sql` — `organizations` table (for tenant resolver)
- `migrations/004_clients.sql` — `clients` + `client_secrets` tables (for client finder)

### External Dependencies

- `oidc-provider` — The core OIDC engine (to be installed)
- `node:crypto` — ES256 key generation (built-in, no install needed)

### Downstream Dependencies (future RDs that build on RD-03)

- **RD-04** (Organizations) — Will add real organization CRUD; tenant resolver currently does direct DB query
- **RD-05** (Applications & Clients) — Will complete `findClient` with Argon2id secret verification
- **RD-06** (Users) — Will complete `findAccount` with real user profile claims
- **RD-07** (Auth Workflows) — Will implement login/consent UI and interaction completion
- **RD-08** (RBAC & Custom Claims) — Will inject custom claims via `findAccount.claims()`

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `node-oidc-provider` version incompatibility with Koa 3 | Low | High | Check compatibility before install; provider supports Koa natively |
| Multi-tenant issuer complexity with `node-oidc-provider` | Medium | Medium | Provider supports dynamic issuers; well-documented pattern |
| PEM → JWK conversion complexity | Low | Medium | Node.js `crypto` module has built-in JWK export; `node-oidc-provider` also has helpers |
| TypeScript type definitions for `oidc-provider` | Medium | Low | Package includes its own types; may need some type assertions |
| Cookie keys management in development | Low | Low | Use static default keys in `.env` for development |
| Redis adapter data loss on restart | Low | Low | Short-lived data only; users re-authenticate after Redis restart |
