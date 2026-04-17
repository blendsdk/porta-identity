# Testing Strategy: OIDC Client Authentication

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

- Unit tests: All 5 decision matrix scenarios, secret extraction, edge cases
- Integration tests: Full token exchange with real DB + Redis
- Pentest tests: Brute force, timing, replay, malformed inputs
- E2E tests: Complete OIDC flows (Auth Code + PKCE, Client Credentials)

## Test Categories

### Unit Tests — Client Finder (`tests/unit/oidc/client-finder.test.ts`)

Expand the existing 4 tests to cover all scenarios:

| # | Test                                                    | Priority |
|---|--------------------------------------------------------|----------|
| 1 | Returns metadata for active public client (no secret)   | High     |
| 2 | Returns metadata for active confidential client + valid secret (post) | High |
| 3 | Returns metadata for active confidential client + valid secret (basic) | High |
| 4 | Returns undefined for confidential client + invalid secret | High |
| 5 | Returns undefined for public client + secret presented  | High     |
| 6 | Returns undefined for unknown client_id                 | High     |
| 7 | Returns undefined for inactive/suspended client         | High     |
| 8 | Sets `client_secret` on metadata for valid confidential | High     |
| 9 | Does NOT set `client_secret` for public client          | High     |
| 10| Logs warning for public client + secret                 | Medium   |
| 11| Logs warning for failed confidential secret             | Medium   |
| 12| Handles malformed Basic auth header gracefully          | Medium   |
| 13| Handles empty Authorization header                      | Low      |
| 14| Handles Basic auth with wrong client_id                 | Medium   |
| 15| Handles URL-encoded client_id in Basic auth             | Medium   |
| 16| Secret extraction from body takes priority over header  | Medium   |
| 17| Multiple active secrets — rotation support              | High     |
| 18| Expired secret rejected even if hash matches            | High     |
| 19| Revoked secret rejected                                 | High     |
| 20| Returns undefined on database error (fail closed)       | High     |

### Unit Tests — Configuration (`tests/unit/oidc/configuration.test.ts`)

| # | Test                                              | Priority |
|---|--------------------------------------------------|----------|
| 1 | Config includes findClient when provided          | High     |
| 2 | findClient is the injected function               | High     |

### Unit Tests — Client Service (`tests/unit/clients/service.test.ts`)

| # | Test                                              | Priority |
|---|--------------------------------------------------|----------|
| 1 | verifyClientSecret returns true for valid secret  | High     |
| 2 | verifyClientSecret returns false for invalid      | High     |
| 3 | verifyClientSecret returns false for public client| High     |
| 4 | verifyClientSecret returns false for inactive     | High     |
| 5 | verifyClientSecret returns false for unknown      | High     |

### Pentest Tests (`tests/pentest/oidc-client-auth/`)

| # | Test                                                    | Category |
|---|---------------------------------------------------------|----------|
| 1 | Brute force secret guessing (rate limiting)             | Auth     |
| 2 | Timing attack — response time constant for valid/invalid| Auth     |
| 3 | Empty client_secret in body                             | Injection|
| 4 | SQL injection in client_id                              | Injection|
| 5 | Very long client_secret (memory exhaustion)             | DoS      |
| 6 | Null bytes in client_secret                             | Injection|
| 7 | Basic auth with invalid base64                          | Malformed|
| 8 | Client_secret in both body and header (ambiguity)       | Auth     |
| 9 | Replay of expired/revoked secret                        | Auth     |
| 10| Cross-tenant client_id probing                          | Multi-tenant |

### Integration Tests (`tests/integration/oidc-client-auth.test.ts`)

| # | Test                                                   | Components           |
|---|-------------------------------------------------------|----------------------|
| 1 | Public client: full Authorization Code + PKCE flow     | DB + Redis + Provider|
| 2 | Confidential client: Client Credentials grant          | DB + Redis + Provider|
| 3 | Confidential client: Auth Code + secret on token exchange | DB + Redis + Provider|
| 4 | Refresh token exchange for confidential client         | DB + Redis + Provider|
| 5 | Token introspection with client auth                   | DB + Redis + Provider|
| 6 | Secret rotation — old and new secrets both work        | DB + Redis           |

## Test Data

### Fixtures Needed

- Public client (active, type='public', application_type='spa')
- Confidential client (active, type='confidential', application_type='web')
- Confidential client with 2 active secrets (rotation testing)
- Confidential client with expired secret
- Suspended client
- Test user with password (for Auth Code flow)
- Test organization (for multi-tenant context)

### Mock Requirements

- Unit tests: Mock `findForOidc`, `getClientByClientId`, `verify` from secret-service
- Integration tests: Real DB + Redis (Docker services)
- Pentest tests: Mock services, focus on input validation

## Verification Checklist

- [ ] All new unit tests pass (≥25 tests)
- [ ] All new pentest tests pass (≥10 tests)
- [ ] All new integration tests pass (≥6 tests)
- [ ] All existing 1,818+ tests pass (zero regressions)
- [ ] `yarn verify` passes cleanly
- [ ] Playground seed + OIDC tester demonstrates working flow
