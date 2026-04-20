# Quick Start

Get Porta running locally in under 5 minutes. Choose the path that fits your goal:

- **🐳 Docker** (recommended) — Evaluate Porta with zero local toolchain setup
- **💻 Source** — Set up a development environment for contributing

## Path 1: Docker Quick Start {#docker}

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Docker Compose v2+

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
docker exec -it porta-app node dist/cli/index.js init
```

This interactive command creates:
- The super-admin organization
- The admin application with RBAC permissions
- A PKCE client for CLI authentication
- Your first admin user (you'll be prompted for email, name, and password)

You can also run it non-interactively:

```bash
docker exec porta-app node dist/cli/index.js init \
  --email admin@example.com \
  --given-name Admin \
  --family-name User \
  --password 'YourSecurePassword123!'
```

**6. Verify**

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

## Path 2: Source Development Setup {#source}

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

---

## Troubleshooting

### Container won't start

**Check logs:**
```bash
docker compose -f docker/docker-compose.prod.yml logs porta
```

**Common causes:**
- PostgreSQL not ready yet — the entrypoint waits up to 60 seconds
- Missing or invalid environment variables — check `.env.docker.local`
- Port 3000 already in use — change `PORT` in your env file

### Health check failing

```bash
# Check individual services
docker compose -f docker/docker-compose.prod.yml ps
```

All services should show "healthy". If PostgreSQL is unhealthy, check:
```bash
docker compose -f docker/docker-compose.prod.yml logs postgres
```

### Migration errors

If migrations fail during auto-migrate:
```bash
# Check migration status
docker exec porta-app node dist/cli/index.js migrate status

# Run manually with verbose output
docker exec porta-app node dist/cli/index.js migrate up
```

### Port conflicts

If port 3000, 5432, or 6379 are already in use, update the port mappings in
`docker/docker-compose.prod.yml` or stop conflicting services.

---

## Next Steps

- 📖 [Architecture Overview](./architecture.md) — Understand how Porta is designed
- 💻 [CLI Reference](../cli/overview.md) — Full CLI command documentation
- 📋 [Admin API](../api/overview.md) — REST API reference
- 🔑 [OIDC & Authentication](../concepts/oidc.md) — How OIDC works in Porta
- 🏢 [Multi-Tenancy](../concepts/multi-tenancy.md) — Organization-scoped tenancy model
