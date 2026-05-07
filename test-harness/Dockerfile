# Test Harness Dockerfile — extends production image with pino-pretty for debug logging
# Usage: docker compose -f test-harness/docker-compose.yml up
#
# This multi-stage build reuses ALL stages from the production Dockerfile,
# then adds pino-pretty so NODE_ENV=development + LOG_LEVEL=debug works.

# ─── Stage 1: Build @portaidentity/sdk ───
# Required because admin-gui depends on SDK via file: reference
FROM node:22-alpine AS sdk-builder

WORKDIR /app/packages/porta-sdk

COPY packages/porta-sdk/package.json packages/porta-sdk/yarn.lock* ./
RUN yarn install --frozen-lockfile 2>/dev/null || yarn install

COPY packages/porta-sdk/tsconfig.json ./
COPY packages/porta-sdk/src/ src/
RUN yarn build

# ─── Stage 2: Production dependencies ───
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json yarn.lock ./
# Create workspace stubs so yarn resolves the workspaces field without error
# (only name/version — no deps, keeps the install focused on server deps)
RUN mkdir -p packages/porta-sdk packages/porta-cli packages/porta-admin-gui \
    && echo '{"name":"@portaidentity/sdk","version":"0.1.0"}' > packages/porta-sdk/package.json \
    && echo '{"name":"@portaidentity/cli","version":"0.1.0"}' > packages/porta-cli/package.json \
    && echo '{"name":"@portaidentity/admin-gui","version":"0.1.0"}' > packages/porta-admin-gui/package.json
RUN yarn install --production --frozen-lockfile

# ─── Stage 3: Build TypeScript (Porta server) ───
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
# Create workspace stubs so yarn resolves the workspaces field without error
RUN mkdir -p packages/porta-sdk packages/porta-cli packages/porta-admin-gui \
    && echo '{"name":"@portaidentity/sdk","version":"0.1.0"}' > packages/porta-sdk/package.json \
    && echo '{"name":"@portaidentity/cli","version":"0.1.0"}' > packages/porta-cli/package.json \
    && echo '{"name":"@portaidentity/admin-gui","version":"0.1.0"}' > packages/porta-admin-gui/package.json
RUN yarn install --frozen-lockfile
COPY tsconfig.json ./
COPY src/ src/
RUN yarn build

# ─── Stage 4: Build Admin GUI (React SPA + BFF) ───
FROM node:22-alpine AS admin-builder
WORKDIR /app/packages/porta-admin-gui

# Copy SDK build output so file: dependency resolves
COPY --from=sdk-builder /app/packages/porta-sdk/ /app/packages/porta-sdk/

COPY packages/porta-admin-gui/package.json packages/porta-admin-gui/yarn.lock* ./
RUN yarn install --frozen-lockfile
# Symlink SDK peer dependency so TypeScript can resolve @portaidentity/sdk
RUN mkdir -p node_modules/@portaidentity && ln -s /app/packages/porta-sdk node_modules/@portaidentity/sdk
COPY packages/porta-admin-gui/tsconfig*.json packages/porta-admin-gui/vite.config.ts ./
COPY packages/porta-admin-gui/index.html ./
COPY packages/porta-admin-gui/src/ ./src/
COPY packages/porta-admin-gui/public/ ./public/
RUN yarn build

# ─── Stage 5: Final image with pino-pretty for dev/debug logging ───
FROM node:22-alpine
RUN apk add --no-cache curl tini
RUN addgroup -S porta && adduser -S porta -G porta
WORKDIR /app

COPY --from=builder /app/dist/ dist/
COPY --from=deps /app/node_modules/ node_modules/
COPY package.json ./
COPY migrations/ migrations/
COPY templates/ templates/
COPY locales/ locales/
COPY --from=admin-builder /app/packages/porta-admin-gui/dist/ packages/porta-admin-gui/dist/
COPY --from=admin-builder /app/packages/porta-admin-gui/node_modules/ packages/porta-admin-gui/node_modules/
COPY --from=admin-builder /app/packages/porta-admin-gui/package.json packages/porta-admin-gui/package.json
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
RUN printf '#!/bin/sh\nexec node /app/dist/cli/index.js "$@"\n' > /usr/local/bin/porta \
    && chmod +x /usr/local/bin/porta

# ── TEST HARNESS ADDITION: Install pino-pretty for dev-mode colored logging ──
RUN npm install --no-save pino-pretty

USER porta
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./entrypoint.sh"]
