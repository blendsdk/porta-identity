# Testing Strategy: CSRF Fix & Playwright UI Testing

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

- CSRF fix: 100% of affected route handlers tested
- Playwright UI: All 4 core auth flows tested in browser
- No regressions in existing 2,100+ tests

## Test Categories

### Unit Tests (CSRF Module)

| Test | Description | Priority |
|---|---|---|
| `setCsrfCookie` sets correct cookie | Verify cookie name, httpOnly, sameSite, path, overwrite | High |
| `setCsrfCookie` secure flag in production | Verify secure=true when NODE_ENV=production | Medium |
| `getCsrfFromCookie` returns cookie value | Verify returns token from ctx.cookies.get | High |
| `getCsrfFromCookie` returns undefined when missing | Verify returns undefined if no cookie | High |
| Existing `generateCsrfToken` tests | Unchanged | High |
| Existing `verifyCsrfToken` tests | Unchanged | High |

### Route Handler Tests (CSRF Integration)

| Test | Description | Priority |
|---|---|---|
| Interaction GET handlers set CSRF cookie | Verify `ctx.cookies.set` called | High |
| Interaction POST handlers read from cookie | Verify `ctx.cookies.get('_csrf')` used | High |
| Two-factor GET handlers set CSRF cookie | Same pattern | High |
| Two-factor POST handlers read from cookie | Same pattern | High |
| Password-reset GET handlers set CSRF cookie | Same pattern | High |
| Password-reset POST handlers read from cookie | Same pattern | High |
| Invitation GET handler sets CSRF cookie | Same pattern | High |
| Invitation POST handler reads from cookie | Same pattern | High |

### E2E Tests (HTTP-Level CSRF)

Existing `tests/e2e/security/csrf.test.ts` (4 tests) — update to use cookie-based mechanism:

| Test | Update Needed | Priority |
|---|---|---|
| Login form includes CSRF token | Extract from HTML AND verify Set-Cookie header | High |
| POST without CSRF token rejected | Send without cookie AND without form field | High |
| POST with invalid CSRF token rejected | Send correct cookie but wrong form field | High |
| POST with valid CSRF token accepted | Send matching cookie and form field | High |

### Playwright UI Tests

| Category | File | Tests | Priority |
|---|---|---|---|
| Password Login | `flows/password-login.spec.ts` | 6 | High |
| Magic Link | `flows/magic-link.spec.ts` | 4 | High |
| Consent | `flows/consent.spec.ts` | 4 | Medium |
| Two-Factor | `flows/two-factor.spec.ts` | 4 | Medium |
| CSRF Protection | `security/csrf-protection.spec.ts` | 6 | High |
| Cookie Flags | `security/cookie-flags.spec.ts` | 4 | Medium |

**Total new Playwright tests: ~28**

## Test Data

### Fixtures Needed (Playwright Global Setup)

- 1 active organization with branding
- 1 active application (first-party) for auto-consent tests
- 1 active application (third-party) for consent page tests
- 1 active client per application (with known client_id/secret)
- 1 active user with known email/password
- 1 active user with 2FA enabled (for 2FA flow tests)

### Mock Requirements

- **No mocks in Playwright tests** — everything is real (server, DB, Redis, MailHog)
- Unit test mocks: `ctx.cookies.get()`, `ctx.cookies.set()` for cookie verification

## Verification Checklist

- [ ] All CSRF unit tests pass (existing + new cookie tests)
- [ ] All route handler tests pass with cookie-based CSRF
- [ ] All 4 E2E CSRF tests pass with cookie mechanism
- [ ] All existing 2,100+ tests pass (no regressions)
- [ ] Playwright password login flow passes
- [ ] Playwright CSRF enforcement tests pass
- [ ] `yarn test:ui` completes successfully
- [ ] `yarn verify` passes
