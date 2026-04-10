# Requirements: UI Testing Phase 2

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)

## Feature Overview

Complete Playwright browser-level test coverage for all Porta auth workflow UI pages. This extends the Phase 1 UI tests (which covered happy paths for login, magic link request, consent, 2FA, confidential client, userinfo, CSRF, and cookies) to cover every remaining user-facing interaction: forgot/reset password, magic link verification, invitation acceptance, login error states, consent edge cases, interaction lifecycle, 2FA error states, multi-tenant isolation, page quality, and accessibility.

## Bug Fix (Phase 0)

### BUG: clientName Shows Raw UUID on Login Page
- **Severity**: Medium (visible to every user on every login)
- **Symptom**: Login page shows raw `client_id` UUID or literal `{{clientName}}` instead of the human-readable application name
- **Root Cause**: `src/routes/interactions.ts` login handler sets `clientName` to `params.client_id` (raw UUID) instead of resolving `client_name` from OIDC provider client metadata
- **Affected Pages**: Login page (`login.hbs`), error/abort pages — 2 occurrences in `src/routes/interactions.ts`
- **Not Affected**: Consent page (already correctly resolves `client?.metadata()?.client_name`)
- **Fix**: Look up client from OIDC provider in showLogin handler, use `client_name` metadata
- **Verification**: UI test confirms login subtitle shows human-readable name

## Functional Requirements

### Must Have

#### Category 1: Forgot Password Flow (8 tests)
- [x] 1.1 Forgot password page renders with email field, submit button, and CSRF token
- [x] 1.2 Submit valid email → "check your email" confirmation page (`forgot-password-sent.hbs`)
- [x] 1.3 Submit non-existent email → same confirmation page (enumeration-safe)
- [x] 1.4 Submit empty/invalid email → validation error displayed
- [x] 1.5 Rate limiting → error message after repeated submissions
- [x] 1.6 CSRF validation — POST without valid CSRF token is rejected
- [x] 1.7 "Back to login" link navigates correctly
- [x] 1.8 Flash message from magic link redirect renders (`?flash=magic_link_success`)

#### Category 2: Reset Password Flow (10 tests)
- [x] 2.1 Valid token → form renders with password + confirm fields + CSRF
- [x] 2.2 Submit matching strong passwords → success page (`reset-password-success.hbs`)
- [x] 2.3 Expired token → error page with "link expired" message
- [x] 2.4 Invalid/garbage token → error page
- [x] 2.5 Weak password (below NIST SP 800-63B) → validation error
- [x] 2.6 Mismatched passwords → error, form re-rendered with error flash
- [x] 2.7 CSRF validation on POST
- [x] 2.8 Token replay — use same token twice → error on second attempt
- [x] 2.9 After successful reset, login with new password works
- [x] 2.10 After successful reset, login with old password fails

#### Category 3: Magic Link Verification (6 tests)
- [x] 3.1 Valid token during active OIDC interaction → auto-login + redirect to callback
- [x] 3.2 Valid token without active interaction → redirect to forgot-password with success flash
- [x] 3.3 Expired token → error page with "link expired" message
- [x] 3.4 Invalid/garbage token → error page
- [x] 3.5 Already-used token → error page (single-use enforcement)
- [x] 3.6 Email verified flag set after successful magic link use

#### Category 4: Magic Link Abuse (4 tests)
- [x] 4.1 Request rate limiting — rapid submissions → rate limit error
- [x] 4.2 Non-existent email → same success message (no user enumeration)
- [x] 4.3 Suspended user email → same success message (no enumeration)
- [x] 4.4 Brute-force token guessing (random tokens) → all fail with error page

#### Category 5: Invitation Flow (9 tests)
- [x] 5.1 Valid invitation token → form with user email shown + password fields + CSRF
- [x] 5.2 Submit matching strong passwords → invite-success page
- [x] 5.3 After accepting invitation, login with set password works
- [x] 5.4 Expired token → invite-expired page
- [x] 5.5 Invalid/garbage token → invite-expired page
- [x] 5.6 Weak password → validation error, form re-rendered
- [x] 5.7 Mismatched passwords → error, form re-rendered
- [x] 5.8 CSRF validation on POST
- [x] 5.9 Token replay — accept same invite twice → error on second attempt

#### Category 6: Login Error States (9 tests)
- [x] 6.1 Suspended user → "account suspended" error message on login page
- [x] 6.2 Archived user → "account not found" or appropriate error
- [x] 6.3 Locked user (exceeded failed attempts) → lockout message
- [x] 6.4 Deactivated user → appropriate error
- [x] 6.5 Suspended organization → 403 error page (not login page)
- [x] 6.6 Archived organization → 404 error page
- [x] 6.7 Non-existent org slug → 404
- [x] 6.8 Login form preserves email input after failed attempt
- [x] 6.9 Account lockout after N consecutive failures → lockout message

#### Category 7: Consent Edge Cases (5 tests)
- [x] 7.1 First-party client auto-consents (skips consent page)
- [x] 7.2 Third-party client shows scope descriptions
- [x] 7.3 Deny consent → redirect to client with `access_denied` error
- [x] 7.4 CSRF validation on consent confirm POST
- [x] 7.5 Consent page shows client name and requested scopes

