# Requirements: Project Scaffolding

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-01](../../requirements/RD-01-project-scaffolding.md)

## Feature Overview

Set up the foundational project structure for Porta v5 — a multi-tenant OIDC provider built on Koa + TypeScript + node-oidc-provider + PostgreSQL + Redis. This is the skeleton that all subsequent features (RD-02 through RD-12) build upon.

## Functional Requirements

### Must Have

- [ ] Koa-based HTTP server with TypeScript
- [ ] yarn as the sole package manager (enforced via `.npmrc`)
- [ ] TypeScript strict mode with ES2022+ target
- [ ] Docker Compose with PostgreSQL 16+, Redis 7+, MailHog
- [ ] Environment-based config system (`.env`, validated at startup with zod)
- [ ] Graceful shutdown handling (SIGTERM, SIGINT)
- [ ] Health check endpoint (`GET /health`) — server, DB, Redis status
- [ ] Structured JSON logging via pino
- [ ] ESLint + Prettier (TypeScript-aware)
- [ ] Vitest as test framework
- [ ] Build script producing production JavaScript
- [ ] `tsx watch` for development hot-reload

### Should Have

- [ ] Makefile as single entry point for all commands
- [ ] `.editorconfig` for consistent editor settings
- [ ] Git hooks via husky + lint-staged
- [ ] Source maps in development

### Won't Have (Out of Scope)

- Frontend SPA (RD-07 handles Handlebars templates)
- CI/CD pipeline (RD-11)
- Production Docker image (RD-11)
- Database schema or migrations (RD-02)
- OIDC provider setup (RD-03)
- Any domain logic (RD-04+)

## Technical Requirements

### Environment

- Node.js 22 LTS (confirmed on system)
- Yarn Classic 1.22 (confirmed on system)
- Docker 27.2 + Compose v2.29 (confirmed on system)

### Performance

- Server startup < 2 seconds (excluding Docker)
- Health check response < 100ms

### Security

- No secrets in source code
- `.env` file git-ignored
- Config validation fails fast on missing required vars

## Acceptance Criteria

1. [ ] `yarn install` succeeds with no errors
2. [ ] `yarn dev` starts Koa server, responds to `GET /health` with 200
3. [ ] `yarn build` produces valid JavaScript output
4. [ ] `yarn test` runs Vitest with no errors
5. [ ] `yarn lint` passes with no errors
6. [ ] `docker compose up` starts Postgres, Redis, MailHog
7. [ ] Application connects to Postgres and Redis (verified via health check)
8. [ ] Application fails fast if `DATABASE_URL` or `REDIS_URL` is missing
9. [ ] Graceful shutdown works (SIGTERM → clean exit)
10. [ ] Structured JSON logs appear in stdout
11. [ ] `.env.example` documents all environment variables
12. [ ] Project structure matches the defined layout
