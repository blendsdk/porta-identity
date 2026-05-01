# Quick Start

Get Porta running in 5 minutes with Docker.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Docker Compose v2+

::: info Looking for other setup methods?
This guide uses Docker Hub images for the fastest setup. For cloning the repo or developing from source, see [Setup Alternatives](./setup-alternatives.md).
:::

---

## Step 1: Create a Project Directory

```bash
mkdir porta && cd porta
```

---

## Step 2: Generate Required Secrets

::: danger Required — Do Not Skip
Porta requires **3 cryptographic secrets** to operate securely. These protect session cookies, 2FA secrets, and signing keys. **You must generate unique values** — do not use the defaults or placeholders.
:::

Run these commands to generate all three secrets:

```bash
# 1. Cookie signing key (base64, at least 32 chars)
echo "COOKIE_KEYS=$(openssl rand -base64 32)"

# 2. Two-Factor encryption key (64 hex chars = 32 bytes, AES-256-GCM)
echo "TWO_FACTOR_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"

# 3. Signing key encryption key (64 hex chars = 32 bytes, AES-256-GCM)
echo "SIGNING_KEY_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
```

**Save the output** — you'll paste these into your `.env` file in Step 4.

| Secret | Purpose | Format |
|--------|---------|--------|
| `COOKIE_KEYS` | Signs OIDC session cookies | Base64 string, ≥32 chars |
| `TWO_FACTOR_ENCRYPTION_KEY` | Encrypts TOTP authenticator secrets at rest | 64 hex characters (32 bytes) |
| `SIGNING_KEY_ENCRYPTION_KEY` | Encrypts ES256 signing key private keys at rest | 64 hex characters (32 bytes) |

---

## Step 3: SMTP — Email is Required

::: warning Porta requires a working SMTP server
Magic links, user invitations, password resets, and email-based 2FA all send emails. Without SMTP, these features will fail silently.
:::

