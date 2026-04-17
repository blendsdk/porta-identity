# Testing Strategy: Confidential Client E2E

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

- E2E test: Complete confidential client OIDC workflow
- Regression: All 2038+ existing tests pass after body parser fix

## Test Categories

### E2E Tests (New)

| Test | Description | Priority |
|------|-------------|----------|
| Auth + token exchange | Login, consent, code exchange with client_secret_post | High |
| ID token validation | JWT decode, verify claims (iss, aud, sub, email) | High |
| Token introspection | Verify active=true, client_id, token_type | High |
| UserInfo request | Verify user claims match access token | High |

### Regression Tests (Existing)

| Area | Risk | Verification |
|------|------|-------------|
| Admin API routes | Body parser removal could break JSON parsing | Run existing route tests |
| Interaction routes | Login/consent forms need body parsing | Run existing UI tests |
| OIDC configuration tests | findClient removal changes config shape | Update affected tests |

## Verification

```bash
# Unit + integration tests
clear && sleep 3 && yarn verify

# Playwright UI tests (includes new confidential client test)
clear && sleep 3 && npx playwright test
```

## Verification Checklist

- [ ] New Playwright E2E test passes
- [ ] All unit tests pass (no regressions from body parser fix)
- [ ] All existing UI tests pass (login, consent flows)
- [ ] oidc-provider no longer logs "already parsed request body" warning
