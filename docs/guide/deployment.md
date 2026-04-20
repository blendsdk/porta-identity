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

### Backups

Set up regular PostgreSQL backups:

```bash
# Manual backup
docker exec porta-postgres pg_dump -U porta porta > backup_$(date +%Y%m%d).sql

# Restore from backup
docker exec -i porta-postgres psql -U porta porta < backup_20260420.sql
```

For production, use a scheduled backup solution (pg_dump cron job, WAL archiving,
or a managed database service with automated backups).

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

::: tip
Make sure `ISSUER_BASE_URL` matches your public domain (e.g., `https://auth.example.com`).
OIDC tokens include the issuer URL, and clients validate it.
:::

### Cookie Key Rotation

Cookie keys support rotation without invalidating existing sessions:

1. Generate a new cookie key
2. Set `COOKIE_KEYS` to `new-key,old-key` (comma-separated, newest first)
3. Restart Porta — new cookies use the new key, old cookies still validate
4. After session TTL expires, remove the old key

### Signing Key Management

Porta uses ES256 (ECDSA P-256) keys for JWT signing. Keys are stored in the database
and auto-generated on first startup.

```bash
# List current signing keys
docker exec porta-app node dist/cli/index.js keys list

# Generate a new key (for rotation)
docker exec porta-app node dist/cli/index.js keys generate

# Rotate: mark old key inactive, activate new key
docker exec porta-app node dist/cli/index.js keys rotate
```

Keep at least one previous key active during rotation so existing tokens can still
be verified until they expire.

## Health Checks

The `GET /health` endpoint checks:
- ✅ Server is running
- ✅ PostgreSQL connection is alive
- ✅ Redis connection is alive

**Response (healthy):**
```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "redis": "ok"
  }
}
```

**Response (unhealthy):**
```json
{
  "status": "error",
  "checks": {
    "database": "ok",
    "redis": "error"
  }
}
```

Use this endpoint for:
- Docker `HEALTHCHECK` (already configured in the image)
- Load balancer health checks
- Monitoring / uptime tools (Uptime Robot, Pingdom, etc.)

## Logging

Porta uses [pino](https://github.com/pinojs/pino) for structured logging:

| `NODE_ENV` | Format | Behavior |
|------------|--------|----------|
| `development` | Pretty-printed (pino-pretty) | Human-readable, colorized |
| `production` | JSON (one line per entry) | Machine-parseable, suitable for log aggregators |
| `test` | Silent | No log output |

In production, pipe JSON logs to your log aggregator (ELK, Datadog, CloudWatch, etc.):

```bash
# View logs
docker compose -f docker/docker-compose.prod.yml logs -f porta

# With jq for readable JSON
docker logs porta-app | jq .
```

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

## Monitoring

Beyond the health endpoint, monitor:

| Metric | Source | What to Watch |
|--------|--------|---------------|
| Health status | `GET /health` | Any non-200 response |
| Response times | Reverse proxy logs | P95 > 500ms |
| Error rate | Application logs (`level: 50+`) | Spike in errors |
| PostgreSQL connections | `pg_stat_activity` | Connection pool exhaustion |
| Redis memory | `redis-cli info memory` | Memory approaching limits |
| Disk usage | PostgreSQL data volume | Running out of space |
