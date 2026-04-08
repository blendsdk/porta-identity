# Requirements: Project Setup

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)

## Feature Overview

Scaffold the Porta v5 project from an empty repository to a fully buildable, testable, and runnable Koa HTTP server with Docker development infrastructure and CI pipeline. This is the foundation all subsequent plans build upon.

## Functional Requirements

### Must Have

- [ ] Yarn project initialized with all production + dev dependencies
- [ ] TypeScript strict mode, ESM-only configuration
- [ ] Vitest configured and running
- [ ] Docker Compose with PostgreSQL 16 + Redis 7 for development
- [ ] Production multi-stage Dockerfile
- [ ] Directory structure matching project conventions
- [ ] Configuration loader reading all env vars with Zod validation
- [ ] Structured JSON logger (stdout)
- [ ] Basic Koa server with graceful shutdown
- [ ] Health check endpoint (`GET /health`)
- [ ] Yarn scripts: `build`, `dev`, `test`, `test:watch`, `verify`, `start`
- [ ] `.env.example` documenting all env vars
- [ ] `.gitignore` for Node.js/TypeScript project
- [ ] GitHub Actions CI workflow (build + test on push/PR)
- [ ] First passing unit tests (config, logger, health endpoint)

### Should Have

- [ ] `.dockerignore` for efficient Docker builds
- [ ] `yarn dev` with watch mode (tsx or similar)
- [ ] Yarn script stubs for `migrate` and `bootstrap` (echo "not implemented yet")

### Won't Have (Out of Scope)

- oidc-provider integration
- Database schema or migrations
- Any API endpoints beyond `/health`
- Authentication or authorization
- EJS templates or views
- Email functionality
- CLI tool
- Bootstrap seed data logic

## Technical Requirements

### Performance

- Server startup time: < 2 seconds
- Health check response: < 10ms

### Compatibility

- Node.js ≥ 22
- TypeScript 5.x
- ESM-only (no CommonJS)
- Docker Engine 24+, Docker Compose v2

### Security

- No secrets in committed files (`.env.example` has placeholders only)
- Dockerfile runs as non-root user
- Dependencies pinned to specific versions in package.json
- Yarn modern (v4) managed via Corepack

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale |
| -------- | ------------------ | ------ | --------- |
| Config validation | Manual checks, Zod, Joi, Ajv | Zod | TypeScript-first, infers types, lightweight, no runtime overhead for schema definition |
| Logger | Pino, Winston, Custom JSON | Custom JSON | Minimal dependency, full control over format, matches the structured log schema in OPERATIONS.md |
| Dev server | ts-node, tsx, nodemon+tsc | tsx | Fast ESM support, watch mode built-in, no config needed |
| Dockerfile | Single-stage, Multi-stage | Multi-stage | Smaller production image, no dev dependencies in runtime |

## Acceptance Criteria

1. [ ] `yarn build` compiles TypeScript without errors
2. [ ] `yarn test` runs and all tests pass
3. [ ] `yarn verify` (build + test) passes
4. [ ] `yarn dev` starts the server on port 3000
5. [ ] `GET http://localhost:3000/health` returns 200 with JSON status
6. [ ] `docker compose up -d` starts PostgreSQL and Redis
7. [ ] `docker build .` produces a working image
8. [ ] GitHub Actions workflow runs on push (self-hosted runner, build + test)
9. [ ] All env vars from OPERATIONS.md are defined in config schema (with defaults where applicable)
