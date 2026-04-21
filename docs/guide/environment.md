# Environment Variables

Complete reference for all environment variables used to configure Porta.

See also: [Quick Start](./quickstart.md) for minimal setup, [Deployment Guide](./deployment.md) for production guidance.

## Server

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `NODE_ENV` | `development` | No | Runtime mode (`development`, `production`, `test`). Controls log format, cookie defaults, and other behavior. |
| `PORT` | `3000` | No | HTTP listen port. |
| `HOST` | `0.0.0.0` | No | HTTP listen address. Use `127.0.0.1` to restrict to localhost. |

## Database & Cache

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DATABASE_URL` | — | **Yes** | PostgreSQL connection string. Example: `postgresql://porta:secret@localhost:5432/porta` |
| `REDIS_URL` | — | **Yes** | Redis connection string. Example: `redis://localhost:6379` |

## OIDC

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `ISSUER_BASE_URL` | — | **Yes** | The public-facing URL of your Porta instance. Must match the URL users see in their browser (e.g., `https://auth.example.com`). OIDC tokens embed this as the `iss` claim — clients validate it, so it must be correct. |
| `COOKIE_KEYS` | — | **Yes** | Cookie signing key(s). Must be at least 32 random characters. For key rotation, use comma-separated values with the newest key first (e.g., `new-key,old-key`). See [Cookie Key Rotation](./deployment.md#cookie-key-rotation). |

## Email (SMTP)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `SMTP_HOST` | — | **Yes** (prod) | SMTP relay hostname. Use `localhost` with MailHog for development. |
| `SMTP_PORT` | `587` | No | SMTP port. Common values: `587` (STARTTLS), `465` (implicit TLS), `25` (unencrypted), `1025` (MailHog). |
| `SMTP_USER` | — | No | SMTP authentication username. Leave empty for MailHog. |
| `SMTP_PASS` | — | No | SMTP authentication password. Leave empty for MailHog. |
| `SMTP_FROM` | `noreply@porta.local` | No | Sender email address for magic links, password resets, and invitations. |

## Logging

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `LOG_LEVEL` | `info` (prod), `debug` (dev) | No | Log verbosity. Values: `debug`, `info`, `warn`, `error`, `silent`. |

Porta uses [pino](https://github.com/pinojs/pino) for structured logging:

| `NODE_ENV` | Format | Behavior |
|------------|--------|----------|
| `development` | Pretty-printed (pino-pretty) | Human-readable, colorized |
| `production` | JSON (one line per entry) | Machine-parseable for log aggregators |
| `test` | Silent | No log output |

## Reverse Proxy

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `TRUST_PROXY` | `false` | **Yes** (behind proxy) | Set to `true` when Porta runs behind a TLS-terminating reverse proxy (nginx, Traefik, Caddy, cloud load balancer, etc.). |

### Why `TRUST_PROXY` Matters

Porta sets the `Secure` flag on authentication cookies based on the actual connection
protocol (`ctx.secure` in Koa). In a typical production setup, a reverse proxy terminates
TLS and forwards requests to Porta over plain HTTP:

```
Browser ──HTTPS──▶ Reverse Proxy ──HTTP──▶ Porta (port 3000)
```

Without `TRUST_PROXY=true`, Porta sees only the internal HTTP connection and sets cookies
**without** the `Secure` flag. Modern browsers then silently drop these cookies on HTTPS
pages, causing **OIDC login flows to fail** — the interaction session is lost between
redirects.

When `TRUST_PROXY=true`, Koa reads the `X-Forwarded-Proto` header from the proxy to
determine the original protocol. This makes `ctx.secure` return `true` when the browser
connected via HTTPS, so cookies are correctly flagged as `Secure`.

**Affected features:**
- CSRF tokens (login forms)
- OIDC interaction sessions (login/consent)
- Magic link sessions

::: danger Do Not Enable Without a Proxy
Only set `TRUST_PROXY=true` when Porta is actually behind a trusted reverse proxy.
Enabling it without a proxy allows clients to spoof `X-Forwarded-*` headers.
:::

### Common Scenarios

| Setup | `TRUST_PROXY` | Notes |
|-------|---------------|-------|
| Direct HTTP (dev/eval) | `false` | Default — cookies use `Secure: false` |
| Behind nginx/Traefik/Caddy with TLS | `true` | Proxy must send `X-Forwarded-Proto: https` |
| Behind a cloud load balancer (AWS ALB, GCP LB) | `true` | Cloud LBs typically set `X-Forwarded-Proto` |
| Direct HTTPS (TLS on Porta itself) | `false` | Porta sees TLS directly — no proxy headers needed |

## Security

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `TWO_FACTOR_ENCRYPTION_KEY` | — | **Yes** (prod) | AES-256-GCM key for encrypting TOTP secrets. Must be exactly 64 hex characters (32 bytes). Optional in development/test. |

### Generating Secrets

```bash
# Cookie signing key (random 64-char string)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# Two-factor encryption key (64 hex chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Database password
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

## Startup Behavior

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORTA_AUTO_MIGRATE` | `false` | No | When `true`, the Docker entrypoint runs database migrations automatically before starting the server. Convenient for initial setup; disable in production after the schema is stable. |
| `PORTA_WAIT_TIMEOUT` | `60` | No | Maximum seconds the Docker entrypoint waits for PostgreSQL and Redis to become available before exiting. |

## Test Environment

These variables are used by the test suite and should not be set in production.

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_DATABASE_URL` | — | PostgreSQL connection string for the test database, keeping test data isolated from development data. |
| `TEST_REDIS_URL` | — | Redis connection string (typically a different DB index) for test isolation. |

## Example `.env` Files

Porta ships with two example files:

- **`.env.example`** — Development defaults (local PostgreSQL, Redis, MailHog)
- **`.env.docker`** — Docker Compose defaults (service hostnames, production mode)

Copy the appropriate file and customize:

```bash
# For local development
cp .env.example .env

# For Docker Compose
cp .env.docker .env.docker.local
```
