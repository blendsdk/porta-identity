# UI Testing Phase 2 — Comprehensive Browser Coverage

> **Feature**: Complete Playwright UI test coverage for all auth workflow pages
> **Status**: Planning Complete
> **Created**: 2026-04-10

## Overview

Porta's UI test suite (Phase 1) established Playwright infrastructure and covered the core happy paths: password login, magic link request, consent, 2FA, confidential client flow, userinfo, CSRF protection, and cookie flags. However, significant gaps remain across password reset, magic link verification, invitation acceptance, login error states, interaction lifecycle, and security/accessibility concerns.

This plan closes every remaining gap by adding ~89 new browser-level test cases across 14 categories and ~12 new spec files. Unlike the E2E tests (HTTP-level via `fetch`) and pentests (API-level security), these Playwright tests validate what **a real user actually sees and experiences**: rendered pages, form interactions, browser redirects, flash messages, and visual feedback.

## Document Index

| #  | Document                                                         | Description                                        |
|----|------------------------------------------------------------------|----------------------------------------------------|
| 00 | [Index](00-index.md)                                             | This document — overview and navigation            |
| 01 | [Requirements](01-requirements.md)                               | All 14 test categories, ~89 test cases             |
| 02 | [Current State](02-current-state.md)                             | Existing coverage analysis, E2E/pentest overlap    |
| 03 | [Infrastructure](03-infrastructure.md)                           | New fixtures, global-setup changes, seed data      |
| 04 | [Password Reset Tests](04-password-reset-tests.md)               | Forgot + reset password + abuse specs              |
| 05 | [Magic Link & Invitation](05-magic-link-invitation-tests.md)     | Magic link verification + invitation flow specs    |
| 06 | [Login & Consent & Interaction](06-login-consent-interaction-tests.md) | Login states, consent edges, interaction lifecycle |
| 07 | [Testing Strategy](07-testing-strategy.md)                       | Coverage goals, verification approach              |
| 08 | [Security & Accessibility](08-security-accessibility-tests.md)   | 2FA edges, tenant isolation, page quality, a11y    |
| 99 | [Execution Plan](99-execution-plan.md)                           | Phased task checklist                              |

## Quick Reference

### Known Bug (Phase 0 Fix)

**BUG: clientName shows raw `client_id` UUID on login page instead of human-readable name.**
- **Root cause**: `src/routes/interactions.ts` login handler passes `params.client_id` as `clientName` instead of resolving `client_name` from OIDC provider metadata
- **Affected**: Login page (`login.hbs`), error/abort pages — 2 occurrences
- **Not affected**: Consent page (already correctly resolves `client_name`)
- **Fix**: Phase 0 of the execution plan

### Key Decisions

| Decision                  | Outcome                                                      |
|---------------------------|--------------------------------------------------------------|
| Test runner               | Playwright Test (same as Phase 1)                            |
| Browser                   | Chromium only (same as Phase 1)                              |
| Test location             | `tests/ui/` — new spec files alongside existing              |
| Mail capture              | MailHog API (`http://localhost:8025`) via new fixture         |
| DB access for setup       | Direct `pg` queries via new DB helper fixture                |
| Token extraction          | DB queries (not email parsing) for reliable token access     |
| Seed data approach        | Extend existing `global-setup.ts` with additional users      |
| Plan folder               | `plans/ui-testing-v2/` (Phase 1 was `plans/ui-testing/`)    |

### New Files Created

| File                                          | Purpose                               |
|-----------------------------------------------|---------------------------------------|
| `tests/ui/fixtures/mail-capture.ts`           | MailHog API integration fixture        |
| `tests/ui/fixtures/db-helpers.ts`             | Direct DB queries for test setup       |
| `tests/ui/flows/forgot-password.spec.ts`      | Forgot password form tests             |
| `tests/ui/flows/reset-password.spec.ts`       | Reset password form + abuse tests      |
| `tests/ui/flows/magic-link-verify.spec.ts`    | Magic link token verification tests    |
| `tests/ui/flows/invitation.spec.ts`           | Invitation acceptance flow tests       |
| `tests/ui/flows/login-error-states.spec.ts`   | Login user/org status error tests      |
| `tests/ui/flows/consent-edge-cases.spec.ts`   | Auto-consent, denial, CSRF tests       |
| `tests/ui/flows/interaction-lifecycle.spec.ts` | Abort, expiry, browser edge cases     |
| `tests/ui/flows/two-factor-edge-cases.spec.ts`| 2FA error states and setup flow        |
| `tests/ui/security/magic-link-abuse.spec.ts`  | Magic link rate limiting + enumeration |
| `tests/ui/security/reset-password-abuse.spec.ts` | Token replay, brute-force          |
| `tests/ui/security/tenant-isolation.spec.ts`  | Multi-tenant UI isolation              |
| `tests/ui/security/page-quality.spec.ts`      | Console errors, headers, form attrs    |
| `tests/ui/accessibility/form-accessibility.spec.ts` | Labels, focus, keyboard nav      |

### Modified Files

| File                                    | Changes                                    |
|-----------------------------------------|--------------------------------------------|
| `tests/ui/setup/global-setup.ts`        | Additional seed users (suspended, locked, etc.), invitation token |
| `tests/ui/fixtures/test-fixtures.ts`    | Extended with mail capture + DB helper fixtures |

## Related Files

### Source Routes (UI-facing)
- `src/routes/interactions.ts` — Login, consent, abort
- `src/routes/password-reset.ts` — Forgot/reset password
- `src/routes/magic-link.ts` — Magic link verification
- `src/routes/invitation.ts` — Invitation acceptance
- `src/routes/two-factor.ts` — 2FA challenge/setup

### Templates (Handlebars)
- `templates/default/pages/*.hbs` — All 16 page templates
- `templates/default/layouts/base.hbs` — Base layout
- `templates/default/partials/*.hbs` — Header, footer, flash messages
