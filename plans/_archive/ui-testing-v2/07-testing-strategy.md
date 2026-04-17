# Testing Strategy: UI Testing Phase 2

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

- **Page coverage**: Every Handlebars page template exercised (16/16 → all rendered in at least one test)
- **Route coverage**: Every UI-facing route handler exercised (all GET + POST handlers)
- **Error state coverage**: Every user status, org status, and token state tested
- **Security coverage**: CSRF, rate limiting, enumeration safety, token abuse verified in browser
- **Accessibility basics**: Form labels, keyboard navigation, error focus management

### Test Layer Strategy

| Layer | Tool | Purpose | This Plan |
|---|---|---|---|
| Unit tests | Vitest | Business logic, functions | NOT in scope |
| E2E tests | Vitest + fetch | HTTP protocol, API | NOT in scope |
| Pentest | Vitest + AttackClient | Security at protocol level | NOT in scope |
| **UI tests** | **Playwright** | **Browser rendering, UX, forms** | **✅ This plan** |

### Why Playwright (Not E2E Expansion)

E2E tests already cover the same logical flows at HTTP level. Playwright UI tests add:

1. **Real browser rendering** — verifies templates render without errors
2. **JavaScript execution** — catches client-side JS issues
3. **Form interactions** — validates HTML form behavior, validation, autocomplete
4. **Visual feedback** — confirms error/success flash messages are visible
5. **Cookie behavior** — tests real browser cookie handling
6. **Redirect chains** — follows full redirect chains as a browser does
7. **Accessibility** — tests label associations, focus management, keyboard nav

## Test Categories

### Flow Tests (`tests/ui/flows/`)

| Test File | Category | Tests | Priority |
|---|---|---|---|
| `forgot-password.spec.ts` | Cat 1 | 8 | High |
| `reset-password.spec.ts` | Cat 2 | 10 | High |
| `magic-link-verify.spec.ts` | Cat 3 | 6 | High |
| `invitation.spec.ts` | Cat 5 | 9 | High |
| `login-error-states.spec.ts` | Cat 6 | 9 | High |
| `consent-edge-cases.spec.ts` | Cat 7 | 5 | Medium |
| `interaction-lifecycle.spec.ts` | Cat 8 | 6 | Medium |
| `two-factor-edge-cases.spec.ts` | Cat 9 | 8 | Medium |

### Security Tests (`tests/ui/security/`)

| Test File | Category | Tests | Priority |
|---|---|---|---|
| `magic-link-abuse.spec.ts` | Cat 4 | 4 | High |
| `reset-password-abuse.spec.ts` | Cat 10 | 4 | High |
| `tenant-isolation.spec.ts` | Cat 11 | 4 | Medium |
| `page-quality.spec.ts` | Cat 12 | 7 | Medium |

### Discovery Tests (within existing or new flows)

| Test Scope | Category | Tests | Priority |
|---|---|---|---|
| OIDC discovery endpoints | Cat 13 | 4 | Low |

### Accessibility Tests (`tests/ui/accessibility/`)

| Test File | Category | Tests | Priority |
|---|---|---|---|
| `form-accessibility.spec.ts` | Cat 14 | 5 | Low |

## Test Data

### Fixtures Needed

| Fixture | File | New/Modified |
|---|---|---|
| `testData` | `test-fixtures.ts` | Modified — extended interface |
| `startAuthFlow` | `test-fixtures.ts` | Existing — no changes |
| `mailCapture` | `mail-capture.ts` | New |
| `dbHelpers` | `db-helpers.ts` | New |

### Seed Data (Global Setup)

| Entity | Purpose | Status |
|---|---|---|
| Active user | Main test user (existing) | Existing |
| Suspended user | Login error state test | New |
| Archived user | Login error state test | New |
| Deactivated user | Login error state test | New |
| Lockable user | Account lockout test | New |
| Invited user | Invitation acceptance test | New |
| Resettable user | Password reset test | New |
| Suspended org | Tenant isolation test | New |
| Archived org | Tenant isolation test | New |

### Mock Requirements

- **No mocks needed** — all tests run against real server with real DB/Redis/MailHog
- This is intentional: UI tests should exercise the full stack as a user would

## Test Isolation Strategy

### Rate Limits
- Each test that touches rate limits calls `dbHelpers.resetAllRateLimits()` in `test.beforeEach`
- Pattern: `rl:*` keys in Redis

### User State
- Tests that modify user status restore original status in `test.afterEach`
- The `lockableUser` is active by default; only lockout tests change its status

### Tokens
- Each test creates its own tokens (not shared between tests)
- Tokens are single-use, so each test gets a fresh one

### Emails
- `mailCapture.deleteAll()` called before email-dependent tests
- Timestamp-based filtering (`after`) to avoid picking up stale emails

### Passwords
- Tests that reset passwords track the original hash and restore it in teardown
- `resettableUser` has a known password that can be reset and restored

## Verification Checklist

- [ ] All 89 new test cases pass
- [ ] No regressions in existing UI tests (Phase 1: ~42 tests)
- [ ] No regressions in existing E2E tests
- [ ] No regressions in existing unit tests (1,818 tests)
- [ ] `yarn test:ui` succeeds with all UI tests
- [ ] `yarn verify` passes (build + lint + unit tests)
- [ ] Test execution time is reasonable (< 5 minutes total for all UI tests)
- [ ] Infrastructure fixtures are reusable for future test additions
- [ ] Each spec file is self-contained and can run independently
