# Configuration Reference

> **Last Updated**: 2026-09-17

## Overview

Porta separates external startup configuration from a closed database-backed operational catalog.
Environment variables are validated at startup using a **Zod schema** (`packages/server/src/config/schema.ts`).
If any required variable is missing or invalid, the process exits immediately with a clear error
message (fail-fast principle). PostgreSQL stores operational native values; code owns their metadata.

Configuration is loaded via `packages/server/src/config/index.ts`, which reads from `process.env` (with `.env` file support via dotenv in development).

## Environment Variables

### Server

| Variable           | Type                                              | Default       | Required | Description                                                                                                        |
| ------------------ | ------------------------------------------------- | ------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`         | `development` \| `test` \| `production`           | `development` | No       | Runtime environment mode                                                                                           |
| `PORT`             | Integer                                           | `3000`        | No       | HTTP server listen port                                                                                            |
| `HOST`             | String                                            | `0.0.0.0`     | No       | HTTP server bind address                                                                                           |
| `TRUST_PROXY`      | Boolean                                           | `true`        | No       | Trust `X-Forwarded-*` headers from reverse proxy; set `false` for direct exposure                                  |
| `TRUST_PROXY_HOPS` | Integer                                           | `1`           | No       | Trusted proxy hops that append to `X-Forwarded-For`; the resolved client IP used for rate-limit and audit identity |
| `LOG_LEVEL`        | `debug` \| `info` \| `warn` \| `error` \| `fatal` | `info`        | No       | Pino log level                                                                                                     |

### Database

| Variable       | Type         | Default | Required | Description                  |
| -------------- | ------------ | ------- | -------- | ---------------------------- |
| `DATABASE_URL` | String (URL) | —       | **Yes**  | PostgreSQL connection string |

**Format**: `postgresql://user:password@host:port/database`

**Example**: `postgresql://porta:porta@localhost:5432/porta`

### Redis

| Variable    | Type         | Default | Required | Description             |
| ----------- | ------------ | ------- | -------- | ----------------------- |
| `REDIS_URL` | String (URL) | —       | **Yes**  | Redis connection string |

**Format**: `redis://[user:password@]host:port[/db]`

**Examples**: `redis://localhost:6379`, `redis://:secret@redis:6379/0`

### OIDC

| Variable          | Type                     | Default | Required | Description                                                                                                                                                                                                         |
| ----------------- | ------------------------ | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ISSUER_BASE_URL` | String (URL)             | —       | **Yes**  | Base URL for OIDC issuer. Must include protocol. Used to construct org-specific issuer URLs: `{ISSUER_BASE_URL}/{orgSlug}`                                                                                          |
| `COOKIE_KEYS`     | String (comma-separated) | —       | **Yes**  | Cookie signing keys for OIDC sessions and source keys for privacy-safe security-decision references. First key is active; subsequent keys verify retained cookies/references only. Each key must be ≥ 16 characters |

**COOKIE_KEYS format**: Comma-separated list of secrets. For rotation, add a new key at the beginning:

```bash
# Single key
COOKIE_KEYS=my-secret-key-at-least-16-chars

# Key rotation (new key first, old key still valid for verification)
COOKIE_KEYS=new-key-at-least-16-chars,old-key-still-valid
```

Security-decision references derive separate HMAC-SHA-256 keys from this ring with HKDF-SHA-256.
Keep the prior key in the ring for as long as operators need to verify references created before a
rotation; removing it deliberately ends that verification window.

### SMTP (Email)

| Variable    | Type    | Default | Required | Description                              |
| ----------- | ------- | ------- | -------- | ---------------------------------------- |
| `SMTP_HOST` | String  | —       | **Yes**  | SMTP server hostname                     |
| `SMTP_PORT` | Integer | `587`   | No       | SMTP server port                         |
| `SMTP_USER` | String  | —       | No       | SMTP authentication username             |
| `SMTP_PASS` | String  | —       | No       | SMTP authentication password             |
| `SMTP_FROM` | String  | —       | **Yes**  | Sender email address for outgoing emails |

### Encryption Keys

| Variable                     | Type                  | Default | Required      | Description                                                                                                                             |
| ---------------------------- | --------------------- | ------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `SIGNING_KEY_ENCRYPTION_KEY` | String (64 hex chars) | —       | **Yes**       | AES-256-GCM key for encrypting ES256 signing key private keys at rest. Must be exactly 64 hex characters (32 bytes)                     |
| `TWO_FACTOR_ENCRYPTION_KEY`  | String (64 hex chars) | —       | **Prod: Yes** | AES-256-GCM key for encrypting TOTP secrets. Must be exactly 64 hex characters (32 bytes). Optional in dev/test; required in production |

**Generate encryption keys**:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# or
openssl rand -hex 32
```

