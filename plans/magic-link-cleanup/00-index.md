# Cross-Browser Magic Link Pre-Auth Cleanup

> **Feature**: Remove the non-standard cross-browser magic link pre-auth flow
> **Status**: Planning Complete
> **Created**: 2026-04-12

## Overview

The Porta OIDC provider contains a "pre-auth" cross-browser magic link flow that attempts to complete an OIDC authorization code flow in a different browser than the one that initiated it. This is fundamentally incompatible with OIDC + PKCE because:

1. PKCE `code_verifier` is bound to the original browser's session
2. The `state` parameter cannot be verified cross-browser
3. The `nonce` parameter cannot be verified cross-browser
4. No major OIDC provider (Auth0, Okta, Firebase) supports this pattern

The pre-auth flow should be removed, keeping only the legacy `_ml_session` flow which correctly handles both same-browser (seamless login) and different-browser (friendly "return to original browser" message) scenarios.

## Document Index

| #   | Document                                      | Description                               |
| --- | --------------------------------------------- | ----------------------------------------- |
| 00  | [Index](00-index.md)                          | This document — overview and navigation   |
| 01  | [Requirements](01-requirements.md)            | Cleanup requirements and scope            |
| 02  | [Current State](02-current-state.md)          | Analysis of both flows (legacy + pre-auth)|
| 03  | [Cleanup Spec](03-cleanup-spec.md)            | Detailed cleanup instructions per file    |
| 07  | [Testing Strategy](07-testing-strategy.md)    | Test updates and verification             |
| 99  | [Execution Plan](99-execution-plan.md)        | Tasks and execution checklist             |

## Key Decisions

| Decision                                | Outcome                                             |
| --------------------------------------- | --------------------------------------------------- |
| Cross-browser magic link support        | Remove — incompatible with OIDC + PKCE              |
| Same-browser magic link                 | Keep — works correctly via `_ml_session`             |
| Different-browser UX                    | Keep existing "return to original browser" page      |
| Success page message improvement        | Improve to explicitly mention different browser hint |

## Related Files

**Source files modified:**
- `src/auth/magic-link-session.ts` — Remove pre-auth section (~360 lines)
- `src/routes/interactions.ts` — Remove pre-auth detection + auth context storage
- `src/routes/magic-link.ts` — Remove pre-auth path, simplify to legacy-only

**Test files modified/deleted:**
- `tests/ui/flows/magic-link-cross-browser.spec.ts` — Delete (411 lines)
- `tests/unit/routes/magic-link.test.ts` — Remove pre-auth test cases
- `tests/unit/routes/interactions.test.ts` — Remove pre-auth detection tests

**Locale files updated:**
- `locales/default/en/magic-link.json` — Improve success messages

**No changes needed:**
- `src/auth/index.ts` — Barrel only exports legacy functions
- `tests/pentest/` — No pentest tests reference pre-auth code
