# Configuration Reference

> **Last Updated**: 2026-04-25

## Overview

Porta's configuration is managed through environment variables, validated at startup using a **Zod schema** (`src/config/schema.ts`). If any required variable is missing or invalid, the process exits immediately with a clear error message (fail-fast principle).

Configuration is loaded via `src/config/index.ts`, which reads from `process.env` (with `.env` file support via dotenv in development).

## Environment Variables

### Server

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `NODE_ENV` | `development` \| `test` \| `production` | `development` | No | Runtime environment mode |
| `PORT` | Integer | `3000` | No | HTTP server listen port |
| `HOST` | String | `0.0.0.0` | No | HTTP server bind address |
| `TRUST_PROXY` | Boolean | `false` | No | Trust `X-Forwarded-*` headers from reverse proxy |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` \| `fatal` | `info` | No | Pino log level |

### Database

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `DATABASE_URL` | String (URL) | — | **Yes** | PostgreSQL connection string |

**Format**: `postgresql://user:password@host:port/database`

**Example**: `postgresql://porta:porta@localhost:5432/porta`

### Redis

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `REDIS_URL` | String (URL) | — | **Yes** | Redis connection string |

**Format**: `redis://[password@]host:port[/db]`

**Example**: `redis://localhost:6379`

### OIDC

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `ISSUER_BASE_URL` | String (URL) | — | **Yes** | Base URL for OIDC issuer. Must include protocol. Used to construct org-specific issuer URLs: `{ISSUER_BASE_URL}/{orgSlug}` |
| `COOKIE_KEYS` | String (comma-separated) | — | **Yes** | Cookie signing keys for OIDC sessions. First key signs; subsequent keys verify only (supports key rotation). Each key must be ≥ 16 characters |

**COOKIE_KEYS format**: Comma-separated list of secrets. For rotation, add a new key at the beginning:

```bash
# Single key
COOKIE_KEYS=my-secret-key-at-least-16-chars

# Key rotation (new key first, old key still valid for verification)
COOKIE_KEYS=new-key-at-least-16-chars,old-key-still-valid
```

### SMTP (Email)

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SMTP_HOST` | String | — | **Yes** | SMTP server hostname |
| `SMTP_PORT` | Integer | `587` | No | SMTP server port |
| `SMTP_USER` | String | — | No | SMTP authentication username |
| `SMTP_PASS` | String | — | No | SMTP authentication password |
| `SMTP_FROM` | String | — | **Yes** | Sender email address for outgoing emails |

### Encryption Keys

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SIGNING_KEY_ENCRYPTION_KEY` | String (64 hex chars) | — | **Yes** | AES-256-GCM key for encrypting ES256 signing key private keys at rest. Must be exactly 64 hex characters (32 bytes) |
| `TWO_FACTOR_ENCRYPTION_KEY` | String (64 hex chars) | — | **Prod: Yes** | AES-256-GCM key for encrypting TOTP secrets. Must be exactly 64 hex characters (32 bytes). Optional in dev/test; required in production |

