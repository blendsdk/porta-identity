# TOTP & Recovery Codes

> **Document**: 06-totp-recovery.md
> **Parent**: [Index](00-index.md)

## TOTP Enrollment Flow

1. User navigates to setup page (during login if org requires, or via future self-service)
2. Server generates 20-byte base32 TOTP secret
3. Secret encrypted with AES-256-GCM, stored in `user_totp` table (verified=false)
4. Server generates `otpauth://` URI and QR code data URI
5. Page displays QR code + manual secret entry option
6. User scans QR, enters 6-digit code from authenticator app
7. Server verifies code → marks TOTP as verified, enables 2FA on user
8. Server generates 10 recovery codes, hashes with Argon2id, stores in DB
9. Page displays recovery codes once — user must save them

## TOTP Verification Flow

1. User completes password login
2. Server detects user has TOTP enabled → redirects to 2FA challenge
3. User enters 6-digit code from authenticator app
4. Server decrypts TOTP secret from DB, verifies with ±1 step window
5. On success → `interactionFinished()` (login complete)
6. On failure → re-render with error, increment rate limit counter

## Recovery Code Flow

1. On 2FA challenge page, user clicks "Use recovery code"
2. User enters one of their 10 recovery codes (XXXX-XXXX format)
3. Server iterates unused recovery codes, verifies with Argon2id
4. On match → mark code as used (`used_at = now()`), complete login
5. Warn user if remaining codes ≤ 3

## AES-256-GCM Encryption Details

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function encrypt(plaintext: string, keyHex: string) {
  const key = Buffer.from(keyHex, 'hex'); // 32 bytes
  const iv = randomBytes(12);              // 96-bit IV for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return { encrypted, iv: iv.toString('hex'), tag };
}

function decrypt(encrypted: string, ivHex: string, tagHex: string, keyHex: string) {
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

## Recovery Code Format

- 10 codes per user, generated during 2FA setup
- Format: `XXXX-XXXX` (8 alphanumeric chars, uppercase)
- Each code hashed individually with Argon2id before storage
- Single-use: `used_at` set on consumption
- Regeneration: deletes all old codes, generates new set
