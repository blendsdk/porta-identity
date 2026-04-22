# Quick Start

Get Porta running locally in under 5 minutes. Choose the path that fits your goal:

- **🐳 Docker Hub** (recommended) — Run Porta from Docker Hub with zero setup
- **📦 Clone & Docker** — Clone the repo and use the included Docker Compose
- **💻 Source** — Set up a development environment for contributing

## Path 1: Docker Hub Quick Start {#docker-hub}

The fastest way to try Porta. No git clone required — just create two files and run.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Docker Compose v2+

### Steps

**1. Create a project directory**

```bash
mkdir porta && cd porta
```

**2. Create `docker-compose.yml`**

Create a file called `docker-compose.yml`:

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

**3. Create `.env`**

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

# Signing Key Encryption — CHANGE THIS in production!
# AES-256-GCM key for encrypting ES256 signing key private keys at rest.
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SIGNING_KEY_ENCRYPTION_KEY=CHANGE-ME-generate-a-64-char-hex-string-for-signing-keys

# Reverse proxy — set to "true" when behind a TLS-terminating proxy
# TRUST_PROXY=false

# Auto-run database migrations on startup (set to "false" after initial setup)
PORTA_AUTO_MIGRATE=true
```

**4. Start all services**

```bash
docker compose up -d
```

This starts:
- **porta** — The Porta OIDC provider (port 3000)
- **postgres** — PostgreSQL 16 database
- **redis** — Redis 7 cache

**5. Wait for health checks**

```bash
# Check that Porta is healthy
curl http://localhost:3000/health
```

You should see a JSON response with `"status": "ok"`. If the container is still starting,
wait a few seconds — the entrypoint waits for PostgreSQL and Redis before starting Porta.

**6. Bootstrap the admin system**

```bash
docker exec -it porta-app porta init
```

This interactive command creates:
- The super-admin organization
- The admin application with RBAC permissions
- A PKCE client for CLI authentication
- Your first admin user (you'll be prompted for email, name, and password)

You can also run it non-interactively:

```bash
docker exec porta-app porta init \
  --email admin@example.com \
  --given-name Admin \
  --family-name User \
  --password 'YourSecurePassword123!'
```

::: tip CLI Wrapper Script
For an even cleaner experience, download [`porta.sh`](https://github.com/blendsdk/porta-identity/blob/main/docker/porta.sh), save it as `porta` next to your `docker-compose.yml`, and make it executable (`chmod +x porta`). Then you can simply run:
```bash
./porta init
./porta login
./porta org list
```
:::

**7. Authenticate the CLI**

```bash
docker exec -it porta-app porta login
```

Since you're running inside Docker, the CLI **automatically detects** the container and uses manual mode. It will print an authorization URL — open it in your host browser, log in with the admin credentials you just created, then paste the callback URL back into the terminal.

```
Container environment detected — using manual login mode.

Open this URL in your browser to log in:
  http://localhost:3000/porta-admin/auth?...

Paste the callback URL: <paste URL from browser address bar>

✅ Logged in as admin@example.com
```

After logging in, you can use all admin commands:

```bash
docker exec -it porta-app porta whoami
docker exec -it porta-app porta org list
```

**8. Verify**

Open [http://localhost:3000/health](http://localhost:3000/health) in your browser.
The health endpoint confirms the server, database, and Redis are all connected.

### Stopping

```bash
docker compose down
```

Add `-v` to also remove the PostgreSQL data volume (fresh start):

```bash
docker compose down -v
```

---

## Path 2: Clone & Docker Compose {#docker}

Use the included Docker Compose file from the repository. Useful if you want to
explore the full project or customize the Docker setup.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Docker Compose v2+
- [Git](https://git-scm.com/)

### Steps

**1. Clone the repository**

```bash
git clone https://github.com/blendsdk/porta-identity.git
cd porta-identity
```

**2. Configure environment**

```bash
cp .env.docker .env.docker.local
```

Edit `.env.docker.local` if needed. The defaults work for local evaluation. Key settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `ISSUER_BASE_URL` | `http://localhost:3000` | Public URL of your Porta instance |
| `COOKIE_KEYS` | `CHANGE-ME-...` | Cookie signing key (change for production) |
| `PORTA_AUTO_MIGRATE` | `true` | Auto-run database migrations on startup |
| `POSTGRES_PASSWORD` | `porta_secret` | PostgreSQL password |

**3. Start all services**

```bash
docker compose -f docker/docker-compose.prod.yml up -d
```

This starts:
- **porta** — The Porta OIDC provider (port 3000)
- **postgres** — PostgreSQL 16 database
- **redis** — Redis 7 cache

