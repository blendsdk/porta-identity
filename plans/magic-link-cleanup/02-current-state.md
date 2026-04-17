# Current State: Cross-Browser Magic Link Pre-Auth

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### Two Magic Link Flows

The codebase contains two distinct magic link authentication flows:

#### Flow A: `_ml_session` (same-browser, correct) — KEEP

1. Magic link clicked → token verified → `_ml_session` cookie set → redirect to `/interaction/:uid`
2. `showLogin()` detects `_ml_session` → `consumeMagicLinkSession()` returns session data
3. **Same browser**: Calls `interactionFinished()` → OIDC flow completes → redirect to client callback ✅
4. **Different browser**: `interactionFinished()` fails (no interaction cookies) → shows "You're signed in" success page ✅

#### Flow B: `_ml_preauth` + auth context (cross-browser, broken) — REMOVE

1. When magic link is sent: `storeMagicLinkAuthContext()` stores original OIDC params in Redis
2. Magic link clicked → token verified → `getMagicLinkAuthContext()` retrieves stored params
3. `createMagicLinkPreAuth()` sets `_ml_preauth` cookie
4. `buildAuthorizationUrl()` reconstructs original auth URL → `renderRedirectPage()` renders spinner
5. Browser redirected to Porta auth endpoint → new interaction created
6. `showLogin()` detects `_ml_preauth` → `consumeMagicLinkPreAuth()` → `interactionFinished()`
7. Code issued bound to original `code_challenge` → client callback fails (no `code_verifier` in this browser)

### Relevant Files

| File | Purpose | Changes Needed |
| --- | --- | --- |
| `src/auth/magic-link-session.ts` | Both flows: legacy (L44-205) + pre-auth (L207-563) | Remove lines 207-563 |
| `src/routes/interactions.ts` | `showLogin()` detects both flows; `handleSendMagicLink()` stores auth context | Remove pre-auth block (L309-358) + auth context store (L773) |
| `src/routes/magic-link.ts` | `verifyMagicLink()` has pre-auth path (L217-237) + legacy path (L240-252) | Remove pre-auth path (L217-237) |
| `src/auth/index.ts` | Barrel export — only exports legacy functions | No changes needed |
| `locales/default/en/magic-link.json` | Success page text | Improve messages |
| `templates/default/pages/magic-link-success.hbs` | Success page template | Update comment |

### Code Analysis

#### `src/auth/magic-link-session.ts` — Pre-auth Section (Lines 207-563)

**Exports to REMOVE:**
- `MagicLinkAuthContext` (interface, L241-260)
- `MagicLinkPreAuthData` (interface, L269-274)
- `storeMagicLinkAuthContext()` (async function, L290-303)
- `getMagicLinkAuthContext()` (async function, L317-348)
- `createMagicLinkPreAuth()` (async function, L369-394)
- `consumeMagicLinkPreAuth()` (async function, L410-447)
- `hasMagicLinkPreAuth()` (function, L455-457)
- `buildAuthorizationUrl()` (function, L489-507)
- `renderRedirectPage()` (function, L524-563)

**Non-exported helpers to REMOVE:**
- `clearMagicLinkPreAuthCookie()` (L464-472)

**Constants to REMOVE:**
- `ML_PREAUTH_COOKIE` (L216)
- `ML_PREAUTH_PREFIX` (L219)
- `ML_PREAUTH_TTL` (L222)
- `ML_AUTH_CONTEXT_PREFIX` (L225)
- `ML_AUTH_CONTEXT_TTL` (L228)

#### `src/routes/interactions.ts` — Two Removal Points

**1. `showLogin()` — Pre-auth detection block (L309-358):**
```
// Pre-auth detection — cross-browser magic link flow (preferred path)
if (hasMagicLinkPreAuth(ctx)) {
  const preAuth = await consumeMagicLinkPreAuth(ctx);
  // ... recordLogin, audit log, interactionFinished ...
}
```

**2. `handleSendMagicLink()` — Auth context storage (L773):**
```
await storeMagicLinkAuthContext(interaction.uid, {
  clientId: params.client_id,
  redirectUri: params.redirect_uri,
  // ... all other OIDC params ...
});
```

**Imports to REMOVE (L57-59):**
- `hasMagicLinkPreAuth`
- `consumeMagicLinkPreAuth`
- `storeMagicLinkAuthContext`

#### `src/routes/magic-link.ts` — Pre-auth Path (L217-237)

**Code path to REMOVE:**
```
if (authContext) {
  await createMagicLinkPreAuth(ctx, { userId, organizationId });
  const authUrl = buildAuthorizationUrl(issuerBaseUrl, authContext);
  renderRedirectPage(ctx, authUrl);
  return;
}
```

**Imports to REMOVE (L37-40):**
- `createMagicLinkPreAuth`
- `getMagicLinkAuthContext`
- `buildAuthorizationUrl`
- `renderRedirectPage`

### Test Files Affected

| Test File | Pre-auth References | Action |
| --- | --- | --- |
| `tests/ui/flows/magic-link-cross-browser.spec.ts` | 411 lines, entire file tests cross-browser flow | DELETE |
| `tests/unit/routes/magic-link.test.ts` | 14 references to pre-auth mocks/assertions | Remove pre-auth test cases |
| `tests/unit/routes/interactions.test.ts` | 3 references to pre-auth mocks | Remove pre-auth detection tests |
| `tests/pentest/*` | 0 references | No changes |

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Same-browser magic link breaks | Low | High | Legacy flow is untouched; existing tests cover it |
| Missing import removal causes build error | Low | Low | `yarn verify` catches compilation errors |
| Test count drop raises concern | Low | Low | Removed tests covered broken functionality |
