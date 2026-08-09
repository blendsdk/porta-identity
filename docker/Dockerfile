# ──────────────────────────────────────────────────────────
# Porta production image
# Multi-stage build: server builder → production dependencies → runtime
# ──────────────────────────────────────────────────────────

FROM node:22-alpine AS builder

WORKDIR /app
RUN apk add --no-cache python3 make g++

# Copy the complete workspace manifest graph before installation for stable Docker layers.
COPY package.json yarn.lock ./
COPY packages/server/package.json packages/server/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/cli/package.json packages/cli/package.json
RUN yarn install --frozen-lockfile

COPY packages/server/tsconfig.json packages/server/tsconfig.json
COPY packages/server/src/ packages/server/src/
RUN yarn workspace @portaidentity/server build

FROM node:22-alpine AS production-dependencies

WORKDIR /app
RUN apk add --no-cache python3 make g++

COPY package.json yarn.lock ./
COPY packages/server/package.json packages/server/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/cli/package.json packages/cli/package.json
RUN yarn install --production --frozen-lockfile

FROM node:22-alpine AS runtime

LABEL org.opencontainers.image.title="Porta" \
      org.opencontainers.image.description="Multi-tenant OIDC provider built on node-oidc-provider" \
      org.opencontainers.image.vendor="BlendSDK" \
      org.opencontainers.image.source="https://github.com/blendsdk/porta-identity" \
      org.opencontainers.image.licenses="MIT"

RUN apk add --no-cache curl tini
RUN addgroup -S porta && adduser -S porta -G porta

WORKDIR /app

COPY --from=builder /app/packages/server/dist/ dist/
COPY --from=production-dependencies /app/node_modules/ node_modules/
COPY --from=production-dependencies /app/packages/server/node_modules/ node_modules/
COPY packages/server/package.json ./package.json
COPY packages/server/migrations/ migrations/
COPY packages/server/templates/ templates/
COPY packages/server/locales/ locales/
COPY docker/entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh \
    && printf '#!/bin/sh\nexec node /app/dist/cli/index.js "$@"\n' > /usr/local/bin/porta \
    && chmod +x /usr/local/bin/porta

USER porta
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./entrypoint.sh"]