#### Category 8: Interaction Lifecycle (6 tests)
- [x] 8.1 Abort interaction → redirect with `access_denied` error
- [x] 8.2 Expired interaction UID → error page ("session expired")
- [x] 8.3 Invalid/garbage interaction UID → error page
- [x] 8.4 Direct URL to `/interaction/:uid` without starting auth flow → error
- [x] 8.5 Browser back button after successful login → handled gracefully
- [x] 8.6 Refresh/reload of interaction page → handled gracefully

#### Category 9: Two-Factor Edge Cases (8 tests)
- [x] 9.1 Invalid OTP code → error message, can retry
- [x] 9.2 Expired OTP code → error, option to resend
- [x] 9.3 Invalid TOTP code → error message
- [x] 9.4 Invalid recovery code → error message
- [x] 9.5 2FA setup page renders QR code for TOTP
- [x] 9.6 2FA setup with invalid confirmation code → error, stays on setup
- [x] 9.7 2FA verify page shows method-appropriate UI (email vs TOTP)
- [x] 9.8 Resend OTP code link/button works

#### Category 10: Reset Password Abuse (4 tests)
- [x] 10.1 Brute-force token guessing → random tokens all fail
- [x] 10.2 Token single-use enforcement verified via DB
- [x] 10.3 Expired password reset token → rejected
- [x] 10.4 Forgot-password rate limiting enforced in browser

### Should Have

#### Category 11: Multi-Tenant UI Isolation (4 tests)
- [x] 11.1 Auth pages render with correct org branding/name
- [x] 11.2 Cannot access auth pages with non-existent org slug
- [x] 11.3 Suspended org shows proper error (not login page)
- [x] 11.4 Archived org shows proper error (not login page)

#### Category 12: Page Quality & Security Headers (7 tests)
- [x] 12.1 No JavaScript console errors on login page
- [x] 12.2 No JavaScript console errors on consent page
- [x] 12.3 No JavaScript console errors on forgot-password page
- [x] 12.4 No network errors (failed resource loads)
- [x] 12.5 Password fields use `type="password"`
- [x] 12.6 Forms have appropriate `autocomplete` attributes
- [x] 12.7 Security headers present on HTML pages (X-Content-Type-Options, etc.)

#### Category 13: OIDC Discovery (4 tests)
- [x] 13.1 `/.well-known/openid-configuration` returns valid JSON with correct issuer
- [x] 13.2 JWKS endpoint returns valid key set
- [x] 13.3 Discovery `authorization_endpoint` is reachable
- [x] 13.4 Discovery `token_endpoint` matches expected path

#### Category 14: Accessibility (5 tests)
- [x] 14.1 Login form fields have associated `<label>` elements
- [x] 14.2 Error messages associated with form fields (aria-describedby or similar)
- [x] 14.3 Focus moves to first error field on validation failure
- [x] 14.4 All interactive elements keyboard-navigable (Tab order)
- [x] 14.5 Consent page scopes are screen-reader accessible

### Won't Have (Out of Scope)

- Visual regression testing (screenshot comparison)
- Multi-browser testing (Firefox, WebKit) — Chromium only
- Performance/load testing
- Full WCAG 2.1 AA compliance audit (only basic a11y checks)
- Admin API route testing (already covered by E2E + pentest suites)
- Rewriting existing E2E tests as Playwright tests
- Mobile viewport testing

## Technical Requirements

### Infrastructure
- MailHog API fixture for email capture (extract tokens from sent emails)
- DB helper fixture for direct PostgreSQL queries (create test users, read tokens, reset rate limits)
- Extended global-setup seed data (users in all status states)
- Rate limit cleanup between tests

### Compatibility
- Playwright Test runner (same as Phase 1)
- Chromium only (same as Phase 1)
- Runs against real Porta server on port 49200
- Requires Docker services (Postgres, Redis, MailHog)

### Security
- Tests must not weaken actual security (no disabling rate limits in production code)
- Token extraction via DB queries, not by weakening token generation

## Scope Decisions

| Decision                     | Options Considered              | Chosen                  | Rationale                                              |
|------------------------------|---------------------------------|-------------------------|--------------------------------------------------------|
| Token extraction method      | Email parsing, DB query, API    | DB query                | Most reliable; no email parsing fragility              |
| Seed data approach           | Separate seed file, inline      | Extend global-setup.ts  | Consistent with Phase 1 pattern                        |
| Rate limit testing           | Disable limits, test with real  | Test with real limits   | Tests should verify actual production behavior         |
| Spec file organization       | One mega-file, per-category     | Per-category spec files | Better isolation, parallel execution, clear ownership  |
| Accessibility depth          | Full WCAG audit, basic checks   | Basic checks            | Full audit out of scope; basic ensures fundamentals    |

## Acceptance Criteria

1. [ ] All 89 new test cases implemented and passing
2. [ ] No regressions in existing UI tests (Phase 1)
3. [ ] No regressions in existing E2E tests
4. [ ] No regressions in existing unit tests
5. [ ] `yarn test:ui` runs all UI tests (old + new) successfully
6. [ ] `yarn verify` passes (build + lint + unit tests)
7. [ ] All new spec files follow existing patterns from Phase 1
8. [ ] Infrastructure fixtures (mail capture, DB helpers) are reusable
