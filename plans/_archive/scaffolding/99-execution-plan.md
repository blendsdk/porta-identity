# Execution Plan: Project Scaffolding

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-08 13:28
> **Progress**: 18/18 tasks (100%) ✅

## Overview

Set up the complete project skeleton for Porta v5: TypeScript/Koa project, Docker Compose infrastructure, configuration system, connections, middleware, logging, toolchain, and initial tests.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time | Status |
|-------|-------|----------|-----------|--------|
| 1 | Project Init & Docker | 1 | 30 min | ✅ Done |
| 2 | Core Libraries & Config | 1 | 30 min | ✅ Done |
| 3 | Koa Server & Middleware | 1 | 30 min | ✅ Done |
| 4 | Testing & Verification | 1 | 30 min | ✅ Done |

**Total: 4 sessions, ~2 hours (completed in 1 session)**

---

## Phase 1: Project Init & Docker

### Session 1.1: Initialize Project and Docker Infrastructure

**Reference**: [03-docker-and-config.md](03-docker-and-config.md), [06-toolchain.md](06-toolchain.md)
**Objective**: Create package.json, install dependencies, set up TypeScript, ESLint, Prettier, Docker Compose, and all config files.

**Tasks**:

| # | Task | File |
|---|------|------|
| 1.1.1 | Create `package.json` with all dependencies, scripts, and engines | `package.json` |
| 1.1.2 | Run `yarn install` to install all dependencies | `yarn.lock` |
| 1.1.3 | Create TypeScript, ESLint, Prettier, EditorConfig, .npmrc, .gitignore configs | `tsconfig.json`, `.eslintrc.cjs`, `.prettierrc`, `.editorconfig`, `.npmrc`, `.gitignore` |
| 1.1.4 | Create Docker Compose file with Postgres, Redis, MailHog | `docker/docker-compose.yml` |
| 1.1.5 | Create `.env.example` and `.env` (copy) | `.env.example`, `.env` |
| 1.1.6 | Create `Makefile` with all targets | `Makefile` |

**Deliverables**:
- [x] `yarn install` succeeds
- [x] `docker compose -f docker/docker-compose.yml up -d` starts all services
- [x] `docker compose -f docker/docker-compose.yml down` stops all services
- [x] TypeScript compiles (even with empty src/)

**Verify**: `yarn install && docker compose -f docker/docker-compose.yml config` ✅

---

## Phase 2: Core Libraries & Config

### Session 2.1: Configuration, Logger, Database, Redis

**Reference**: [03-docker-and-config.md](03-docker-and-config.md), [05-connections-and-logging.md](05-connections-and-logging.md)
**Objective**: Create the config loader, pino logger, database pool, and Redis client modules.

**Tasks**:

| # | Task | File |
|---|------|------|
| 2.1.1 | Create config schema with zod validation | `src/config/schema.ts` |
| 2.1.2 | Create config loader (dotenv + zod parse + fail-fast) | `src/config/index.ts` |
| 2.1.3 | Create pino logger with dev/prod/test modes | `src/lib/logger.ts` |
| 2.1.4 | Create PostgreSQL connection pool (connect, getPool, disconnect) | `src/lib/database.ts` |
| 2.1.5 | Create Redis client (connect, getRedis, disconnect) | `src/lib/redis.ts` |

**Deliverables**:
- [x] Config loads from .env and validates
- [x] Config fails fast with clear error on missing required vars
- [x] Logger outputs structured JSON (prod) or pretty (dev)
- [x] Database connects to PostgreSQL
- [x] Redis connects to Redis

**Verify**: `yarn build` ✅

---

## Phase 3: Koa Server & Middleware

### Session 3.1: Server, Middleware, Entry Point

**Reference**: [04-koa-server-and-middleware.md](04-koa-server-and-middleware.md)
**Objective**: Create the Koa application, middleware stack, health check endpoint, and entry point with graceful shutdown.

**Tasks**:

