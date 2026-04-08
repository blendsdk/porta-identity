# Execution Plan: Project Setup

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-08 00:00
> **Progress**: 0/15 tasks (0%)

## Overview

Scaffold the Porta v5 project from an empty repository to a running Koa server with Docker development environment, CI pipeline, and passing tests.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                    | Sessions | Est. Time |
| ----- | ------------------------ | -------- | --------- |
| 1     | Project Scaffolding      | 1        | 45 min    |
| 2     | Docker Environment       | 1        | 30 min    |
| 3     | Application Core         | 1        | 60 min    |
| 4     | Tests                    | 1        | 45 min    |
| 5     | CI Pipeline & Final      | 1        | 30 min    |

**Total: 5 sessions, ~3.5 hours**

---

## Phase 1: Project Scaffolding

### Session 1.1: Initialize Project

**Reference**: [03-project-scaffolding.md](03-project-scaffolding.md)
**Objective**: Create package.json, TypeScript config, Vitest config, directory structure, and project-level files.

**Tasks**:

| #     | Task                                              | File(s)                    |
| ----- | ------------------------------------------------- | -------------------------- |
| 1.1.1 | Create package.json with all dependencies         | `package.json`             |
| 1.1.2 | Create tsconfig.json                              | `tsconfig.json`            |
| 1.1.3 | Create vitest.config.ts                           | `vitest.config.ts`         |
| 1.1.4 | Create directory structure with .gitkeep files    | `src/`, `tests/`, `views/`, `locales/`, `migrations/`, `docker/`, `scripts/` |
| 1.1.5 | Create .gitignore and .env.example                | `.gitignore`, `.env.example` |

**Deliverables**:
- [ ] `yarn install` succeeds
- [ ] `yarn build` compiles (empty project, no errors)
- [ ] Directory structure matches project conventions

**Verify**: `clear && sleep 3 && yarn build`

---

## Phase 2: Docker Environment

### Session 2.1: Docker Setup

**Reference**: [04-docker.md](04-docker.md)
**Objective**: Create Docker Compose for development and production Dockerfile.

**Tasks**:

| #     | Task                                              | File(s)                    |
| ----- | ------------------------------------------------- | -------------------------- |
| 2.1.1 | Create docker-compose.yml (PostgreSQL + Redis)    | `docker-compose.yml`       |
| 2.1.2 | Create production Dockerfile (multi-stage)        | `Dockerfile`               |
| 2.1.3 | Create .dockerignore                              | `.dockerignore`            |

**Deliverables**:
- [ ] `docker compose config` validates without errors
- [ ] `docker compose up -d` starts both services
- [ ] `docker compose ps` shows healthy services

**Verify**: `clear && sleep 3 && docker compose config`

---

## Phase 3: Application Core

### Session 3.1: Config, Logger, Server

**Reference**: [05-application-core.md](05-application-core.md)
**Objective**: Implement configuration loader, structured logger, Koa server with health endpoint, and entry point.

**Tasks**:

| #     | Task                                              | File(s)                    |
| ----- | ------------------------------------------------- | -------------------------- |
| 3.1.1 | Create config schema with Zod validation          | `src/config/schema.ts`     |
| 3.1.2 | Create config loader                              | `src/config/index.ts`      |
| 3.1.3 | Create structured JSON logger                     | `src/utils/logger.ts`      |
| 3.1.4 | Create Koa server with health endpoint + graceful shutdown | `src/app/server.ts` |
| 3.1.5 | Create application entry point                    | `src/index.ts`             |

**Deliverables**:
- [ ] `yarn build` compiles without errors
- [ ] `yarn dev` starts server (with valid env vars)
- [ ] `GET /health` returns 200 with JSON body

**Verify**: `clear && sleep 3 && yarn build`

---

## Phase 4: Tests

### Session 4.1: Unit Tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Write unit tests for config loader, logger, and health endpoint.

**Tasks**:

