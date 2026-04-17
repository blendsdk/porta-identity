# Testing Strategy: BFF + M2M Playground

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

The BFF playground is itself a testing/debugging tool — it doesn't need its own automated test suite. Testing is primarily **manual verification** against a running Porta instance, supplemented by a **smoke test script** that validates the BFF starts and basic flows work.

### Coverage Goals

- Manual verification of all 8 auth scenarios via BFF
- Manual verification of M2M client_credentials flow
- Smoke test script for CI/startup validation
- No unit tests (this is a playground, not production code)

## Test Categories

### Manual Verification Tests

#### BFF Auth Code Flow

| # | Test | Steps | Expected Result |
| --- | --- | --- | --- |
| 1 | Dashboard loads | Navigate to `http://localhost:4001` | Shows "Not authenticated" + scenario sidebar |
| 2 | Normal login | Click "Standard password login" scenario | Redirects to Porta login → enter password → redirects back → dashboard shows decoded tokens |
| 3 | Magic link login | Click "Magic link" scenario | Redirects to Porta → enter email → check MailHog → click link → dashboard shows tokens |
| 4 | Email OTP | Click "Email 2FA" scenario | Login → enter password → receive OTP via MailHog → enter OTP → dashboard |
| 5 | TOTP | Click "TOTP 2FA" scenario | Login → enter password → enter TOTP code → dashboard |
| 6 | Recovery code | Click "Recovery code" scenario | Login → enter password → enter recovery code → dashboard |
| 7 | Third-party consent | Click "Third-party consent" scenario | Login → consent page shown → approve → dashboard |
| 8 | Password reset | Click "Password reset" scenario | Request reset → check MailHog → set new password → login |
| 9 | TOTP setup | Click "TOTP setup" scenario | Login → setup TOTP → scan QR → enter code → dashboard |

#### Token Operations

| # | Test | Steps | Expected Result |
| --- | --- | --- | --- |
| 10 | UserInfo | Login → click "UserInfo" | Panel shows JSON with user claims (sub, name, email) |
| 11 | Refresh | Login → click "Refresh" | Page reloads with new tokens, expiry updated |
| 12 | Introspect | Login → click "Introspect" | Panel shows `active: true` + token metadata |
| 13 | Logout | Login → click "Logout" | Session destroyed, redirected to Porta end_session, then back to dashboard as unauthenticated |

#### Session Security

| # | Test | Steps | Expected Result |
| --- | --- | --- | --- |
| 14 | Cookie is HttpOnly | Login → check DevTools → Cookies | `bff_session` cookie has `HttpOnly` flag |
| 15 | No tokens in browser | Login → check DevTools → Network/Console | No access_token or id_token visible in browser JS context |
| 16 | Session survives reload | Login → refresh page | Still authenticated (session in Redis) |
| 17 | Multi-org switch | Login with org A → logout → login with org B | Different issuer, different tokens, correct org displayed |

#### M2M Flow

| # | Test | Steps | Expected Result |
| --- | --- | --- | --- |
| 18 | M2M page loads | Navigate to `/m2m` | Shows M2M config info + buttons |
| 19 | Get token | Click "Get Token" | Token returned, displayed (opaque or JWT) |
| 20 | Introspect M2M | Get token → click "Introspect" | Shows `active: true`, client_id in response |
| 21 | Revoke M2M | Get token → click "Revoke" | Token revoked, introspect returns `active: false` |
| 22 | No user in M2M | Get token → check payload/introspect | No `sub` claim pointing to a user |

#### UI/UX

| # | Test | Steps | Expected Result |
| --- | --- | --- | --- |
| 23 | Dark/light theme | Toggle theme | Styling switches, persists across page loads |
| 24 | Status indicators | Check sidebar | Green dots for Porta + MailHog when running |
| 25 | SPA playground link | Click "SPA Playground" link | Opens `http://localhost:4000` in new tab |
| 26 | MailHog link | Click "MailHog" link | Opens `http://localhost:8025` in new tab |

### Smoke Test Script

A simple script that can be run after `run-playground.sh` to verify basic functionality:

```bash
#!/bin/bash
# scripts/playground-bff-smoke.sh
# Quick smoke test for BFF playground

BFF_URL="http://localhost:4001"
PORTA_URL="http://localhost:3000"
PASS=0
FAIL=0

check() {
  local name=$1 url=$2 expected=$3
  local status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$status" = "$expected" ]; then
    echo "✅ $name (HTTP $status)"
    PASS=$((PASS+1))
  else
    echo "❌ $name (expected $expected, got $status)"
    FAIL=$((FAIL+1))
  fi
}

echo "BFF Playground Smoke Test"
echo "========================="

# Health
check "BFF health" "$BFF_URL/health" "200"

# Dashboard (unauthenticated)
check "Dashboard" "$BFF_URL" "200"

# M2M page
check "M2M page" "$BFF_URL/m2m" "200"

# Login redirect (should 302 to Porta)
check "Login redirect" "$BFF_URL/auth/login?org=no2fa" "302"

# Porta health
check "Porta health" "$PORTA_URL/health" "200"

echo ""
echo "Results: $PASS passed, $FAIL failed"
exit $FAIL
```

## Test Data

### Fixtures Needed

No additional test fixtures beyond what the seed script already creates:
- 5 organizations with different 2FA policies
- BFF confidential clients (one per org) — created by updated seed
- M2M service client — created by updated seed
- 10 users with passwords across orgs
- TOTP setup for totp2fa users
- Roles, permissions, custom claims assigned

### Mock Requirements

None — the BFF playground tests against real Porta, Redis, and PostgreSQL services. This is intentional — the whole point is to exercise real OIDC flows.

## Verification Checklist

### Before Declaring Complete

- [ ] BFF starts on port 4001 without errors
- [ ] All 8 auth scenarios redirect to correct Porta issuer
- [ ] Login completes and tokens are stored in session
- [ ] Dashboard displays decoded ID/access/refresh tokens
- [ ] UserInfo returns correct claims
- [ ] Token refresh works and updates session
- [ ] Introspection returns `active: true`
- [ ] Logout destroys session and redirects to Porta
- [ ] M2M token request succeeds
- [ ] M2M introspection works
- [ ] M2M revocation works
- [ ] Session cookie is HttpOnly
- [ ] No tokens visible in browser context
- [ ] Theme toggle works
- [ ] Status indicators work
- [ ] Smoke test script passes
- [ ] `run-playground.sh` starts both SPA and BFF
- [ ] `run-playground-stop.sh` stops both SPA and BFF
