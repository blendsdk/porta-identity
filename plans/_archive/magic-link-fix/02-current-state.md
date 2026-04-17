# Current State: Magic Link Cross-Browser Fix

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Current Magic Link Flow

### How It Works Today

1. User starts OIDC auth → browser gets `_interaction` + `_interaction_resume` cookies
2. User requests magic link → server sends email with `/{orgSlug}/auth/magic-link/{token}?interaction={uid}`
3. User clicks link → `verifyMagicLink()` handler:
   - Validates token (SHA-256 hash lookup)
   - Marks token as used (single-use)
   - Marks email as verified
   - Records login
   - Calls `provider.interactionFinished(ctx.req, ctx.res, result)` ← **FAILS if no cookies**

### The Bug

`provider.interactionFinished()` reads `_interaction` and `_interaction_resume` cookies from `ctx.req`. These cookies are:
- Set by the OIDC provider during step 1
- Scoped to the `/interaction/{uid}` path
- Only present in the **original browser session**

When the magic link is opened in a different browser/machine/incognito:
- `ctx.req` has **no** `_interaction` cookies
- `interactionFinished()` throws an error (can't find the interaction)
- The user sees an error page instead of being authenticated

### Skipped Tests — 2 total

**`tests/ui/flows/magic-link.spec.ts`** — 1 fixme:
- `should complete authentication via magic link` — full flow: start auth → request magic link → get email → click link → complete. Fails because the email capture + navigation happens async, and interaction may expire or cookies may not be present.

**`tests/ui/flows/magic-link-verify.spec.ts`** — 1 fixme:
- `valid token during active interaction auto-logins and redirects` — navigates to magic link URL directly, but `_interaction` cookies are path-scoped and not sent to the magic link URL path.

### Relevant Files

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `src/routes/magic-link.ts` | Magic link handler | Set `_ml_session`, redirect to interaction URL |
| `src/routes/interactions.ts` | Login handler | Detect `_ml_session`, auto-complete or show success |
| `templates/default/` | Handlebars templates | Add `magic-link-success.hbs` |
| `locales/default/en/` | i18n strings | Add success page strings |

## Gaps Identified

### Gap 1: interactionFinished() Cookie Dependency

**Current:** Handler calls `interactionFinished()` directly, which requires cookies
**Required:** Handler should set session, redirect to interaction URL where cookies ARE in scope
**Fix:** Redirect-through-interaction pattern with `_ml_session` cookie

### Gap 2: No Cross-Browser Support

**Current:** Magic link only works in same browser session
**Required:** Must work on any device/browser
**Fix:** Unified flow with success page fallback (guarded by `_ml_session`)

### Gap 3: No Success Page Template

**Current:** No template for "You're signed in" landing page
**Required:** Template showing email + link to application
**Fix:** Create `magic-link-success.hbs` template

## Architecture: Unified Flow

```
Click magic link (any browser)
    │
    ▼
Validate token → Set _ml_session cookie → Redirect to /interaction/{uid}/login
    │
    ├── Has _interaction cookies? (same browser)
    │   └── YES → interactionFinished() → callback ✅
    │
    └── No _interaction cookies? (different browser)
        └── Has valid _ml_session?
            ├── YES → Show success page ("You're signed in") ✅
            └── NO → Standard error page (no info leak) ✅
```
