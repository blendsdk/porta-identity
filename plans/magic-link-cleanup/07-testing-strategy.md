# Testing Strategy: Cross-Browser Magic Link Pre-Auth Cleanup

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

This is a **removal** task — we're deleting broken code, not adding features. The testing strategy focuses on:
1. Ensuring the remaining same-browser magic link flow still works
2. Verifying no build/lint/type errors after removal
3. Confirming test suite passes (minus deleted cross-browser tests)

### Coverage Goals

- Existing unit tests for `_ml_session` flow: Must pass unchanged
- Existing unit tests for magic link routes: Must pass (pre-auth tests removed)
- Existing unit tests for interaction routes: Must pass (pre-auth tests removed)
- Existing UI tests for same-browser magic link: Must pass unchanged
- Build + lint: Zero errors

## Test Files Affected

### Delete Entirely

| File | Lines | Reason |
| --- | --- | --- |
| `tests/ui/flows/magic-link-cross-browser.spec.ts` | 411 | Tests the broken cross-browser pre-auth flow |

### Modify — Remove Pre-Auth Test Cases

#### `tests/unit/routes/magic-link.test.ts` (14 pre-auth references)

Remove test cases that mock or assert on:
- `createMagicLinkPreAuth`
- `getMagicLinkAuthContext`
- `buildAuthorizationUrl`
- `renderRedirectPage`

Keep all test cases that test:
- Token verification (hash, lookup, expiry)
- User validation (exists, active)
- `createMagicLinkSession` (same-browser flow)
- Error pages (expired token, inactive user)

#### `tests/unit/routes/interactions.test.ts` (3 pre-auth references)

Remove test cases that mock or assert on:
- `hasMagicLinkPreAuth`
- `consumeMagicLinkPreAuth`
- `storeMagicLinkAuthContext`

Keep all test cases that test:
- `hasMagicLinkSession` / `consumeMagicLinkSession` detection
- Normal login flow (password)
- Consent flow
- CSRF verification
- Rate limiting
- Two-factor flow

### No Changes Needed

| File | Reason |
| --- | --- |
| `tests/unit/auth/` | No pre-auth references in auth module unit tests |
| `tests/ui/flows/magic-link.spec.ts` | Tests same-browser flow only |
| `tests/ui/flows/magic-link-verify.spec.ts` | Tests token verification only |
| `tests/pentest/*` | No pre-auth references |
| `tests/e2e/*` | No pre-auth references |

## Verification Checklist

- [ ] `yarn verify` passes (build + lint + unit tests)
- [ ] No TypeScript compilation errors (removed exports not referenced)
- [ ] No unused import warnings
- [ ] Same-browser magic link UI tests pass (`tests/ui/flows/magic-link.spec.ts`)
- [ ] Magic link verify UI tests pass (`tests/ui/flows/magic-link-verify.spec.ts`)
- [ ] Total test count drops by the expected amount (cross-browser tests removed)
