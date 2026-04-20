# Porta — Multi-tenant OIDC Provider

[![CI](https://github.com/blendsdk/porta-identity/actions/workflows/ci.yml/badge.svg)](https://github.com/blendsdk/porta-identity/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/blendsdk/porta-identity)](https://github.com/blendsdk/porta-identity/blob/main/LICENSE)

Multi-tenant OpenID Connect provider built on [node-oidc-provider](https://github.com/panva/node-oidc-provider) + Koa + TypeScript. Provides organization-scoped authentication, user management, RBAC, custom claims, two-factor authentication, and a comprehensive admin CLI.

> ⚠️ **Beta Software** — Porta is under active development. APIs, configuration, and database schemas may change between versions. Not recommended for production use yet.

Porta requires **PostgreSQL** and **Redis** as companion services. The fastest way to get started is with Docker Compose.

---

## Quick Start

Get Porta running in under 5 minutes. No git clone required — just create two files and run.

### 1. Create `docker-compose.yml`

Create a file called `docker-compose.yml` with the following content:

```yaml
services:
  # ── Porta OIDC Provider ─────────────────────
  porta:
    image: blendsdk/porta:latest
    container_name: porta-app
    restart: unless-stopped
    ports:
      - "${PORT:-3000}:3000"
    env_file:
      - .env
    environment:
      DATABASE_URL: postgresql://porta:${POSTGRES_PASSWORD:-porta_secret}@postgres:5432/porta
      REDIS_URL: redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      start_period: 30s
      retries: 3

  # ── PostgreSQL 16 ───────────────────────────
  postgres:
    image: postgres:16-alpine
    container_name: porta-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: porta
      POSTGRES_USER: porta
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-porta_secret}
    volumes:
      - porta_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U porta"]
      interval: 5s
      timeout: 5s
      retries: 5

  # ── Redis 7 ─────────────────────────────────
  redis:
    image: redis:7-alpine
    container_name: porta-redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  porta_pgdata:
    driver: local
```

### 2. Create `.env`

Create a `.env` file in the same directory:

```env
# Server
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database password (used by both Porta and PostgreSQL)
POSTGRES_PASSWORD=porta_secret

# OIDC issuer — change to your public-facing URL
ISSUER_BASE_URL=http://localhost:3000

# Cookie signing key — CHANGE THIS in production!
COOKIE_KEYS=CHANGE-ME-to-a-random-string-at-least-32-chars

# Email (configure SMTP for magic links, invitations, password reset)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@porta.local

# Logging
LOG_LEVEL=info

# Two-Factor Authentication — CHANGE THIS in production!
TWO_FACTOR_ENCRYPTION_KEY=CHANGE-ME-generate-a-64-char-hex-string

# Auto-run database migrations on startup (set to "false" after initial setup)
PORTA_AUTO_MIGRATE=true
```

### 3. Start services

```bash
docker compose up -d
```

This starts Porta, PostgreSQL, and Redis. The entrypoint automatically waits for the database and Redis to be ready, then runs migrations (when `PORTA_AUTO_MIGRATE=true`).

### 4. Verify health

Wait a few seconds for startup, then check:

```bash
curl http://localhost:3000/health
```

You should see:

```json
{"status":"ok","checks":{"database":"ok","redis":"ok"}}
```

### 5. Bootstrap the admin system

```bash
docker exec -it porta-app node dist/cli/index.js init
```

This interactive command creates:
- The super-admin organization
- The admin application with RBAC permissions
- A PKCE client for CLI authentication
- Your first admin user (you'll be prompted for email, name, and password)

Or run it non-interactively:

```bash
docker exec porta-app node dist/cli/index.js init \
  --email admin@example.com \
  --given-name Admin \
  --family-name User \
  --password 'YourSecurePassword123!'
```

### 6. You're done! 🎉

Porta is running at [http://localhost:3000](http://localhost:3000). The OIDC discovery endpoint is available at `http://localhost:3000/{org-slug}/.well-known/openid-configuration`.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Runtime mode |
| `PORT` | `3000` | HTTP server port |
| `HOST` | `0.0.0.0` | HTTP listen address |
| `DATABASE_URL` | — | PostgreSQL connection string (set in compose) |
| `REDIS_URL` | — | Redis connection string (set in compose) |
| `ISSUER_BASE_URL` | — | **Required.** Public URL of your Porta instance |
| `COOKIE_KEYS` | — | **Required.** Cookie signing key (≥32 random chars) |
| `TWO_FACTOR_ENCRYPTION_KEY` | — | **Required.** AES-256-GCM key (64 hex chars) |
| `SMTP_HOST` | — | SMTP relay hostname |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_FROM` | — | Sender email address |
| `LOG_LEVEL` | `info` | Log verbosity (`debug`, `info`, `warn`, `error`) |
| `PORTA_AUTO_MIGRATE` | `false` | Auto-run DB migrations on startup |
| `PORTA_WAIT_TIMEOUT` | `60` | Seconds to wait for DB/Redis at startup |

### Generating Production Secrets

```bash
# Cookie signing key (random 64-char string)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# Two-factor encryption key (64 hex chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Database password
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

---

## Stopping & Cleanup

```bash
# Stop all services (preserves data)
docker compose down

# Stop and remove all data (fresh start)
docker compose down -v
```

---

## Features

- **Multi-Tenant OIDC** — Path-based tenancy with per-org OIDC endpoints
- **User Management** — CRUD, status lifecycle, password policies (NIST SP 800-63B)
- **RBAC** — Roles, permissions, and user-role mappings per application
- **Custom Claims** — Type-validated custom claim definitions and user values
- **Two-Factor Auth** — Email OTP, TOTP (authenticator apps), recovery codes
- **Login Methods** — Per-org and per-client configurable (password, magic link)
- **Admin CLI** — 14+ commands for managing orgs, apps, clients, users, roles
- **Admin API** — JWT-authenticated REST API for all admin operations
- **ES256 Signing** — ECDSA P-256 keys, auto-bootstrapped, stored in database
- **Audit Logging** — Comprehensive event logging for security and compliance

---

## Documentation & Links

| | |
|---|---|
| 📖 [Full Documentation](https://blendsdk.github.io/porta-identity/) | Guides, API reference, CLI docs |
| 💻 [GitHub Repository](https://github.com/blendsdk/porta-identity) | Source code and issue tracker |
| 🚀 [Quick Start Guide](https://blendsdk.github.io/porta-identity/guide/quickstart) | Detailed setup instructions |
| 📋 [Admin API Reference](https://blendsdk.github.io/porta-identity/api/overview) | REST API for admin operations |
| 💻 [CLI Reference](https://blendsdk.github.io/porta-identity/cli/overview) | Command-line admin tool |
| 🏗️ [Architecture](https://blendsdk.github.io/porta-identity/guide/architecture) | Design and architecture overview |
| 🚢 [Deployment Guide](https://blendsdk.github.io/porta-identity/guide/deployment) | Production deployment guidance |
