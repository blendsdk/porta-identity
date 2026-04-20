# Testing Strategy: Production Hardening

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

Each phase lands with its own tests. Total new test budget: ~30 unit + 5 integration cases.

### Coverage Goals

- All zod refinement rules have a dedicated failure test + one passing test.
- All new middleware (`ready`, `metrics`) has integration coverage.
- Existing tests (2,189) must remain green.

## Test Categories

### Phase A: Config refinement (unit)

`tests/unit/config/schema.production.test.ts`

| # | Test | Expectation |
|---|---|---|
| A1 | `NODE_ENV=production` + `change-me` cookie key | fails with `COOKIE_KEYS contains a dev placeholder` |
| A2 | `NODE_ENV=production` + 16-char cookie key | fails with `shorter than 32 chars` |
| A3 | `NODE_ENV=production` + missing `TWO_FACTOR_ENCRYPTION_KEY` | fails with `is required in production` |
| A4 | `NODE_ENV=production` + example 2FA key | fails with `dev placeholder` |
| A5 | `NODE_ENV=production` + 30-byte 2FA key | fails with `>= 32 bytes` |
| A6 | `NODE_ENV=production` + `porta_dev` in DB URL | fails with `dev password` |
| A7 | `NODE_ENV=production` + `http://example.com` issuer | fails with `must use HTTPS` |
| A8 | `NODE_ENV=production` + `http://localhost:3000` issuer | passes (loopback exception) |
| A9 | `NODE_ENV=production` + `LOG_LEVEL=debug` | fails with `too verbose` |
| A10 | `NODE_ENV=production` + `SMTP_HOST=localhost` | fails with `dev inbox` |
| A11 | `NODE_ENV=production` + valid values everywhere | passes |
| A12 | `NODE_ENV=development` + all placeholders | passes |
| A13 | `NODE_ENV=production` + `PORTA_SKIP_PROD_SAFETY=true` + placeholders | passes |

### Phase B: Runtime hardening

#### Unit

- `tests/unit/middleware/error-handler.test.ts` (augment): prod env → response body has no `stack`.
- `tests/unit/oidc/configuration.test.ts` (new or augment): HTTPS issuer → cookie `secure: true`; HTTP issuer → `secure: false`.

#### Integration

- `tests/integration/ready.test.ts`:
  - Happy path: `GET /ready` → 200 JSON with `status:'ready'`.
  - DB down (stub `getPool().query` to reject): 503 + `checks.db.ok=false`.
  - Redis down (stub `getRedis().ping`): 503 + `checks.redis.ok=false`.
  - Timeout: stub both to never resolve → 503 within 2.5s.

#### Manual (developer)

- Start with `TRUST_PROXY=true`, `curl -H 'X-Forwarded-For: 9.9.9.9'`; request log shows `9.9.9.9`.
- `kill -TERM $(pgrep -f 'tsx.*src/index.ts')` → clean exit < 10s.

### Phase C: Metrics

`tests/integration/metrics.test.ts`

| # | Test | Expectation |
|---|---|---|
| C1 | `METRICS_ENABLED=false` | GET `/metrics` → 404 |
| C2 | `METRICS_ENABLED=true` | GET `/metrics` → 200, content-type `text/plain; version=0.0.4` |
| C3 | Body contains `porta_http_requests_total` + `process_cpu_user_seconds_total` | ok |
| C4 | After hitting `/health`, scrape shows a `{route=/health,status=200}` sample | ok |

### Phase D: CI workflow

- Open a PR with a trivial README edit; workflow runs; `yarn verify` step passes green.
- Break a test intentionally; workflow fails red.

## Verification Checklist

- [ ] A1–A13 pass
- [ ] Error-handler + cookie unit tests pass
- [ ] Ready integration suite passes
- [ ] Metrics integration suite passes
- [ ] Shutdown manual test passes
- [ ] `yarn verify` green at end of each phase
- [ ] GitHub Actions workflow green on a PR
