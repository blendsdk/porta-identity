# Docker Environment: Project Setup

> **Document**: 04-docker.md
> **Parent**: [Index](00-index.md)

## Overview

Docker setup for both development (Docker Compose with PostgreSQL + Redis) and production (multi-stage Dockerfile). The development environment provides the external services Porta depends on. The production Dockerfile builds a minimal container image.

## Docker Compose (Development)

### docker-compose.yml

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: porta-postgres
    environment:
      POSTGRES_DB: porta
      POSTGRES_USER: porta
      POSTGRES_PASSWORD: porta
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U porta -d porta"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: porta-redis
    command: redis-server --save "" --appendonly no
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  postgres-data:
```

**Design decisions:**
- Alpine images for smaller size
- PostgreSQL 16 (latest stable)
- Redis 7 with persistence disabled (`--save "" --appendonly no`) per OPERATIONS.md Redis Key Strategy
- Health checks for both services
- Named volume for PostgreSQL data (persists across `docker compose down`)
- Default credentials match `.env.example` values

## Production Dockerfile

### Multi-Stage Build

```dockerfile
# ============================================================
# Stage 1: Build
# ============================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (Docker layer caching)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ============================================================
# Stage 2: Runtime
# ============================================================
FROM node:22-alpine AS runtime

# Security: run as non-root
RUN addgroup -g 1001 -S porta && \
    adduser -S porta -u 1001 -G porta

WORKDIR /app

# Copy production artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy runtime assets (views, locales)
COPY views/ ./views/
COPY locales/ ./locales/

# Set ownership
RUN chown -R porta:porta /app

USER porta

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

**Design decisions:**
- Multi-stage: build stage has TypeScript compiler, runtime stage only has production deps
- `npm ci --ignore-scripts` — deterministic installs, skip postinstall scripts for security
- `npm prune --production` — remove devDependencies before copying to runtime
- Non-root user (`porta:1001`) per security requirements
- Alpine base for minimal image size (~150MB estimated)
- Health check using wget (available in Alpine, no curl needed)
- Views and locales copied as runtime assets (needed for EJS rendering and i18n)

## .dockerignore

```
node_modules
dist
.git
.github
.env
.env.*
*.md
plans/
tests/
coverage/
scripts/tmp-*
.clinerules/
.vscode/
```

## Testing Requirements

- `docker compose config` validates the compose file syntax
- `docker compose up -d` starts services without errors
- `docker compose ps` shows both services as healthy
- `docker build .` completes without errors (after source code exists)
