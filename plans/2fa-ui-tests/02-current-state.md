# Current State: 2FA UI Tests

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### Skipped Tests — 12 total across 2 files

**`tests/ui/flows/two-factor.spec.ts`** — 4 fixme tests:
1. `should render 2FA verification page after login`
2. `should authenticate with valid OTP code`
3. `should show error for invalid OTP code`
4. `should receive new OTP email after clicking resend`

**`tests/ui/flows/two-factor-edge-cases.spec.ts`** — 8 fixme tests:
1. `invalid OTP code shows error and allows retry`
2. `expired OTP code shows error with resend option`
3. `invalid TOTP code shows error`
4. `invalid recovery code shows error`
5. `TOTP setup page renders QR code image`
6. `invalid TOTP setup confirmation code shows error`
7. `2FA verify page shows method-appropriate UI for email OTP`
8. `resend OTP code button works`

### Why They're Skipped

The tests use `beforeAll` hooks that run SQL `UPDATE` + Redis cache invalidation from the Playwright worker process to enable 2FA for test users. But the server runs in the global-setup process with its own connection pool and 60-second in-memory cache. The server never sees the DB changes made by the worker.

### What Already Works

- OTP extraction from emails: `extractOtpCode()` function exists in `two-factor.spec.ts`
- MailHog fixture: `mailCapture` with `waitForEmail()`, `extractLink()` methods
- DB helpers fixture: direct SQL access from worker process
- Test user creation: `createFullTestTenant()` in global-setup
- 2FA module: complete implementation with email OTP, TOTP, recovery codes

### Relevant Files

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `tests/ui/setup/global-setup.ts` | Seeds test data | Add 2FA user seeding |
| `tests/ui/fixtures/test-fixtures.ts` | TestData interface | Add 2FA fields |
| `tests/ui/flows/two-factor.spec.ts` | 4 fixme tests | Remove fixme, use seeded users |
| `tests/ui/flows/two-factor-edge-cases.spec.ts` | 8 fixme tests | Remove fixme, use seeded users |
| `src/two-factor/service.ts` | 2FA service | Used for seeding (no changes) |
| `src/two-factor/totp.ts` | TOTP generation | Used for seeding (no changes) |
| `src/two-factor/otp.ts` | Email OTP | Server-side (no changes) |
| `src/two-factor/recovery.ts` | Recovery codes | Used for seeding (no changes) |

## Gaps Identified

### Gap 1: No 2FA-Enabled Users in Seed Data

**Current Behavior:** All seeded test users have `two_factor_enabled=false`
**Required Behavior:** Need at least 2 users: one with email OTP, one with TOTP
**Fix Required:** Add 2FA user creation in `global-setup.ts` using real service modules

### Gap 2: No TOTP Helper in Test Fixtures

**Current Behavior:** No way to generate valid TOTP codes in tests
**Required Behavior:** Test fixtures need a `generateTotpCode(secret)` helper
**Fix Required:** Add helper using the `otpauth` library (already a project dependency)

### Gap 3: Test Fixtures Missing 2FA Data

**Current Behavior:** `TestData` interface has no 2FA-related fields
**Required Behavior:** Need `twoFactorEmailUser`, `twoFactorTotpUser`, `totpSecret`, `recoveryCodes`
**Fix Required:** Extend `TestData` and populate from env vars set during global-setup

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| TOTP timing sensitivity | Low | Med | Use ±1 step window (already configured) |
| MailHog email delay | Low | Med | Existing 10s polling timeout |
| Encryption key missing | Low | High | Set `TWO_FACTOR_ENCRYPTION_KEY` in test env |
