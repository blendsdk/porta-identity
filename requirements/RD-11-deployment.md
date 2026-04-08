# RD-11: Deployment & Blue-Green

> **Document**: RD-11-deployment.md
> **Status**: Draft
> **Created**: 2026-04-08
> **Project**: Porta v5 — OIDC Provider
> **Depends On**: RD-01 (Project Scaffolding), All Domain RDs

---

## Feature Overview

Define the production deployment strategy for Porta v5, including the production Docker image, environment configuration, health checks, graceful shutdown, and blue-green deployment using [blendsdk/blue-green](https://github.com/blendsdk/blue-green). The deployment must support zero-downtime releases with instant rollback capability.

---

## Functional Requirements

### Must Have

- [ ] Production-optimized Dockerfile (multi-stage build)
- [ ] Docker image produces minimal, secure container
- [ ] Production environment configuration via environment variables
- [ ] Health check endpoint used by orchestrator (`GET /health`)
- [ ] Readiness check endpoint (`GET /ready`) — indicates app is ready to serve traffic
- [ ] Graceful shutdown on SIGTERM (drain connections, close DB/Redis)
- [ ] Blue-green deployment configuration using `blendsdk/blue-green`
- [ ] Zero-downtime deployment with instant rollback
- [ ] Database migration strategy for blue-green (backward-compatible migrations)
- [ ] Docker Compose for production (app + external services configuration)
- [ ] Non-root container user for security
- [ ] `.dockerignore` to minimize build context

### Should Have

- [ ] Container security scanning (Trivy or similar)
- [ ] Logging to stdout/stderr (12-factor compliant)
- [ ] Resource limits (memory, CPU) documented
- [ ] Startup probe configuration
- [ ] Automated backup strategy for PostgreSQL (documented)
- [ ] SSL/TLS termination strategy (documented)

### Won't Have (Out of Scope)

- Kubernetes manifests (blue-green uses Docker Compose)
- CI/CD pipeline implementation (documented approach only)
- CDN configuration
- Auto-scaling
- Multi-region deployment

---

## Technical Requirements

### Production Dockerfile

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=false

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN yarn build

# Prune dev dependencies
RUN yarn install --frozen-lockfile --production=true

# Stage 2: Production
FROM node:20-alpine AS production

# Security: non-root user
RUN addgroup -g 1001 -S porta && \
    adduser -S porta -u 1001 -G porta

WORKDIR /app

# Copy built application
COPY --from=builder --chown=porta:porta /app/dist ./dist
COPY --from=builder --chown=porta:porta /app/node_modules ./node_modules
COPY --from=builder --chown=porta:porta /app/package.json ./

# Copy runtime assets
COPY --chown=porta:porta templates/ ./templates/
COPY --chown=porta:porta locales/ ./locales/
COPY --chown=porta:porta migrations/ ./migrations/

# Switch to non-root user
USER porta

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### .dockerignore

```
node_modules/
dist/
.env
.env.*
.git/
.github/
tests/
coverage/
*.md
*.log
.eslintrc.*
.prettierrc
vitest.config.ts
tsconfig.json
docker/
plans/
requirements/
scripts/
```

### Health & Readiness Endpoints

```typescript
// GET /health — Liveness probe
// Returns 200 if the process is alive
// Used by Docker HEALTHCHECK and load balancer
{
  "status": "ok",
  "timestamp": "2026-04-08T12:00:00Z",
  "uptime": 3600
}

// GET /ready — Readiness probe
// Returns 200 only if all dependencies are connected
// Used by blue-green to determine when to switch traffic
{
  "status": "ready",
  "timestamp": "2026-04-08T12:00:00Z",
  "checks": {
    "database": "connected",
    "redis": "connected"
  }
}

// Returns 503 if not ready
{
  "status": "not_ready",
  "checks": {
    "database": "connected",
    "redis": "disconnected"
  }
}
```

### Graceful Shutdown

```typescript
// Shutdown sequence on SIGTERM/SIGINT
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  // 1. Stop accepting new connections
  server.close();

  // 2. Wait for in-flight requests (with timeout)
  await waitForDrain(30_000); // 30s max

  // 3. Close OIDC provider sessions
  // (node-oidc-provider handles this internally)

  // 4. Close database pool
  await database.end();
  logger.info('Database pool closed');

  // 5. Close Redis connection
  await redis.quit();
  logger.info('Redis connection closed');

  // 6. Exit
  logger.info('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

### Blue-Green Deployment

Using [blendsdk/blue-green](https://github.com/blendsdk/blue-green) for zero-downtime deployments.

#### Deployment Architecture

```
                    ┌─────────────────┐
                    │   Load Balancer  │
                    │   (nginx/traefik)│
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │  Blue-Green      │
                    │  Router          │
                    └────┬───────┬────┘
                         │       │
              ┌──────────┴─┐  ┌──┴──────────┐
              │  BLUE       │  │   GREEN      │
              │  (current)  │  │  (next)      │
              │  porta:v1.0 │  │  porta:v1.1  │
              │  Port 3001  │  │  Port 3002   │
              └──────┬──────┘  └──────┬───────┘
                     │                │
              ┌──────┴────────────────┴───────┐
              │         Shared Services        │
              │  PostgreSQL  │  Redis          │
              └───────────────────────────────┘
```

#### Deployment Flow

```
1. Current state: BLUE is live, serving traffic

2. Deploy new version:
   a. Pull new Docker image
   b. Start GREEN container with new image
   c. GREEN starts, runs migrations (if backward-compatible)
   d. GREEN health check passes (/ready returns 200)
   e. Blue-green router switches traffic to GREEN
   f. BLUE continues running (standby for rollback)

3. Verification:
   a. Monitor GREEN for errors
   b. If healthy → stop BLUE container
   c. If unhealthy → instant rollback (switch back to BLUE)

4. Rollback:
   a. Blue-green router switches traffic back to BLUE
   b. GREEN is stopped
   c. No downtime, no data loss
```

#### Blue-Green Configuration

```yaml
# blue-green.yml (blendsdk/blue-green configuration)
service:
  name: porta
  image: porta:latest
  ports:
    blue: 3001
    green: 3002
  health_check:
    endpoint: /ready
    interval: 5s
    timeout: 3s
    retries: 5
  environment:
    - DATABASE_URL
    - REDIS_URL
    - ISSUER_BASE_URL
    - SMTP_HOST
    - SMTP_PORT
    - SMTP_FROM
    - NODE_ENV=production
    - LOG_LEVEL=info
  volumes:
    - ./templates:/app/templates:ro      # Custom templates (optional)
    - ./locales:/app/locales:ro          # Custom translations (optional)
  shutdown:
    timeout: 30s                         # Graceful shutdown timeout
```

### Database Migration Strategy for Blue-Green

**Critical rule**: All database migrations must be **backward-compatible** to support blue-green deployment where two versions may run simultaneously.

```
Safe migration patterns:
✅ Add new column (with default or nullable)
✅ Add new table
✅ Add new index
✅ Add new column and backfill data

Unsafe migration patterns (require special handling):
⚠️ Rename column → use migration sequence:
    1. Add new column
    2. Deploy: write to both old + new column
    3. Backfill new column
    4. Deploy: read from new column
    5. Drop old column

⚠️ Drop column → use migration sequence:
    1. Deploy: stop reading from column
    2. Drop column in next release

⚠️ Change column type → add new column, migrate data, drop old

❌ NEVER in a blue-green migration:
   - Drop a column that the current version reads
   - Rename a column in-place
   - Change a column type in-place
   - Drop a table that the current version uses
```

### Production Environment Variables

All environment variables from RD-01, plus production-specific:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | yes | — | Must be `production` |
| `PORT` | no | `3000` | HTTP server port |
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `REDIS_URL` | yes | — | Redis connection string |
| `ISSUER_BASE_URL` | yes | — | Public OIDC issuer base URL |
| `SMTP_HOST` | yes | — | SMTP server host |
| `SMTP_PORT` | no | `587` | SMTP server port |
| `SMTP_USER` | conditional | — | SMTP auth username |
| `SMTP_PASS` | conditional | — | SMTP auth password |
| `SMTP_FROM` | yes | — | Sender email address |
| `LOG_LEVEL` | no | `info` | Log level |
| `COOKIE_KEYS` | yes | — | Comma-separated cookie signing keys |
| `DB_POOL_MIN` | no | `2` | Minimum DB pool connections |
| `DB_POOL_MAX` | no | `10` | Maximum DB pool connections |
| `SHUTDOWN_TIMEOUT` | no | `30000` | Graceful shutdown timeout (ms) |

### Production Security Checklist

```
Container Security:
- [ ] Non-root user in Dockerfile
- [ ] Minimal base image (Alpine)
- [ ] No dev dependencies in production image
- [ ] No source code (.ts files) in production image
- [ ] Read-only filesystem where possible

Network Security:
- [ ] HTTPS enforced (via reverse proxy / load balancer)
- [ ] Secure headers (HSTS, X-Frame-Options, CSP)
- [ ] Cookie flags: httpOnly, secure, sameSite
- [ ] CORS restricted to registered client origins

Data Security:
- [ ] Database connection via SSL
- [ ] Redis connection via TLS (if exposed)
- [ ] Secrets not logged (password, tokens, keys)
- [ ] Sensitive config marked as `is_sensitive` in system_config

Operational Security:
- [ ] Health check endpoint does not leak internal info
- [ ] Error responses do not include stack traces in production
- [ ] Rate limiting enabled
- [ ] Audit logging for all security events
```

### Logging in Production

```
Requirements:
- JSON structured logging to stdout (12-factor)
- No file-based logging (log aggregator collects from stdout)
- Log levels: info, warn, error (debug disabled in production)
- Request logs include: method, path, status, duration, org-slug
- Error logs include: error message, error code (no stack traces)
- Sensitive data redacted from logs (passwords, tokens, secrets)
```

### Docker Compose for Production

```yaml
# docker-compose.production.yml
version: '3.8'

services:
  porta:
    image: porta:${VERSION:-latest}
    restart: unless-stopped
    ports:
      - "${PORT:-3000}:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      ISSUER_BASE_URL: ${ISSUER_BASE_URL}
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT:-587}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
      SMTP_FROM: ${SMTP_FROM}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      COOKIE_KEYS: ${COOKIE_KEYS}
    volumes:
      - ./templates:/app/templates:ro    # Optional custom templates
      - ./locales:/app/locales:ro        # Optional custom translations
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
        reservations:
          memory: 256M
          cpus: '0.5'
