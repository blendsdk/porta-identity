# Getting Started — Developer Setup

> **Last Updated**: 2026-04-25

## Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Node.js | ≥ 22.0.0 | Runtime |
| Yarn | ≥ 1.22.0 (Classic) | Package manager (**not npm, not Berry**) |
| Docker & Docker Compose | Latest | PostgreSQL, Redis, MailHog |
| Git | Latest | Version control |

::: warning Yarn Classic Only
Porta uses Yarn Classic 1.22.x. Do **not** use npm, pnpm, or Yarn Berry. This is enforced via `.npmrc` (`engine-strict=true`).
:::

## Initial Setup

### 1. Clone the Repository

```bash
git clone git@github.com:blendsdk/porta-identity.git
cd porta-identity
```

### 2. Install Dependencies

```bash
yarn install
```

This installs all dependencies including native modules (argon2 requires Python 3 and a C++ compiler on your system).

### 3. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your local settings. The minimum required variables are:

```bash
# Database
DATABASE_URL=postgresql://porta:porta@localhost:5432/porta

# Redis
REDIS_URL=redis://localhost:6379

# OIDC
ISSUER_BASE_URL=http://localhost:3000

# Security (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
COOKIE_KEYS=your-random-hex-string-here
```

See the [Configuration Reference](/implementation-details/reference/configuration) for all environment variables.

### 4. Start Infrastructure Services

```bash
yarn docker:up
```

This starts PostgreSQL 16, Redis 7, and MailHog via Docker Compose.

| Service | URL | Credentials |
|---------|-----|-------------|
| PostgreSQL | `localhost:5432` | `porta:porta` / DB: `porta` |
| Redis | `localhost:6379` | No auth |
| MailHog SMTP | `localhost:1025` | No auth |
| MailHog UI | `http://localhost:8025` | Browser |

### 5. Run Migrations

```bash
yarn porta migrate up
```

This runs all 19 migrations to create the database schema.

### 6. Bootstrap Admin Infrastructure

```bash
yarn porta init
```

The `porta init` command creates:
- The super-admin organization
- The Porta admin application with RBAC roles and permissions
- A PKCE-enabled OIDC client for the CLI
- The first admin user (interactive prompts for email/password)

### 7. Start the Dev Server

```bash
yarn dev
```

The server starts at `http://localhost:3000` with hot-reload via `tsx watch`.

### 8. Verify Setup

Check the health endpoint:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "healthy",
  "checks": {
    "database": "ok",
    "redis": "ok"
  }
}
```

## First Login

After `porta init`, log in via the CLI:

```bash
yarn porta login
```

This opens a browser window for OIDC authentication. After logging in, credentials are stored at `~/.porta/credentials.json`.

Verify your identity:

```bash
yarn porta whoami
```

## Admin GUI Setup (Optional)

The Admin GUI is a separate application in `admin-gui/`. To set it up:

### 1. Install Admin GUI Dependencies

```bash
cd admin-gui
yarn install
cd ..
```

### 2. Configure Admin GUI Environment

```bash
cp admin-gui/.env.example admin-gui/.env
```

Edit `admin-gui/.env` with the client credentials from `porta init` output:

```bash
PORTA_ADMIN_PORTA_URL=http://localhost:3000
PORTA_ADMIN_CLIENT_ID=<gui-client-id-from-porta-init>
PORTA_ADMIN_CLIENT_SECRET=<gui-client-secret-from-porta-init>
PORTA_ADMIN_SESSION_SECRET=<generate-random-string-32chars>
REDIS_URL=redis://localhost:6379/1
```

### 3. Start the Admin GUI Dev Server

```bash
cd admin-gui
yarn dev
```

The Admin GUI is available at `http://localhost:4002`. It authenticates via magic link through the Porta server.

## Project Layout Quick Reference

```
src/
├── index.ts           # Entry point (startup sequence)
├── server.ts          # Koa app factory (middleware + routes)
├── config/            # Zod-validated environment config
├── lib/               # Core infrastructure (DB, Redis, logger, keys)
├── middleware/         # Koa middleware (auth, health, tenant resolver, security headers)
├── oidc/              # OIDC provider configuration and adapters
├── organizations/     # Tenant management module
├── applications/      # Application management module
├── clients/           # OIDC client management module
├── users/             # User management module
├── auth/              # Authentication workflows (magic link, email, templates)
├── rbac/              # Roles, permissions, user-role assignments
├── custom-claims/     # Custom claim definitions and values
├── two-factor/        # 2FA (TOTP, email OTP, recovery codes)
├── routes/            # API route handlers
└── cli/               # CLI command implementations
admin-gui/
├── src/client/        # React SPA (FluentUI v9, React Router, React Query)
├── src/server/        # Koa BFF (OIDC auth, session, CSRF, API proxy)
├── src/shared/        # Shared types between client and server
├── tests/             # Vitest unit tests + Playwright E2E tests
└── public/            # Static assets
tests/
├── unit/              # Unit tests (no external services)
├── integration/       # Integration tests (require Docker)
├── e2e/               # End-to-end tests
├── pentest/           # Security/penetration tests
├── ui/                # Playwright UI tests
├── fixtures/          # Test data
└── helpers/           # Test utilities
migrations/            # SQL migration files (001-019)
templates/             # Handlebars templates for auth UI
locales/               # i18n translation files
docker/                # Docker Compose + Dockerfile
```

## Common Tasks

| Task | Command |
|------|---------|
| Start Porta dev server | `yarn dev` |
| Start Admin GUI dev server | `cd admin-gui && yarn dev` |
| Run all Porta tests | `yarn test:all` |
| Run Porta unit tests only | `yarn test:unit` |
| Run integration tests | `yarn test:integration` |
| Run Admin GUI tests | `cd admin-gui && yarn test` |
| Run Admin GUI E2E tests | `cd admin-gui && yarn test:e2e` |
| Build for production | `yarn build` |
| Full verify (lint + build + test) | `yarn verify` |
| Create a migration | `yarn migrate:create <name>` |
| Run migrations | `yarn porta migrate up` |
| Lint code | `yarn lint` |
| Start Docker services | `yarn docker:up` |
| Stop Docker services | `yarn docker:down` |

## Troubleshooting

### argon2 Installation Fails

argon2 requires native build tools:

```bash
# Ubuntu/Debian
sudo apt-get install python3 build-essential

# macOS
xcode-select --install
```

### Port 3000 Already in Use

The dev script automatically kills any process on port 3000 before starting. If that fails:

```bash
lsof -ti:3000 | xargs kill -9
```

### Database Connection Refused

Ensure Docker services are running:

```bash
yarn docker:up
docker ps  # Verify containers are healthy
```

### Redis Connection Refused

Same as above — verify Docker services. Redis runs on port 6379.

## Next Steps

- [Development Workflow](/implementation-details/guides/development) — Coding patterns, testing, and module conventions
- [System Overview](/implementation-details/architecture/system-overview) — Understand the architecture
- [Data Model](/implementation-details/architecture/data-model) — Explore the database schema
