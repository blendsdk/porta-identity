# Testing Strategy: Project Scaffolding

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

- Unit tests: Core utilities (config, logger, middleware)
- Integration tests: DB/Redis connectivity, health check endpoint
- No E2E tests for this plan (no OIDC flows yet)

## Test Categories

### Unit Tests

| Test | Description | File | Priority |
|------|------------|------|----------|
| Config loads valid env | Config schema accepts valid vars | `tests/unit/config.test.ts` | High |
| Config rejects missing DATABASE_URL | Fails with clear error | `tests/unit/config.test.ts` | High |
| Config rejects invalid PORT | Non-numeric port rejected | `tests/unit/config.test.ts` | Medium |
| Error handler catches thrown error | Returns correct status/body | `tests/unit/middleware/error-handler.test.ts` | High |
| Error handler hides 500 details | Doesn't expose internal errors | `tests/unit/middleware/error-handler.test.ts` | High |
| Request logger adds request ID | X-Request-Id header set | `tests/unit/middleware/request-logger.test.ts` | Medium |
| Logger is a pino instance | Exports working logger | `tests/unit/lib/logger.test.ts` | Low |

### Integration Tests

| Test | Components | File | Priority |
|------|-----------|------|----------|
| Health check — all healthy | DB + Redis + Koa | `tests/integration/health.test.ts` | High |
| Health check — DB down | Koa with no DB | `tests/integration/health.test.ts` | High |
| Database connects | pg + real PostgreSQL | `tests/integration/database.test.ts` | High |
| Database getPool throws when not connected | pg module | `tests/integration/database.test.ts` | Medium |
| Redis connects | ioredis + real Redis | `tests/integration/redis.test.ts` | High |
| Redis getRedis throws when not connected | ioredis module | `tests/integration/redis.test.ts` | Medium |

## Test Data

### Fixtures Needed

- Environment variable sets (valid, missing required, invalid values)

### Mock Requirements

- Config unit tests: mock `process.env` (no real DB needed)
- Middleware unit tests: mock Koa context
- Integration tests: use real Docker PostgreSQL and Redis

## Verification Commands

```bash
# Run all tests
yarn test

# Run unit tests only
yarn test:unit

# Run integration tests (requires Docker services)
yarn docker:up
yarn test:integration

# Full verification
yarn verify   # lint + build + test
```

## Verification Checklist

- [ ] All unit tests pass
- [ ] All integration tests pass (with Docker services running)
- [ ] `yarn build` succeeds with no TypeScript errors
- [ ] `yarn lint` passes with no ESLint errors
- [ ] No regressions (there are no pre-existing tests)
