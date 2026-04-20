# Porta

Multi-tenant OIDC provider built on [node-oidc-provider](https://github.com/panva/node-oidc-provider) + Koa + TypeScript + PostgreSQL + Redis.

Provides organization-scoped authentication, user management, RBAC, custom claims, two-factor authentication, and a comprehensive admin CLI.

## Prerequisites

- **Node.js** ≥ 22.0.0
- **Yarn** Classic 1.22 (NOT npm, NOT Berry)
- **Docker** + Docker Compose (for PostgreSQL, Redis, MailHog)

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url> porta && cd porta
yarn install

# 2. Configure environment
cp .env.example .env
# Edit .env if needed — defaults work for local development

# 3. Start infrastructure (PostgreSQL 16, Redis 7, MailHog)
yarn docker:up

# 4. Run database migrations
yarn build
node dist/cli/index.js migrate up

# 5. Bootstrap admin system
node dist/cli/index.js init
# Interactive prompts will ask for admin email, name, and password.
# Or non-interactive:
#   node dist/cli/index.js init \
#     --email admin@example.com \
#     --given-name Admin \
#     --family-name User \
#     --password 'YourSecurePassword123!'

# 6. Start the server
yarn dev
```

## Admin CLI

Porta includes a yargs-based CLI (`porta`) for server administration. After bootstrapping with `porta init`, all commands authenticate via OIDC (JWT Bearer tokens over HTTP).

### Authentication

```bash
# Log in — opens browser for OIDC Authorization Code + PKCE flow
porta login
porta login --server https://porta.example.com  # Remote server

# Check current identity
porta whoami

# Log out — clears stored credentials
porta logout
```

Credentials are stored in `~/.porta/credentials.json` with `0600` permissions. Tokens refresh automatically when expired.

### Bootstrap Commands (Direct-DB)

These commands connect directly to PostgreSQL/Redis and do not require authentication. They are used for initial setup before the server is running.

```bash
porta init                  # Bootstrap admin infrastructure (one-time)
porta migrate up            # Run database migrations
porta migrate down          # Rollback last migration
porta migrate status        # Show migration status
porta seed run              # Load development seed data
porta health                # Check DB + Redis connectivity
porta health --direct       # Force direct-DB check (skip HTTP)
```

### Admin Commands (Authenticated HTTP)

All other commands require `porta login` first and communicate with the running Porta server via the admin API.

```bash
# Organizations
porta org create --name "Acme Corp"
porta org list
porta org show <id>
porta org update <id> --name "New Name"
porta org suspend <id>
porta org activate <id>
porta org archive <id>

# Applications
porta app create --name "My App" --org-id <id>
porta app list
porta app show <id>

# Clients
porta client create --app-id <id> --name "Web Client"
porta client list --app-id <id>
porta client secret generate <clientId>

# Users
porta user create --org-id <id> --email user@example.com
porta user list --org-id <id>
porta user show <userId>

# RBAC
porta app role create --app-id <id> --name "Editor"
porta app permission create --app-id <id> --slug "docs:edit"
porta user roles assign <userId> --role-id <roleId>

# Custom Claims
porta app claim create --app-id <id> --key "department" --type string
porta user claims set <userId> --claim-id <id> --value "Engineering"

# System
porta config list
porta keys list
porta audit list
```

Use `--json` on any command for JSON output. Use `--help` on any command for detailed usage.

## Admin API

All admin endpoints are mounted at `/api/admin/*` and require JWT Bearer authentication. The JWT is validated against Porta's own ES256 signing keys — the server authenticates itself.

### Authentication Flow

1. `porta init` creates the admin org, app, RBAC permissions, a public PKCE client, and the first admin user
2. `porta login` runs the OIDC Authorization Code + PKCE flow through the browser
3. The resulting JWT access token is stored locally and sent as `Authorization: Bearer <token>` on every API call
4. The `requireAdminAuth` middleware validates the token, checks the user belongs to the super-admin org, and verifies the `porta-admin` role

### Endpoints

| Prefix | Description |
|--------|-------------|
| `GET /api/admin/metadata` | Unauthenticated — OIDC discovery for CLI login |
| `/api/admin/organizations/*` | Organization CRUD + lifecycle |
| `/api/admin/applications/*` | Application CRUD + modules |
| `/api/admin/clients/*` | Client CRUD + secret management |
| `/api/admin/organizations/:orgId/users/*` | User CRUD + status transitions |
| `/api/admin/applications/:appId/roles/*` | Role management |
| `/api/admin/applications/:appId/permissions/*` | Permission management |
| `/api/admin/organizations/:orgId/users/:userId/roles/*` | User-role assignments |
| `/api/admin/applications/:appId/claims/*` | Custom claim definitions + values |
| `/api/admin/config/*` | System configuration |
| `/api/admin/keys/*` | Signing key management |
| `/api/admin/audit/*` | Audit log viewer |

## Development

```bash
# Start dev server (hot-reload via tsx)
yarn dev

# Run all tests (unit + integration)
yarn test

# Run unit tests only
yarn test:unit

# Run integration tests (requires docker:up)
yarn test:integration

# Lint
yarn lint

# Full verification (lint + build + test) — run before committing
yarn verify
```

## Architecture

- **Multi-tenant OIDC** — Path-based tenancy (`/:orgSlug/*`) with per-org OIDC endpoints
- **Hybrid adapters** — Redis for short-lived OIDC artifacts (sessions, auth codes), PostgreSQL for long-lived (access/refresh tokens, grants)
- **ES256 signing** — ECDSA P-256 keys stored as PEM in the database, auto-bootstrapped on first start
- **Admin self-auth** — The admin API authenticates using Porta's own OIDC tokens (no external IdP)
- **CLI dual-mode** — Bootstrap commands use direct-DB; all other commands use authenticated HTTP

## Project Structure

```
src/
  config/          # Zod-validated config schema + loader
  lib/             # Core: logger, database, redis, migrator, signing-keys, audit-log
  middleware/      # Koa middleware: error-handler, request-logger, health, admin-auth, tenant-resolver
  oidc/            # OIDC provider: configuration, adapters, client/account finders
  organizations/   # Organization module: CRUD, status lifecycle, caching
  applications/    # Application module: CRUD, modules
  clients/         # Client module: CRUD, secrets (Argon2id), OIDC mapping
  users/           # User module: CRUD, status transitions, password (Argon2id)
  auth/            # Auth workflows: magic link, password reset, invitation, CSRF, i18n
  rbac/            # RBAC: roles, permissions, user-role mappings
  custom-claims/   # Custom claims: definitions, user values, validation
  two-factor/      # 2FA: email OTP, TOTP, recovery codes, per-org policy
  routes/          # Admin API route handlers (16 files)
  cli/             # CLI: yargs commands, HTTP client, token store, PKCE
  server.ts        # Koa app factory
  index.ts         # Entry point
```

## License

Private — © TrueSoftware NL
