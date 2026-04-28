# Setup Alternatives

Alternative ways to set up Porta beyond the [Quick Start](./quickstart.md) Docker Hub path.

::: tip Fastest path
If you just want to try Porta, use the [Quick Start](./quickstart.md) guide — it's the fastest way to get running with Docker Hub images.
:::

---

## Clone & Docker Compose {#docker}

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

Edit `.env.docker.local` and **generate your secrets** (see [Quick Start → Step 2](./quickstart.md#step-2-generate-required-secrets)):

| Variable | Default | Description |
|----------|---------|-------------|
| `ISSUER_BASE_URL` | `http://localhost:3000` | Public URL of your Porta instance |
| `COOKIE_KEYS` | — | Cookie signing key (**must generate**) |
| `TWO_FACTOR_ENCRYPTION_KEY` | — | 2FA encryption key (**must generate**) |
| `SIGNING_KEY_ENCRYPTION_KEY` | — | Signing key encryption (**must generate**) |
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
curl http://localhost:3000/health
```

You should see a JSON response with `"status": "ok"`.

**5. Bootstrap the admin system**

```bash
docker exec -it porta-app porta init
```

This creates the super-admin organization, admin application with RBAC permissions, CLI/GUI clients, and your first admin user. See [Quick Start → Step 7](./quickstart.md#step-7-bootstrap-the-admin-system) for details.

Non-interactive mode:

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

**7. Set up your environment**

Use [declarative provisioning](../cli/provisioning.md) to create organizations, applications, and clients.

Using the [CLI wrapper](./quickstart.md#step-8-install-the-cli-wrapper):

```bash
./porta provision -f setup.yaml
```

Or without the wrapper:

```bash
docker exec porta-app porta provision -f /dev/stdin < setup.yaml
```

### Stopping

```bash
docker compose -f docker/docker-compose.prod.yml down

# Remove data volumes too (fresh start):
docker compose -f docker/docker-compose.prod.yml down -v
```

---

## Source Development Setup {#source}

Full development environment for contributing to Porta or running from source.

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

Edit `.env` and **generate your secrets** (see [Quick Start → Step 2](./quickstart.md#step-2-generate-required-secrets)).

The defaults in `.env.example` work for local development with the Docker-based infrastructure (MailHog for email on port 1025).

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
yarn lint              # ESLint
yarn test:unit         # Unit tests only
yarn test:integration  # Integration tests (requires docker:up)
```

### Stopping

```bash
yarn docker:down
```

---

## Next Steps

- 📖 [Quick Start](./quickstart.md) — The primary setup guide
- 🔧 [Provisioning Guide](../cli/provisioning.md) — Declarative environment setup
- ⚙️ [Environment Variables](./environment.md) — Complete configuration reference
- 🚢 [Deployment Guide](./deployment.md) — Production deployment guidance
