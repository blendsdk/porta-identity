# ──────────────────────────────────────────────────────────
# Porta — Production Docker Image
# Multi-stage build: builder → production-deps → runtime
# Target: < 200MB, non-root user, health check
# ──────────────────────────────────────────────────────────

# ──────────────────────────────────────────────
# Stage 1: Build TypeScript
# ──────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install build tools for native modules (argon2 requires python3/make/g++)
RUN apk add --no-cache python3 make g++

# Copy dependency manifests first for Docker layer caching
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src/ src/
RUN yarn build

# ──────────────────────────────────────────────
# Stage 2: Build Admin GUI (React SPA + BFF)
# ──────────────────────────────────────────────
FROM node:22-alpine AS admin-builder

WORKDIR /app/admin-gui

# Copy dependency manifests first for Docker layer caching
COPY admin-gui/package.json admin-gui/yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy source and build (Vite client + TypeScript server)
COPY admin-gui/tsconfig*.json admin-gui/vite.config.ts ./
COPY admin-gui/index.html ./
COPY admin-gui/src/ ./src/
COPY admin-gui/public/ ./public/
RUN yarn build

# ──────────────────────────────────────────────
# Stage 3: Production dependencies only
# ──────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Install build tools for native modules (argon2 requires python3/make/g++)
RUN apk add --no-cache python3 make g++

COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile

# ──────────────────────────────────────────────
# Stage 4: Runtime
# ──────────────────────────────────────────────
FROM node:22-alpine

# OCI image labels
LABEL org.opencontainers.image.title="Porta" \
      org.opencontainers.image.description="Multi-tenant OIDC provider built on node-oidc-provider" \
      org.opencontainers.image.vendor="BlendSDK" \
      org.opencontainers.image.source="https://github.com/blendsdk/porta-identity" \
      org.opencontainers.image.licenses="MIT"

# Install curl for healthcheck + tini for proper PID 1 signal handling
RUN apk add --no-cache curl tini

# Create non-root user for security
RUN addgroup -S porta && adduser -S porta -G porta

WORKDIR /app

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist/ dist/

# Copy production-only node_modules from deps stage
COPY --from=deps /app/node_modules/ node_modules/

# Copy package.json (needed for ESM module resolution)
COPY package.json ./

# Copy runtime assets (migrations, templates, locales)
COPY migrations/ migrations/
COPY templates/ templates/
COPY locales/ locales/

# Copy admin GUI build artifacts (SPA + BFF server)
COPY --from=admin-builder /app/admin-gui/dist/ admin-gui/dist/
COPY --from=admin-builder /app/admin-gui/node_modules/ admin-gui/node_modules/
COPY --from=admin-builder /app/admin-gui/package.json admin-gui/package.json

# Copy and prepare entrypoint script
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Create a 'porta' CLI command available inside the container
# so users can run: docker exec -it porta-app porta <command>
# instead of: docker exec -it porta-app node dist/cli/index.js <command>
RUN printf '#!/bin/sh\nexec node /app/dist/cli/index.js "$@"\n' > /usr/local/bin/porta \
    && chmod +x /usr/local/bin/porta

# Switch to non-root user
USER porta

# Default port (configurable via PORT env var)
EXPOSE 3000

# Health check — curl the /health endpoint every 30s
# Start period gives the app time to boot and run migrations
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

# Use tini as PID 1 for proper signal forwarding (SIGTERM/SIGINT)
ENTRYPOINT ["/sbin/tini", "--"]

# Default command — run the entrypoint script
CMD ["./entrypoint.sh"]
