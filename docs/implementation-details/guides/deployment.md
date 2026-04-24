# Deployment Guide

> **Last Updated**: 2026-04-24

## Deployment Options

Porta can be deployed in three ways:

1. **Docker Compose** (recommended for most deployments)
2. **Docker image** with external PostgreSQL and Redis
3. **Source build** on bare metal / VM

## Docker Compose Deployment

### Prerequisites

- Docker Engine ≥ 20.10
- Docker Compose v2
- A domain name with DNS pointing to your server
- A TLS-terminating reverse proxy (nginx, Caddy, Traefik)

### 1. Create Project Directory

```bash
mkdir porta && cd porta
```

### 2. Create Environment File

```bash
cat > .env << 'EOF'
# Required
DATABASE_URL=postgresql://porta:porta@postgres:5432/porta
REDIS_URL=redis://redis:6379
ISSUER_BASE_URL=https://auth.yourdomain.com
COOKIE_KEYS=<generate-a-64-char-hex-string>
NODE_ENV=production

# SMTP (for magic links, password reset, invitations)
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM=noreply@yourdomain.com
EOF
```

Generate a secure `COOKIE_KEYS` value:

```bash
openssl rand -hex 32
```

### 3. Create Docker Compose File

```yaml
# docker-compose.yml
version: '3.8'

services:
  porta:
    image: blendsdk/porta:latest
    ports:
      - '3000:3000'
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: porta
      POSTGRES_PASSWORD: porta
      POSTGRES_DB: porta
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U porta']
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
```

### 4. Start Services

```bash
docker compose up -d
```

The entrypoint script automatically:
1. Runs database migrations
2. Starts the Porta server

### 5. Bootstrap Admin

```bash
docker exec -it porta-porta-1 porta init
```

Follow the interactive prompts to create the super-admin organization and first admin user.

### 6. Configure Reverse Proxy

Example nginx configuration:

```nginx
server {
    listen 443 ssl http2;
    server_name auth.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 7. Verify Deployment

```bash
curl https://auth.yourdomain.com/health
```

## Standalone Docker Image

For deployments with externally managed PostgreSQL and Redis:

```bash
docker run -d \
  --name porta \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://user:pass@db-host:5432/porta \
  -e REDIS_URL=redis://redis-host:6379 \
  -e ISSUER_BASE_URL=https://auth.yourdomain.com \
  -e COOKIE_KEYS=your-secure-key \
  -e NODE_ENV=production \
  blendsdk/porta:latest
```

## Source Build Deployment

### Build

```bash
git clone git@github.com:blendsdk/porta-identity.git
cd porta-identity
yarn install --frozen-lockfile
yarn build
```

### Run

```bash
NODE_ENV=production node dist/index.js
```

Requires `node_modules/` to be present alongside `dist/`.

## Production Checklist

### Security

| Item | Check |
|------|-------|
| `NODE_ENV` | Set to `production` |
| `ISSUER_BASE_URL` | Uses `https://` |
| `COOKIE_KEYS` | Cryptographically random, at least 32 bytes hex |
| TLS | Terminated at reverse proxy |
| Database | Not exposed to internet |
| Redis | Not exposed to internet |
| Secrets | Not committed to version control |

### Configuration Safety

Porta enforces production safety checks via Zod's `superRefine`:

- In production, `ISSUER_BASE_URL` must use `https://`
- Cookie security settings must match the transport security
- Invalid production configurations cause a fail-fast exit

### Infrastructure

| Item | Check |
|------|-------|
| PostgreSQL | Version 16+, regular backups configured |
| Redis | Version 7+, memory limits set |
| Disk | Sufficient space for PostgreSQL data + audit logs |
| Memory | ≥ 512MB for Porta container |
| Monitoring | Health check endpoint (`/health`) monitored |
| Logging | JSON logs shipped to log aggregator |

### Operational

| Item | Check |
|------|-------|
| Migrations | Run automatically on container start |
| Backups | PostgreSQL `pg_dump` on schedule |
| Key rotation | ES256 signing keys rotated periodically |
| Audit log | Retention policy configured |
| Admin access | First admin user created via `porta init` |

## Upgrades

### Docker Compose Upgrade

```bash
# Pull latest image
docker compose pull porta

# Restart (migrations run automatically)
docker compose up -d
```

### Rollback

If an upgrade causes issues:

```bash
# Stop the new version
docker compose down

# Pin to the previous version in docker-compose.yml
# image: blendsdk/porta:1.2.3

# Start the previous version
docker compose up -d
```

::: danger Migration Rollback
Database migrations are forward-only in production. Rolling back a migration requires manual intervention with `porta migrate down` and should be done with extreme care.
:::

## Monitoring

### Health Check

Poll `GET /health` every 30 seconds. Alert if:
- Status 503 (service unhealthy)
- No response within 5 seconds

### Logs

Porta logs JSON in production to stdout:

```json
{"level":"info","time":1234567890,"msg":"Server listening on port 3000"}
{"level":"info","time":1234567891,"msg":"GET /health 200 2ms","requestId":"abc-123"}
```

Ship to your log aggregator (ELK, Datadog, CloudWatch, etc.) for analysis.

### Key Metrics to Monitor

| Metric | Source | Alert Threshold |
|--------|--------|----------------|
| Health status | `GET /health` | Non-200 response |
| Response time | Request logger | P95 > 500ms |
| Error rate | Error handler logs | > 1% of requests |
| DB connections | PostgreSQL pool | Pool exhaustion |
| Redis memory | Redis `INFO` | > 80% maxmemory |
| Disk usage | OS metrics | > 85% |

## Related Documentation

- [Infrastructure](/implementation-details/architecture/infrastructure) — Docker architecture and CI/CD
- [Configuration Reference](/implementation-details/reference/configuration) — All environment variables
- [Security](/implementation-details/architecture/security) — Production security requirements
- [Quick Start Guide](/guide/quickstart) — Product documentation for operators
