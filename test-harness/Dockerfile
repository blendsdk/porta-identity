# Test Harness Dockerfile — extends production image with pino-pretty for debug logging
# Usage: docker compose -f test-harness/docker-compose.yml up
#
# This multi-stage build reuses ALL stages from the production Dockerfile,
# then adds pino-pretty so NODE_ENV=development + LOG_LEVEL=debug works.

# ─── Stage 1-3: Reuse production build (deps, builder, admin-builder) ───
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY tsconfig.json ./
COPY src/ src/
RUN yarn build

FROM node:22-alpine AS admin-builder
WORKDIR /app/admin-gui
COPY admin-gui/package.json admin-gui/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY admin-gui/tsconfig*.json admin-gui/vite.config.ts ./
COPY admin-gui/index.html ./
COPY admin-gui/src/ ./src/
COPY admin-gui/public/ ./public/
RUN yarn build

# ─── Stage 4: Final image with pino-pretty for dev/debug logging ───
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
COPY --from=admin-builder /app/admin-gui/dist/ admin-gui/dist/
COPY --from=admin-builder /app/admin-gui/node_modules/ admin-gui/node_modules/
COPY --from=admin-builder /app/admin-gui/package.json admin-gui/package.json
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
