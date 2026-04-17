# Cleanup Specification: Cross-Browser Magic Link Pre-Auth

> **Document**: 03-cleanup-spec.md
> **Parent**: [Index](00-index.md)

## Overview

Detailed instructions for removing the pre-auth cross-browser flow from each file. The goal is surgical removal — only pre-auth code is removed, the legacy `_ml_session` flow is preserved exactly as-is.

## File Changes

### 1. `src/auth/magic-link-session.ts`

**Action**: Remove everything from line 207 to end of file (lines 207-563)

The file currently has two major sections:
- **Lines 1-205**: Legacy `_ml_session` flow (KEEP)
- **Lines 207-563**: Pre-auth `_ml_preauth` + auth context flow (REMOVE)

After removal, the file should end at approximately line 205 (after `clearMagicLinkSessionCookie`).

**Also update**: The module JSDoc comment at the top of the file (lines 1-42) references the pre-auth flow extensively. Rewrite it to only describe the `_ml_session` flow. Remove "legacy" terminology — this is now the only flow.

### 2. `src/routes/interactions.ts`

**Action A — Remove imports (lines 54-60):**

Current:
```typescript
import {
  hasMagicLinkSession,
  consumeMagicLinkSession,
  hasMagicLinkPreAuth,
  consumeMagicLinkPreAuth,
  storeMagicLinkAuthContext,
} from '../auth/magic-link-session.js';
```

Change to:
```typescript
import {
  hasMagicLinkSession,
  consumeMagicLinkSession,
} from '../auth/magic-link-session.js';
```

**Action B — Remove pre-auth detection block in `showLogin()` (lines 309-358):**

Remove the entire block starting with:
```
// Pre-auth detection — cross-browser magic link flow (preferred path)
if (hasMagicLinkPreAuth(ctx)) {
```
...through to the closing `}` and the fall-through comment.

Also update the comment above the `_ml_session` detection block (currently labeled "Legacy magic link session detection") — rename to just "Magic link session detection" (no "legacy").

**Action C — Remove `storeMagicLinkAuthContext()` call in `handleSendMagicLink()` (around line 773):**

Remove the entire block that stores auth context in Redis:
```typescript
await storeMagicLinkAuthContext(interaction.uid, {
  clientId: params.client_id as string,
  redirectUri: params.redirect_uri as string,
  scope: (params.scope as string) ?? 'openid',
  state: params.state as string | undefined,
  nonce: params.nonce as string | undefined,
  codeChallenge: params.code_challenge as string | undefined,
  codeChallengeMethod: params.code_challenge_method as string | undefined,
  responseType: (params.response_type as string) ?? 'code',
  orgSlug: org.slug,
});
```

### 3. `src/routes/magic-link.ts`

**Action A — Remove imports (lines 36-41):**

Current:
```typescript
import {
  createMagicLinkSession,
  createMagicLinkPreAuth,
  getMagicLinkAuthContext,
  buildAuthorizationUrl,
  renderRedirectPage,
} from '../auth/magic-link-session.js';
```

Change to:
```typescript
import {
  createMagicLinkSession,
} from '../auth/magic-link-session.js';
```

Also remove the `config` import if it's only used for `config.issuerBaseUrl` in the pre-auth path:
```typescript
import { config } from '../config/index.js';  // Check if still needed elsewhere
```

**Action B — Remove pre-auth path in `verifyMagicLink()` (lines 215-253):**

Current flow at the decision point (line 215):
```typescript
if (interactionUid) {
  // Try the pre-auth flow first
  const authContext = await getMagicLinkAuthContext(interactionUid);

  if (authContext) {
    // Pre-auth flow: ... renderRedirectPage ...
    return;
  }

  // Fallback: legacy flow
  await createMagicLinkSession(ctx, { ... });
  ctx.redirect(`/interaction/${interactionUid}`);
  return;
}
```

Simplify to:
```typescript
if (interactionUid) {
  // Create magic link session and redirect to the interaction handler.
  // The interaction handler will detect the session cookie and complete
  // the OIDC flow (same browser) or show a success page (different browser).
  await createMagicLinkSession(ctx, {
    userId: user.id,
    interactionUid,
    organizationId: org.id,
  });
  ctx.redirect(`/interaction/${interactionUid}`);
  return;
}
```

**Action C — Update JSDoc comments:**

Remove references to pre-auth flow in the module docstring (lines 1-23) and the `verifyMagicLink()` function docstring (lines 112-128). Update step 8 description to only describe the `_ml_session` approach.

### 4. `locales/default/en/magic-link.json`

**Action**: Improve success page messages for cross-browser clarity.

Current:
```json
{
  "success_title": "You're signed in",
  "success_message": "You have been signed in successfully.",
  "success_hint": "You can close this tab and return to the application where you started."
}
```

Updated:
```json
{
  "success_title": "Email verified",
  "success_message": "Your sign-in link has been verified successfully.",
  "success_hint": "Please return to the browser where you started the sign-in and the login will complete automatically.",
  "success_close_tab": "You can safely close this tab."
}
```

### 5. `templates/default/pages/magic-link-success.hbs`

**Action**: Update template comment and add close-tab hint.

```handlebars
{{!-- Magic link verified: shown when link is opened in a different browser --}}
{{!--
  Displayed when a magic link is opened in a different browser than the one
  that started the OIDC authorization flow. The magic link IS verified and
  the user's email is confirmed, but the OIDC flow completes in the original
  browser where the interaction cookies reside.

  Security: This page is ONLY rendered when a valid _ml_session cookie
  was present and consumed. The session is single-use (Redis key deleted),
  so this page cannot be shown by URL crafting or replay.
--}}
<div class="text-center">
  <h1>{{t "magic-link.success_title"}}</h1>
  <p class="text-muted mb-4">{{t "magic-link.success_message"}}</p>
  <p class="text-muted">{{t "magic-link.success_hint"}}</p>
  <p class="text-muted mt-2">{{t "magic-link.success_close_tab"}}</p>
</div>
```

## Error Handling

No new error handling needed — this is a removal, not an addition.

## Integration Points

After cleanup, the magic link flow is self-contained in:
1. `src/auth/magic-link-session.ts` — Session creation/consumption
2. `src/routes/magic-link.ts` — Token verification → session creation
3. `src/routes/interactions.ts` — Session detection → OIDC flow completion
