# Test Implementation: 2FA UI Tests

> **Document**: 04-test-fixes.md
> **Parent**: [Index](00-index.md)

## Overview

Remove `test.fixme()` from all 12 skipped 2FA tests and update them to use seeded 2FA users, real MailHog OTP capture, real TOTP code generation, and real recovery codes.

## two-factor.spec.ts — 4 Tests

### Test 1: Render 2FA verification page after login
- Login with `twoFactorEmailUser` + password
- After login, server should redirect to 2FA verify page (not callback)
- Assert: 2FA verify page is shown with OTP input field

### Test 2: Authenticate with valid OTP code
- Login with `twoFactorEmailUser` + password → 2FA verify page
- Wait for OTP email in MailHog → extract 6-digit code
- Enter code in OTP input → submit
- Assert: redirected to consent/callback (auth flow completes)

### Test 3: Show error for invalid OTP code
- Login with `twoFactorEmailUser` + password → 2FA verify page
- Enter wrong code (e.g., "000000")
- Assert: error message shown, still on 2FA page

### Test 4: Resend OTP email
- Login with `twoFactorEmailUser` + password → 2FA verify page
- Click "Resend" button
- Wait for new email in MailHog
- Assert: new email received with new OTP code

## two-factor-edge-cases.spec.ts — 8 Tests

### Tests 9.1–9.2: Invalid/expired OTP
- Same pattern as tests 3–4 above, with additional edge cases
- Invalid: enter wrong code, verify error + retry
- Expired: may need to wait or mock — possibly mark as longer timeout

### Tests 9.3–9.4: Invalid TOTP / Invalid recovery code
- Login with `twoFactorTotpUser` → TOTP verify page
- Enter wrong TOTP code → verify error
- Switch to recovery code mode → enter wrong code → verify error

### Tests 9.5–9.6: TOTP setup
- These require a user WITHOUT TOTP but with org policy `required_totp`
- Need to seed a third user with org policy `required_totp` but no TOTP configured
- On login, server should redirect to TOTP setup page
- Verify QR code renders, verify invalid setup code shows error

### Tests 9.7–9.8: Method-appropriate UI + resend
- Login with email OTP user → verify page shows email-specific UI
- Resend button works, new email arrives

## Changes Required Per File

### two-factor.spec.ts
1. Remove `beforeAll` hook that does SQL UPDATE
2. Remove `test.fixme()` from all 4 tests → `test()`
3. Use `testData.twoFactorEmailUser` instead of `testData.userEmail`
4. Use `mailCapture.waitForEmail()` to capture OTP
5. Use shared `extractOtpCode()` helper

### two-factor-edge-cases.spec.ts
1. Remove `test.fixme()` from all 8 tests → `test()`
2. Use `testData.twoFactorEmailUser` for email OTP tests
3. Use `testData.twoFactorTotpUser` + `generateTotpCode(testData.totpSecret)` for TOTP tests
4. Use `testData.recoveryCodes[0]` for recovery code test
5. For TOTP setup tests (9.5–9.6): use a separate user with `required_totp` org policy

## Test Data Dependencies

| Test | User | 2FA Method | Data Needed |
|------|------|-----------|-------------|
| OTP tests (1,2,3,4,9.1,9.2,9.7,9.8) | twoFactorEmailUser | email | MailHog access |
| TOTP tests (9.3) | twoFactorTotpUser | totp | totpSecret |
| Recovery test (9.4) | twoFactorTotpUser | totp | recoveryCodes |
| TOTP setup tests (9.5,9.6) | new user | none (org requires totp) | org with required_totp policy |
