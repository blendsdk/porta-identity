# Requirements: Confidential Client E2E

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: Manual testing revealed "no client authentication mechanism provided" error

## Feature Overview

Fix the OIDC token endpoint so confidential clients can authenticate, then prove
it works with a comprehensive E2E test covering the full OIDC workflow.

## Functional Requirements

### Must Have

- [ ] Token endpoint accepts `client_secret_post` authentication
- [ ] Token endpoint accepts `client_secret_basic` authentication
- [ ] Token exchange returns access_token, id_token, refresh_token
- [ ] ID token contains correct claims (sub, aud, iss, email)
- [ ] Token introspection returns active=true with token metadata
- [ ] UserInfo endpoint returns user claims matching the access token

### Should Have

- [ ] Body parser does not interfere with oidc-provider's body parsing
- [ ] Dead `findClient` code removed (silently ignored by oidc-provider v9.8.0)

### Won't Have (Out of Scope)

- Monkey-patch `compareClientSecret` for multi-secret rotation (future feature)
- `client_secret_jwt` or `private_key_jwt` authentication methods
- External OIDC tester CORS configuration

## Acceptance Criteria

1. [ ] Confidential client token exchange succeeds (no 400 error)
2. [ ] Playwright E2E test passes: auth → token → id_token → introspect → userinfo
3. [ ] All existing tests still pass (2038+ tests)
4. [ ] No "already parsed request body" warning from oidc-provider