| #     | Task                                              | File(s)                              |
| ----- | ------------------------------------------------- | ------------------------------------ |
| 4.1.1 | Write config loader tests                         | `tests/unit/config/config.test.ts`   |
| 4.1.2 | Write logger tests                                | `tests/unit/utils/logger.test.ts`    |
| 4.1.3 | Write health endpoint tests                       | `tests/unit/middleware/health.test.ts`|

**Deliverables**:
- [ ] All unit tests pass
- [ ] Config tests cover validation, defaults, and error cases
- [ ] Logger tests verify JSON format and level filtering
- [ ] Health tests verify response format

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 5: CI Pipeline & Final Verification

### Session 5.1: GitHub Actions + Final Check

**Reference**: [06-ci-pipeline.md](06-ci-pipeline.md)
**Objective**: Create CI workflow and run full project verification.

**Tasks**:

| #     | Task                                              | File(s)                        |
| ----- | ------------------------------------------------- | ------------------------------ |
| 5.1.1 | Create GitHub Actions CI workflow                 | `.github/workflows/ci.yml`     |
| 5.1.2 | Final verification — build + test + Docker        | N/A (verification only)        |

**Deliverables**:
- [ ] CI workflow file exists and is valid YAML
- [ ] `yarn verify` passes (build + all tests)
- [ ] `docker compose config` validates
- [ ] `docker build .` completes successfully

**Verify**: `clear && sleep 3 && yarn verify`

---

## Task Checklist (All Phases)

### Phase 1: Project Scaffolding
- [ ] 1.1.1 Create package.json with all dependencies
- [ ] 1.1.2 Create tsconfig.json
- [ ] 1.1.3 Create vitest.config.ts
- [ ] 1.1.4 Create directory structure with .gitkeep files
- [ ] 1.1.5 Create .gitignore and .env.example

### Phase 2: Docker Environment
- [ ] 2.1.1 Create docker-compose.yml (PostgreSQL + Redis)
- [ ] 2.1.2 Create production Dockerfile (multi-stage)
- [ ] 2.1.3 Create .dockerignore

### Phase 3: Application Core
- [ ] 3.1.1 Create config schema with Zod validation
- [ ] 3.1.2 Create config loader
- [ ] 3.1.3 Create structured JSON logger
- [ ] 3.1.4 Create Koa server with health endpoint + graceful shutdown
- [ ] 3.1.5 Create application entry point

### Phase 4: Tests
- [ ] 4.1.1 Write config loader tests
- [ ] 4.1.2 Write logger tests
- [ ] 4.1.3 Write health endpoint tests

### Phase 5: CI Pipeline & Final
- [ ] 5.1.1 Create GitHub Actions CI workflow
- [ ] 5.1.2 Final verification — build + test + Docker

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X, Session X.X per `plans/project-setup/99-execution-plan.md`"

### Ending a Session

1. Run the project's verify command: `clear && sleep 3 && yarn verify`
2. Handle commit per the active **commit mode** (see "Commit Behavior During Plan Execution" in `make_plan.md`)
3. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with [x]
3. Start new conversation for next session
4. Run `exec_plan project-setup` to continue

---

## Dependencies

```
Phase 1: Project Scaffolding
    ↓
Phase 2: Docker Environment (needs package.json for Dockerfile)
    ↓
Phase 3: Application Core (needs TypeScript config + dependencies)
    ↓
Phase 4: Tests (needs application code to test)
    ↓
Phase 5: CI Pipeline & Final (needs everything)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ `yarn verify` passes (build + all tests)
3. ✅ `yarn dev` starts a working server
4. ✅ `GET /health` returns 200 with structured JSON
5. ✅ `docker compose up -d` starts PostgreSQL + Redis
6. ✅ `docker build .` produces a working image
7. ✅ `.github/workflows/ci.yml` exists and is valid
8. ✅ No warnings/errors from TypeScript compiler
9. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
