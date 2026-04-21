# Production Deployment

Guidance for deploying Porta to production environments using Docker.

::: tip Docker Hub
The Porta Docker image is available on [Docker Hub](https://hub.docker.com/r/blendsdk/porta):
```bash
docker pull blendsdk/porta:latest
```
No git clone required — see the [Quick Start](./quickstart.md#docker-hub) for a
standalone setup using just `docker-compose.yml` + `.env`.
:::

## Production Docker Compose

For production, remove MailHog and use a real SMTP relay. Here's a minimal production-ready
compose file that can be used standalone (no repository clone needed):

```yaml
services:
  porta:
    image: blendsdk/porta:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      PORT: "3000"
      HOST: "0.0.0.0"
      DATABASE_URL: postgresql://porta:${POSTGRES_PASSWORD}@postgres:5432/porta
      REDIS_URL: redis://redis:6379
      ISSUER_BASE_URL: https://auth.example.com
      COOKIE_KEYS: ${COOKIE_KEYS}
      SMTP_HOST: smtp.example.com
      SMTP_PORT: "587"
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
      SMTP_FROM: noreply@example.com
      LOG_LEVEL: info
      TWO_FACTOR_ENCRYPTION_KEY: ${TWO_FACTOR_ENCRYPTION_KEY}
      TRUST_PROXY: "true"
      PORTA_AUTO_MIGRATE: "false"
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

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: porta
      POSTGRES_USER: porta
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U porta"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

::: warning
Never use default passwords in production. Generate strong, unique values for
`POSTGRES_PASSWORD`, `COOKIE_KEYS`, and `TWO_FACTOR_ENCRYPTION_KEY`.
:::

## Environment Variables

### Required for Production

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://porta:secret@postgres:5432/porta` |
| `REDIS_URL` | Redis connection string | `redis://redis:6379` |
| `ISSUER_BASE_URL` | Public-facing URL (must match your domain) | `https://auth.example.com` |
| `COOKIE_KEYS` | Cookie signing key (≥32 random characters) | `a1b2c3d4e5f6...` |
| `TWO_FACTOR_ENCRYPTION_KEY` | AES-256-GCM key (64 hex chars = 32 bytes) | `0123456789abcdef...` |
| `SMTP_HOST` | SMTP relay hostname | `smtp.sendgrid.net` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_FROM` | Sender email address | `noreply@example.com` |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Runtime mode |
| `PORT` | `3000` | HTTP listen port |
| `HOST` | `0.0.0.0` | HTTP listen address |
| `LOG_LEVEL` | `info` | Log verbosity (`debug`, `info`, `warn`, `error`) |
| `TRUST_PROXY` | `false` | Set to `true` when behind a TLS-terminating reverse proxy |
| `PORTA_AUTO_MIGRATE` | `false` | Auto-run migrations on startup |
| `PORTA_WAIT_TIMEOUT` | `60` | Seconds to wait for DB/Redis at startup |

### Generating Secrets

```bash
# Cookie signing key (random 64-char string)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# Two-factor encryption key (64 hex chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Database password
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

## Secret Management

Production deployments must protect sensitive configuration values — database credentials,
encryption keys, SMTP passwords, and cookie signing keys. Never commit secrets to version
control or pass them as plain-text command-line arguments.

### Environment File Security

The simplest approach: store secrets in an `.env` file with restrictive permissions.

```bash
# Create .env from the example template
cp .env.example .env

# Restrict read access to the file owner only
chmod 600 .env

# Edit with your production values
nano .env
```

::: warning
Ensure `.env` is listed in `.gitignore` (it is by default in Porta). Never commit
environment files containing real credentials.
:::

### Docker Secrets

For Docker Swarm deployments, use [Docker Secrets](https://docs.docker.com/engine/swarm/secrets/)
to inject sensitive values as files rather than environment variables:

```yaml
services:
  porta:
    image: blendsdk/porta:latest
    environment:
      # Non-secret configuration
      NODE_ENV: production
      ISSUER_BASE_URL: https://auth.example.com
      # Read secrets from files mounted by Docker
      DATABASE_URL_FILE: /run/secrets/database_url
      COOKIE_KEYS_FILE: /run/secrets/cookie_keys
      TWO_FACTOR_ENCRYPTION_KEY_FILE: /run/secrets/2fa_key
    secrets:
      - database_url
      - cookie_keys
      - 2fa_key

secrets:
  database_url:
    external: true
  cookie_keys:
    external: true
  2fa_key:
    external: true
```

Create the secrets before deploying:

```bash
# Create secrets in Docker Swarm
echo "postgresql://porta:secret@postgres:5432/porta" | docker secret create database_url -
echo "your-cookie-signing-key-here" | docker secret create cookie_keys -
echo "0123456789abcdef..." | docker secret create 2fa_key -
```

::: tip
Porta's Docker entrypoint supports the `_FILE` suffix convention — if `DATABASE_URL_FILE`
is set, Porta reads the secret from that file path instead of the `DATABASE_URL` environment
variable.
:::

### Cloud Secret Managers

For cloud deployments, use your provider's secret management service:

| Provider | Service | Inject Via |
|----------|---------|------------|
| **AWS** | [Secrets Manager](https://aws.amazon.com/secrets-manager/) | ECS task definition `secrets` block, or Lambda env from SSM |
| **GCP** | [Secret Manager](https://cloud.google.com/secret-manager) | Cloud Run `--set-secrets`, or GKE volume mount |
| **Azure** | [Key Vault](https://azure.microsoft.com/en-us/products/key-vault/) | App Service Key Vault references, or AKS CSI driver |

Each service supports automatic rotation and audit logging. Refer to your provider's
documentation for integration details.

### HashiCorp Vault

For self-hosted or multi-cloud setups, [HashiCorp Vault](https://www.vaultproject.io/)
provides centralised secret management:

**Agent sidecar pattern** (recommended for containers):

1. Run a Vault Agent sidecar alongside Porta
2. The agent authenticates to Vault, fetches secrets, and writes them to a shared volume
3. Porta reads secrets from the file paths via the `_FILE` env var convention

**Environment injection pattern** (simpler for VMs):

1. Use `vault kv get` or [envconsul](https://github.com/hashicorp/envconsul) to inject
   secrets as environment variables before starting Porta
2. Example: `envconsul -prefix porta/config ./start.sh`

## Database

### Migrations

Porta uses [node-pg-migrate](https://github.com/salsita/node-pg-migrate) for schema management.
Migration files are in the `migrations/` directory inside the Docker image.

**Running migrations manually:**

```bash
# Via Docker exec
docker exec porta-app node dist/cli/index.js migrate up

# Check migration status
docker exec porta-app node dist/cli/index.js migrate status
```

**Auto-migration:** Set `PORTA_AUTO_MIGRATE=true` for the entrypoint to run migrations
automatically on startup. This is convenient for initial setup but should be disabled
in production once the schema is stable — run migrations explicitly during deployments.

### Backup & Recovery

PostgreSQL is Porta's only durable data store — all organizations, users, clients, roles,
signing keys, and audit logs live in PG. Regular, tested backups are essential.

#### Logical Backups (pg_dump)

Use `pg_dump` in custom format (`-Fc`) for the best balance of compression and flexibility:

```bash
# Full database backup (custom format, compressed)
docker exec porta-postgres pg_dump \
  -U porta \
  -Fc \
  --no-owner \
  --no-privileges \
  porta > porta_$(date +%Y%m%d_%H%M%S).dump

# Plain SQL backup (human-readable, larger)
docker exec porta-postgres pg_dump \
  -U porta \
  --no-owner \
  --no-privileges \
  porta > porta_$(date +%Y%m%d_%H%M%S).sql
```

**Automate with cron** — schedule daily backups and upload to secure storage:

```bash
# Example crontab entry — daily at 02:00 UTC
0 2 * * * docker exec porta-postgres pg_dump -U porta -Fc --no-owner porta > /backups/porta_$(date +\%Y\%m\%d).dump
```

#### Point-in-Time Recovery (PITR)

For continuous backup with the ability to restore to any point in time, configure
[WAL archiving](https://www.postgresql.org/docs/16/continuous-archiving.html):

1. Enable WAL archiving in `postgresql.conf`:
   ```
   wal_level = replica
   archive_mode = on
   archive_command = 'cp %p /archive/%f'
   ```
2. Take periodic base backups with `pg_basebackup`
3. Restore by replaying WAL files up to the desired timestamp

::: tip Managed Databases
Cloud-managed PostgreSQL services (AWS RDS, GCP Cloud SQL, Azure Database for PostgreSQL)
provide automated PITR out of the box — typically with configurable retention up to 35 days.
This is the simplest approach for production deployments.
:::

#### Restore Procedures

```bash
# Restore from custom format dump
docker exec -i porta-postgres pg_restore \
  -U porta \
  --no-owner \
  --no-privileges \
  -d porta < porta_20260420_020000.dump

# Restore from plain SQL dump
docker exec -i porta-postgres psql -U porta porta < porta_20260420_020000.sql
```

::: danger Test Your Backups
A backup that has never been tested is not a backup. Periodically restore to a staging
environment to verify data integrity and measure restore time.
:::

#### Backup Encryption & Retention

- **Encrypt at rest** — Store backups in encrypted storage (S3 with SSE-KMS, GCS with CMEK,
  or gpg-encrypted files on disk)
- **Encrypt in transit** — Use TLS connections for any remote backup transfer

**Suggested retention policy:**

| Period | Frequency | Keep |
|--------|-----------|------|
| Daily | Every day | 7 days |
| Weekly | Every Sunday | 4 weeks |
| Monthly | 1st of month | 12 months |

Adjust based on your compliance requirements and storage budget.

### Access Controls

Porta stores signing keys as PEM-encoded private keys in the `signing_keys` database
table. Until at-rest encryption (KEK) is implemented, restrict database-level access
as an interim security measure.

#### Principle of Least Privilege

Create separate database roles for the application and for migrations:

```sql
-- Application role: can read/write data but NOT alter schema
CREATE ROLE porta_app LOGIN PASSWORD 'app-password-here';
GRANT CONNECT ON DATABASE porta TO porta_app;
GRANT USAGE ON SCHEMA public TO porta_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO porta_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO porta_app;

-- Migration role: can alter schema (used only during deployments)
CREATE ROLE porta_migrate LOGIN PASSWORD 'migrate-password-here';
GRANT CONNECT ON DATABASE porta TO porta_migrate;
GRANT ALL PRIVILEGES ON SCHEMA public TO porta_migrate;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO porta_migrate;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO porta_migrate;
```

Update your connection strings:
- **Application** (`DATABASE_URL`): use `porta_app`
- **Migrations** (`porta migrate up`): use `porta_migrate`

#### Restrict Signing Key Access

If you cannot use separate roles, at minimum restrict direct `SELECT` on the
`signing_keys` table to prevent exposure through SQL injection or application bugs:

```sql
-- Revoke default access, then grant only to the app role
REVOKE ALL ON TABLE signing_keys FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE signing_keys TO porta_app;
```

::: tip
This is an interim mitigation. A future release will add envelope encryption (KEK)
so that signing keys are encrypted at rest in the database.
:::

## Redis

### What Porta Stores in Redis

Porta uses Redis for **short-lived, ephemeral data** only:

| Data Type | Purpose | TTL |
|-----------|---------|-----|
| OIDC Sessions | Login interaction state | Minutes |
| Authorization Codes | PKCE auth code exchange | Minutes |
| OIDC Interactions | Consent/login flow state | Minutes |
| Rate Limit Counters | Brute-force protection | 60 seconds |
| Tenant Cache | Organization lookup cache | 5 minutes |
| Client Cache | Client metadata cache | 5 minutes |
| RBAC Cache | Role/permission lookup cache | 5 minutes |

### Data Loss Tolerance

All Redis data is **ephemeral and reconstructable**. If Redis is flushed or restarted:

- Active login sessions are invalidated — users must re-authenticate
- Rate limit counters reset — temporarily allows more attempts (self-correcting)
- Cache entries are evicted — rebuilt on next access from PostgreSQL

**No permanent data is lost.** PostgreSQL is the sole source of truth for all durable state.

### Recommended Settings

For production Redis, configure these settings in `redis.conf` or via container command:

```bash
# AOF persistence — provides durability across Redis restarts
# (belt-and-suspenders with the default RDB snapshots)
appendonly yes
appendfsync everysec

# Memory limit with LRU eviction — prevents Redis from consuming
# all available memory; safe because all data is cache/ephemeral
maxmemory 256mb
maxmemory-policy allkeys-lru
```

**Docker Compose example:**

```yaml
redis:
  image: redis:7-alpine
  command: >
    redis-server
    --appendonly yes
    --maxmemory 256mb
    --maxmemory-policy allkeys-lru
```

::: tip No Redis Backup Required
Since Redis contains only ephemeral data, **backup is not required**. PostgreSQL
backup covers all durable state. Focus your backup strategy on PostgreSQL.
:::

## Security

### HTTPS / Reverse Proxy

Porta listens on HTTP. Use a reverse proxy for TLS termination:

**Nginx example:**

```nginx
server {
    listen 443 ssl http2;
    server_name auth.example.com;

    ssl_certificate     /etc/ssl/certs/auth.example.com.pem;
    ssl_certificate_key /etc/ssl/private/auth.example.com-key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Caddy example** (automatic HTTPS):

```
auth.example.com {
    reverse_proxy localhost:3000
}
```

::: warning TRUST_PROXY Required
When running behind a TLS-terminating reverse proxy, you **must** set `TRUST_PROXY=true`.
Without it, Porta cannot detect that the original connection was HTTPS — cookies will be
set without the `Secure` flag, and OIDC login flows will fail because browsers silently
drop insecure cookies on HTTPS pages.

`TRUST_PROXY` tells Koa to trust `X-Forwarded-Proto` and `X-Forwarded-For` headers
from the proxy, so `ctx.secure`, `ctx.protocol`, and `ctx.ip` reflect the real client
connection rather than the internal HTTP hop.
:::

::: tip
Make sure `ISSUER_BASE_URL` matches your public domain (e.g., `https://auth.example.com`).
OIDC tokens include the issuer URL, and clients validate it.
:::

### Key Rotation

Regular key rotation limits the impact of key compromise. Porta supports zero-downtime
rotation for all three secret types: signing keys, cookie keys, and client secrets.

#### Signing Key Rotation

Porta uses ES256 (ECDSA P-256) keys for JWT signing. Multiple keys can be active
simultaneously — the newest key signs new tokens while older keys verify existing ones.

**Zero-downtime rotation procedure:**

```bash
# 1. List current signing keys
docker exec porta-app node dist/cli/index.js keys list

# 2. Generate a new signing key (becomes the active signing key)
docker exec porta-app node dist/cli/index.js keys generate

# 3. Verify the new key is active
docker exec porta-app node dist/cli/index.js keys list
```

After generating a new key, the old key remains in the database for token verification.
Wait for all existing tokens to expire before deactivating the old key:

| Token Type | Default TTL | Wait Before Deactivation |
|------------|-------------|--------------------------|
| Access Token | 1 hour | 1 hour |
| Refresh Token | 14 days | 14 days |
| ID Token | 1 hour | 1 hour |

```bash
# 4. After the longest TTL has elapsed, deactivate the old key
docker exec porta-app node dist/cli/index.js keys rotate
```

::: warning
Never deactivate the old key before its tokens expire — clients will receive
`invalid_token` errors when presenting tokens signed with a deactivated key.
:::

**Recommended rotation schedule:** Every 90 days, or immediately if a key is suspected
to be compromised.

#### Cookie Key Rotation

`COOKIE_KEYS` is an ordered, comma-separated list. The **first** key signs new cookies;
**all** keys are used for verification. This enables seamless rotation:

```bash
# 1. Generate a new cookie key
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
# Output: dG9wLXNlY3JldC1rZXktZXhhbXBsZQ...

# 2. Prepend the new key to COOKIE_KEYS (newest first)
# Before: COOKIE_KEYS=old-key-here
# After:  COOKIE_KEYS=new-key-here,old-key-here

# 3. Restart Porta with the updated COOKIE_KEYS
docker compose -f docker/docker-compose.prod.yml restart porta

# 4. After session TTL expires (~24h), remove the old key
# Final:  COOKIE_KEYS=new-key-here
```

::: tip
When running multiple Porta replicas, update `COOKIE_KEYS` on **all instances
simultaneously** — mismatched keys cause cookie verification failures.
:::

#### Client Secret Rotation

OIDC clients can have multiple active secrets, enabling zero-downtime rotation
for consuming services:

```bash
# 1. Generate a new secret for the client
docker exec porta-app node dist/cli/index.js client secret generate <client-id>
# Output: new secret value (save this — it cannot be retrieved later)

# 2. Update the consuming service/application with the new secret

# 3. Verify the consuming service works with the new secret

# 4. Revoke the old secret
docker exec porta-app node dist/cli/index.js client secret list <client-id>
docker exec porta-app node dist/cli/index.js client secret revoke <client-id> <old-secret-id>
```

::: danger
Client secrets are displayed only once at generation time. Store the new secret
securely in your consuming service before revoking the old one.
:::

## Health Checks & Readiness

Porta exposes two diagnostic endpoints:

### `GET /health` — Liveness

Confirms the server process is running and can reach PostgreSQL and Redis.

**Response (healthy — 200):**
```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "redis": "ok"
  }
}
```

**Response (unhealthy — 503):**
```json
{
  "status": "error",
  "checks": {
    "database": "ok",
    "redis": "error"
  }
}
```

### `GET /ready` — Readiness

Verifies the server is ready to accept traffic by running a real DB query (`SELECT 1`) and a Redis `PING`, both with a **2-second timeout**. Returns `200` when ready, `503` when not.

Use `/ready` for:
- **Kubernetes readiness probes** — prevents traffic routing before the server is fully ready
- **Load balancer health checks** — remove unhealthy instances from rotation
- **Orchestrator startup checks** — wait for full connectivity before considering the container healthy

Use `/health` for:
- Docker `HEALTHCHECK` (already configured in the image)
- Basic uptime monitoring (Uptime Robot, Pingdom, etc.)

**Docker Compose example with readiness:**

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/ready"]
  interval: 30s
  timeout: 5s
  start_period: 30s
  retries: 3
```

**Kubernetes example:**

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 30
readinessProbe:
  httpGet:
    path: /ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
```

## Logging

Porta uses [pino](https://github.com/pinojs/pino) for structured logging:

| `NODE_ENV` | Format | Behavior |
|------------|--------|----------|
| `development` | Pretty-printed (pino-pretty) | Human-readable, colorized |
| `production` | JSON (one line per entry) | Machine-parseable, suitable for log aggregators |
| `test` | Silent | No log output |

### PII Redaction

Porta automatically redacts sensitive fields from log output to prevent personally identifiable information (PII) from leaking into log aggregators. The following fields are replaced with `[Redacted]` in all log entries:

| Redacted Field | Reason |
|----------------|--------|
| `password` | User credentials |
| `token` | Access/refresh tokens |
| `authorization` | Bearer tokens in headers |
| `cookie` | Session cookies |
| `refresh_token` | OIDC refresh tokens |
| `client_secret` | OIDC client secrets |

This redaction is always active regardless of `NODE_ENV` or `LOG_LEVEL`.

In production, pipe JSON logs to your log aggregator (ELK, Datadog, CloudWatch, etc.):

```bash
# View logs
docker compose -f docker/docker-compose.prod.yml logs -f porta

# With jq for readable JSON
docker logs porta-app | jq .
```

## Graceful Shutdown

Porta handles `SIGTERM` and `SIGINT` signals for graceful shutdown:

1. The HTTP server stops accepting new connections
2. In-flight requests are allowed to complete
3. The server closes via a promisified `server.close()`
4. Database and Redis connections are disconnected
5. A **10-second kill switch** forces exit if cleanup stalls

This ensures zero dropped requests during rolling deployments and container orchestration restarts.

::: tip
Kubernetes sends `SIGTERM` before killing a pod. Set `terminationGracePeriodSeconds: 15` (or higher) in your pod spec to give Porta enough time to drain.
:::

## Scaling

Porta is designed to be **horizontally scalable**:

- **Stateless application** — No in-memory sessions; all state is in PostgreSQL and Redis
- **Shared database** — All instances connect to the same PostgreSQL
- **Shared cache** — All instances share the same Redis for sessions and OIDC artifacts
- **Health check** — Each instance responds to `/health` independently

To scale, run multiple Porta containers behind a load balancer:

```yaml
services:
  porta:
    image: blendsdk/porta:latest
    deploy:
      replicas: 3
    # ... (same config as above)
```

::: warning
When running multiple replicas, ensure `COOKIE_KEYS` and `TWO_FACTOR_ENCRYPTION_KEY`
are identical across all instances. These are encryption keys — different values will
cause decryption failures.
:::

## Custom UI & Templates

Porta supports full customization of login pages and email templates. See the
[Custom UI Tutorial](./custom-ui.md) for a complete guide.

### Per-Org Branding (Zero Code)

The fastest approach — set branding via the Admin API or CLI without touching any files:

```bash
porta org branding <org-id> \
  --logo-url "https://cdn.example.com/logo.png" \
  --primary-color "#E11D48" \
  --company-name "Acme Corp"
```

### Custom Templates (Volume Mount)

For full control, mount a custom templates directory:

```yaml
services:
  porta:
    image: blendsdk/porta:latest
    volumes:
      - ./my-templates:/app/templates/default:ro
```

::: warning
When mounting custom templates, include **all** template files (layouts, pages, partials,
emails). Porta reads from the mounted directory exclusively — it does not merge with
built-in defaults.
:::

### Custom Templates (Docker Image)

For immutable deployments, build a custom image:

```dockerfile
FROM blendsdk/porta:latest
COPY my-templates/ /app/templates/default/
```

---

## Monitoring

### Prometheus Metrics

When `METRICS_ENABLED=true`, Porta exposes a Prometheus-compatible `GET /metrics` endpoint using [prom-client](https://github.com/slotscheck/prom-client) v15.

**Available metrics:**

| Metric | Type | Description |
|--------|------|-------------|
| `porta_http_requests_total` | Counter | Total HTTP requests (labels: `method`, `status_code`, `path`) |
| Default Node.js metrics | Various | CPU, memory, event loop lag, GC (via `collectDefaultMetrics()`) |

**Enable in Docker Compose:**

```yaml
environment:
  METRICS_ENABLED: "true"
```

**Prometheus scrape config:**

```yaml
scrape_configs:
  - job_name: porta
    scrape_interval: 15s
    static_configs:
      - targets: ['porta:3000']
    metrics_path: /metrics
```

When `METRICS_ENABLED` is `false` (default), the `/metrics` endpoint returns `404`.

::: info
The metrics endpoint is **unauthenticated**. If exposing Porta directly to the internet, restrict access to `/metrics` via your reverse proxy or firewall.
:::

### General Monitoring

Beyond Prometheus metrics, monitor:

| Metric | Source | What to Watch |
|--------|--------|---------------|
| Health status | `GET /health` | Any non-200 response |
| Readiness | `GET /ready` | 503 responses indicate DB/Redis connectivity issues |
| Response times | Reverse proxy logs | P95 > 500ms |
| Error rate | Application logs (`level: 50+`) | Spike in errors |
| PostgreSQL connections | `pg_stat_activity` | Connection pool exhaustion |
| Redis memory | `redis-cli info memory` | Memory approaching limits |
| Disk usage | PostgreSQL data volume | Running out of space |
| Rate limit hits | Audit log `security.rate_limited` | Brute-force attempts |
| Account lockouts | Audit log `user.locked` | Credential-stuffing attacks |

---

## Rate Limiting

Porta applies Redis-backed, per-IP rate limiting to sensitive endpoints:

| Scope | Limit | Window | Endpoints |
|-------|-------|--------|-----------|
| **Token endpoint** | 30 requests | 5 minutes | `POST /:orgSlug/auth/token` |
| **Admin API** (write ops) | 60 requests | 60 seconds | `POST/PUT/PATCH/DELETE /api/admin/*` |
| **Introspection** | 100 requests | 60 seconds | `POST /:orgSlug/auth/token/introspection` |
| **Login interactions** | Per existing auth rate limiter | — | `POST /:orgSlug/interaction/*` |

When a rate limit is exceeded, the server returns `429 Too Many Requests` with a `Retry-After` header. Rate limit events are logged to the audit trail as `security.rate_limited`.

::: info
Rate limit counters are stored in Redis and automatically expire. If Redis is restarted, counters reset — this temporarily allows more attempts but is self-correcting.
:::

---

## Account Lockout

Porta automatically locks user accounts after repeated failed login attempts to protect against brute-force and credential-stuffing attacks.

### How It Works

1. Each failed login increments a per-user `failed_login_count` counter in PostgreSQL
2. When the count reaches the threshold (default: **5 attempts**), the account is auto-locked
3. After the cooldown period (default: **15 minutes**), the account auto-unlocks on the next login attempt
4. A successful login resets the failed count to zero

### Configuration

Account lockout thresholds are managed via `system_config`:

```bash
# View current settings
porta config get --key account_lockout_threshold
porta config get --key account_lockout_cooldown_minutes

# Change lockout threshold (default: 5)
porta config set --key account_lockout_threshold --value 10

# Change cooldown period in minutes (default: 15)
porta config set --key account_lockout_cooldown_minutes --value 30
```

### Security Design

- **No information leakage** — Locked accounts return the same error as invalid credentials, preventing account enumeration
- **Audit logging** — Every auto-lock event is logged as `user.locked` with metadata indicating the trigger
- **Admin override** — Administrators can manually unlock a user at any time via `porta user unlock` or the Admin API

---

## Request Size Limits

Porta enforces body parser size limits to prevent denial-of-service via oversized payloads:

| Content Type | Limit |
|-------------|-------|
| `application/json` | 100 KB |
| `application/x-www-form-urlencoded` | 100 KB |
| `text/plain` | 100 KB |

Requests exceeding these limits receive a `413 Payload Too Large` response.

---

## GDPR Compliance

Porta provides built-in support for GDPR data portability (Article 20) and right to erasure (Article 17).

### Data Export (Article 20)

Export all personal data for a user in JSON format:

```bash
# Via CLI
porta user export --org-id <id> --user-id <id>

# Via API
GET /api/admin/organizations/:orgId/users/:userId/export
```

The export includes: profile data, organization membership, role assignments, custom claim values, audit log entries, 2FA enrollment status, and active OIDC sessions.

### Data Purge (Article 17)

Permanently anonymize and delete a user's personal data:

```bash
# Via CLI (requires confirmation)
porta user purge --org-id <id> --user-id <id>

# Via API
POST /api/admin/organizations/:orgId/users/:userId/purge
```

The purge anonymizes the user record (replaces email, name, etc. with anonymized values) and deletes all associated data (roles, claims, tokens, 2FA enrollment, audit metadata) in a single database transaction.

::: danger
**Data purge is irreversible.** The CLI prompts for confirmation; use `--force` to skip. Super-admin users cannot be purged as a safety measure.
:::

### Audit Retention

Configure automatic cleanup of old audit log entries:

```bash
# Set retention period (in days)
porta config set --key audit_retention_days --value 365

# Run cleanup (deletes entries older than retention period)
porta audit cleanup
```

See [Audit Log API](/api/audit) and [CLI Infrastructure](/cli/infrastructure) for details.
