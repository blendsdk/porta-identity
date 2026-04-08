# RD-01: Project Scaffolding & Infrastructure

> **Document**: RD-01-project-scaffolding.md
> **Status**: Draft
> **Created**: 2026-04-08
> **Project**: Porta v5 — OIDC Provider

---

## Feature Overview

Set up the foundational project structure for Porta v5 — a multi-tenant OIDC provider built on top of `node-oidc-provider`, using Koa as the web framework, TypeScript for type safety, yarn as the package manager, and Docker Compose for local development infrastructure (PostgreSQL, Redis, MailHog).

This document defines the project skeleton, toolchain, conventions, and Docker development environment that all subsequent features build upon.

---

## Functional Requirements

### Must Have

- [ ] Koa-based HTTP server with TypeScript
- [ ] yarn as the sole package manager (no `package-lock.json`, enforce via `.npmrc` or `engines`)
- [ ] TypeScript strict mode with modern ES target (ES2022+)
- [ ] Docker Compose with PostgreSQL 16+, Redis 7+, and MailHog for local development
- [ ] Environment-based configuration system (`.env` files, validated at startup)
- [ ] Graceful shutdown handling (SIGTERM, SIGINT)
- [ ] Health check endpoint (`GET /health`) returning server status, DB connectivity, Redis connectivity
- [ ] Structured JSON logging (request logging, error logging, application logging)
- [ ] ESLint + Prettier for code quality (TypeScript-aware config)
- [ ] Vitest as the test framework (unit + integration)
- [ ] Build script producing production-ready JavaScript output
- [ ] `nodemon` or `tsx watch` for development hot-reload

### Should Have

- [ ] Makefile or `package.json` scripts as the single entry point for all commands (build, test, dev, lint, migrate, etc.)
- [ ] `.editorconfig` for consistent editor settings
- [ ] Git hooks via `husky` + `lint-staged` for pre-commit linting
- [ ] Source maps enabled in development

### Won't Have (Out of Scope)

- Frontend SPA (interaction pages are server-rendered Handlebars, covered in RD-07)
- CI/CD pipeline configuration (covered in RD-11)
- Production Docker image (covered in RD-11)
- Database schema or migrations (covered in RD-02)

---

## Technical Requirements

### Project Structure

```
porta/
├── src/
│   ├── index.ts                 # Application entry point
│   ├── server.ts                # Koa server setup and middleware
│   ├── config/
│   │   ├── index.ts             # Configuration loader (env → validated config object)
│   │   └── schema.ts            # Configuration validation schema (zod or similar)
│   ├── middleware/
│   │   ├── error-handler.ts     # Global error handling middleware
│   │   ├── request-logger.ts    # Request/response logging middleware
│   │   └── health.ts            # Health check route handler
│   ├── lib/
│   │   ├── logger.ts            # Structured logger (pino)
│   │   ├── database.ts          # PostgreSQL connection pool (pg)
│   │   └── redis.ts             # Redis client (ioredis)
│   ├── oidc/                    # OIDC provider (RD-03)
│   ├── organizations/           # Tenant management (RD-04)
│   ├── applications/            # App & client management (RD-05)
│   ├── users/                   # User management (RD-06)
│   ├── auth/                    # Auth workflows (RD-07)
│   ├── rbac/                    # Roles & permissions (RD-08)
│   ├── cli/                     # CLI commands (RD-09)
│   └── types/                   # Shared TypeScript types
├── templates/
│   └── default/                 # Default Handlebars interaction pages (RD-07)
├── locales/
│   └── default/                 # Default i18n translation files (RD-07)
├── migrations/                  # SQL migration files (RD-02)
├── tests/
│   ├── unit/                    # Unit tests (mirror src/ structure)
│   ├── integration/             # Integration tests (DB/Redis required)
│   └── e2e/                     # End-to-end OIDC flow tests
├── scripts/                     # Build/dev/utility scripts
├── docker/
│   └── docker-compose.yml       # Dev infrastructure
├── .env.example                 # Environment variable template
├── .env                         # Local environment (git-ignored)
├── tsconfig.json
├── vitest.config.ts
├── .eslintrc.cjs
├── .prettierrc
├── .editorconfig
├── .gitignore
├── Makefile                     # Command runner
├── package.json
└── yarn.lock
```

### Technology Stack

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Runtime | Node.js | 20 LTS+ | JavaScript runtime |
| Language | TypeScript | 5.x | Type safety |
| Web Framework | Koa | 2.x | HTTP server |
| OIDC | node-oidc-provider | latest | OIDC protocol implementation |
| Database | PostgreSQL | 16+ | Persistent storage |
| Cache/Sessions | Redis | 7+ | Session store, rate limiting, cache |
| Package Manager | yarn | 1.x (classic) or 4.x (berry) | Dependency management |
| Test Framework | Vitest | latest | Unit, integration, E2E tests |
| Logging | pino | latest | Structured JSON logging |
| DB Client | pg (node-postgres) | latest | PostgreSQL driver |
| Redis Client | ioredis | latest | Redis driver |
| Template Engine | handlebars | latest | Server-rendered interaction pages |
| i18n | i18next | latest | Internationalization |
| Email | nodemailer | latest | SMTP email delivery |
| CLI | yargs | latest | Command-line interface |
| Config Validation | zod | latest | Environment variable validation |
| Linting | eslint + prettier | latest | Code quality |
| Dev Server | tsx | latest | TypeScript execution + watch mode |

