# CSRF Fix: Cookie-Based Synchronized Token Pattern

> **Document**: 03-csrf-fix.md
> **Parent**: [Index](00-index.md)

## Overview

Replace the broken double-form-field CSRF pattern with a proper cookie-based synchronized token pattern. One universal mechanism for all routes (interaction, two-factor, password-reset, invitation).

## Architecture

### How It Works

1. **On GET (render form):** Generate CSRF token → set `_csrf` cookie (HttpOnly, SameSite=Lax) → embed same token in form as hidden field `_csrf`
2. **On POST (process form):** Read `_csrf` from cookie → read `_csrf` from form body → compare with `verifyCsrfToken(cookieValue, formValue)`

### Why This Is Secure

- **Attacker can't read the cookie**: HttpOnly prevents JavaScript access; same-origin policy prevents cross-site reading
- **Attacker can't set the cookie**: SameSite=Lax prevents cookies from being set by cross-site requests
- **Attacker can't submit matching values**: They can craft a form POST from evil.com, but they can't know the cookie value to include in the hidden field
- **Constant-time comparison**: Existing `verifyCsrfToken` uses `crypto.timingSafeEqual`

## Implementation Details

### Changes to `src/auth/csrf.ts`

Add two new functions alongside the existing `generateCsrfToken` and `verifyCsrfToken`:

```typescript
import type { Context } from 'koa';

/** Cookie name for CSRF token */
const CSRF_COOKIE_NAME = '_csrf';

/**
 * Set the CSRF token as an HttpOnly cookie on the response.
 * Call this in every GET handler that renders a form.
 *
 * @param ctx - Koa context
 * @param token - CSRF token (from generateCsrfToken())
 */
export function setCsrfCookie(ctx: Context, token: string): void {
  ctx.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // secure: true in production (behind HTTPS)
    secure: process.env.NODE_ENV === 'production',
    overwrite: true,
  });
}

/**
 * Read the CSRF token from the request cookie.
 * Call this in every POST handler to get the "expected" token.
 *
 * @param ctx - Koa context
 * @returns The CSRF token from the cookie, or undefined if not set
 */
export function getCsrfFromCookie(ctx: Context): string | undefined {
  return ctx.cookies.get(CSRF_COOKIE_NAME) ?? undefined;
}
```

### Changes to Route Handlers

All 4 route files follow the same refactor pattern:

#### Before (broken):
```typescript
const submittedCsrf = body._csrf ?? '';
const storedCsrf = body._csrfStored ?? '';  // ← BROKEN

if (!verifyCsrfToken(storedCsrf, submittedCsrf)) { ... }
```

#### After (fixed):
```typescript
import { getCsrfFromCookie } from '../auth/csrf.js';

const submittedCsrf = body._csrf ?? '';
const storedCsrf = getCsrfFromCookie(ctx) ?? '';  // ← From cookie

if (!verifyCsrfToken(storedCsrf, submittedCsrf)) { ... }
```

And in every GET handler that renders a form, add `setCsrfCookie`:

#### Before:
```typescript
const csrfToken = generateCsrfToken();
// csrfToken only passed to template context
```

#### After:
```typescript
import { setCsrfCookie } from '../auth/csrf.js';

const csrfToken = generateCsrfToken();
setCsrfCookie(ctx, csrfToken);  // ← Store in cookie
// csrfToken also passed to template context (for the hidden field)
```

### Affected Route Files

#### `src/routes/interactions.ts` — 5 changes

| Handler | Change |
|---|---|
| `showLogin` | Add `setCsrfCookie(ctx, csrfToken)` |
| `processLogin` | Replace `body._csrfStored` with `getCsrfFromCookie(ctx)` |
| `handleSendMagicLink` | Replace `body._csrfStored` with `getCsrfFromCookie(ctx)` |
| `showConsent` | Add `setCsrfCookie(ctx, csrfToken)` |
| `processConsent` | Replace `body._csrfStored` with `getCsrfFromCookie(ctx)` |
| `renderLoginWithError` | Add `setCsrfCookie(ctx, csrfToken)` (re-renders form with new token) |

#### `src/routes/two-factor.ts` — 4 changes

| Handler | Change |
|---|---|
| `showTwoFactor` | Add `setCsrfCookie(ctx, csrfToken)` |
| `verifyTwoFactor` | Replace `body._csrfStored` with `getCsrfFromCookie(ctx)` |
| `showTwoFactorSetup` | Add `setCsrfCookie(ctx, csrfToken)` |
| `processTwoFactorSetup` | Replace `body._csrfStored` with `getCsrfFromCookie(ctx)` |

#### `src/routes/password-reset.ts` — 4 changes

| Handler | Change |
|---|---|
| `showForgotPassword` | Add `setCsrfCookie(ctx, csrfToken)` |
| `processForgotPassword` | Replace `body._csrfStored` with `getCsrfFromCookie(ctx)` |
| `showResetPassword` | Add `setCsrfCookie(ctx, csrfToken)` |
| `processResetPassword` | Replace `body._csrfStored` with `getCsrfFromCookie(ctx)` |

#### `src/routes/invitation.ts` — 2 changes

| Handler | Change |
|---|---|
| `showAcceptInvite` | Add `setCsrfCookie(ctx, csrfToken)` |
| `processAcceptInvite` | Replace `body._csrfStored` with `getCsrfFromCookie(ctx)` |

### Template Changes

Remove `_csrfStored` from templates that have it:

| Template | Change |
|---|---|
| `two-factor-verify.hbs` | Remove `<input type="hidden" name="_csrfStored" value="{{csrfToken}}">` |
| `two-factor-setup.hbs` | Remove both `_csrfStored` inputs (2 forms) |

No other templates need changes — they already only have `_csrf`.

### Test Updates

#### Unit tests (`tests/unit/auth/csrf.test.ts`)
- Add tests for `setCsrfCookie` and `getCsrfFromCookie`
- Existing `generateCsrfToken` and `verifyCsrfToken` tests unchanged

#### Route unit tests
- Update mocks: POST handlers should mock `ctx.cookies.get('_csrf')` instead of `body._csrfStored`
- Update GET handler assertions: verify `ctx.cookies.set` was called with correct args

#### E2E tests (`tests/e2e/security/csrf.test.ts`)
- Update to extract CSRF token from both response HTML AND Set-Cookie header
- Submit POST with both form field AND cookie

## Error Handling

| Error Case | Handling Strategy |
|---|---|
| Cookie missing (cleared/expired) | `getCsrfFromCookie` returns `undefined` → `verifyCsrfToken(undefined, ...)` returns `false` → 403 |
| Cookie tampered | Token won't match form field → `verifyCsrfToken` returns `false` → 403 |
| Form field missing | `body._csrf` is `''` → `verifyCsrfToken(cookie, '')` returns `false` → 403 |
| Both missing | Both `undefined`/`''` → `verifyCsrfToken` returns `false` → 403 |
