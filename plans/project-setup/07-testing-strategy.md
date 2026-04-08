# Testing Strategy: Project Setup

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

- Unit tests: 90%+ coverage for config loader, logger, health endpoint
- Integration tests: None in this plan (no external services used yet)
- E2E tests: Basic server startup test

## Test Categories

### Unit Tests

| Test File | What It Tests | Priority |
| --------- | ------------- | -------- |
| `tests/unit/config/config.test.ts` | Config schema validation, defaults, error messages | High |
| `tests/unit/utils/logger.test.ts` | Log output format, level filtering, structured schema | High |
| `tests/unit/middleware/health.test.ts` | Health endpoint response format, status code | High |

### Config Loader Tests (`tests/unit/config/config.test.ts`)

| Test | Description |
| ---- | ----------- |
| should load valid config with all required vars | Happy path with all env vars set |
| should apply default values for optional vars | Verify defaults for PORT, NODE_ENV, TTLs, etc. |
| should throw on missing ISSUER | Required var missing → descriptive error |
| should throw on missing DATABASE_URL | Required var missing → descriptive error |
| should throw on missing REDIS_URL | Required var missing → descriptive error |
| should throw on invalid ISSUER (not a URL) | Format validation |
| should throw on invalid PORT (not a number) | Type coercion validation |
| should throw on invalid KEY_ENCRYPTION_KEY (wrong length) | Must be exactly 64 hex chars |
| should transform COOKIE_SECRETS to array | `"a,b,c"` → `["a", "b", "c"]` |
| should transform TRUST_PROXY string to boolean | `"true"` → `true`, `"false"` → `false` |
| should accept optional bootstrap vars when missing | Bootstrap vars are optional |
| should report all validation errors at once | Multiple missing vars → all listed |

### Logger Tests (`tests/unit/utils/logger.test.ts`)

| Test | Description |
| ---- | ----------- |
| should output valid JSON to stdout | Verify JSON.parse works on output |
| should include required fields (timestamp, level, message, service) | Schema compliance |
| should set service to "porta" | Per OPERATIONS.md spec |
| should include ISO 8601 timestamp | Format validation |
| should include extra fields when provided | `logger.info('msg', { key: 'val' })` |
| should filter debug messages when level is info | Level filtering |
| should pass info messages when level is info | Level filtering |
| should pass warn messages when level is info | Level filtering |
| should pass error messages when level is info | Level filtering |
| should pass all messages when level is debug | Level filtering |
| should filter info when level is warn | Level filtering |
| should write errors to stderr | Error routing |

### Health Endpoint Tests (`tests/unit/middleware/health.test.ts`)

| Test | Description |
| ---- | ----------- |
| should return 200 status | HTTP status code |
| should return JSON content type | Response headers |
| should include status "ok" | Response body |
| should include timestamp in ISO format | Response body format |
| should include version | Response body |
| should include database and redis check stubs | Response body structure |

## Test Implementation Notes

### Testing the Config Loader

Config tests need to manipulate `process.env`. Use a helper pattern:

```typescript
function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const original = { ...process.env };
  Object.assign(process.env, overrides);
  try {
    fn();
  } finally {
    // Restore original env
    for (const key of Object.keys(overrides)) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  }
}
```

Provide a base set of valid env vars, then override individual vars per test.

### Testing the Logger

Capture stdout/stderr by mocking `process.stdout.write` and `process.stderr.write`:

```typescript
import { vi } from 'vitest';

const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
```

Parse the written JSON and assert on fields.

### Testing the Health Endpoint

Use Koa's test pattern — create the app, use `node:http` to make a request:

```typescript
import { createApp } from '../../../src/app/server.js';
import http from 'node:http';

// Create app with test config, start a server on random port,
// make HTTP request, assert response, close server.
```

Or use a lightweight HTTP testing utility. Keep it simple — no test framework dependencies beyond Vitest.

## Test Data

### Fixtures Needed

A base valid environment for config tests:

```typescript
const VALID_ENV = {
  ISSUER: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://porta:porta@localhost:5432/porta',
  REDIS_URL: 'redis://localhost:6379',
  KEY_ENCRYPTION_KEY: '0'.repeat(64),
  COOKIE_SECRETS: 'test-secret',
  SMTP_HOST: 'localhost',
  SMTP_USER: 'test',
  SMTP_PASS: 'test',
  SMTP_FROM: 'Test <test@localhost>',
};
```

### Mock Requirements

- `process.stdout.write` / `process.stderr.write` — for logger tests
- No other mocks needed (all components are pure functions or simple Koa middleware)

## Verification Checklist

- [ ] All unit tests pass (`yarn test`)
- [ ] All tests produce clear pass/fail output
- [ ] No regressions (there are no existing tests to regress)
- [ ] `yarn verify` (build + test) passes
