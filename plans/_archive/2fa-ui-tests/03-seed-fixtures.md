# Seed & Fixtures: 2FA UI Tests

> **Document**: 03-seed-fixtures.md
> **Parent**: [Index](00-index.md)

## Overview

Seed 2FA-enabled test users during `global-setup.ts` using real service modules, and extend test fixtures with 2FA data and helpers.

## Global Setup Changes

### New Seed Users

After existing user creation in `global-setup.ts`, add:

1. **Email OTP User** — `ui-test-2fa-email@test.local`
   - Create user with password (same as other test users)
   - Enable email OTP 2FA via service: `two_factor_enabled=true, two_factor_method='email'`

2. **TOTP User** — `ui-test-2fa-totp@test.local`
   - Create user with password
   - Enable TOTP 2FA via service
   - Capture plaintext TOTP secret before encryption
   - Generate recovery codes, capture plaintext values

### Seed Implementation

```typescript
// In global-setup.ts, after existing user creation:

// 1. Create email OTP 2FA user
const twoFaEmailUser = await createUser(pool, {
  orgId, email: 'ui-test-2fa-email@test.local', password: testPassword
});
// Enable 2FA via direct SQL (we're in the server process)
await pool.query(
  `UPDATE users SET two_factor_enabled = true, two_factor_method = 'email' WHERE id = $1`,
  [twoFaEmailUser.id]
);

// 2. Create TOTP 2FA user  
const twoFaTotpUser = await createUser(pool, {
  orgId, email: 'ui-test-2fa-totp@test.local', password: testPassword
});
// Generate TOTP secret, encrypt, store
const totpSecret = generateTotpSecret(); // from src/two-factor/totp.ts
const { encrypted, iv, tag } = encryptSecret(totpSecret); // from src/two-factor/crypto.ts
await pool.query(
  `INSERT INTO user_totp (id, user_id, encrypted_secret, encryption_iv, encryption_tag, verified)
   VALUES (gen_random_uuid(), $1, $2, $3, $4, true)`,
  [twoFaTotpUser.id, encrypted, iv, tag]
);
await pool.query(
  `UPDATE users SET two_factor_enabled = true, two_factor_method = 'totp' WHERE id = $1`,
  [twoFaTotpUser.id]
);

// 3. Generate recovery codes
const { codes, hashedCodes } = await generateRecoveryCodes();
for (const hashed of hashedCodes) {
  await pool.query(
    `INSERT INTO two_factor_recovery_codes (id, user_id, code_hash) VALUES (gen_random_uuid(), $1, $2)`,
    [twoFaTotpUser.id, hashed]
  );
}

// 4. Export to env vars for test fixtures
process.env.UI_TEST_2FA_EMAIL_USER = 'ui-test-2fa-email@test.local';
process.env.UI_TEST_2FA_TOTP_USER = 'ui-test-2fa-totp@test.local';
process.env.UI_TEST_TOTP_SECRET = totpSecret;
process.env.UI_TEST_RECOVERY_CODES = JSON.stringify(codes);
```

## Test Fixture Changes

### TestData Interface Extension

```typescript
interface TestData {
  // ... existing fields ...
  twoFactorEmailUser: string;  // email of 2FA email OTP user
  twoFactorTotpUser: string;   // email of 2FA TOTP user
  totpSecret: string;          // plaintext TOTP secret for code generation
  recoveryCodes: string[];     // plaintext recovery codes
}
```

### TOTP Code Generation Helper

```typescript
// tests/ui/fixtures/totp-helper.ts
import { TOTP } from 'otpauth';

export function generateTotpCode(secret: string): string {
  const totp = new TOTP({
    secret,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  return totp.generate();
}
```

### OTP Extraction Helper (shared)

Move the existing `extractOtpCode()` from `two-factor.spec.ts` to a shared helper:

```typescript
// tests/ui/fixtures/otp-helper.ts
export function extractOtpCode(message: { subject: string; body: string }): string | null {
  const subjectMatch = message.subject.match(/verification code:\s*(\d+)/i);
  if (subjectMatch) return subjectMatch[1];
  const bodyMatch = message.body.match(/\b(\d{6})\b/);
  return bodyMatch ? bodyMatch[1] : null;
}
```

## Error Handling

| Error Case | Handling Strategy |
|------------|-------------------|
| Encryption key not set | Fail fast in global-setup with clear error message |
| TOTP code timing mismatch | otpauth library uses ±1 step window (30s tolerance) |
| MailHog email not received | Existing 10s polling timeout with clear failure |
| Recovery code already used | Each test uses a different code from the array |
