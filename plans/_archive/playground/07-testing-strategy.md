# Testing Strategy: Playground Application & Infrastructure

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

The playground is a developer tool, not a production application. Testing is primarily
**manual verification** — confirming each scenario works end-to-end through the real
Porta auth flows. Automated testing of the playground app itself is out of scope
(per RD-14), but the seed script's idempotency and the startup scripts' reliability
are verified through structured manual test protocols.

### Coverage Goals

- Seed script: All 5 orgs, 8+ users, RBAC, 2FA enrollment verified
- Startup: One-command startup works from clean state
- Playground app: All 8 scenarios exercisable, token display correct
- Infrastructure: Teardown and reset scripts work correctly

## Test Categories

### Seed Script Verification

| Test | Description | Priority |
|------|-------------|----------|
| Idempotent re-run | Run seed twice; verify no errors on second run | High |
| Organization count | Verify 5 orgs created with correct slugs | High |
| 2FA policies | Verify each org has correct `two_factor_policy` | High |
| User count | Verify 8+ users with correct org associations | High |
| User statuses | Verify inactive/suspended users exist | Medium |
| 2FA enrollment | Verify email OTP and TOTP users are enrolled | High |
| TOTP secret logged | Verify TOTP base32 secret printed to console | High |
| Recovery codes logged | Verify recovery codes printed for TOTP user | Medium |
| RBAC roles | Verify admin/viewer roles assigned to correct users | Medium |
| Custom claims | Verify department/employee_id set on demo user | Medium |
| Client redirect URIs | Verify all clients point to localhost:4000 | High |
| Config file generated | Verify `playground/config.generated.js` exists and is valid | High |
| Config file content | Verify all org IDs, client IDs present in config | High |

### Startup Infrastructure Verification

| Test | Description | Priority |
|------|-------------|----------|
| `yarn playground` from clean | Fresh clone → yarn install → yarn playground | High |
| Docker services start | Verify Postgres, Redis, MailHog running | High |
| Migrations run | Verify database schema created | High |
| Porta health | Verify `GET /health` returns 200 | High |
| Playground serves | Verify http://localhost:4000 returns HTML | High |
| Ctrl+C cleanup | Verify all processes killed on Ctrl+C | Medium |
| `yarn playground:stop` | Verify ports 3000 and 4000 freed | Medium |
| `yarn playground:reset` | Verify DB dropped and re-seeded | Medium |

### Playground App Verification

| Scenario | Steps | Expected Result |
|----------|-------|-----------------|
| Normal Login | Select scenario → Login → Enter credentials → Submit | ID token displayed with claims |
| Email OTP | Select scenario → Login → Enter credentials → Check MailHog → Enter OTP | Token with 2FA claims |
| TOTP | Select scenario → Login → Enter credentials → Enter authenticator code | Token with 2FA claims |
| Recovery Code | Select TOTP scenario → Login → Use recovery code option | Token received (recovery code consumed) |
| Magic Link | Select scenario → Click magic link on login page → Check MailHog → Click link | Token received without password |
| Consent | Select third-party scenario → Login → Approve scopes | Token with approved scopes |
| Password Reset | Select scenario → Forgot password → Check MailHog → Reset → Login | Successful login with new password |
| TOTP Setup | Select fresh user scenario → Login → Scan QR → Enter code | Token received, TOTP enrolled |

### UI Feature Verification

| Feature | Test Steps | Expected |
|---------|-----------|----------|
| Status indicators | Start with Porta running | Green dots for Porta and MailHog |
| Status indicators | Stop Porta | Porta dot turns red |
| Token dashboard | Complete login | ID, access, refresh token panels populated |
| UserInfo button | Click after login | UserInfo panel shows claims JSON |
| Logout | Click Logout | Session cleared, returns to logged-out view |
| Re-login | Click Re-login | Fresh auth flow starts |
| Token refresh | Click Refresh Token | New tokens received and displayed |
| Dark/light theme | Click theme toggle | Colors switch, preference persists |
| Event log | Perform login flow | All OIDC events logged chronologically |
| Config panel | Change org in dropdown | OIDC settings update |
| MailHog link | Click link | MailHog opens in new tab |

## Test Data

### Pre-Seeded Credentials

| Email | Password | Org | 2FA | Roles |
|-------|----------|-----|-----|-------|
| user@no2fa.local | Playground123! | playground-no2fa | none | admin |
| inactive@no2fa.local | Playground123! | playground-no2fa | none | — |
| suspended@no2fa.local | Playground123! | playground-no2fa | none | — |
| user@email2fa.local | Playground123! | playground-email2fa | email | viewer |
| user@totp2fa.local | Playground123! | playground-totp2fa | totp | admin |
| fresh@totp2fa.local | Playground123! | playground-totp2fa | none | — |
| user@optional2fa.local | Playground123! | playground-optional2fa | none | — |
| user@thirdparty.local | Playground123! | playground-thirdparty | none | — |

### TOTP Secret

The TOTP secret for `user@totp2fa.local` is generated dynamically during seed.
It is printed to the console output. Use it to configure your authenticator app
(Google Authenticator, Microsoft Authenticator, Authy, etc.).

### Recovery Codes

10 recovery codes are generated for each 2FA-enrolled user. They are printed
to the console during seed. Each code is single-use and in `XXXX-XXXX` format.

## Verification Checklist

- [ ] Seed script runs successfully from clean database
- [ ] Seed script runs again without errors (idempotent)
- [ ] All 5 organizations visible in CLI (`yarn porta org list`)
- [ ] All users visible in CLI (`yarn porta user list`)
- [ ] `yarn playground` starts all services
- [ ] Playground app loads at http://localhost:4000
- [ ] At least 3 different scenarios tested end-to-end
- [ ] Token dashboard shows decoded ID token
- [ ] UserInfo endpoint returns claims
- [ ] Logout clears session
- [ ] `yarn playground:stop` cleans up all processes
- [ ] `yarn playground:reset` drops and re-seeds data
- [ ] No regressions in existing test suite (`yarn verify`)
