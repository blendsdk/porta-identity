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
# Stage 2: Production dependencies only
# ──────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Install build tools for native modules (argon2 requires python3/make/g++)
RUN apk add --no-cache python3 make g++

COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile

# ──────────────────────────────────────────────
# Stage 3: Runtime
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

# Copy and prepare entrypoint script
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

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
