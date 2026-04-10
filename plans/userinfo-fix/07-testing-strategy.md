# Testing Strategy: UserInfo (/me) Endpoint Fix

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

- Unit tests: Verify `defaultResource` conditional logic
- E2E tests: Full OIDC flow → userinfo endpoint validation (4 new tests)
- Regression: All existing 2013+ unit/integration tests and 26 Playwright tests pass

## Test Categories

### Unit Tests

| Test | Description | File | Priority |
| ---- | ----------- | ---- | -------- |
| `defaultResource returns undefined when no resource requested` | Call with `oneOf = undefined` → returns `undefined` | `tests/unit/oidc/configuration.test.ts` | High |
| `defaultResource returns resource when explicitly requested` | Call with `oneOf = 'urn:porta:default'` → returns `'urn:porta:default'` | `tests/unit/oidc/configuration.test.ts` | High |

### E2E Tests (Playwright)

| Test | File | Description | Priority |
| ---- | ---- | ----------- | -------- |
| `GET /me returns user profile and email claims` | `tests/ui/flows/userinfo.spec.ts` | Full flow → GET /me with `openid profile email` scope → 200 with all claims | High |
| `GET /me rejects invalid bearer token` | `tests/ui/flows/userinfo.spec.ts` | Invalid token → 401 | High |
| `GET /me rejects missing Authorization header` | `tests/ui/flows/userinfo.spec.ts` | No auth header → 400 or 401 | Medium |
| `GET /me with openid-only scope returns sub only` | `tests/ui/flows/userinfo.spec.ts` | Full flow → GET /me with `openid` scope → 200 with `sub` only | Medium |

### Regression Tests

| Test | Description |
| ---- | ----------- |
| Existing confidential-client.spec.ts | Updated to strict 200 assertion on /me (was graceful 401 fallback) |
| Existing consent.spec.ts | Must continue passing |
| Existing password-login.spec.ts | Must continue passing |
| Existing magic-link.spec.ts | Must continue passing |
| All 2013+ Vitest unit/integration tests | Must continue passing |

## Test Data

### Fixtures Needed

No new fixtures needed. All tests reuse existing confidential client infrastructure:

| Fixture | Source | Already Exists |
| ------- | ------ | -------------- |
| Organization (test-org) | `global-setup.ts` | ✅ |
| Application | `global-setup.ts` | ✅ |
| User with password | `global-setup.ts` | ✅ |
| Confidential client (client_secret_post) | `global-setup.ts` | ✅ |
| Client secret (SHA-256 stored) | `global-setup.ts` | ✅ |
| Test data env vars | `test-fixtures.ts` | ✅ |

### Mock Requirements

None — all tests use the real Porta server started by Playwright's global setup.

## Verification Checklist

- [ ] Unit tests for `defaultResource` conditional logic pass
- [ ] All 4 new userinfo E2E tests pass
- [ ] Existing confidential-client.spec.ts passes with strict 200 assertion
- [ ] All other Playwright tests pass (consent, password-login, magic-link, two-factor)
- [ ] All 2013+ Vitest unit/integration tests pass
- [ ] `yarn verify` passes (lint + build + test)
- [ ] No regressions in any existing test