**Generate encryption keys**:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# or
openssl rand -hex 32
```

### Admin API

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `ADMIN_CORS_ORIGINS` | String (comma-separated URLs) | `""` (empty = deny all) | No | Allowed CORS origins for `/api/admin/*`. Only needed for web admin dashboards on different origins |

### Monitoring

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `METRICS_ENABLED` | Boolean | `false` | No | Enable Prometheus metrics at `GET /metrics`. Endpoint is unauthenticated — restrict access via network policy |

### Test Environment

These variables are used by the test suites (integration, e2e, pentest):

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `TEST_DATABASE_URL` | String (URL) | — | For tests | Separate test database connection |
| `TEST_REDIS_URL` | String (URL) | — | For tests | Separate Redis DB index for test isolation |
| `TEST_SMTP_HOST` | String | — | For tests | Test SMTP host (MailHog) |
| `TEST_SMTP_PORT` | Integer | — | For tests | Test SMTP port |
| `TEST_MAILHOG_URL` | String (URL) | — | For tests | MailHog API URL for test assertions |

### Admin GUI (BFF)

These variables configure the Admin GUI BFF server (`admin-gui/`). They are separate from the main Porta server configuration.

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `PORTA_SERVICE` | `admin` | — | Yes (Docker) | Set to `admin` to start the BFF instead of the OIDC server |
| `PORTA_ADMIN_PORTA_URL` | String (URL) | — | **Yes** | Internal URL of the Porta server (e.g., `http://porta:3000` in Docker, `https://porta.local:3443` in dev) |
| `PORTA_ADMIN_CLIENT_ID` | String | — | **Yes** | OIDC client ID for the GUI confidential client (from `porta init` output) |
| `PORTA_ADMIN_CLIENT_SECRET` | String | — | **Yes** | OIDC client secret for the GUI confidential client |
| `PORTA_ADMIN_SESSION_SECRET` | String | — | **Yes** | Session encryption key (minimum 32 characters) |
| `PORTA_ADMIN_PORT` | Integer | `4002` | No | BFF listen port |
| `PORTA_ADMIN_PUBLIC_URL` | String (URL) | `http://localhost:4002` | No | Public URL for OIDC redirect URIs |
| `PORTA_ADMIN_ORG_SLUG` | String | Auto-detected | No | Super-admin org slug (auto-detected from Porta metadata if not set) |
| `REDIS_URL` | String (URL) | — | **Yes** | Redis URL for session storage (use DB 1: `redis://localhost:6379/1`) |
| `NODE_ENV` | String | `development` | No | Runtime environment |
| `LOG_LEVEL` | String | `info` | No | Pino log level |

**Session storage**: The BFF uses Redis DB index 1 (separate from Porta's DB index 0) for session persistence. Sessions are server-side only — the browser receives an opaque session cookie.

### Internal / Escape Hatch

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `PORTA_SKIP_PROD_SAFETY` | Boolean | `false` | No | **Emergency only**: Skip production safety checks. Logs an ERROR when used. For incident response only — never set in normal operation |

## Production Safety Checks

When `NODE_ENV=production`, Porta enforces additional validation rules via Zod's `superRefine`. These prevent deploying with development placeholder values:

| Rule | Check | Error |
|------|-------|-------|
| R1 | `COOKIE_KEYS` contains no `change-me` patterns | Rejects dev placeholders |
| R2 | Each cookie key ≥ 32 characters | Ensures sufficient entropy |
| R3 | `TWO_FACTOR_ENCRYPTION_KEY` is present | Required for 2FA in production |
| R4 | `TWO_FACTOR_ENCRYPTION_KEY` ≠ dev placeholder | Rejects `0123456789abcdef...` |
| R5 | `SIGNING_KEY_ENCRYPTION_KEY` ≠ dev placeholder | Rejects `fedcba9876543210...` |
| R6 | `DATABASE_URL` doesn't contain `porta_dev` password | Rejects dev credentials |
| R7 | `ISSUER_BASE_URL` uses HTTPS (unless localhost) | Enforces TLS in production |
| R8 | `LOG_LEVEL` is not `debug` | Prevents verbose logging |
| R9 | `SMTP_HOST` is not `localhost`/`127.x.x.x` | Rejects dev MailHog |

## System Config (Runtime)

In addition to environment variables, Porta reads runtime configuration from the `system_config` PostgreSQL table. These values are cached in-memory for 60 seconds (`src/lib/system-config.ts`).

System config is managed via:
- **CLI**: `porta config list/get/set`
- **API**: `GET/PUT /api/admin/config`

### System Config Keys

| Key | Type | Description |
|-----|------|-------------|
| `oidc.ttl.accessToken` | Number (seconds) | Access token TTL |
| `oidc.ttl.refreshToken` | Number (seconds) | Refresh token TTL |
| `oidc.ttl.idToken` | Number (seconds) | ID token TTL |
| `oidc.ttl.session` | Number (seconds) | OIDC session TTL |
| `oidc.ttl.interaction` | Number (seconds) | Interaction TTL |
| `oidc.ttl.authorizationCode` | Number (seconds) | Authorization code TTL |
| `oidc.ttl.grant` | Number (seconds) | Grant TTL |

These TTLs are loaded at startup and passed to the OIDC provider configuration.

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
TRUST_PROXY=false

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

- [Getting Started](/implementation-details/guides/getting-started) — Initial setup with environment configuration
- [Deployment](/implementation-details/guides/deployment) — Production configuration checklist
- [Security](/implementation-details/architecture/security) — Security implications of configuration
- [Environment Variables Guide](/guide/environment) — Product documentation for operators