::: tip Email Testing
To enable the MailHog email testing UI, start with the `dev` profile:
```bash
docker compose -f docker/docker-compose.prod.yml --profile dev up -d
```
Then open [http://localhost:8025](http://localhost:8025) for the MailHog inbox.
:::

**4. Wait for health checks**

```bash
# Check that Porta is healthy
curl http://localhost:3000/health
```

You should see a JSON response with `"status": "ok"`. If the container is still starting,
wait a few seconds — the entrypoint waits for PostgreSQL and Redis before starting Porta.

**5. Bootstrap the admin system**

```bash
docker exec -it porta-app porta init
```

This interactive command creates:
- The super-admin organization
- The admin application with RBAC permissions
- A PKCE client for CLI authentication
- Your first admin user (you'll be prompted for email, name, and password)

You can also run it non-interactively:

```bash
docker exec porta-app porta init \
  --email admin@example.com \
  --given-name Admin \
  --family-name User \
  --password 'YourSecurePassword123!'
```

**6. Authenticate the CLI**

```bash
docker exec -it porta-app porta login
```

The CLI auto-detects the Docker container and uses manual mode — it prints an auth URL for you to open in your host browser, then you paste the callback URL back. See [porta login](../cli/bootstrap.md#porta-login) for details.

**7. Verify**

Open [http://localhost:3000/health](http://localhost:3000/health) in your browser.
The health endpoint confirms the server, database, and Redis are all connected.

### Stopping

```bash
docker compose -f docker/docker-compose.prod.yml down
```

Add `-v` to also remove the PostgreSQL data volume (fresh start):

```bash
docker compose -f docker/docker-compose.prod.yml down -v
```

---

## Path 3: Source Development Setup {#source}

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 22.0.0
- [Yarn](https://classic.yarnpkg.com/) Classic 1.22 (NOT npm, NOT Berry)
- [Docker](https://docs.docker.com/get-docker/) + Docker Compose (for infrastructure services)

### Steps

**1. Clone and install**

```bash
git clone https://github.com/blendsdk/porta-identity.git
cd porta-identity
yarn install
```

**2. Configure environment**

```bash
cp .env.example .env
```

The defaults in `.env.example` work for local development with the Docker-based infrastructure.

**3. Start infrastructure**

```bash
yarn docker:up
```

This starts PostgreSQL 16, Redis 7, and MailHog using Docker Compose.

**4. Build and initialize**

```bash
# Compile TypeScript
yarn build

# Run database migrations
node dist/cli/index.js migrate up

# Bootstrap admin system (interactive)
node dist/cli/index.js init
```

**5. Start the development server**

```bash
yarn dev
```

The server starts with hot-reload via `tsx watch` on [http://localhost:3000](http://localhost:3000).

**6. Run tests**

```bash
# Full verification (lint + build + test)
yarn verify

# Or individually:
yarn lint           # ESLint
yarn test:unit      # Unit tests only
yarn test:integration  # Integration tests (requires docker:up)
```

---

## Environment Variables

See the [Environment Variables](./environment.md) page for the complete reference.

Key variables for getting started:

| Variable | Dev Default | Docker Default | Description |
|----------|-------------|----------------|-------------|
| `NODE_ENV` | `development` | `production` | Runtime mode |
| `PORT` | `3000` | `3000` | HTTP server port |
| `DATABASE_URL` | `postgresql://porta:porta_dev@localhost:5432/porta` | `postgresql://porta:porta_secret@postgres:5432/porta` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379` | `redis://redis:6379` | Redis connection |
| `ISSUER_BASE_URL` | `http://localhost:3000` | `http://localhost:3000` | OIDC issuer URL |
| `COOKIE_KEYS` | `dev-cookie-key-...` | Change this! | Cookie signing key |
| `TRUST_PROXY` | `false` | `false` | Set `true` behind a TLS proxy ([details](./environment.md#reverse-proxy)) |

---

## Troubleshooting

### Container won't start

**Check logs:**
```bash
docker compose logs porta
```

**Common causes:**
- PostgreSQL not ready yet — the entrypoint waits up to 60 seconds
- Missing or invalid environment variables — check your `.env` file
- Port 3000 already in use — change `PORT` in your env file

### Health check failing

```bash
# Check individual services
docker compose ps
```

All services should show "healthy". If PostgreSQL is unhealthy, check:
```bash
docker compose logs postgres
```

### Migration errors

If migrations fail during auto-migrate:
```bash
# Check migration status
docker exec porta-app porta migrate status

# Run manually with verbose output
docker exec porta-app porta migrate up
```

### Login page loads but authentication fails silently

If the login page renders but submitting the form redirects back without logging in,
the most likely cause is **missing `TRUST_PROXY` configuration**. When Porta runs behind
a TLS-terminating reverse proxy (nginx, Traefik, cloud load balancer), it must be told
to trust `X-Forwarded-Proto` headers so it can set `Secure` cookies correctly.

**Fix:** Add `TRUST_PROXY=true` to your `.env` file and restart Porta.

See [Environment Variables → Reverse Proxy](./environment.md#reverse-proxy) for details.

### Port conflicts

If port 3000, 5432, or 6379 are already in use, update the port mappings in
your `docker-compose.yml` or stop conflicting services.

---

## Next Steps

- 📖 [Architecture Overview](./architecture.md) — Understand how Porta is designed
- 💻 [CLI Reference](../cli/overview.md) — Full CLI command documentation
- 📋 [Admin API](../api/overview.md) — REST API reference
- 🔑 [OIDC & Authentication](../concepts/oidc.md) — How OIDC works in Porta
- 🏢 [Multi-Tenancy](../concepts/multi-tenancy.md) — Organization-scoped tenancy model
- 🚢 [Deployment Guide](./deployment.md) — Production deployment guidance
