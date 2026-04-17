# Requirements: CSRF Fix & Playwright UI Testing

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)

## Feature Overview

Two related improvements to Porta v5's authentication UI:

1. **CSRF Fix**: Replace the broken double-form-field CSRF mechanism with a proper cookie-based synchronized token pattern across all 4 route files and 8 templates.
2. **Playwright UI Testing**: Add real-browser-based automated testing for all authentication UI flows, catching DOM, JavaScript, cookie, and redirect issues that HTTP-level tests miss.

## Functional Requirements

### Must Have

#### Part A: CSRF Fix
- [x] All form POST endpoints verify CSRF token correctly
- [x] CSRF token stored server-side (cookie), not in form field
- [x] Cookie is HttpOnly + SameSite=Lax
- [x] All existing templates work without `_csrfStored` field
- [x] CSRF verification uses constant-time comparison (existing `verifyCsrfToken`)
- [x] CSRF cookie set on every GET that renders a form
- [x] Existing CSRF unit tests updated for new mechanism
- [x] Existing E2E CSRF tests still pass

#### Part B: Playwright UI Testing
- [x] Playwright installed and configured
- [x] Global setup starts real Porta server with Docker services
- [x] Password login flow tested end-to-end in browser
- [x] Magic link flow tested (request + email click)
- [x] Consent page approve/deny tested
- [x] 2FA challenge flow tested
- [x] CSRF protection verified in browser (form submits work, missing token fails)
- [x] Cookie flags verified (HttpOnly, SameSite)
- [x] `yarn test:ui` command works

### Should Have

- [ ] Forgot/reset password flow tested in Playwright
- [ ] Invitation acceptance flow tested in Playwright
- [ ] Console error detection (fail test on uncaught JS errors)
- [ ] Network error detection (fail test on failed resource loads)

### Won't Have (Out of Scope)

- Visual regression testing (screenshot comparison) — future enhancement
- Playwright tests for admin API routes (API-only, no browser UI)
- Rewriting existing HTTP-level E2E tests to use Playwright
- Multi-browser testing (Firefox, WebKit) — Chromium-only for now
- Accessibility (a11y) audit — separate future plan

## Technical Requirements

### Performance
- UI tests should complete in < 5 minutes for the full suite
- Each test should have a 30-second timeout (OIDC flows involve multiple redirects)
- Tests run in parallel where possible (Playwright default)

### Compatibility
- Node.js >= 22.0.0 (matches project requirement)
- Playwright latest stable
- Chromium headless

### Security
- CSRF cookie must be HttpOnly (not readable by client JS)
- CSRF cookie must be SameSite=Lax (prevents cross-site form submissions)
- CSRF cookie path should be `/` (available to all routes)
- Token comparison remains constant-time via existing `verifyCsrfToken`

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale |
|---|---|---|---|
| CSRF storage | A) Interaction session, B) Koa session, C) Cookie | **C) Cookie** | Universal — works for interaction routes AND non-interaction routes (password-reset, invitation) without different mechanisms |
| Cookie SameSite | A) Strict, B) Lax, C) None | **B) Lax** | Strict blocks the cookie on OIDC redirects from other sites. Lax allows navigational GET but blocks cross-site POST — correct for CSRF protection |
| Playwright runner | A) Playwright Test, B) Vitest + playwright | **A) Playwright Test** | Purpose-built for browser testing: trace viewer, auto-wait, built-in assertions, better debugging |
| Test structure | A) Inside `tests/e2e/`, B) Separate `tests/ui/` | **B) Separate `tests/ui/`** | Clear separation — E2E (HTTP client) vs UI (real browser). Different config, different toolchain |

## Acceptance Criteria

1. [ ] Login form submits successfully without `csrf_invalid` error
2. [ ] Consent form submits successfully
3. [ ] Magic link form submits successfully
4. [ ] 2FA forms submit successfully
5. [ ] Password reset forms submit successfully
6. [ ] Invitation acceptance form submits successfully
7. [ ] CSRF cookie is HttpOnly + SameSite=Lax in browser DevTools
8. [ ] POST without CSRF token returns 403
9. [ ] POST with wrong CSRF token returns 403
10. [ ] All existing unit tests pass after CSRF refactor
11. [ ] All existing E2E/pentest CSRF tests pass after refactor
12. [ ] Playwright password login flow passes in Chromium
13. [ ] Playwright CSRF enforcement test passes
14. [ ] `yarn test:ui` runs and completes successfully
15. [ ] No regressions in existing 2,100+ tests
