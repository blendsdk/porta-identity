# Requirements: Cross-Browser Magic Link Pre-Auth Cleanup

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)

## Feature Overview

Remove the cross-browser magic link "pre-auth" flow from Porta. This flow attempts to complete an OIDC authorization code flow in a different browser than the one that initiated it, which is fundamentally incompatible with OIDC + PKCE security guarantees.

## Background

### Why This Code Exists

The pre-auth flow was built to allow magic links to work across browsers — e.g., user starts login in Chrome, opens magic link in Safari. It stores the original OIDC authorization parameters (client_id, redirect_uri, scope, state, nonce, code_challenge) in Redis, then reconstructs the authorization URL when the magic link is clicked in any browser.

### Why It Doesn't Work

1. **PKCE binding**: The authorization code issued by Porta is bound to the original `code_challenge`. Only the holder of the `code_verifier` (in the original browser's session) can exchange it.
2. **State verification**: The client stores state in its session. A different browser has no session → state mismatch → client rejects the callback.
3. **Nonce verification**: Same problem — nonce is in the original session.
4. **Industry precedent**: Auth0, Okta, and Firebase Auth all show a "return to original browser" message for cross-browser magic links. None attempt to complete the OIDC flow.

### Why the Legacy Flow Is Correct

The `_ml_session` cookie approach already handles both cases properly:
- **Same browser**: `_ml_session` + interaction cookies present → `interactionFinished()` completes the OIDC flow
- **Different browser**: `_ml_session` present but no interaction cookies → catches error → shows "You're signed in, return to original browser" success page

## Functional Requirements

### Must Have

- [x] Remove all pre-auth flow code (`_ml_preauth` cookie, auth context storage, URL reconstruction, redirect page)
- [x] Remove `storeMagicLinkAuthContext()` call from interaction route (magic link send handler)
- [x] Keep legacy `_ml_session` flow fully intact and working
- [x] Same-browser magic link flow continues to work seamlessly
- [x] Different-browser magic link shows friendly "return to original browser" page
- [x] Improve success page i18n messages to be more helpful
- [x] All existing tests pass (except removed pre-auth tests)

### Should Have

- [x] Update module JSDoc comments to remove pre-auth references
- [x] Clean up "legacy" terminology in remaining code (it's now the only flow)

### Won't Have (Out of Scope)

- Polling mechanism for original browser to detect magic link verification
- WebSocket-based cross-browser notification
- Any alternative cross-browser magic link approach

## Technical Requirements

### Security

- No new security surface introduced
- Removing pre-auth flow eliminates: auth context Redis storage, `_ml_preauth` cookie, reconstructed auth URLs
- The `_ml_session` cookie retains all existing security properties (HttpOnly, SameSite=Lax, single-use, 5-min TTL)

### Compatibility

- Works with SPA clients (public, PKCE)
- Works with BFF clients (confidential, PKCE)
- Works with any standard OIDC library (passport-openidconnect, openid-client, etc.)

## Acceptance Criteria

1. [ ] Pre-auth code completely removed from `src/auth/magic-link-session.ts`
2. [ ] Pre-auth detection removed from `src/routes/interactions.ts`
3. [ ] Pre-auth path removed from `src/routes/magic-link.ts`
4. [ ] Cross-browser UI test deleted (`tests/ui/flows/magic-link-cross-browser.spec.ts`)
5. [ ] Unit tests updated (pre-auth mocks/assertions removed)
6. [ ] Success page messages improved in `locales/default/en/magic-link.json`
7. [ ] `yarn verify` passes with zero failures
8. [ ] Same-browser magic link flow works (manual test or existing UI tests)
