# Current State: UI Testing Phase 2

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists — Playwright UI Tests (`tests/ui/`)

Phase 1 established a complete Playwright test infrastructure with 8 spec files:

| Spec File | Tests | Coverage |
|---|---|---|
| `smoke.spec.ts` | 2 | Health endpoint reachable, test data populated |
| `flows/password-login.spec.ts` | ~5 | Happy path login, invalid credentials, rate limiting |
| `flows/magic-link.spec.ts` | ~4 | Request magic link form, success message display |
| `flows/consent.spec.ts` | ~5 | Consent page rendering, approve flow, deny flow |
| `flows/two-factor.spec.ts` | ~6 | Email OTP, TOTP, recovery code verification |
| `flows/confidential-client.spec.ts` | ~5 | Full OIDC code + token exchange + introspect + userinfo |
| `flows/userinfo.spec.ts` | ~5 | UserInfo endpoint claims verification |
| `security/csrf-protection.spec.ts` | ~6 | CSRF presence, validation, tampering, rotation |
| `security/cookie-flags.spec.ts` | ~4 | HttpOnly, SameSite cookie attributes |

**Total: ~42 Playwright tests across 9 files**

### What Exists — E2E Tests (HTTP-level, NOT browser)

The `tests/e2e/` directory contains 14 test files using Vitest + `fetch`-based `TestHttpClient`. These test the same logical flows but at the HTTP protocol level — no real browser, no DOM, no JavaScript execution:

| E2E File | Overlap with Planned UI Tests |
|---|---|
| `auth/forgot-password.test.ts` | Forgot/reset password flow (HTTP-level) |
| `auth/magic-link.test.ts` | Magic link request + verification (HTTP-level) |
| `auth/invitation.test.ts` | Invitation acceptance (HTTP-level) |
| `auth/login.test.ts` | Password login (HTTP-level) |
| `auth/consent.test.ts` | Auto-consent, abort, invalid UID (HTTP-level) |
| `auth/two-factor-*.test.ts` | 2FA flows (HTTP-level) |
| `oidc/*.test.ts` | OIDC discovery, authorization, token (HTTP-level) |

**Key distinction:** E2E tests validate HTTP responses and redirects. UI tests validate what a real user sees — rendered HTML, form interactions, flash messages, browser redirects, cookie behavior, and JavaScript execution.

### What Exists — Pentest Tests (API-level security)

The `tests/pentest/` directory contains 31 test files testing security at the API level using raw HTTP `AttackClient`. Categories:

- `auth-bypass/` — Brute force, session attacks, SQL injection, timing
- `magic-link-attacks/` — Prediction, replay, host injection, enumeration
- `injection/` — SQL, XSS, CRLF, SSTI
- `crypto-attacks/` — JWT algo confusion, manipulation, key confusion
- `admin-security/` — Unauthorized access, privilege escalation, IDOR
- `multi-tenant/` — Cross-tenant auth, enumeration, slug injection
- `infrastructure/` — Headers, CORS, method tampering, info disclosure

**Key distinction:** Pentests validate security at the protocol level. UI security tests validate that security measures are visible/enforced in the browser (e.g., rate limit messages shown, CSRF forms reject in browser, cookie flags set properly).

### Infrastructure (Phase 1)

| Component | File | Description |
|---|---|---|
| Config | `tests/ui/playwright.config.ts` | Port 49200, Chromium, global setup/teardown |
| Global Setup | `tests/ui/setup/global-setup.ts` | Starts Porta server, seeds 2 clients + 1 user |
| Global Teardown | `tests/ui/setup/global-teardown.ts` | Stops server, disconnects DB/Redis |
| Fixtures | `tests/ui/fixtures/test-fixtures.ts` | `testData` + `startAuthFlow` + PKCE helpers |

### Relevant Source Files

| File | Purpose | Relevant For |
|---|---|---|
| `src/routes/interactions.ts` | Login, consent, abort, 2FA redirect | Categories 6, 7, 8 |
| `src/routes/password-reset.ts` | Forgot/reset password pages | Categories 1, 2, 10 |
| `src/routes/magic-link.ts` | Magic link token verification | Categories 3, 4 |
| `src/routes/invitation.ts` | Invitation acceptance | Category 5 |
| `src/routes/two-factor.ts` | 2FA challenge/setup pages | Category 9 |
| `src/middleware/tenant-resolver.ts` | Org slug → tenant resolution | Category 11 |
| `src/middleware/error-handler.ts` | Global error handling | Categories 8, 11 |
| `src/auth/rate-limiter.ts` | Redis sliding window rate limiter | Categories 1, 4, 10 |
| `src/auth/csrf.ts` | Cookie-based CSRF tokens | Categories 1, 2, 5, 7 |
| `src/auth/template-engine.ts` | Handlebars page rendering | All rendering tests |
| `src/auth/email-service.ts` | Email sending (magic link, reset, invite) | Categories 1, 3, 5 |

