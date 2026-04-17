# Requirements: Magic Link Cross-Browser Fix

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)

## Feature Overview

Magic links must be self-contained authentication credentials that work regardless of where they are opened. The link carries everything needed — the user doesn't need to be in the same browser, on the same machine, or even have any prior session.

## Functional Requirements

### Must Have

- [ ] Magic link works when opened in the same browser (seamless OIDC completion)
- [ ] Magic link works when opened in a different browser (success page + pre-authenticated session)
- [ ] Magic link works when opened on a different machine / remote desktop
- [ ] Magic link works in private/incognito windows
- [ ] `_ml_session` cookie: signed, short-lived (5 min), single-use, HttpOnly, Secure
- [ ] Success page ONLY renders when valid `_ml_session` exists (security guard)
- [ ] Success page shows user email + link to the application
- [ ] Expired interaction handled gracefully (authenticate user, show success page)
- [ ] 2 previously-fixme Playwright tests unblocked and passing

### Should Have

- [ ] i18n support for success page strings
- [ ] Audit log entry for cross-browser magic link authentication

### Won't Have (Out of Scope)

- Replaying original state/nonce params to different browsers
- Auto-redirecting to application from different browser (security risk)
- Magic link working after token expiry (security — tokens have TTL)

## Security Requirements

- `_ml_session` cookie MUST be signed (HMAC) to prevent forgery
- `_ml_session` MUST be single-use (consumed after first use)
- `_ml_session` MUST have short TTL (5 minutes max)
- Success page MUST NOT render without valid `_ml_session` (prevents URL crafting)
- Success page MUST NOT leak sensitive information beyond the user's own email
- Magic link token remains single-use (no replay)

## Acceptance Criteria

1. [ ] Same-browser magic link completes OIDC flow seamlessly
2. [ ] Different-browser magic link shows success page with app link
3. [ ] Success page rejects requests without valid `_ml_session`
4. [ ] Expired interaction shows graceful message
5. [ ] 2 previously-fixme magic link tests pass
6. [ ] All existing UI tests still pass
7. [ ] `yarn verify` passes
8. [ ] Pentest: crafted URLs without `_ml_session` don't reach success page