| # | Task | File |
|---|------|------|
| 3.1.1 | Create error handler middleware | `src/middleware/error-handler.ts` |
| 3.1.2 | Create request logger middleware | `src/middleware/request-logger.ts` |
| 3.1.3 | Create health check route handler | `src/middleware/health.ts` |
| 3.1.4 | Create Koa server with middleware stack | `src/server.ts` |
| 3.1.5 | Create entry point with startup, connections, and graceful shutdown | `src/index.ts` |

**Deliverables**:
- [x] `yarn dev` starts the server
- [x] `GET /health` returns 200 with DB and Redis status
- [x] SIGTERM triggers graceful shutdown
- [x] Structured request logs in stdout

**Verify**: `yarn build && yarn docker:up && yarn dev` ✅

---

## Phase 4: Testing & Verification

### Session 4.1: Write Tests and Final Verification

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Write unit and integration tests, verify all acceptance criteria pass.

**Tasks**:

| # | Task | File |
|---|------|------|
| 4.1.1 | Write config unit tests (valid, missing required, invalid) | `tests/unit/config.test.ts` |
| 4.1.2 | Write middleware unit tests (error handler, request logger) | `tests/unit/middleware/error-handler.test.ts`, `tests/unit/middleware/request-logger.test.ts` |

**Deliverables**:
- [x] All unit tests pass (22/22)
- [x] `yarn lint` passes
- [x] `yarn build` succeeds
- [x] `yarn test` succeeds
- [x] `yarn verify` passes (lint + build + test)

**Verify**: `yarn verify` ✅

---

## Task Checklist (All Phases)

### Phase 1: Project Init & Docker
- [x] 1.1.1 Create `package.json` with dependencies, scripts, engines
- [x] 1.1.2 Run `yarn install`
- [x] 1.1.3 Create TypeScript, ESLint, Prettier, EditorConfig, .npmrc, .gitignore
- [x] 1.1.4 Create Docker Compose file
- [x] 1.1.5 Create `.env.example` and `.env`
- [x] 1.1.6 Create `Makefile`

### Phase 2: Core Libraries & Config
- [x] 2.1.1 Create config schema (`src/config/schema.ts`)
- [x] 2.1.2 Create config loader (`src/config/index.ts`)
- [x] 2.1.3 Create pino logger (`src/lib/logger.ts`)
- [x] 2.1.4 Create PostgreSQL pool (`src/lib/database.ts`)
- [x] 2.1.5 Create Redis client (`src/lib/redis.ts`)

### Phase 3: Koa Server & Middleware
- [x] 3.1.1 Create error handler middleware
- [x] 3.1.2 Create request logger middleware
- [x] 3.1.3 Create health check route handler
- [x] 3.1.4 Create Koa server (`src/server.ts`)
- [x] 3.1.5 Create entry point with graceful shutdown (`src/index.ts`)

### Phase 4: Testing & Verification
- [x] 4.1.1 Write config unit tests
- [x] 4.1.2 Write middleware unit tests

---

## Implementation Notes

### Deviations from Plan
- **pino import**: Changed from `import pino from 'pino'` to `import { pino } from 'pino'` for NodeNext module resolution compatibility
- **ioredis import**: Changed from `import Redis from 'ioredis'` to `import { Redis } from 'ioredis'` for NodeNext module resolution compatibility
- **ESLint config**: Added `tsconfig.eslint.json` extending `tsconfig.json` to include test files in ESLint's TypeScript project
- **ESLint unused vars rule**: Extended to include `varsIgnorePattern: '^_'` and `destructuredArrayIgnorePattern: '^_'` for destructured variable patterns in tests

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ `yarn verify` passes (lint + build + test)
3. ✅ `GET /health` returns 200 with DB and Redis status
4. ✅ Application starts, connects to DB/Redis, and shuts down gracefully
5. ✅ Docker Compose starts all 3 services (Postgres, Redis, MailHog)
6. ✅ All 12 acceptance criteria from RD-01 are met
7. ⬜ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
