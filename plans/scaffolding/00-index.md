# Project Scaffolding Implementation Plan

> **Feature**: Set up the foundational project structure for Porta v5
> **Status**: Planning Complete
> **Created**: 2026-04-08
> **Source**: [RD-01 — Project Scaffolding](../../requirements/RD-01-project-scaffolding.md)

## Overview

This plan implements the complete project skeleton for Porta v5 — a multi-tenant OIDC provider. It creates the TypeScript/Koa project from scratch, configures Docker Compose for local development (PostgreSQL, Redis, MailHog), sets up structured logging, health checks, graceful shutdown, environment validation, linting, testing infrastructure, and all build/dev commands.

After this plan is complete, the project will have a running Koa server connected to PostgreSQL and Redis, with a full development toolchain ready for feature implementation.

## Document Index

| #  | Document | Description |
|----|----------|-------------|
| 00 | [Index](00-index.md) | This document — overview and navigation |
| 01 | [Requirements](01-requirements.md) | Feature requirements and scope |
| 02 | [Current State](02-current-state.md) | Analysis of current implementation |
| 03 | [Docker & Config](03-docker-and-config.md) | Docker Compose, env vars, config validation |
| 04 | [Koa Server & Middleware](04-koa-server-and-middleware.md) | Server setup, middleware, health check, shutdown |
| 05 | [Connections & Logging](05-connections-and-logging.md) | PostgreSQL, Redis, pino logger |
| 06 | [Toolchain](06-toolchain.md) | TypeScript, ESLint, Prettier, Vitest, build scripts |
| 07 | [Testing Strategy](07-testing-strategy.md) | Test cases and verification |
| 99 | [Execution Plan](99-execution-plan.md) | Phases, sessions, and task checklist |

## Quick Reference

### After Implementation

```bash
# Start infrastructure
yarn docker:up

# Start development server
yarn dev

# Verify health
curl http://localhost:3000/health

# Run tests
yarn test

# Build for production
yarn build
```

### Key Decisions

| Decision | Outcome |
|----------|---------|
| Package manager | Yarn Classic 1.22 |
| Node.js version | 22 LTS |
| TypeScript target | ES2022 |
| Logging | pino (structured JSON) |
| Config validation | zod |
| Dev server | tsx watch |
| Test framework | Vitest |
| Docker Compose | v2 (local dev only) |

## Key Files Created

```
porta/
├── src/index.ts                    # Entry point
├── src/server.ts                   # Koa server
├── src/config/index.ts             # Config loader
├── src/config/schema.ts            # Zod validation
├── src/middleware/error-handler.ts  # Error middleware
├── src/middleware/request-logger.ts # Request logging
├── src/middleware/health.ts         # Health check
├── src/lib/logger.ts               # Pino logger
├── src/lib/database.ts             # PostgreSQL pool
├── src/lib/redis.ts                # Redis client
├── docker/docker-compose.yml       # Dev infrastructure
├── .env.example                    # Env template
├── package.json                    # Dependencies & scripts
├── tsconfig.json                   # TypeScript config
├── vitest.config.ts                # Test config
├── .eslintrc.cjs                   # Linting
├── .prettierrc                     # Formatting
├── Makefile                        # Command runner
└── .gitignore                      # Git ignores
```
