# Production Deployment

> **Last Updated**: 2026-09-17

Guidance for deploying Porta to production environments using Docker.

## Editable Global Configuration

The closed database-backed catalog contains exactly 18 editable settings. PostgreSQL stores native
JSONB integers or the locale string; code owns metadata, defaults and inclusive bounds. Administrators
cannot create, rename or delete arbitrary keys. Internal `super_admin_user_id` is not editable or
exposed through the configuration API.

| Key                                | Default   | Inclusive range / choices | Unit     | Application mode   |
| ---------------------------------- | --------- | ------------------------- | -------- | ------------------ |
| `access_token_ttl`                 | `3600`    | `60..86400`               | seconds  | `restart-required` |
| `id_token_ttl`                     | `3600`    | `60..86400`               | seconds  | `restart-required` |
| `refresh_token_ttl`                | `2592000` | `300..31536000`           | seconds  | `restart-required` |
| `authorization_code_ttl`           | `600`     | `30..3600`                | seconds  | `restart-required` |
| `session_ttl`                      | `86400`   | `300..2592000`            | seconds  | `restart-required` |
| `magic_link_ttl`                   | `900`     | `60..3600`                | seconds  | `runtime`          |
| `password_reset_ttl`               | `3600`    | `300..86400`              | seconds  | `runtime`          |
| `invitation_ttl`                   | `604800`  | `300..2592000`            | seconds  | `runtime`          |
| `rate_limit_login_max`             | `10`      | `1..100`                  | attempts | `runtime`          |
| `rate_limit_login_window`          | `900`     | `60..86400`               | seconds  | `runtime`          |
| `rate_limit_magic_link_max`        | `5`       | `1..100`                  | attempts | `runtime`          |
| `rate_limit_magic_link_window`     | `900`     | `60..86400`               | seconds  | `runtime`          |
| `rate_limit_password_reset_max`    | `5`       | `1..100`                  | attempts | `runtime`          |
| `rate_limit_password_reset_window` | `900`     | `60..86400`               | seconds  | `runtime`          |
| `max_failed_logins`                | `5`       | `1..100`                  | attempts | `runtime`          |
| `lockout_duration_seconds`         | `900`     | `60..604800`              | seconds  | `runtime`          |
| `audit_retention_days`             | `90`      | `1..3650`                 | days     | `runtime`          |
| `default_locale`                   | `en`      | `en only`                 | locale   | `runtime`          |

