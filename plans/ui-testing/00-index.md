# CSRF Fix & Playwright UI Testing Plan

> **Feature**: Fix broken CSRF protection + add Playwright browser-based UI testing
> **Status**: Planning Complete
> **Created**: 2026-04-10
> **Source**: Bug report (csrf_invalid on login) + architectural improvement

## Overview

This plan addresses two related issues in Porta v5:

**Part A — CSRF Bug Fix**: The CSRF protection on all server-rendered forms is fundamentally broken. Route handlers read `body._csrfStored` as the "expected" token, but most templates don't include a `_csrfStored` field, causing every POST to fail with `csrf_invalid`. Even where `_csrfStored` exists (two-factor templates), both the expected and actual values come from the same form — an attacker could set both fields to the same value, defeating CSRF protection entirely.

The fix replaces the broken double-form-field approach with a proper **cookie-based CSRF pattern**: the server stores the token in an HttpOnly cookie on GET, embeds it in the form, and compares the cookie with the form field on POST.

**Part B — Playwright UI Testing**: The project has been experiencing repeated browser-level bugs (wrong form action URLs, missing hidden fields, cookie path mismatches) that existing unit, E2E (HTTP-level), and pentest suites cannot catch because they don't use a real browser. Playwright tests will drive a real Chromium instance through complete OIDC flows, catching DOM, JavaScript, cookie, and redirect issues automatically.

## Document Index

| #  | Document                                           | Description                                    |
|----|---------------------------------------------------|------------------------------------------------|
| 00 | [Index](00-index.md)                              | This document — overview and navigation        |
| 01 | [Requirements](01-requirements.md)                | Feature requirements and scope                 |
| 02 | [Current State](02-current-state.md)              | Analysis of current CSRF implementation        |
| 03 | [CSRF Fix](03-csrf-fix.md)                        | Cookie-based CSRF implementation               |
| 04 | [Playwright Infrastructure](04-playwright-infra.md) | Playwright setup, config, fixtures           |
| 05 | [Playwright Tests](05-playwright-tests.md)        | Browser-based test specifications              |
| 07 | [Testing Strategy](07-testing-strategy.md)        | Test cases and verification                    |
| 99 | [Execution Plan](99-execution-plan.md)            | Phases, sessions, and task checklist           |

## Quick Reference

### CSRF Fix Summary

| Before (Broken) | After (Fixed) |
|---|---|
| Token stored in form field `_csrfStored` | Token stored in HttpOnly cookie `_csrf` |
| Many templates missing `_csrfStored` → always fails | Cookie set automatically on render |
| Attacker can set both form fields to same value | Attacker can't read/set HttpOnly SameSite cookie |
| Different mechanism needed per route type | One universal mechanism for all routes |

### Key Decisions

| Decision | Outcome |
|---|---|
| CSRF storage mechanism | HttpOnly SameSite=Lax cookie (`_csrf`) |
| Playwright runner | Playwright Test (built-in, not Vitest plugin) |
| Browser targets | Chromium only (expand later) |
| Test location | `tests/ui/` (distinct from HTTP-based `tests/e2e/`) |
| CI mode | Headless with trace-on-failure |

## Related Files

### Modified Files (CSRF Fix)
- `src/auth/csrf.ts` — Add `setCsrfCookie()`, `getCsrfFromCookie()`
- `src/routes/interactions.ts` — Use cookie-based CSRF
- `src/routes/two-factor.ts` — Use cookie-based CSRF
- `src/routes/password-reset.ts` — Use cookie-based CSRF
- `src/routes/invitation.ts` — Use cookie-based CSRF
- `templates/default/pages/two-factor-verify.hbs` — Remove `_csrfStored`
- `templates/default/pages/two-factor-setup.hbs` — Remove `_csrfStored`

### New Files (Playwright)
- `tests/ui/playwright.config.ts` — Playwright configuration
- `tests/ui/setup/global-setup.ts` — Server lifecycle
- `tests/ui/setup/global-teardown.ts` — Cleanup
- `tests/ui/fixtures/test-fixtures.ts` — Shared page fixtures
- `tests/ui/flows/*.spec.ts` — Browser flow tests
- `tests/ui/security/*.spec.ts` — Browser security tests
