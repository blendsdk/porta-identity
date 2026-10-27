# Getting Started — Developer Setup

> **Last Updated**: 2026-05-07

## Prerequisites

| Requirement             | Version  | Purpose                    |
| ----------------------- | -------- | -------------------------- |
| Node.js                 | ≥ 22.0.0 | Runtime                    |
| pnpm                    | 12.15    | Package manager            |
| Docker & Docker Compose | Latest   | PostgreSQL, Redis, MailHog |
| Git                     | Latest   | Version control            |

::: warning pnpm only
Porta uses pnpm 12.15.x with the hoisted node_modules layout. Do **not** use npm or Yarn. The workspace contract is enforced by `pnpm-workspace.yaml` and the structural tests.
:::

## Initial Setup

### 1. Clone the Repository

```bash
git clone git@github.com:blendsdk/porta-identity.git
cd porta-identity
```

### 2. Install Dependencies

```bash
pnpm install
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
ISSUER_BASE_URL=https://porta.local:3443

# Security (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
COOKIE_KEYS=your-random-hex-string-here
```

See the [Configuration Reference](../reference/configuration.md) for all environment variables.

### 4. Start Infrastructure Services

```bash
pnpm docker:up
```

This starts PostgreSQL 16, Redis 7, and MailHog via Docker Compose.

| Service      | URL                     | Credentials                 |
| ------------ | ----------------------- | --------------------------- |
| PostgreSQL   | `localhost:5432`        | `porta:porta` / DB: `porta` |
| Redis        | `localhost:6379`        | No auth                     |
| MailHog SMTP | `localhost:1025`        | No auth                     |
| MailHog UI   | `http://localhost:8025` | Browser                     |

### 5. Run Migrations

```bash
pnpm porta migrate up
```

This runs all 19 migrations to create the database schema.

### 6. Bootstrap Admin Infrastructure

```bash
pnpm porta init
```

The `porta init` command creates:

- The super-admin organization
- The Porta admin application with RBAC roles and permissions
- A PKCE-enabled OIDC client for the CLI
- The first admin user (interactive prompts for email/password)

### 7. Start the Dev Server

```bash
pnpm dev
```

The server starts at `https://porta.local:3443` with hot-reload via `tsx watch`.

### 8. Verify Setup

Check the health endpoint:

```bash
curl https://porta.local:3443/health
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
pnpm porta login
```

This opens a browser window for OIDC authentication. After logging in, credentials are stored at `~/.porta/credentials.json`.

Verify your identity:

```bash
pnpm porta whoami
```

## Project Layout Quick Reference

```
packages/
├── server/             # @portaidentity/server: source, tests, migrations, templates, locales
├── sdk/                # @portaidentity/sdk
└── cli/                # @portaidentity/cli
repo-tests/            # Repository-structure contracts
test-harness/          # External OIDC browser harness
docker/                # Docker Compose and production image
docs/                  # Public VitePress documentation
techdocs/              # Developer and architecture documentation
```

## Common Tasks

| Task                                   | Command                                              |
| -------------------------------------- | ---------------------------------------------------- |
| Start Porta server                     | `pnpm dev`                                           |
| Run affected tests (local default)     | `pnpm test:changed`                                  |
| Run all unit tests                     | `pnpm test:unit`                                     |
| Run the full product suite (CI only)   | `pnpm test`                                          |
| Run integration tests                  | `pnpm test:integration`                              |
| Run E2E, penetration, or browser tests | `pnpm test:e2e`, `pnpm test:pentest`, `pnpm test:ui` |
| Build for production                   | `pnpm build`                                         |
| Full verification (CI only)            | `pnpm verify`                                        |
| Create a migration                     | `pnpm migrate:create <name>`                         |
| Run migrations                         | `pnpm porta migrate up`                              |
| Lint code                              | `pnpm lint`                                          |
| Start Docker services                  | `pnpm docker:up`                                     |
| Stop Docker services                   | `pnpm docker:down`                                   |

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

The dev script does not stop an existing service on port 3000. Identify and stop the process that
owns the port before starting Porta again.

### Database Connection Refused

Ensure Docker services are running:

```bash
pnpm docker:up
docker ps  # Verify containers are healthy
```

### Redis Connection Refused

Same as above — verify Docker services. Redis runs on port 6379.

## Next Steps

- [Development Workflow](../guides/development.md) — Coding patterns, testing, and module conventions
- [System Overview](../architecture/system-overview.md) — Understand the architecture
- [Data Model](../architecture/data-model.md) — Explore the database schema