### Docker Compose Services

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: porta
      POSTGRES_USER: porta
      POSTGRES_PASSWORD: porta_dev
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  mailhog:
    image: mailhog/mailhog
    ports:
      - "1025:1025"   # SMTP
      - "8025:8025"   # Web UI
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | no | `development` | Environment (development, test, production) |
| `PORT` | no | `3000` | HTTP server port |
| `HOST` | no | `0.0.0.0` | HTTP server bind address |
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `REDIS_URL` | yes | — | Redis connection string |
| `SMTP_HOST` | yes | — | SMTP server host |
| `SMTP_PORT` | no | `587` | SMTP server port |
| `SMTP_USER` | no | — | SMTP username |
| `SMTP_PASS` | no | — | SMTP password |
| `SMTP_FROM` | yes | — | Default "from" email address |
| `LOG_LEVEL` | no | `info` | Logging level (debug, info, warn, error) |
| `ISSUER_BASE_URL` | yes | — | Base URL for OIDC issuer (e.g., `https://auth.example.com`) |

### Configuration Validation

All environment variables must be validated at startup using zod schemas. The application must fail fast with clear error messages if required variables are missing or invalid.

```typescript
// Example: src/config/schema.ts
const configSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().default(3000),
  databaseUrl: z.string().url(),
  redisUrl: z.string().url(),
  // ...
});
```

### Logging Requirements

- Use `pino` for structured JSON logging
- Request logging middleware: method, url, status, duration, request-id
- All log entries must include: timestamp, level, message, and optional context
- Error logging must include stack traces in development, sanitized in production
- Log levels: `debug`, `info`, `warn`, `error`, `fatal`

### Graceful Shutdown

The application must handle shutdown signals properly:
1. Stop accepting new connections
2. Wait for in-flight requests to complete (with timeout)
3. Close database pool
4. Close Redis connection
5. Exit with code 0

### Build & Development Commands

| Command | Purpose |
|---------|---------|
| `yarn dev` | Start development server with hot-reload |
| `yarn build` | Compile TypeScript to JavaScript |
| `yarn start` | Run production build |
| `yarn test` | Run all tests |
| `yarn test:unit` | Run unit tests only |
| `yarn test:integration` | Run integration tests only |
| `yarn test:e2e` | Run E2E tests only |
| `yarn lint` | Run ESLint |
| `yarn lint:fix` | Run ESLint with auto-fix |
| `yarn format` | Run Prettier |
| `yarn migrate` | Run database migrations |
| `yarn migrate:create` | Create a new migration file |
| `yarn docker:up` | Start Docker Compose services |
| `yarn docker:down` | Stop Docker Compose services |

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| Package manager | npm, yarn, pnpm | yarn | User requirement |
| Web framework | Express, Koa, Fastify | Koa | User requirement; node-oidc-provider is built for Koa |
| Test framework | Jest, Vitest, Mocha | Vitest | Fast, TypeScript-native, Jest-compatible API |
| Logging | winston, pino, bunyan | pino | Fastest, structured JSON, low overhead |
| Config validation | joi, yup, zod | zod | TypeScript-first, excellent inference |
| DB driver | pg, knex, prisma | pg (raw) | Lightweight, full control, no ORM overhead |
| Redis driver | redis, ioredis | ioredis | Feature-rich, cluster support, better API |
| Dev server | nodemon, tsx, ts-node-dev | tsx | Fast, modern, esbuild-powered |
| Docker Compose version | v1, v2 | v2 | Modern, built into Docker CLI |

---

## Acceptance Criteria

1. [ ] `yarn install` succeeds with no errors
2. [ ] `yarn dev` starts the Koa server and responds to `GET /health` with `200 OK`
3. [ ] `yarn build` produces valid JavaScript output
4. [ ] `yarn test` runs Vitest with no errors (even if no tests yet)
5. [ ] `yarn lint` passes with no errors
6. [ ] `docker compose up` starts Postgres, Redis, and MailHog
7. [ ] Application connects to Postgres and Redis on startup (verified via health check)
8. [ ] Application fails fast with clear error if `DATABASE_URL` or `REDIS_URL` is missing
9. [ ] Graceful shutdown works (SIGTERM → clean exit)
10. [ ] Structured JSON logs appear in stdout
11. [ ] `.env.example` documents all environment variables
12. [ ] Project structure matches the defined layout
