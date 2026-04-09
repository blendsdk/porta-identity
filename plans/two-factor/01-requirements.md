# Requirements: Two-Factor Authentication

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-12](../../requirements/RD-12-two-factor-authentication.md)

## Feature Overview

Add two-factor authentication to Porta v5 with Email OTP and TOTP methods, configurable per organization, with recovery codes and admin management.

## Functional Requirements

### Must Have

- [ ] Email OTP: 6-digit code via email after password login, valid 10 min, SHA-256 hashed, single-use
- [ ] Email OTP: Max 3 active codes per user, resend with rate limiting, masked email display
- [ ] TOTP: RFC 6238 via `otpauth`, 30-sec step, 6-digit SHA-1, 20-byte base32 secret
- [ ] TOTP: AES-256-GCM encrypted at rest, QR code via `qrcode`, manual entry fallback
- [ ] TOTP: ±1 step time window tolerance (±30 sec)
- [ ] Recovery codes: 10 codes, 8-char alphanumeric `XXXX-XXXX`, Argon2id hashed, single-use
- [ ] Recovery codes: Displayed once during setup, regeneration invalidates old codes
- [ ] Per-org `two_factor_policy`: `optional`, `required_email`, `required_totp`, `required_any`
- [ ] Per-user 2FA state: `two_factor_enabled`, `two_factor_method` on users table
- [ ] Login flow: After password verification → 2FA challenge → consent → token
- [ ] Setup flow: Enrollment pages for Email OTP and TOTP with recovery code display
- [ ] Migration: New `user_two_factor`, `two_factor_otp_codes`, `two_factor_recovery_codes` tables
- [ ] Migration: Add `two_factor_policy` column to `organizations` table
- [ ] Migration: Add `two_factor_enabled`, `two_factor_method` columns to `users` table
- [ ] CLI: `porta user 2fa status/disable/reset` commands (replace existing stubs)
- [ ] Config: `TWO_FACTOR_ENCRYPTION_KEY` env var for TOTP secret encryption

### Should Have

- [ ] Graceful enrollment: If org requires 2FA and user hasn't set up, redirect to setup during login
- [ ] Rate limiting on OTP verification attempts (prevent brute force of 6-digit codes)
- [ ] Audit logging for 2FA events (enable, disable, verify, recovery code use)

### Won't Have (Out of Scope)

- SMS/phone-based OTP (cost/complexity, not in RD-12)
- WebAuthn/FIDO2/passkeys (future RD)
- Per-application 2FA policies (org-level only)
- Admin portal UI (CLI-only admin management)

## Technical Requirements

### Security

- TOTP secrets encrypted with AES-256-GCM (32-byte key from env var)
- Email OTP codes SHA-256 hashed before storage (same pattern as magic link tokens)
- Recovery codes Argon2id hashed (same pattern as passwords)
- Rate limiting on OTP/TOTP verification (5 attempts per 5 min)
- Replay detection: each code can only be used once

### Performance

- 2FA verification adds <200ms to login flow
- TOTP validation is CPU-bound (HMAC-SHA1) — negligible
- Email OTP relies on existing email infrastructure

## Acceptance Criteria

1. [ ] Email OTP flow works: login → email sent → code entered → authenticated
2. [ ] TOTP flow works: setup QR → scan → code entered → authenticated
3. [ ] Recovery code flow works: enter recovery code → authenticated → code consumed
4. [ ] Org policy `required_totp` forces TOTP setup on first login
5. [ ] Org policy `optional` allows users to skip 2FA
6. [ ] Rate limiting prevents OTP brute force (6-digit = 1M possibilities)
7. [ ] TOTP secrets are encrypted at rest (not plaintext in DB)
8. [ ] Recovery codes are hashed (not plaintext in DB)
9. [ ] CLI `porta user 2fa status` shows 2FA state
10. [ ] CLI `porta user 2fa disable` removes 2FA for a user
11. [ ] CLI `porta user 2fa reset` regenerates recovery codes
12. [ ] All existing tests still pass (no regressions)
13. [ ] New unit tests for 2FA module (≥90% coverage)
14. [ ] New integration tests for 2FA database operations
15. [ ] Migration runs cleanly on existing data