### Admin API

| Variable             | Type                          | Default                 | Required | Description                                                                                        |
| -------------------- | ----------------------------- | ----------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `ADMIN_CORS_ORIGINS` | String (comma-separated URLs) | `""` (empty = deny all) | No       | Allowed CORS origins for `/api/admin/*`. Only needed for web admin dashboards on different origins |

### Monitoring

| Variable          | Type    | Default | Required | Description                                                                                                   |
| ----------------- | ------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `METRICS_ENABLED` | Boolean | `false` | No       | Enable Prometheus metrics at `GET /metrics`. Endpoint is unauthenticated — restrict access via network policy |

### Test Environment

These variables are used by the test suites (integration, e2e, pentest):

| Variable            | Type         | Default | Required  | Description                                |
| ------------------- | ------------ | ------- | --------- | ------------------------------------------ |
| `TEST_DATABASE_URL` | String (URL) | —       | For tests | Separate test database connection          |
| `TEST_REDIS_URL`    | String (URL) | —       | For tests | Separate Redis DB index for test isolation |
| `TEST_SMTP_HOST`    | String       | —       | For tests | Test SMTP host (MailHog)                   |
| `TEST_SMTP_PORT`    | Integer      | —       | For tests | Test SMTP port                             |
| `TEST_MAILHOG_URL`  | String (URL) | —       | For tests | MailHog API URL for test assertions        |

### Internal / Escape Hatch

| Variable                 | Type    | Default | Required | Description                                                                                                                            |
| ------------------------ | ------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `PORTA_SKIP_PROD_SAFETY` | Boolean | `false` | No       | **Emergency only**: Skip production safety checks. Logs an ERROR when used. For incident response only — never set in normal operation |

## Production Safety Checks

When `NODE_ENV=production`, Porta enforces additional validation rules via Zod's `superRefine`. These prevent deploying with development placeholder values:

| Rule | Check                                               | Error                          |
| ---- | --------------------------------------------------- | ------------------------------ |
| R1   | `COOKIE_KEYS` contains no `change-me` patterns      | Rejects dev placeholders       |
| R2   | Each cookie key ≥ 32 characters                     | Ensures sufficient entropy     |
| R3   | `TWO_FACTOR_ENCRYPTION_KEY` is present              | Required for 2FA in production |
| R4   | `TWO_FACTOR_ENCRYPTION_KEY` ≠ dev placeholder       | Rejects `0123456789abcdef...`  |
| R5   | `SIGNING_KEY_ENCRYPTION_KEY` ≠ dev placeholder      | Rejects `fedcba9876543210...`  |
| R6   | `DATABASE_URL` doesn't contain `porta_dev` password | Rejects dev credentials        |
| R7   | `ISSUER_BASE_URL` uses HTTPS (unless localhost)     | Enforces TLS in production     |
| R8   | `LOG_LEVEL` is not `debug`                          | Prevents verbose logging       |
| R9   | `SMTP_HOST` is not `localhost`/`127.x.x.x`          | Rejects dev MailHog            |

## System Config (Runtime)

Global operational policy lives in the `system_config` PostgreSQL table. The server-owned
catalog in `packages/server/src/lib/system-config-catalog.ts` defines exactly 18 supported keys,
native JSONB values, integer bounds, supported locales and application modes. Bootstrap settings,
infrastructure addresses and root secrets remain environment-owned. Internal bootstrap identity
rows use a separate native-string reader and are not operational policy.

Runtime readers validate stored values without coercion. Missing, invalid or unavailable values
use their exact catalog defaults and emit only a catalog key and fixed fallback reason. Found rows
are cached process-locally for 60 seconds; missing rows and storage failures are not cached.
Explicit clearing replaces the cache map so a read started before clearing cannot restore stale
policy in the active cache. The administrative API is a separate authoritative boundary and must
not present runtime fallbacks as stored values.

System config is managed via:

- **CLI**: `porta config list/get/set`
- **API**: `GET/PUT /api/admin/config`
- **Embedded Admin UI**: **System Configuration…** with four maximized Layout DSL tabs and one
  persistent Save/Cancel footer, using exact read/update capabilities and one changed-key batch.

