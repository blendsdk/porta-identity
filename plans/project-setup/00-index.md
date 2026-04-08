# Project Setup Implementation Plan

> **Feature**: Phase 0 — Project scaffolding, Docker, CI, config
> **Status**: Planning Complete
> **Created**: 2026-04-08

## Overview

This plan scaffolds the Porta v5 project from scratch: Yarn project initialization, TypeScript configuration, Docker development environment, basic Koa server with health check, structured logging, configuration loader, production Dockerfile, GitHub Actions CI (self-hosted runner), and the first passing tests. After this plan, `yarn dev` starts a working server and `yarn verify` passes.

## Document Index

| #   | Document                                            | Description                             |
| --- | --------------------------------------------------- | --------------------------------------- |
| 00  | [Index](00-index.md)                                | This document — overview and navigation |
| 01  | [Requirements](01-requirements.md)                  | Feature requirements and scope          |
| 02  | [Current State](02-current-state.md)                | Analysis of current implementation      |
| 03  | [Project Scaffolding](03-project-scaffolding.md)    | package.json, TypeScript, Vitest, Yarn scripts |
| 04  | [Docker Environment](04-docker.md)                  | Docker Compose, Dockerfile, .dockerignore |
| 05  | [Application Core](05-application-core.md)          | Config loader, logger, Koa server, health endpoint |
| 06  | [CI Pipeline](06-ci-pipeline.md)                    | GitHub Actions workflow                 |
| 07  | [Testing Strategy](07-testing-strategy.md)          | Test cases and verification             |
| 99  | [Execution Plan](99-execution-plan.md)              | Phases, sessions, and task checklist    |

## Quick Reference

### After Completion

```bash
# Start development environment
docker compose up -d && yarn dev

# Run tests
yarn test

# Full verification (build + test)
yarn verify

# Production build
docker build -t porta:latest .
```

### Key Decisions

| Decision                  | Outcome                                     |
| ------------------------- | ------------------------------------------- |
| Package manager           | Yarn (modern, via Corepack)                 |
| TypeScript target         | ES2022, ESM-only                            |
| Test framework            | Vitest                                      |
| Docker dev services       | PostgreSQL 16 + Redis 7                     |
| Dockerfile strategy       | Multi-stage (build + runtime)               |
| CI platform               | GitHub Actions (self-hosted runner)          |
| Config validation         | Zod                                         |
| Logger                    | Custom structured JSON (stdout)             |

## Files Created or Modified

### New Files

```
package.json
tsconfig.json
vitest.config.ts
.gitignore
.env.example
.dockerignore
Dockerfile
docker-compose.yml
.github/workflows/ci.yml
src/index.ts
src/app/server.ts
src/config/index.ts
src/config/schema.ts
src/utils/logger.ts
src/middleware/health.ts
tests/unit/config/config.test.ts
tests/unit/utils/logger.test.ts
tests/unit/middleware/health.test.ts
```