Use [the Configuration API](../api/config.md), `porta config list|get|set`, or **System Configuration…**
in `porta admin`; see [the environment reference](./environment.md#editable-global-configuration).
After successful save/commit, the local process cache is cleared and subsequent runtime reads
see the saved policy immediately. Other healthy server instances pick up runtime changes on their
next read within the existing at-most-60-second cache lifetime. There is no broadcast invalidation.

The five `restart-required` lifetime keys require restarting every Porta server instance after
saving. Stored changes do not reconfigure an already running OIDC provider. API/SDK results return
`restartRequired: true` for these keys or a batch containing one. Runtime-only batches return `false`.
Porta does not automatically restart servers or instantly invalidate every instance's cache.
Existing token/link absolute expiries and Redis counter expiries remain unchanged; current runtime
policy applies at the established next read/decision or artifact creation point.

## External Bootstrap Settings and Secrets

The following remain external, in environment variables or a secret manager, outside the editable
catalog/configuration API. Provide them before startup; never move root secrets into `system_config`.

| External setting                        | Source and purpose                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `DATABASE_URL`                          | Environment/secret manager; PostgreSQL connection and credentials            |
| `REDIS_URL`                             | Environment/secret manager; Redis connection and credentials                 |
| `ISSUER_BASE_URL`                       | Environment; public issuer/bootstrap URL                                     |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`   | Environment; SMTP connection and sender                                      |
| `SMTP_USER`, `SMTP_PASS`                | Secret manager/environment; SMTP credentials                                 |
| `COOKIE_KEYS`                           | Secret manager/environment; cookie signing key ring                          |
| `SIGNING_KEY_ENCRYPTION_KEY`            | Secret manager/environment; signing-key encryption root                      |
| `TWO_FACTOR_ENCRYPTION_KEY`             | Secret manager/environment; distinct TOTP encryption root                    |
| `NODE_ENV`, `HOST`, `PORT`, `LOG_LEVEL` | Environment; process bootstrap and logging                                   |
| `TRUST_PROXY`, `ADMIN_CORS_ORIGINS`     | Environment; trusted-proxy and authenticated CORS policy                     |
| TLS certificate/private key             | Reverse-proxy files/secret manager; HTTPS termination outside the config API |

Run migrations explicitly during deployment. Migration `030_global_configuration_catalog.sql`
resets canonical operational values to these native defaults, removes obsolete public rows and
preserves internal rows. Down is intentionally a no-op; database backup/restore remains the
operator's separate PostgreSQL workflow, not a configuration API feature.

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
      - '3000:3000'
    environment:
      NODE_ENV: production
      PORT: '3000'
      HOST: '0.0.0.0'
      DATABASE_URL: postgresql://porta:${POSTGRES_PASSWORD}@postgres:5432/porta
      REDIS_URL: redis://redis:6379
      ISSUER_BASE_URL: https://auth.example.com
      COOKIE_KEYS: ${COOKIE_KEYS}
      SMTP_HOST: smtp.example.com
      SMTP_PORT: '587'
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
      SMTP_FROM: noreply@example.com
      LOG_LEVEL: info
      TWO_FACTOR_ENCRYPTION_KEY: ${TWO_FACTOR_ENCRYPTION_KEY}
      SIGNING_KEY_ENCRYPTION_KEY: ${SIGNING_KEY_ENCRYPTION_KEY}
      TRUST_PROXY: 'true'
      PORTA_AUTO_MIGRATE: 'false'
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
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
      test: ['CMD-SHELL', 'pg_isready -U porta']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

::: warning
Never use default passwords or reusable example secrets in production. Generate strong, unique
values for `POSTGRES_PASSWORD` and `COOKIE_KEYS`. Generate
`SIGNING_KEY_ENCRYPTION_KEY` and `TWO_FACTOR_ENCRYPTION_KEY` separately: both are required,
external secrets of exactly 64 hexadecimal characters, and they must contain different values.
:::

## Environment Variables

### Required for Production

| Variable                     | Description                                | Example                                         |
| ---------------------------- | ------------------------------------------ | ----------------------------------------------- |
| `DATABASE_URL`               | PostgreSQL connection string               | `postgresql://porta:secret@postgres:5432/porta` |
| `REDIS_URL`                  | Redis connection string                    | `redis://redis:6379`                            |
| `ISSUER_BASE_URL`            | Public-facing URL (must match your domain) | `https://auth.example.com`                      |
| `COOKIE_KEYS`                | Cookie signing key (≥32 random characters) | `a1b2c3d4e5f6...`                               |
| `TWO_FACTOR_ENCRYPTION_KEY`  | AES-256-GCM key (exactly 64 hex chars)     | `${TWO_FACTOR_ENCRYPTION_KEY}`                  |
| `SIGNING_KEY_ENCRYPTION_KEY` | AES-256-GCM key (exactly 64 hex chars)     | `${SIGNING_KEY_ENCRYPTION_KEY}`                 |
| `SMTP_HOST`                  | SMTP relay hostname                        | `smtp.sendgrid.net`                             |
| `SMTP_PORT`                  | SMTP port                                  | `587`                                           |
| `SMTP_FROM`                  | Sender email address                       | `noreply@example.com`                           |

### Optional

| Variable             | Default      | Description                                                 |
| -------------------- | ------------ | ----------------------------------------------------------- |
| `NODE_ENV`           | `production` | Runtime mode                                                |
| `PORT`               | `3000`       | HTTP listen port                                            |
| `HOST`               | `0.0.0.0`    | HTTP listen address                                         |
| `LOG_LEVEL`          | `info`       | Log verbosity (`debug`, `info`, `warn`, `error`)            |
| `TRUST_PROXY`        | `true`       | Set to `false` when Porta is directly exposed (no proxy)    |
| `TRUST_PROXY_HOPS`   | `1`          | Number of trusted proxies that append to `X-Forwarded-For`  |
| `PORTA_AUTO_MIGRATE` | `false`      | Initial-setup migration switch; keep disabled in production |
| `PORTA_WAIT_TIMEOUT` | `60`         | Seconds to wait for DB/Redis at startup                     |

### Generating Secrets

```bash
# Cookie signing key (random 64-char string)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# Two-factor encryption key (64 hex chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Signing-key encryption key (64 hex chars); run separately and do not reuse the first result
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

### Secret Injection

Porta reads sensitive configuration from its documented environment variables. Have the
deployment platform or secret manager inject those values into the container environment before
the process starts. For Docker Compose, reference values from the host environment or an
uncommitted `.env` file:

```yaml
services:
  porta:
    image: blendsdk/porta:latest
    environment:
      NODE_ENV: production
      ISSUER_BASE_URL: https://auth.example.com
      DATABASE_URL: ${DATABASE_URL}
      COOKIE_KEYS: ${COOKIE_KEYS}
      TWO_FACTOR_ENCRYPTION_KEY: ${TWO_FACTOR_ENCRYPTION_KEY}
      SIGNING_KEY_ENCRYPTION_KEY: ${SIGNING_KEY_ENCRYPTION_KEY}
```

::: warning
Porta does not read `*_FILE` variables. A platform that mounts secrets as files must materialize
their contents into the documented environment variables before starting Porta. The two
encryption root keys must each contain exactly 64 hexadecimal characters and must have different
values.
:::

### Cloud Secret Managers

For cloud deployments, use your provider's secret management service:

| Provider  | Service                                                            | Inject Via                                   |
| --------- | ------------------------------------------------------------------ | -------------------------------------------- |
| **AWS**   | [Secrets Manager](https://aws.amazon.com/secrets-manager/)         | ECS task definition environment secrets      |
| **GCP**   | [Secret Manager](https://cloud.google.com/secret-manager)          | Cloud Run or GKE Secret environment values   |
| **Azure** | [Key Vault](https://azure.microsoft.com/en-us/products/key-vault/) | App Service Key Vault environment references |

Refer to your provider's documentation for environment injection and audit capabilities.

### HashiCorp Vault

For self-hosted or multi-cloud setups, [HashiCorp Vault](https://www.vaultproject.io/)
provides centralised secret management:

Use `vault kv get` or [envconsul](https://github.com/hashicorp/envconsul) to populate Porta's
documented environment variables before starting the process. This must include distinct
`SIGNING_KEY_ENCRYPTION_KEY` and `TWO_FACTOR_ENCRYPTION_KEY` values. For example:

```bash
envconsul -prefix porta/config ./start.sh
```

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

`PORTA_AUTO_MIGRATE` is an initial-setup convenience. Keep it `false` in production and run
`porta migrate up` explicitly as a controlled deployment step before starting the new release.

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

| Period  | Frequency    | Keep      |
| ------- | ------------ | --------- |
| Daily   | Every day    | 7 days    |
| Weekly  | Every Sunday | 4 weeks   |
| Monthly | 1st of month | 12 months |

Adjust based on your compliance requirements and storage budget.

### Access Controls

Porta stores signing public data and AES-256-GCM-encrypted private-key material in the
`signing_keys` table. The external `SIGNING_KEY_ENCRYPTION_KEY` decrypts that material and must
remain outside PostgreSQL. Restrict database-level access as an additional control.

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

## Redis

### What Porta Stores in Redis

Porta uses Redis for **short-lived, ephemeral data** only:

| Data Type           | Purpose                      | TTL        |
| ------------------- | ---------------------------- | ---------- |
| OIDC Sessions       | Login interaction state      | Minutes    |
| Authorization Codes | PKCE auth code exchange      | Minutes    |
| OIDC Interactions   | Consent/login flow state     | Minutes    |
| Rate Limit Counters | Brute-force protection       | 60 seconds |
| Tenant Cache        | Organization lookup cache    | 5 minutes  |
| Client Cache        | Client metadata cache        | 5 minutes  |
| RBAC Cache          | Role/permission lookup cache | 5 minutes  |

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

    # Hide the exact nginx version from public response headers.
    server_tokens off;

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

::: warning TRUST_PROXY
`TRUST_PROXY` defaults to `true` because Porta ships behind a TLS-terminating reverse proxy.
Keep it `true` behind a proxy so Porta can detect that the original connection was HTTPS —
otherwise cookies are set without the `Secure` flag and OIDC login flows fail because
browsers silently drop insecure cookies on HTTPS pages.

`TRUST_PROXY` tells Koa to trust `X-Forwarded-Proto` and `X-Forwarded-For` headers
from the proxy, so `ctx.secure`, `ctx.protocol`, and `ctx.ip` reflect the real client
connection rather than the internal HTTP hop.

If Porta is directly exposed without a proxy, you **must** set `TRUST_PROXY=false`;
otherwise a client can spoof those headers.

With `TRUST_PROXY=true`, also set `TRUST_PROXY_HOPS` to the exact number of trusted proxies
that append to `X-Forwarded-For` (default `1`). It keeps the client IP used for rate
limiting and audit logging on the proxy-appended value instead of the client-supplied
leftmost value. See [Environment Variables → Trusted Proxy Hops](./environment.md#trusted-proxy-hops).
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

**Signing-key change procedure:**

```bash
# 1. List current signing keys
docker exec porta-app node dist/cli/index.js keys list

# 2. Add another active signing key without retiring existing active keys
docker exec porta-app node dist/cli/index.js keys generate

# 3. Restart every running Porta instance so each provider reloads committed keys
docker compose -f docker/docker-compose.prod.yml restart porta

# 4. After restarting, verify the committed active signing key
docker exec porta-app node dist/cli/index.js keys list
```

`porta keys generate` leaves every existing active key active. By contrast, `porta keys rotate`
atomically retires every active key and creates one new active key. Rotation is therefore a
deliberate replacement operation, not a later deactivation step for one generated key. After a
successful rotation, restart every running Porta instance and verify the committed active signing
key with `porta keys list` after restarting.

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
  test: ['CMD', 'curl', '-f', 'http://localhost:3000/ready']
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

| `NODE_ENV`    | Format                       | Behavior                                        |
| ------------- | ---------------------------- | ----------------------------------------------- |
| `development` | Pretty-printed (pino-pretty) | Human-readable, colorized                       |
| `production`  | JSON (one line per entry)    | Machine-parseable, suitable for log aggregators |
| `test`        | Silent                       | No log output                                   |

### PII Redaction

Porta automatically redacts sensitive fields from log output to prevent personally identifiable information (PII) from leaking into log aggregators. The following fields are replaced with `[Redacted]` in all log entries:

| Redacted Field  | Reason                   |
| --------------- | ------------------------ |
| `password`      | User credentials         |
| `token`         | Access/refresh tokens    |
| `authorization` | Bearer tokens in headers |
| `cookie`        | Session cookies          |
| `refresh_token` | OIDC refresh tokens      |
| `client_secret` | OIDC client secrets      |

This redaction is always active regardless of `NODE_ENV` or `LOG_LEVEL`.

For covered administrative and authentication requests, use the single structured
`security.decision.v1` record as the terminal authorization/validation outcome. Correlate on its
server-generated `requestId`; do not attempt to reconstruct a decision by joining ordinary request
messages or audit rows. The event uses normalized route templates and closed reason codes and never
contains raw request values or error diagnostics.

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
When running multiple replicas, each instance must receive the same `COOKIE_KEYS`, the same
`TWO_FACTOR_ENCRYPTION_KEY`, and the same `SIGNING_KEY_ENCRYPTION_KEY`. The signing-key and
two-factor root keys must still be different from one another. Mismatched per-variable values
across instances cause verification or decryption failures.
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

| Metric                      | Type    | Description                                                     |
| --------------------------- | ------- | --------------------------------------------------------------- |
| `porta_http_requests_total` | Counter | Total HTTP requests (labels: `method`, `status_code`, `path`)   |
| Default Node.js metrics     | Various | CPU, memory, event loop lag, GC (via `collectDefaultMetrics()`) |

**Enable in Docker Compose:**

```yaml
environment:
  METRICS_ENABLED: 'true'
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

| Metric                 | Source                            | What to Watch                                       |
| ---------------------- | --------------------------------- | --------------------------------------------------- |
| Health status          | `GET /health`                     | Any non-200 response                                |
| Readiness              | `GET /ready`                      | 503 responses indicate DB/Redis connectivity issues |
| Response times         | Reverse proxy logs                | P95 > 500ms                                         |
| Error rate             | Application logs (`level: 50+`)   | Spike in errors                                     |
| PostgreSQL connections | `pg_stat_activity`                | Connection pool exhaustion                          |
| Redis memory           | `redis-cli info memory`           | Memory approaching limits                           |
| Disk usage             | PostgreSQL data volume            | Running out of space                                |
| Rate limit hits        | Audit log `security.rate_limited` | Brute-force attempts                                |
| Account lockouts       | Audit log `user.auto_locked`      | Credential-stuffing attacks                         |

---

## Rate Limiting

Porta applies Redis-backed, per-IP rate limiting to sensitive endpoints:

| Scope                     | Limit                          | Window     | Endpoints                            |
| ------------------------- | ------------------------------ | ---------- | ------------------------------------ |
| **Token endpoint**        | 30 requests                    | 5 minutes  | `POST /:orgSlug/auth/token`          |
| **Admin API** (write ops) | 60 requests                    | 60 seconds | `POST/PUT/PATCH/DELETE /api/admin/*` |
| **Introspection**         | 100 requests                   | 60 seconds | `POST /:orgSlug/token/introspection` |
| **Login interactions**    | Per existing auth rate limiter | —          | `POST /:orgSlug/interaction/*`       |

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
porta config get max_failed_logins
porta config get lockout_duration_seconds

# Change lockout threshold (default: 5)
porta config set max_failed_logins 10

# Change cooldown period in seconds (default: 900); 1800 seconds is 30 minutes
porta config set lockout_duration_seconds 1800
```

### Security Design

- **No information leakage** — Locked accounts return the same error as invalid credentials, preventing account enumeration
- **Audit logging** — Every auto-lock event is logged as `user.auto_locked` with metadata indicating the trigger
- **Automatic recovery** — Locked accounts return to active after the configured cooldown

---

## Request Size Limits

Porta enforces body parser size limits to prevent denial-of-service via oversized payloads:

| Content Type                        | Limit  |
| ----------------------------------- | ------ |
| `application/json`                  | 100 KB |
| `application/x-www-form-urlencoded` | 100 KB |
| `text/plain`                        | 100 KB |

Requests exceeding these limits receive a `413 Payload Too Large` response.

---

## GDPR Compliance

Porta provides data portability and physical account deletion operations.

### Data Export (Article 20)

Export all personal data for a user in JSON format:

```bash
# Via CLI
porta user export --org-id <id> --user-id <id>

# Via API
GET /api/admin/organizations/:orgId/users/:userId/export
```

The export includes: profile data, organization membership, role assignments, custom claim values, audit log entries, 2FA enrollment status, and active OIDC sessions.

### User Deletion

Permanently delete a user and owned identity and security data:

```bash
# Via CLI (requires confirmation)
porta user delete <org-id> <user-id>

# Via API
DELETE /api/admin/organizations/:orgId/users/:userId
```

The operation deletes the user record and owned roles, claims, credentials, recovery data, and
server-backed sessions in one database transaction. Audit history is retained separately according
to the configured retention policy and may identify the deleted user.

::: danger
**User deletion is irreversible.** The CLI always asks whether to keep or delete the named user.
A control-plane user cannot be deleted when that would leave no other active user with the exact
built-in `porta-super-admin` role.
:::

### Audit Retention

Configure automatic cleanup of old audit log entries:

```bash
# Set retention period (in days)
porta config set audit_retention_days 365

# Run cleanup (deletes entries older than retention period)
porta audit cleanup
```

See [Audit Log API](/api/audit) and [CLI Infrastructure](/cli/infrastructure) for details.