**For local development**, we include [MailHog](https://github.com/mailhog/MailHog) in the Docker Compose file below — it catches all outgoing emails and provides a web inbox at [http://localhost:8025](http://localhost:8025). No extra setup needed.

**For production**, configure a real SMTP server:

| Variable | Example | Description |
|----------|---------|-------------|
| `SMTP_HOST` | `smtp.sendgrid.net` | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP port (587 for STARTTLS, 465 for SSL) |
| `SMTP_USER` | `apikey` | SMTP username |
| `SMTP_PASS` | `SG.xxxxx` | SMTP password or API key |
| `SMTP_FROM` | `noreply@yourdomain.com` | Sender email address |

Popular options: [SendGrid](https://sendgrid.com/), [Amazon SES](https://aws.amazon.com/ses/), [Postmark](https://postmarkapp.com/), [Mailgun](https://www.mailgun.com/), or any SMTP-compatible service.

---

## Step 4: Create `docker-compose.yml`

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

  # ── MailHog (dev email testing) ─────────────
  mailhog:
    image: mailhog/mailhog
    container_name: porta-mailhog
    ports:
      - "8025:8025"   # Web UI
      - "1025:1025"   # SMTP
    profiles:
      - dev

volumes:
  porta_pgdata:
    driver: local
```

::: tip MailHog for development
Start with `docker compose --profile dev up -d` to include MailHog. Then open [http://localhost:8025](http://localhost:8025) to see all emails Porta sends.
:::

---

## Step 5: Create `.env`

Create a `.env` file and **paste in your generated secrets from Step 2**:

```env
# ── Server ────────────────────────────────────
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# ── Database ──────────────────────────────────
POSTGRES_PASSWORD=porta_secret

# ── OIDC ──────────────────────────────────────
ISSUER_BASE_URL=https://porta.local:3443

# ── Secrets (paste values from Step 2) ────────
COOKIE_KEYS=<paste-your-cookie-key-here>
TWO_FACTOR_ENCRYPTION_KEY=<paste-your-2fa-key-here>
SIGNING_KEY_ENCRYPTION_KEY=<paste-your-signing-key-here>

# ── Email (MailHog for dev, real SMTP for prod)
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@porta.local

# ── Logging ───────────────────────────────────
LOG_LEVEL=info

# ── Startup ───────────────────────────────────
PORTA_AUTO_MIGRATE=true
TRUST_PROXY=false
```

::: danger Replace the secret placeholders!
Replace `<paste-your-cookie-key-here>`, `<paste-your-2fa-key-here>`, and `<paste-your-signing-key-here>` with the values you generated in Step 2. Porta will refuse to start with placeholder values in production.
:::

---

## Step 6: Start Services

```bash
# For development (with MailHog email testing):
docker compose --profile dev up -d

# For production (without MailHog):
docker compose up -d
```

Wait a few seconds for PostgreSQL and Redis to become healthy, then verify:

```bash
curl https://porta.local:3443/health
```

You should see `{"status":"ok","database":"ok","redis":"ok"}`.

---

## Step 7: Bootstrap the Admin System

```bash
docker exec -it porta-app porta init
```

This interactive command creates:
- The **super-admin organization** (`porta-admin`)
- The **admin application** with 42 RBAC permissions
- A **PKCE client** for CLI authentication
- A **confidential client** for the Admin GUI
- Your **first admin user** (you'll be prompted for email, name, and password)

You can also run it non-interactively:

```bash
docker exec porta-app porta init \
  --email admin@example.com \
  --given-name Admin \
  --family-name User \
  --password 'YourSecurePassword123!'
```

Then authenticate the CLI:

```bash
docker exec -it porta-app porta login
```

The CLI prints an authorization URL — open it in your browser, log in, then paste the callback URL back into the terminal.

---

## Step 8: Install the CLI Wrapper

Download the `porta` wrapper script for a cleaner command-line experience:

```bash
curl -fsSL https://raw.githubusercontent.com/blendsdk/porta-identity/main/docker/porta.sh \
  -o porta && chmod +x porta
```

This script forwards commands to the Porta container, with automatic host file detection for provisioning. Now you can run:

```bash
./porta init
./porta login
./porta org list
```

::: info Without the wrapper
All commands also work with `docker exec`:
```bash
docker exec -it porta-app porta init
```
:::

---

## Step 9: Set Up Your Environment with Provisioning

Now that Porta is running, use **declarative provisioning** to create your organizations, applications, clients, roles, and permissions in one command.

**1. Create a `setup.yaml` file:**

```yaml
version: "1.0"

organizations:
  - name: My Company
    slug: my-company

    applications:
      - name: Web Portal
        slug: web-portal

        clients:
          - client_name: Web App
            application_type: web
            grant_types:
              - authorization_code
              - refresh_token
            redirect_uris:
              - http://localhost:8080/callback
            response_types:
              - code
            scope: openid profile email

        roles:
          - name: Admin
            slug: admin
            permissions:
              - manage-users
              - manage-settings
          - name: Viewer
            slug: viewer
            permissions:
              - read-data

        permissions:
          - name: Manage Users
            slug: manage-users
          - name: Manage Settings
            slug: manage-settings
          - name: Read Data
            slug: read-data
```

**2. Preview what will be created:**

```bash
./porta provision -f setup.yaml --dry-run
```

**3. Apply the configuration:**

```bash
./porta provision -f setup.yaml
```

::: info Without the wrapper
```bash
docker exec porta-app porta provision -f /dev/stdin < setup.yaml
```
:::

::: tip More examples
The repository includes ready-to-use provisioning files at different complexity levels:

- **`examples/provision-simple.yaml`** — Single org, one app, public + confidential client, basic RBAC
- **`examples/provision-multi-org.yaml`** — Multi-tenant SaaS with two isolated organizations
- **`examples/provision-enterprise.yaml`** — Enterprise setup with multiple apps, custom claims, and system config
- **`examples/provision-full.yaml`** — **Complete feature showcase**: users with passwords, application modules, branding, 2FA policy, secret config, role/claim assignments

Read the full [Provisioning Guide](../cli/provisioning.md) for the complete file format reference.
:::

---

## Step 10: Verify Everything Works

```bash
# Check health
curl https://porta.local:3443/health

# List organizations
docker exec porta-app porta org list

# Open MailHog to see test emails (if using dev profile)
# http://localhost:8025
```

Open [https://porta.local:3443/health](https://porta.local:3443/health) in your browser to confirm the server, database, and Redis are all connected.

---

## Stopping & Cleanup

```bash
# Stop all services
docker compose down

# Stop and delete all data (fresh start)
docker compose down -v
```

---

## Troubleshooting

### Container won't start

```bash
docker compose logs porta
```

**Common causes:**
- Missing or placeholder secrets — check your `.env` (see [Step 2](#step-2-generate-required-secrets))
- PostgreSQL not ready yet — the entrypoint waits up to 60 seconds
- Port 3000 already in use — change `PORT` in your `.env` file

### Emails not being sent

- **Development:** Make sure you started with `--profile dev` for MailHog, and check [http://localhost:8025](http://localhost:8025)
- **Production:** Verify your SMTP settings. Test with `telnet your-smtp-host 587`.
- Check Porta logs: `docker compose logs porta | grep -i smtp`

### Login page loads but authentication fails

Most likely **missing `TRUST_PROXY=true`** when running behind a TLS-terminating reverse proxy (nginx, Traefik, cloud load balancer). See [Environment Variables → Reverse Proxy](./environment.md#reverse-proxy).

### Health check failing

```bash
docker compose ps   # All services should show "healthy"
docker compose logs postgres  # Check database
```

---

## Next Steps

- 📖 [Architecture Overview](./architecture.md) — How Porta is designed
- 🔧 [Provisioning Guide](../cli/provisioning.md) — Full provisioning file format reference
- 💻 [CLI Reference](../cli/overview.md) — All CLI commands
- 📋 [Admin API](../api/overview.md) — REST API reference
- 🔑 [OIDC & Authentication](../concepts/oidc.md) — How OIDC works in Porta
- 🏢 [Multi-Tenancy](../concepts/multi-tenancy.md) — Organization-scoped tenancy model
- ⚙️ [Environment Variables](./environment.md) — Complete configuration reference
- 🚢 [Deployment Guide](./deployment.md) — Production deployment guidance
- 🖥️ [Setup Alternatives](./setup-alternatives.md) — Clone & Docker or source development setup
