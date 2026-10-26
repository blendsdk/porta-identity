# OIDC test-harness server image
# Mirrors the production server layout while retaining development logging dependencies.

FROM node:22-alpine AS builder

WORKDIR /app
RUN apk add --no-cache python3 make g++
RUN npm install -g pnpm@12.15.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/server/package.json packages/server/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/cli/package.json packages/cli/package.json
RUN pnpm install --frozen-lockfile

COPY packages/server/tsconfig.json packages/server/tsconfig.json
COPY packages/server/src/ packages/server/src/
RUN pnpm --filter @portaidentity/server build

FROM node:22-alpine AS production-dependencies

WORKDIR /app
RUN apk add --no-cache python3 make g++
RUN npm install -g pnpm@12.15.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/server/package.json packages/server/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/cli/package.json packages/cli/package.json
RUN pnpm install --prod --frozen-lockfile

RUN node -e "const fs=require('fs'),path=require('path');const s=JSON.parse(fs.readFileSync('packages/server/package.json','utf8'));const bad=[];for(const [n,r] of Object.entries(s.dependencies||{})){const p=path.join('node_modules',n,'package.json');if(!fs.existsSync(p)){bad.push(n+' missing');continue;}const v=JSON.parse(fs.readFileSync(p,'utf8')).version;if(v!==r&&!v.startsWith(r.replace(/^\^/,''))&&r!=='*'){bad.push(n+' '+v+' != '+r);}}if(bad.length){console.error(bad);process.exit(1)}console.log('server runtime dependency tree OK');"

FROM node:22-alpine AS runtime

ARG HARNESS_COVERAGE_REVISION=disabled
ARG HARNESS_COVERAGE_LOCK_DIGEST=disabled
ARG HARNESS_COVERAGE_SOURCE_TREE_DIGEST=disabled

LABEL io.porta.assurance.coverage-revision="${HARNESS_COVERAGE_REVISION}" \
      io.porta.assurance.coverage-lock-digest="${HARNESS_COVERAGE_LOCK_DIGEST}" \
      io.porta.assurance.coverage-source-tree-digest="${HARNESS_COVERAGE_SOURCE_TREE_DIGEST}"

RUN apk add --no-cache curl tini
RUN addgroup -S porta && adduser -S porta -G porta

WORKDIR /app

COPY --from=builder /app/packages/server/dist/ dist/
COPY --from=production-dependencies /app/node_modules/ node_modules/
COPY packages/server/package.json ./package.json
COPY packages/server/migrations/ migrations/
COPY packages/server/templates/ templates/
COPY packages/server/locales/ locales/
COPY docker/entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh \
    && printf '#!/bin/sh\nexec node /app/dist/cli/index.js "$@"\n' > /usr/local/bin/porta \
    && chmod +x /usr/local/bin/porta \
    && mkdir -p /app/.v8-coverage \
    && chown porta:porta /app/.v8-coverage \
    && chmod 0700 /app/.v8-coverage \
    && node --input-type=module -e "await import('chalk'); await import('yaml'); console.log('runtime imports OK')"

USER porta
EXPOSE 3000

HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=20 \
  CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./entrypoint.sh"]
