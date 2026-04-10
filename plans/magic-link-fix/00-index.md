# Magic Link Cross-Browser Fix Implementation Plan

> **Feature**: Fix magic link authentication to work across browsers/devices
> **Status**: Planning Complete
> **Created**: 2026-04-11

## Overview

Fix a **production bug** where magic links only work when opened in the same browser that started the OIDC authorization flow. Currently, `provider.interactionFinished()` requires `_interaction` cookies that are scoped to the original browser session. Opening a magic link on a different machine, in a private window, or in a different browser fails silently.

The fix implements a **unified redirect-through-interaction** flow: the magic link handler validates the token, sets a signed short-lived `_ml_session` cookie, and redirects to the original interaction URL. The login handler detects the `_ml_session`, completes the interaction if cookies are present (same browser), or shows a success page if not (different browser). The success page **only renders when `_ml_session` is valid** — preventing URL crafting attacks.

## Document Index

| #   | Document                                           | Description                             |
| --- | -------------------------------------------------- | --------------------------------------- |
| 00  | [Index](00-index.md)                               | This document — overview and navigation |
| 01  | [Requirements](01-requirements.md)                 | Requirements and scope                  |
| 02  | [Current State](02-current-state.md)               | Current magic link flow analysis        |
| 03  | [Magic Link Handler](03-magic-link-handler.md)     | Handler changes + session cookie        |
| 04  | [Login Handler Integration](04-login-handler.md)   | Login handler `_ml_session` detection   |
| 05  | [Success Page](05-success-page.md)                 | "You're signed in" template             |
| 07  | [Testing Strategy](07-testing-strategy.md)         | Test plan for all scenarios             |
| 99  | [Execution Plan](99-execution-plan.md)             | Phases, sessions, task checklist        |

## Key Decisions

| Decision | Outcome |
|----------|---------|
| Fast path vs unified flow | Unified flow — one code path for all scenarios |
| Session storage | Signed cookie `_ml_session` with 5-min TTL, single-use |
| Different browser behavior | Show success page with link to application |
| Security: success page guard | **Only renders when valid `_ml_session` exists** |
| Interaction expired | Still authenticate user, show "session expired, go to app" |
| state/nonce for different browser | Don't replay — let client app start its own OIDC flow |

## Use Cases Supported

1. ✅ Same browser, same tab — seamless completion
2. ✅ Same browser, different tab — seamless completion
3. ✅ Different browser entirely — success page + instant next login
4. ✅ Different machine / remote desktop — success page + instant next login
5. ✅ Private/incognito window — success page + instant next login
6. ✅ Mobile phone (email app) — success page + instant next login

## Related Files

- `src/routes/magic-link.ts` — magic link handler (main changes)
- `src/routes/interactions.ts` — login handler (_ml_session detection)
- `templates/default/magic-link-success.hbs` — new success page template
- `locales/default/en/` — i18n strings for success page
- `tests/ui/flows/magic-link.spec.ts` — 1 fixme test to unblock
- `tests/ui/flows/magic-link-verify.spec.ts` — 1 fixme test to unblock
