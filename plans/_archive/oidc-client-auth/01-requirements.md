# Requirements: OIDC Client Authentication

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-03](../../requirements/RD-03-oidc-provider-core.md), [RD-05](../../requirements/RD-05-application-client-management.md)

## Feature Overview

Connect Porta's client management system to node-oidc-provider so that OIDC flows can
find and authenticate clients. This includes wiring the `findClient` configuration hook,
implementing Argon2id secret verification for confidential clients, and handling edge
cases (public client + secret, expired secrets, revoked secrets).

## Functional Requirements

### Must Have

- [ ] oidc-provider resolves clients from the `clients` table (not `oidc_payloads`)
- [ ] `findClient(ctx, id)` is wired into the provider configuration
- [ ] Public clients work with `token_endpoint_auth_method: 'none'` (PKCE)
- [ ] Confidential clients authenticate via `client_secret_post` or `client_secret_basic`
- [ ] Secret verification uses existing Argon2id hashes from `client_secrets` table
- [ ] Multiple active secrets supported (rotation — try each active hash)
- [ ] Expired/revoked secrets are never considered during verification
- [ ] Public client sending a secret → `invalid_client` error + server warning log
- [ ] Confidential client with invalid secret → `invalid_client` error + server warning log
- [ ] Confidential client with valid secret → metadata returned with `client_secret` set
- [ ] Authorization Code + PKCE flow works end-to-end (public client)
- [ ] Client Credentials grant works end-to-end (confidential client)
- [ ] Refresh Token exchange works for both client types
- [ ] Token Introspection works with authenticated clients
- [ ] Token Revocation works with authenticated clients
- [ ] `last_used_at` updated on successful secret verification
- [ ] Audit log entry on failed secret verification

### Should Have

- [ ] Cookie `secure` flag configurable via env var for local HTTP testing
- [ ] Playground seed script works with the fixed integration

### Won't Have (Out of Scope)

- `client_secret_jwt` authentication method (future)
- `private_key_jwt` authentication method (future)
- `tls_client_auth` (mTLS) authentication method (future)
- Admin API authentication (GAP-3 — separate RD-13)
- Barrel export cleanup (GAP-4 — cosmetic, separate task)
- Device Authorization Grant (future — RD-13)

## Technical Requirements

### Performance

- Argon2id verification adds ~50-100ms per token exchange (acceptable)
- Secret verification only triggers when a secret is presented (no overhead for public clients)
- `findClient` should be as fast as possible — use existing Redis cache from client service

### Security

- Secrets are NEVER stored in plaintext — only Argon2id hashes
- Failed verification attempts are audit-logged (rate limiting via existing rate-limiter)
- Timing-safe comparison via Argon2id (inherent — no timing attack vector)
- Public clients must not accept secrets (strict enforcement)

### Compatibility

- node-oidc-provider v9.x `findClient(ctx, id)` hook
- Existing client service API unchanged (additive only)
- Existing unit tests must not break
- All 1,818+ existing tests must continue to pass

## Scope Decisions

| Decision                     | Options Considered                       | Chosen    | Rationale                                            |
|------------------------------|------------------------------------------|-----------|------------------------------------------------------|
| Where to verify secrets?     | Middleware, findClient, adapter override  | findClient| Cleanest — natural integration point, no middleware   |
| How to pass secret to oidc?  | Store plaintext, encrypt, pass-through   | Pass-through | Verify first, then return presented secret          |
| Handle public + secret?      | Ignore, warn, error                      | Error     | Strict enforcement prevents misconfiguration          |
| Secret extraction point?     | Request body, headers, both              | Both      | Support client_secret_post AND client_secret_basic    |

## Acceptance Criteria

1. [ ] OIDC tester at psteniusubi.github.io can complete Authorization Code + PKCE flow
2. [ ] Client Credentials grant returns access token for confidential client with valid secret
3. [ ] All 5 decision matrix scenarios produce correct results
4. [ ] All existing tests pass (zero regressions)
5. [ ] New test coverage: ≥40 new tests across unit/integration/pentest
6. [ ] Playground seed script demonstrates working flow
7. [ ] `yarn verify` passes cleanly
