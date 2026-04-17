# Requirements: UserInfo (/me) Endpoint Fix

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)

## Feature Overview

The OIDC `/me` (userinfo) endpoint is currently broken — it returns "invalid token provided" for all access tokens obtained through the standard authorization code flow. This is a critical OIDC compliance issue since the userinfo endpoint is a core part of the OpenID Connect specification.

## Functional Requirements

### Must Have

- [ ] `GET /{orgSlug}/me` returns 200 with user claims when presented with a valid access token
- [ ] Claims returned match the scopes granted during authorization (`openid`, `profile`, `email`)
- [ ] Access tokens obtained without an explicit `resource` parameter work with userinfo
- [ ] Access tokens obtained WITH an explicit `resource` parameter remain audience-restricted (no regression)
- [ ] Dedicated E2E tests for the `/me` endpoint covering happy path and error cases

### Should Have

- [ ] Scope-filtered claims — requesting only `openid email` should return `sub` + email claims, not profile claims
- [ ] Existing confidential-client E2E test updated to strictly assert 200 on `/me`

### Won't Have (Out of Scope)

- POST method support for `/me` (oidc-provider handles this natively)
- Custom userinfo response format (standard OIDC JSON response only)
- Token revocation E2E tests (covered separately)

## Technical Requirements

### Compatibility

- Must remain compatible with oidc-provider v9.8.0 `resourceIndicators` feature
- Must not break existing token introspection behavior
- Must not affect token exchange flow

### Security

- Invalid/expired tokens must still return 401
- Missing Authorization header must return 400 or 401
- Tokens from one org must not work for another org's `/me` endpoint

## Scope Decisions

| Decision                    | Options Considered                          | Chosen            | Rationale                                   |
| --------------------------- | ------------------------------------------- | ----------------- | ------------------------------------------- |
| Fix approach                | Remove resourceIndicators entirely, conditional defaultResource | Conditional       | Preserves resource indicator support for future use |
| Test file                   | Add to existing confidential-client spec, new dedicated file | New dedicated file | Separation of concerns, more comprehensive coverage |

## Acceptance Criteria

1. [ ] `GET /{orgSlug}/me` returns 200 with valid access token
2. [ ] Response contains `sub`, `email`, profile claims when appropriate scopes granted
3. [ ] Invalid token returns 401
4. [ ] Missing authorization returns 400 or 401
5. [ ] All existing unit/integration tests pass (2013+)
6. [ ] All Playwright tests pass (26+)
7. [ ] `yarn verify` passes