### Templates (Handlebars Pages)

All 16 page templates under `templates/default/pages/`:

| Template | Route | Tested (Phase 1) | Tested (Phase 2) |
|---|---|---|---|
| `login.hbs` | `GET /interaction/:uid` | ✅ Yes | Extended (Cat 6) |
| `magic-link-sent.hbs` | `POST /interaction/:uid/magic-link` | ✅ Yes | — |
| `consent.hbs` | `GET /interaction/:uid/consent` | ✅ Yes | Extended (Cat 7) |
| `error.hbs` | Various error states | Partial | Cat 3, 8, 11 |
| `forgot-password.hbs` | `GET /:orgSlug/auth/forgot-password` | ❌ No | Cat 1 |
| `forgot-password-sent.hbs` | `POST /:orgSlug/auth/forgot-password` | ❌ No | Cat 1 |
| `reset-password.hbs` | `GET /:orgSlug/auth/reset-password/:token` | ❌ No | Cat 2 |
| `reset-password-success.hbs` | `POST /:orgSlug/auth/reset-password/:token` | ❌ No | Cat 2 |
| `accept-invite.hbs` | `GET /:orgSlug/auth/accept-invite/:token` | ❌ No | Cat 5 |
| `invite-success.hbs` | `POST /:orgSlug/auth/accept-invite/:token` | ❌ No | Cat 5 |
| `invite-expired.hbs` | Invalid/expired invite token | ❌ No | Cat 5 |
| `two-factor-verify.hbs` | `GET /interaction/:uid/two-factor` | ✅ Yes | Extended (Cat 9) |
| `two-factor-setup.hbs` | `GET /interaction/:uid/two-factor/setup` | Partial | Cat 9 |
| `two-factor-recovery.hbs` | Recovery code display | Partial | Cat 9 |
| `logout.hbs` | End session | ❌ No | — (out of scope) |
| `device-code.hbs` | Device auth (if exists) | ❌ No | — (out of scope) |

## Gaps Identified

### Gap 1: No Password Reset Browser Tests
**Current:** E2E tests cover forgot/reset at HTTP level. No browser tests exist.
**Required:** Full browser tests for both pages (forgot + reset), including form rendering, validation errors, flash messages, token states, and abuse scenarios.

### Gap 2: No Magic Link Verification Browser Tests
**Current:** Phase 1 tests only request a magic link (submit form). The token verification endpoint (`GET /:orgSlug/auth/magic-link/:token`) is untested in browser.
**Required:** Tests for valid/invalid/expired/used tokens, with verification that the OIDC interaction resumes correctly.

### Gap 3: No Invitation Browser Tests
**Current:** E2E tests cover invitation at HTTP level. No browser tests exist.
**Required:** Full browser tests for accept-invite page, password validation, token states, and post-acceptance login.

### Gap 4: No User Status Error State Tests
**Current:** Login tests only cover valid user + wrong password. No tests for suspended/archived/locked/deactivated users.
**Required:** Tests verifying correct error messages for each user status.

### Gap 5: No Organization Status Error Tests
**Current:** No browser tests for accessing auth pages with suspended/archived/non-existent org slugs.
**Required:** Tests verifying tenant resolver behavior in browser context.

### Gap 6: Limited 2FA Edge Case Coverage
**Current:** Phase 1 tests cover happy paths for OTP/TOTP/recovery. No invalid code, expired code, or setup flow edge cases.
**Required:** Error state tests for each 2FA method.

### Gap 7: No Interaction Lifecycle Tests
**Current:** No browser tests for abort, expired interactions, or direct URL access.
**Required:** Tests for interaction UID edge cases.

### Gap 8: No Page Quality or Accessibility Tests
**Current:** No console error checking, security header verification, or accessibility checks.
**Required:** Basic quality and a11y tests across all pages.

## Dependencies

### Internal Dependencies
- Phase 1 UI test infrastructure (Playwright config, global setup, fixtures)
- Docker services (PostgreSQL, Redis, MailHog)
- All source route handlers and templates

### External Dependencies
- Playwright Test (`@playwright/test`)
- MailHog API for email capture
- PostgreSQL `pg` client for DB queries

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Rate limit tests interfere with other tests | Medium | High | Reset rate limits between tests via Redis FLUSHDB or key deletion |
| User status tests require seed data changes | Low | Medium | Extend global-setup with additional seed users |
| Token tests need DB access from Playwright | Low | Low | DB helper fixture with existing `pg` pool |
| Magic link tests need email capture | Medium | Medium | MailHog API is reliable and already used in E2E tests |
| Interaction UID tests depend on OIDC timing | Medium | Medium | Use generous timeouts; refresh interactions as needed |
| Test parallelism conflicts | Medium | High | Unique test data per test; avoid shared mutable state |
