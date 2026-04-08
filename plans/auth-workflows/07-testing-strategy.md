# Testing Strategy: Auth Workflows & Login UI

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

- Unit tests: 90%+ for all auth module files
- Integration tests: Key auth flows with mocked provider
- E2E tests: Deferred to RD-10 (requires full Docker stack)

### Test File Organization

```
tests/unit/auth/
  tokens.test.ts              # Token generation, hashing
  token-repository.test.ts    # DB CRUD for all token tables
  rate-limiter.test.ts        # Rate limit check, exceed, reset, graceful degradation
  email-transport.test.ts     # SMTP transport (mocked nodemailer)
  email-renderer.test.ts      # Template rendering with org overrides
  email-service.test.ts       # High-level email sending
  i18n.test.ts                # Locale resolution, translation loading, overrides
  template-engine.test.ts     # Page rendering, layout, partials, branding
  csrf.test.ts                # CSRF token generation/verification
tests/unit/routes/
  interactions.test.ts        # Login, consent, logout handlers
  magic-link.test.ts          # Magic link callback handler
  password-reset.test.ts      # Forgot/reset password handlers
  invitation.test.ts          # Accept invitation handlers
```

## Test Categories

### Unit Tests — Auth Module

| Test File | Description | Est. Tests | Priority |
| --- | --- | --- | --- |
| `tokens.test.ts` | generateToken, hashToken, format validation | ~8 | High |
| `token-repository.test.ts` | Insert, find, mark used, invalidate, cleanup (all 3 tables) | ~20 | High |
| `rate-limiter.test.ts` | Check allowed, exceeded, reset, key builders, Redis failure | ~15 | High |
| `email-transport.test.ts` | SMTP transport creation, send options, auth config | ~8 | Medium |
| `email-renderer.test.ts` | Template resolution, org override, HTML+text rendering | ~10 | Medium |
| `email-service.test.ts` | Each email type, fire-and-forget, branding context | ~12 | Medium |
| `i18n.test.ts` | Locale resolution chain, translation loading, {{t}} helper | ~15 | High |
| `template-engine.test.ts` | Page rendering, layout injection, partials, org overrides | ~12 | High |
| `csrf.test.ts` | Token generation, verification, constant-time compare | ~6 | High |

### Unit Tests — Route Handlers

| Test File | Description | Est. Tests | Priority |
| --- | --- | --- | --- |
| `interactions.test.ts` | Login show/process, magic link send, consent show/process, abort | ~25 | High |
| `magic-link.test.ts` | Verify valid, expired, used, invalid token, email verified | ~10 | High |
| `password-reset.test.ts` | Forgot/reset flow, token validation, password validation | ~15 | High |
| `invitation.test.ts` | Accept invite, set password, token validation, expired | ~10 | High |

**Estimated total: ~166 new tests**

### Integration Tests (Future — RD-10)

| Scenario | Components | Description |
| --- | --- | --- |
| Full login flow | Provider + routes + user service | Start OIDC flow → login → get auth code |
| Magic link e2e | Routes + email + MailHog | Send magic link → verify via MailHog → complete flow |
| Password reset e2e | Routes + email + DB tokens | Request reset → verify email → set new password |
| Rate limiting | Routes + Redis | Exceed limit → verify 429 → wait → retry succeeds |

## Test Data

### Fixtures Needed

- Mock Organization with branding fields and defaultLocale
- Mock User (active, with password hash)
- Mock User (locked, suspended — for status checks)
- Mock OIDC interaction details (login prompt, consent prompt)
- Mock OIDC provider with `interactionDetails()` and `interactionFinished()`
- Sample Handlebars templates (minimal, for renderer tests)
- Sample translation JSON files (minimal, for i18n tests)

### Mock Requirements

| What | Mock Strategy |
| --- | --- |
| PostgreSQL pool | `vi.mock('../lib/database.js')` — same as existing modules |
| Redis client | `vi.mock('../lib/redis.js')` — same as existing modules |
| OIDC Provider | Mock object with `interactionDetails`, `interactionFinished` |
| Nodemailer | `vi.mock('nodemailer')` — mock `createTransport` and `sendMail` |
| File system (templates) | `vi.mock('node:fs/promises')` for template loading |
| i18next | Mock or use real with test fixtures in temp dir |
| User service | `vi.mock('../users/service.js')` for route handler tests |
| Audit log | `vi.mock('../lib/audit-log.js')` — verify calls |
| System config | `vi.mock('../lib/system-config.js')` — return test defaults |
| crypto.randomBytes | `vi.spyOn` for deterministic token generation |

## Verification Checklist

- [ ] All unit tests pass
- [ ] No regressions in existing 775 tests
- [ ] All route handlers have tests for happy path and error cases
- [ ] Token management covers all 3 token tables
- [ ] Rate limiting covers allowed, exceeded, and Redis failure
- [ ] Email service covers all 5 email types
- [ ] i18n covers the full locale resolution chain
- [ ] Template engine covers org override resolution
- [ ] CSRF covers generation and verification
- [ ] Audit events verified for all auth actions
- [ ] User enumeration prevention verified (same response for existing/non-existing email)
- [ ] `yarn verify` passes with zero failures
