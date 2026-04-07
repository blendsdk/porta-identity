# Porta v5 — Non-Functional Requirements & Operations

> **Part of:** [OVERVIEW.md](./OVERVIEW.md)
> **Section:** §8 Non-Functional Requirements
> **Version**: 0.9.0

---

## Table of Contents

- [Performance](#performance)
- [Deployment](#deployment)
- [Monitoring & Observability](#monitoring--observability)
- [Development](#development)
- [Initial Setup / Bootstrapping](#initial-setup--bootstrapping)
- [Database Migrations](#database-migrations)
- [Redis Key Strategy](#redis-key-strategy)
- [Stale Data Cleanup](#stale-data-cleanup)
- [Environment Variables Reference](#environment-variables-reference)

---

## Performance

| ID | Requirement | Target |
|----|-------------|--------|
| PERF-01 | Token endpoint response time | < 100ms (p95) |
| PERF-02 | Authorization endpoint response time | < 200ms (p95) |
| PERF-03 | UserInfo endpoint response time | < 50ms (p95) |
| PERF-04 | Introspection endpoint response time | < 50ms (p95) |
| PERF-05 | Concurrent users supported | 10,000+ active sessions |
| PERF-06 | Token issuance throughput | 1,000+ tokens/second |

---

## Deployment

| ID | Requirement | Description |
|----|-------------|-------------|
| DEPLOY-01 | Docker container | Single Dockerfile for the application |
| DEPLOY-02 | Docker Compose | Full stack (app + PostgreSQL + Redis) for development |
| DEPLOY-03 | Environment-based configuration | All config via environment variables |
| DEPLOY-04 | Stateless application | No local state — all state in PostgreSQL/Redis |
| DEPLOY-05 | Horizontal scalability | Multiple instances behind a load balancer |
| DEPLOY-06 | Health check endpoint | `/health` with PostgreSQL and Redis status |
| DEPLOY-07 | Graceful shutdown | Handle SIGTERM, drain connections |
| DEPLOY-08 | Blue-green deployment | Zero-downtime deploys via Docker blue-green pattern (existing infrastructure) |

---

## Monitoring & Observability

| ID | Requirement | Priority |
|----|-------------|----------|
| MON-01 | Structured logging (JSON) | **MVP** |
| MON-02 | Health check endpoint | **MVP** |
| MON-03 | Prometheus metrics endpoint | **Phase 2** |
| MON-04 | OpenTelemetry tracing | **Future** |

### Structured Log Schema

> All log output is JSON (one object per line). The following fields are included in every log entry:

| Field | Type | Always Present | Description |
|-------|------|----------------|-------------|
| `timestamp` | string (ISO 8601) | ✅ | e.g., `"2026-04-07T14:30:00.000Z"` |
| `level` | string | ✅ | `"debug"`, `"info"`, `"warn"`, `"error"` |
| `message` | string | ✅ | Human-readable log message |
| `request_id` | string (UUID) | On HTTP requests | Unique per request; set via `X-Request-Id` header or auto-generated |
| `method` | string | On HTTP requests | HTTP method (GET, POST, etc.) |
| `path` | string | On HTTP requests | Request path (e.g., `/token`, `/api/admin/users`) |
| `status` | number | On HTTP responses | HTTP response status code |
| `duration_ms` | number | On HTTP responses | Request processing time in milliseconds |
| `user_id` | string (UUID) | When authenticated | Authenticated user's ID |
| `client_id` | string | When client context | OIDC client ID |
| `organization_id` | string (UUID) | When org context | Organization context |
| `ip` | string | On HTTP requests | Client IP address (respects `TRUST_PROXY`) |
| `error` | object | On errors | `{ "name": "...", "message": "...", "stack": "..." }` (stack only in development) |
| `service` | string | ✅ | Always `"porta"` (for log aggregation filtering) |

**Example log entries:**
```json
{"timestamp":"2026-04-07T14:30:00.000Z","level":"info","message":"Server started","service":"porta","port":3000}
{"timestamp":"2026-04-07T14:30:01.123Z","level":"info","message":"POST /token 200","service":"porta","request_id":"abc-123","method":"POST","path":"/token","status":200,"duration_ms":45,"client_id":"crm-spa"}
{"timestamp":"2026-04-07T14:30:02.456Z","level":"warn","message":"Login failed: account locked","service":"porta","request_id":"def-456","user_id":"user-789","ip":"192.168.1.1"}
```

---

## Development

| ID | Requirement | Description |
|----|-------------|-------------|
| DEV-01 | TypeScript (strict mode) | All source code in TypeScript |
| DEV-02 | Node.js ≥ 22 | Runtime requirement |
| DEV-03 | ESM-only | No CommonJS |
| DEV-04 | Vitest for testing | Unit and integration tests |
| DEV-05 | Automated test suite | Run without external dependencies (Memory/SQLite mocks for unit tests) |
| DEV-06 | Integration tests with Docker | PostgreSQL + Redis via Docker Compose |

---

## Initial Setup / Bootstrapping

> Porta requires seed data to function on first deployment. The bootstrapping procedure creates the system organization, the built-in admin application, admin roles, and the initial admin user.

**Bootstrap command:** `npm run bootstrap`

**Behavior:**
1. **Idempotent** — safe to run multiple times; skips entities that already exist
2. **Runs after migrations** — requires database tables to exist (`npm run migrate` first)
3. **Does NOT run at app startup** — explicit CLI command only (prevents race conditions in multi-instance deployments)

**Entities created during bootstrap:**

| Entity | ID / Identifier | Description |
|--------|-----------------|-------------|
| System Organization | `slug: "porta-system"` | Internal organization for admin users; cannot be deleted via API |
| Admin Application | `id: "porta-admin"` | Built-in application for admin access; cannot be deleted via API |
| Admin Roles | `super-admin`, `admin`, `read-only` | Pre-defined roles on the `porta-admin` application |
| Admin Permissions | `*` (all), `read:*`, `write:*` | Pre-defined permissions for admin roles |
| Initial Admin User | Created from env vars | First admin user with `super-admin` role |
| Initial API Key | Created from env vars (optional) | Bootstrap API key for automation |
| Initial OIDC Client | `porta-admin-client` | Public OIDC client for admin JWT login. Config: `token_endpoint_auth_method: "none"`, `grant_types: ["authorization_code", "refresh_token"]`, `response_types: ["code"]`, `scope: "openid profile email app:roles"`, `skipConsent: true`, redirect URI from `BOOTSTRAP_ADMIN_REDIRECT_URI` env var |
| Initial Signing Key | Auto-generated | First OIDC signing key (algorithm from `SIGNING_ALGORITHM` env var) |

**Environment variables for bootstrap:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BOOTSTRAP_ADMIN_EMAIL` | **Yes** (first run) | — | Email for the initial admin user |
| `BOOTSTRAP_ADMIN_PASSWORD` | **Yes** (first run) | — | Password for the initial admin user (must pass password policy) |
| `BOOTSTRAP_API_KEY_NAME` | No | — | If set, creates an initial API key with this name (plaintext printed to stdout once) |
| `BOOTSTRAP_ADMIN_REDIRECT_URI` | No | `http://localhost:3000/callback` | Redirect URI for the bootstrap `porta-admin-client` OIDC client. Set to your admin tool's callback URL in production |

**Bootstrap flow:**
```
npm run migrate           # 1. Apply database migrations
npm run bootstrap         # 2. Create seed data
npm start                 # 3. Start the application
```

**Protected entities:** The system organization (`porta-system`) and admin application (`porta-admin`) are flagged as `system: true` in their records. The Admin API DELETE endpoints reject deletion of system entities with HTTP 422 and a descriptive error message.

**Post-bootstrap admin access:**
- The initial admin user can log in via the OIDC flow (authorize against the `porta-admin` application) to obtain an admin JWT
- Alternatively, if `BOOTSTRAP_API_KEY_NAME` was set, the printed API key can be used immediately with the `X-API-Key` header
- The bootstrap OIDC client (`porta-admin-client`) allows admin users to authenticate via the standard OIDC Authorization Code flow against the `porta-admin` application
- Additional admin users are created by inviting them to the `porta-system` organization for the `porta-admin` application with appropriate roles

---

## Database Migrations

- **Tool:** `node-pg-migrate` (SQL-based, no ORM)
- **Location:** `migrations/` directory
- **Naming:** `{timestamp}_{description}.sql` (e.g., `20260407120000_create-users.sql`)
- **Execution:** Separate CLI command (`npm run migrate`), NOT at app startup
- **Rollback:** Each migration has an `up` and `down` section
- **CI/CD:** Migrations run as a separate step before deploying the new application version
- **Development:** `docker compose up` starts PostgreSQL; `npm run migrate` applies pending migrations

---

## Redis Key Strategy

- **Key prefix:** `porta:` (all keys prefixed to avoid collisions in shared Redis instances)
- **Key pattern:** `porta:{model}:{id}` (e.g., `porta:AccessToken:abc123`, `porta:Session:xyz789`)
- **TTL alignment:** Redis key TTL matches the token/session lifetime from [SECURITY.md Token & Session Lifetimes](./SECURITY.md#token--session-lifetimes)
- **Eviction policy:** `volatile-ttl` (evict keys with shortest TTL first; only affects keys with expiry set)
- **No persistence:** Redis configured with `save ""` (no RDB/AOF); all persistent data lives in PostgreSQL
- **Models stored in Redis:** AccessToken, AuthorizationCode, DeviceCode, Session, Interaction, ReplayDetection
- **Models stored in PostgreSQL:** RefreshToken, Grant, ClientCredentials (via `oidc_models` table)
- **Model name reference:** See [DATA-MODEL.md §oidc_models Model Names](./DATA-MODEL.md#oidc_models-model-names) for the full list

---

## Stale Data Cleanup

> Multiple tables accumulate expired data that must be periodically cleaned up to prevent unbounded growth.

**Mechanism:** An in-process interval timer runs cleanup queries. The timer uses `pg_try_advisory_lock` to ensure only one instance runs cleanup in multi-instance deployments (same pattern as signing key rotation).

**Cleanup schedule: every hour**

| Table | Condition | Action | Notes |
|-------|-----------|--------|-------|
| `oidc_models` | `expires_at < now()` | DELETE | Expired tokens, codes, sessions |
| `magic_links` | `expires_at < now() AND used_at IS NULL` | DELETE | Expired unused magic links |
| `magic_links` | `used_at IS NOT NULL AND created_at < now() - interval '7 days'` | DELETE | Used magic links older than 7 days |
| `email_verification_tokens` | `expires_at < now()` | DELETE | Expired verification tokens |
| `password_reset_tokens` | `expires_at < now()` | DELETE | Expired reset tokens |
| `invitations` | `status = 'pending' AND expires_at < now()` | UPDATE status → `'expired'` | Mark expired invitations (don't delete — preserve history) |
| `signing_keys` | `status = 'retired' AND created_at < now() - interval '1 year'` | DELETE | Retired keys older than 1 year |

**Audit log cleanup** is handled separately by the retention policy (AUDIT-06, Phase 2). In MVP, audit logs grow indefinitely.

---

## Environment Variables Reference

> Complete list of all environment variables. Required variables have no default.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| **Server** | | | |
| `NODE_ENV` | No | `development` | `production`, `development`, `test` |
| `PORT` | No | `3000` | HTTP listen port |
| `ISSUER` | **Yes** | — | OIDC issuer URL (e.g., `https://auth.example.com`) |
| `TRUST_PROXY` | No | `false` | Trust X-Forwarded-* headers (set `true` behind reverse proxy) |
| **Database** | | | |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `DATABASE_POOL_MAX` | No | `20` | Max connections in pool |
| **Redis** | | | |
| `REDIS_URL` | **Yes** | — | Redis connection string |
| **Security** | | | |
| `KEY_ENCRYPTION_KEY` | **Yes** | — | 32-byte hex key for AES-256-GCM signing key encryption |
| `COOKIE_SECRETS` | **Yes** | — | Comma-separated cookie signing secrets (first is active) |
| **SMTP** | | | |
| `SMTP_HOST` | **Yes** | — | SMTP server hostname |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_USER` | **Yes** | — | SMTP username |
| `SMTP_PASS` | **Yes** | — | SMTP password |
| `SMTP_FROM` | **Yes** | — | Sender email (e.g., `Porta <noreply@example.com>`) |
| **Token Lifetimes** | | | |
| `ACCESS_TOKEN_TTL` | No | `3600` | Access token TTL in seconds |
| `ID_TOKEN_TTL` | No | `3600` | ID token TTL in seconds |
| `REFRESH_TOKEN_TTL` | No | `2592000` | Refresh token TTL in seconds (30 days) |
| `SESSION_TTL` | No | `1209600` | Session TTL in seconds (14 days) |
| `INTERACTION_TTL` | No | `600` | Interaction TTL in seconds (10 min) |
| `MAGIC_LINK_TTL` | No | `900` | Magic link TTL in seconds (15 min) |
| `INVITATION_TTL` | No | `259200` | Default invitation TTL in seconds (72 hours) |
| `PASSWORD_RESET_TTL` | No | `3600` | Password reset TTL in seconds (1 hour) |
| `EMAIL_VERIFY_TTL` | No | `86400` | Email verification TTL in seconds (24 hours) |
| `KEY_ROTATION_OVERLAP` | No | `86400` | Signing key overlap in seconds (24 hours) |
| **i18n** | | | |
| `DEFAULT_LOCALE` | No | `en` | Default language fallback |
| **Features** | | | |
| `SELF_REGISTRATION_ENABLED` | No | `false` | Enable self-service registration (Phase 2) |
| `HIBP_ENABLED` | No | `false` | Enable HaveIBeenPwned breach check (Phase 2) |
| `LOG_LEVEL` | No | `info` | Log level: `debug`, `info`, `warn`, `error` |
| **Signing Keys** | | | |
| `SIGNING_ALGORITHM` | No | `RS256` | Signing algorithm: `RS256` or `ES256` |
| `KEY_ROTATION_INTERVAL` | No | `7776000` | Signing key rotation interval in seconds (90 days) |
| **Bootstrap** | | | |
| `BOOTSTRAP_ADMIN_EMAIL` | **Yes** (first run) | — | Email for the initial admin user |
| `BOOTSTRAP_ADMIN_PASSWORD` | **Yes** (first run) | — | Password for the initial admin user |
| `BOOTSTRAP_API_KEY_NAME` | No | — | If set, creates an initial API key (plaintext printed to stdout) |
| `BOOTSTRAP_ADMIN_REDIRECT_URI` | No | `http://localhost:3000/callback` | Redirect URI for the bootstrap porta-admin OIDC client |