Keys cannot be created, renamed or deleted through these surfaces. The API returns authoritative
entries only: missing/corrupt/unavailable storage uses fixed `503 config_store_unavailable` with a
request ID, not runtime defaults. Unknown/internal/external names share `404 config_entry_not_found`;
invalid native inputs share `400 config_value_invalid`. Single bodies are exactly `{ value }`, batch
bodies exactly non-empty `{ values }`. One existing transaction updates targets and writes one
`admin.config.updated` audit record containing keys and restart status, never values. No upsert or
automatic mutation retry is added. See [the API design](../architecture/api-design.md#global-operational-configuration).

After a successful save commits, the local process cache is cleared; subsequent runtime reads see
the saved policy immediately. Other healthy server instances pick up runtime changes on their next
read within the existing at-most-60-second cache lifetime. Cache expiration is read-driven, not a
background task. There is no broadcast invalidation, polling worker or automatic server restart.

### System Config Keys

| Key                                | Default   | Inclusive range / choices | Unit     | Application mode   |
| ---------------------------------- | --------- | ------------------------- | -------- | ------------------ |
| `access_token_ttl`                 | `3600`    | `60..86400`               | seconds  | `restart-required` |
| `id_token_ttl`                     | `3600`    | `60..86400`               | seconds  | `restart-required` |
| `refresh_token_ttl`                | `2592000` | `300..31536000`           | seconds  | `restart-required` |
| `authorization_code_ttl`           | `600`     | `30..3600`                | seconds  | `restart-required` |
| `session_ttl`                      | `86400`   | `300..2592000`            | seconds  | `restart-required` |
| `magic_link_ttl`                   | `900`     | `60..3600`                | seconds  | `runtime`          |
| `password_reset_ttl`               | `3600`    | `300..86400`              | seconds  | `runtime`          |
| `invitation_ttl`                   | `604800`  | `300..2592000`            | seconds  | `runtime`          |
| `rate_limit_login_max`             | `10`      | `1..100`                  | attempts | `runtime`          |
| `rate_limit_login_window`          | `900`     | `60..86400`               | seconds  | `runtime`          |
| `rate_limit_magic_link_max`        | `5`       | `1..100`                  | attempts | `runtime`          |
| `rate_limit_magic_link_window`     | `900`     | `60..86400`               | seconds  | `runtime`          |
| `rate_limit_password_reset_max`    | `5`       | `1..100`                  | attempts | `runtime`          |
| `rate_limit_password_reset_window` | `900`     | `60..86400`               | seconds  | `runtime`          |
| `max_failed_logins`                | `5`       | `1..100`                  | attempts | `runtime`          |
| `lockout_duration_seconds`         | `900`     | `60..604800`              | seconds  | `runtime`          |
| `audit_retention_days`             | `90`      | `1..3650`                 | days     | `runtime`          |
| `default_locale`                   | `en`      | `en only`                 | locale   | `runtime`          |

The first five lifetimes are loaded at provider startup; changes require restarting every server
instance. Interaction lifetime remains fixed at 3600 seconds and grant lifetime follows refresh
token lifetime. Runtime policy is read at its existing decision point. Absolute artifact expiries
and existing Redis counter expiries are not rewritten. Queued recovery work reads its current
lifetime when creating the artifact; lockout eligibility uses the current duration with the
existing lock timestamp.

Migration `030_global_configuration_catalog.sql` overwrites the 18 canonical rows with native
defaults, deletes seven obsolete public keys and preserves internal rows. Down is intentionally a
no-op; development reset uses `yarn admin:env reset` rather than restoring retired public values.

## Example `.env` File

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
ISSUER_BASE_URL=https://porta.local:3443
COOKIE_KEYS=dev-cookie-key-change-me-in-production

# Email (MailHog for dev)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@porta.local

# Logging
LOG_LEVEL=debug

# Reverse proxy
TRUST_PROXY=true
# Set to the exact number of trusted proxies when TRUST_PROXY=true.
TRUST_PROXY_HOPS=1

# Encryption keys (dev placeholders — replace in production!)
TWO_FACTOR_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
SIGNING_KEY_ENCRYPTION_KEY=fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210

# Metrics (disabled by default)
METRICS_ENABLED=false
```

## Config Loading Flow

```mermaid
graph LR
    ENV[".env file + process.env"] --> DOTENV[dotenv.config]
    DOTENV --> MAP[Map env vars to schema fields]
    MAP --> ZOD[Zod schema.parse]
    ZOD -->|Valid| CONFIG[Frozen AppConfig object]
    ZOD -->|Invalid| EXIT[process.exit 1 with error details]
```

1. `dotenv` loads `.env` file (if present)
2. Environment variables are mapped to the Zod schema field names
3. Zod validates types, formats, and defaults
4. In production, `superRefine` runs safety checks
5. Valid config is frozen and exported as a singleton
6. Invalid config triggers immediate process exit

## Related Documentation

- [Getting Started](../guides/getting-started.md) — Initial setup with environment configuration
- [Deployment](../guides/deployment.md) — Production configuration checklist
- [Security](../architecture/security.md) — Security implications of configuration
- [Environment Variables Guide](../../docs/guide/environment.md) — Product documentation for operators