```

### CI/CD Approach (Documented, Not Implemented)

```
Suggested CI/CD pipeline:

1. On push to main:
   a. Run yarn lint
   b. Run yarn test:unit
   c. Run yarn test:integration (with Docker Compose services)
   d. Run yarn test:e2e
   e. Build Docker image
   f. Push to container registry

2. On release tag:
   a. Pull image from registry
   b. Run database migrations
   c. Deploy via blue-green
   d. Verify health check
   e. Monitor for errors
   f. Rollback if needed
```

---

## Integration Points

### With RD-01 (Scaffolding)
- Production Dockerfile builds the same project
- Same environment variables, different values

### With RD-02 (Database)
- Migrations run before/during deployment
- Backward-compatible migration requirement

### With RD-03 (OIDC Core)
- OIDC provider must handle graceful shutdown
- Cookie keys must be stable across deployments

### With All Domain RDs
- All features must work correctly in production Docker container

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| Deployment strategy | Rolling, blue-green, canary | Blue-green | User requirement, zero-downtime, instant rollback |
| Container base | Debian, Alpine, Distroless | Alpine | Small, secure, widely used |
| Container user | Root, non-root | Non-root | Security best practice |
| Logging | File-based, stdout, external agent | stdout (12-factor) | Standard, works with any log aggregator |
| SSL/TLS | In-app, reverse proxy | Reverse proxy | Separation of concerns, easier cert management |
| Migration timing | Before deploy, during startup, separate step | Before deploy (CLI) | Explicit, controllable, can rollback if migration fails |

---

## Acceptance Criteria

1. [ ] `docker build` produces a working production image
2. [ ] Production image runs with non-root user
3. [ ] Production image size is < 200MB
4. [ ] Production image contains no dev dependencies or source files
5. [ ] Health endpoint returns 200 when app is running
6. [ ] Ready endpoint returns 200 when DB and Redis are connected
7. [ ] Ready endpoint returns 503 when DB or Redis is disconnected
8. [ ] Graceful shutdown drains connections within timeout
9. [ ] Blue-green deployment config works with blendsdk/blue-green
10. [ ] Zero-downtime deployment: no failed requests during switch
11. [ ] Rollback: traffic switches back to old version instantly
12. [ ] Migrations are backward-compatible (documented guidelines)
13. [ ] All environment variables are documented
14. [ ] Logs are JSON-formatted to stdout
15. [ ] Sensitive data is not logged
16. [ ] Container passes basic security checks (non-root, minimal image)
