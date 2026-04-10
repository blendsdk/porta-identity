# Current State: CSRF Fix & Playwright UI Testing

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### CSRF Module (`src/auth/csrf.ts`)

The CSRF module provides two functions:
- `generateCsrfToken()` — generates 32 random bytes, base64url-encoded
- `verifyCsrfToken(expected, actual)` — constant-time comparison via `crypto.timingSafeEqual`

These functions are correct and will be kept. The bug is in **how they're used** by the route handlers.

### Current CSRF Pattern (Broken)

Every route handler that processes a form follows the same broken pattern:

```typescript
// In route handler (POST):
const submittedCsrf = body._csrf ?? '';      // From the form hidden field
const storedCsrf = body._csrfStored ?? '';   // From another form hidden field (BROKEN)

if (!verifyCsrfToken(storedCsrf, submittedCsrf)) {
  // → Always fails because _csrfStored is missing from most templates
}
```

### Affected Files

| File | Handlers | `_csrfStored` in Template? | Status |
|---|---|---|---|
| `src/routes/interactions.ts` | `processLogin`, `handleSendMagicLink`, `processConsent` | ❌ Missing from `login.hbs`, `consent.hbs` | **BROKEN** — always fails |
| `src/routes/two-factor.ts` | `verifyTwoFactor`, `processTwoFactorSetup` | ✅ Present in `two-factor-verify.hbs`, `two-factor-setup.hbs` | **INSECURE** — both values from same form |
| `src/routes/password-reset.ts` | `processForgotPassword`, `processResetPassword` | ❌ Missing from `forgot-password.hbs`, `reset-password.hbs` | **BROKEN** — always fails |
| `src/routes/invitation.ts` | `processAcceptInvite` | ❌ Missing from `accept-invite.hbs` | **BROKEN** — always fails |

### Template Inventory

All templates that have POST forms (and their current CSRF state):

| Template | Form Action | Has `_csrf`? | Has `_csrfStored`? |
|---|---|---|---|
| `login.hbs` | `/interaction/{{uid}}/login` | ✅ | ❌ |
| `login.hbs` | `/interaction/{{uid}}/magic-link` | ✅ | ❌ |
| `consent.hbs` | `/interaction/{{uid}}/confirm` | ✅ | ❌ |
| `consent.hbs` | `/interaction/{{uid}}/abort` | ✅ | ❌ |
| `logout.hbs` | `/interaction/{{uid}}/logout` | ✅ | ❌ |
| `two-factor-verify.hbs` | `/interaction/{{uid}}/two-factor` | ✅ | ✅ (insecure) |
| `two-factor-verify.hbs` | `/interaction/{{uid}}/two-factor/resend` | ✅ | ❌ |
| `two-factor-setup.hbs` | `/interaction/{{uid}}/two-factor/setup` (×2) | ✅ | ✅ (insecure) |
| `forgot-password.hbs` | `/{{orgSlug}}/forgot-password` | ✅ | ❌ |
| `reset-password.hbs` | `/{{orgSlug}}/reset-password` | ✅ | ❌ |
| `accept-invite.hbs` | `/{{orgSlug}}/accept-invite` | ✅ | ❌ |

### Existing Test Infrastructure

| Test Layer | Tool | Cookie Support | Browser? | CSRF Coverage |
|---|---|---|---|---|
| Unit tests | Vitest | Mocked | ❌ | Tests `verifyCsrfToken()` logic |
| E2E tests | Vitest + `TestHttpClient` | Manual cookie jar | ❌ | `tests/e2e/security/csrf.test.ts` (4 tests) |
| Pentest tests | Vitest + `AttackClient` | Manual | ❌ | Session attacks check cookie flags |
| **UI tests** | **None** | N/A | N/A | **No browser-level testing** |

### Existing Test Files

```
tests/unit/auth/csrf.test.ts              — CSRF token generation/verification (unit)
tests/e2e/security/csrf.test.ts           — CSRF enforcement on form POSTs (HTTP-level)
tests/pentest/auth-bypass/session-attacks.test.ts — Cookie flag checks
```

## Gaps Identified

### Gap 1: CSRF Token Storage

**Current Behavior:** CSRF "expected" token read from `body._csrfStored` (form field)
**Required Behavior:** CSRF expected token read from an HttpOnly cookie set by the server
**Fix Required:** Add cookie-based CSRF to `src/auth/csrf.ts`, update all 4 route files

### Gap 2: `_csrfStored` in Templates

**Current Behavior:** Most templates don't include `_csrfStored`; two-factor templates do (insecurely)
**Required Behavior:** Templates only need `_csrf` (the form field). No `_csrfStored` needed.
**Fix Required:** Remove `_csrfStored` from two-factor templates

### Gap 3: No Browser-Level Testing

**Current Behavior:** All tests use programmatic HTTP clients (no real browser)
**Required Behavior:** Automated browser tests verify form submissions, cookies, redirects
**Fix Required:** Add Playwright test suite

## Dependencies

### Internal Dependencies
- CSRF fix must come before Playwright tests (Playwright tests verify CSRF works)
- Docker services (Postgres, Redis, MailHog) must be running for Playwright tests
- Existing `tests/helpers/server-setup.ts` can be reused for Playwright global setup

### External Dependencies
- `@playwright/test` — Playwright Test runner
- Chromium browser (auto-installed by Playwright)

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| CSRF cookie not sent on OIDC redirects | Low | High | SameSite=Lax allows navigational requests |
| Playwright flaky on CI | Medium | Medium | Retry policy, trace-on-failure for debugging |
| Existing E2E CSRF tests break after refactor | Medium | Low | Update tests to send cookie + form field |
| Cookie path conflicts with OIDC provider cookies | Low | High | CSRF cookie uses path `/`, won't collide with provider's scoped cookies |
