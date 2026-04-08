# RD-12: Two-Factor Authentication (2FA)

> **Document**: RD-12-two-factor-authentication.md
> **Status**: Draft
> **Created**: 2026-04-08
> **Project**: Porta v5 — OIDC Provider
> **Depends On**: RD-02 (Database Schema), RD-04 (Organizations), RD-06 (Users), RD-07 (Auth Workflows)

---

## Feature Overview

Add two-factor authentication (2FA) support with two methods: **Email OTP** (6-digit code sent via email) and **TOTP** (authenticator app — Google Authenticator, Microsoft Authenticator, Authy, etc.). 2FA is configurable per organization via a `two_factor_policy` and per user. Includes enrollment flows, challenge flows during login, recovery codes, and admin management.

### 2FA Methods

| Method | How it works | Best for |
|--------|-------------|----------|
| **None** | No 2FA — password or magic link only | Low-security contexts |
| **Email OTP** | 6-digit code emailed after password login | Users without authenticator apps |
| **TOTP** | 6-digit code from authenticator app (RFC 6238) | Highest security |

### Organization 2FA Policy

| Policy | Behavior |
|--------|----------|
| `optional` (default) | Users can enable 2FA themselves; not required |
| `required_email` | All users must use email OTP; enforced on next login |
| `required_totp` | All users must use TOTP; enforced on next login |
| `required_any` | All users must have 2FA (email or TOTP — their choice) |

---

## Functional Requirements

### Must Have — Email OTP

- [ ] After password verification, send 6-digit numeric code to user's email
- [ ] Code is valid for 10 minutes (configurable via `system_config.email_otp_ttl`)
- [ ] Code stored as SHA-256 hash in `email_otp_codes` table
- [ ] Code is single-use (marked `used_at` after successful verification)
- [ ] Maximum 3 active codes per user (older codes invalidated when new one sent)
- [ ] "Resend code" button on challenge page (rate limited)
- [ ] Challenge page shows masked email (e.g., `j***@example.com`)

### Must Have — TOTP (Authenticator App)

- [ ] TOTP implementation per RFC 6238 using `otpauth` library
- [ ] 30-second time step, 6-digit codes, SHA-1 algorithm (standard TOTP defaults)
- [ ] TOTP secret generated as 20-byte random value, base32-encoded
- [ ] TOTP secret encrypted at rest (AES-256-GCM using `ENCRYPTION_KEY` env var)
- [ ] QR code generation for authenticator app enrollment (using `qrcode` library)
- [ ] QR code contains `otpauth://totp/{issuer}:{email}?secret={base32}&issuer={issuer}` URI
- [ ] Issuer = organization name (e.g., "Acme Corp")
- [ ] Manual entry option: show base32 secret as text for users who can't scan QR
- [ ] Time window tolerance: accept codes from 1 step before and after current (±30 sec)

### Must Have — Recovery Codes

- [ ] Generate 10 recovery codes during TOTP enrollment
- [ ] Recovery codes: 8-character alphanumeric (e.g., `A3B7-K9M2`)
- [ ] Codes stored as bcrypt hashes (not SHA-256 — low entropy, need brute-force resistance)
- [ ] Codes displayed once during setup; user must save them
- [ ] Each code is single-use
- [ ] Recovery code login: shown as option on TOTP challenge page ("Use a recovery code")
- [ ] When all recovery codes used → force user to re-enroll TOTP and generate new codes
- [ ] Admin can regenerate recovery codes for a user (invalidates old ones)

### Must Have — 2FA Enrollment Flow

- [ ] Self-service 2FA setup page accessible from user profile (future UI) or via forced enrollment
- [ ] **Email OTP enrollment:** Enable with one click (uses existing verified email)
- [ ] **TOTP enrollment:**
  1. Generate secret → show QR code + manual code
  2. User scans QR with authenticator app
  3. User enters verification code from app (proves setup worked)
  4. Only after successful verification → mark TOTP as active
  5. Show 10 recovery codes (user must acknowledge they've saved them)
- [ ] Enrollment page accessible during login flow when org policy requires 2FA and user hasn't set it up

### Must Have — 2FA Challenge During Login

- [ ] 2FA challenge occurs AFTER successful password verification, BEFORE `interactionFinished()`
- [ ] Challenge type determined by user's `two_factor_method`:
  - `email` → send OTP code, show code input page
  - `totp` → show code input page (no email sent)
- [ ] Login flow with 2FA:
  ```
  Password verification → 2FA challenge → interactionFinished() → OIDC flow continues
  ```
- [ ] If user has no 2FA but org requires it → redirect to 2FA enrollment page first
- [ ] Magic link logins skip 2FA (magic link is already a second factor via email possession)

### Must Have — Organization Policy Enforcement

- [ ] `two_factor_policy` column on `organizations` table (default: `optional`)
- [ ] When policy is `required_*` and user has no 2FA:
  1. After password login → redirect to 2FA setup page
  2. User must complete setup before accessing any application
  3. Cannot skip or dismiss the setup
- [ ] Policy change from `optional` to `required_*` → existing users prompted on next login
- [ ] Policy change from `required_*` to `optional` → no change to users who already have 2FA

### Must Have — Rate Limiting

- [ ] Rate limit on OTP verification attempts: 5 attempts per 15 minutes
- [ ] Rate limit on "resend code" requests: 3 per 15 minutes
- [ ] After rate limit exceeded → show friendly error with retry-after time
- [ ] Rate limit keys:
  ```
  ratelimit:2fa:verify:{org_id}:{user_id}
  ratelimit:2fa:resend:{org_id}:{user_id}
  ```

### Should Have

- [ ] "Remember this device" option (skip 2FA for 30 days on trusted device via cookie)
- [ ] 2FA status shown on user list/detail in CLI
- [ ] Audit log for all 2FA events
- [ ] Configurable TOTP issuer name per organization

### Won't Have (Out of Scope)

- SMS-based OTP
- Hardware security keys (WebAuthn/FIDO2)
- Push notification-based approval
- Biometric authentication

---

## Technical Requirements

### Database Tables

#### `user_2fa_settings`

```sql
CREATE TABLE user_2fa_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method          VARCHAR(20) NOT NULL DEFAULT 'none',  -- 'none', 'email', 'totp'
  enabled_at      TIMESTAMPTZ,                          -- When 2FA was activated
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_user_2fa UNIQUE (user_id),
  CONSTRAINT chk_2fa_method CHECK (method IN ('none', 'email', 'totp'))
);
```

#### `totp_secrets`

```sql
CREATE TABLE totp_secrets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_secret TEXT NOT NULL,                        -- AES-256-GCM encrypted base32 secret
  iv              TEXT NOT NULL,                          -- Initialization vector for AES
  auth_tag        TEXT NOT NULL,                          -- Authentication tag for AES-GCM
  verified        BOOLEAN NOT NULL DEFAULT FALSE,        -- User completed enrollment?
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_totp_user UNIQUE (user_id)
);
```

#### `totp_recovery_codes`

```sql
CREATE TABLE totp_recovery_codes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash       TEXT NOT NULL,                          -- bcrypt hash of recovery code
  used_at         TIMESTAMPTZ,                            -- NULL = available, set = used
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recovery_codes_user ON totp_recovery_codes(user_id) WHERE used_at IS NULL;
```

#### `email_otp_codes`

```sql
CREATE TABLE email_otp_codes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash       VARCHAR(64) NOT NULL,                   -- SHA-256 hash of 6-digit code
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,                            -- NULL = pending, set = used
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_otp_user ON email_otp_codes(user_id) WHERE used_at IS NULL;
```

### Organization Table Update

```sql
ALTER TABLE organizations ADD COLUMN two_factor_policy VARCHAR(20) NOT NULL DEFAULT 'optional';
ALTER TABLE organizations ADD CONSTRAINT chk_2fa_policy
  CHECK (two_factor_policy IN ('optional', 'required_email', 'required_totp', 'required_any'));
```

### TOTP Secret Encryption

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function encryptSecret(plaintext: string, encryptionKey: Buffer): EncryptedData {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');
  return {
    encrypted,
    iv: iv.toString('base64'),
    authTag,
  };
}

function decryptSecret(data: EncryptedData, encryptionKey: Buffer): string {
  const decipher = createDecipheriv(ALGORITHM, encryptionKey, Buffer.from(data.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(data.authTag, 'base64'));
  let decrypted = decipher.update(data.encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

### TOTP Service

```typescript
import * as OTPAuth from 'otpauth';

interface TotpService {
  generateSecret(user: User, org: Organization): Promise<TotpSetupData>;
  verifyCode(userId: string, code: string): Promise<boolean>;
  verifyRecoveryCode(userId: string, code: string): Promise<boolean>;
  generateRecoveryCodes(userId: string): Promise<string[]>;
  disable(userId: string): Promise<void>;
}

interface TotpSetupData {
  secret: string;           // Base32 encoded (for manual entry)
  qrCodeDataUrl: string;    // Data URL for QR code image
  uri: string;              // otpauth:// URI
}

// TOTP generation
function createTotp(secret: string, issuer: string, email: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

// Verification with ±1 time step tolerance
function verifyTotp(totp: OTPAuth.TOTP, token: string): boolean {
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}
```

### Email OTP Service

```typescript
interface EmailOtpService {
  sendCode(user: User, org: Organization, locale: string): Promise<void>;
  verifyCode(userId: string, code: string): Promise<boolean>;
  invalidatePending(userId: string): Promise<void>;
}

function generateOtpCode(): { plaintext: string; hash: string } {
  // Generate 6-digit numeric code
  const code = crypto.randomInt(100000, 999999).toString();
  const hash = crypto.createHash('sha256').update(code).digest('hex');
  return { plaintext: code, hash };
}
```

### Recovery Code Generation

```typescript
function generateRecoveryCodes(count: number = 10): string[] {
  const codes: string[] = [];
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No 0/O/1/I confusion
  for (let i = 0; i < count; i++) {
    let code = '';
    for (let j = 0; j < 8; j++) {
      code += chars[crypto.randomInt(chars.length)];
    }
    // Format as XXXX-XXXX
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}
```

### Login Flow With 2FA

```
1. User enters email + password on login page
2. Password verification (existing flow from RD-07)
3. If password valid:
   a. Check user's 2FA settings (user_2fa_settings.method)
   b. If method = 'none':
      i.  Check org's two_factor_policy
      ii. If 'optional' → complete login (interactionFinished)
      iii. If 'required_*' → redirect to 2FA enrollment page
   c. If method = 'email':
      i.  Generate 6-digit code, store hash, send email
      ii. Redirect to /interaction/:uid/2fa/email (code input page)
   d. If method = 'totp':
      i.  Redirect to /interaction/:uid/2fa/totp (code input page)
4. User enters code on challenge page
5. Verify code:
   a. If valid → complete login (interactionFinished)
   b. If invalid → show error, increment rate limit counter
```

### Interaction Routes (2FA additions)

```typescript
// 2FA challenge pages
router.get('/interaction/:uid/2fa/email', twoFactorController.showEmailChallenge);
router.post('/interaction/:uid/2fa/email', twoFactorController.verifyEmailCode);
router.post('/interaction/:uid/2fa/email/resend', twoFactorController.resendEmailCode);
router.get('/interaction/:uid/2fa/totp', twoFactorController.showTotpChallenge);
router.post('/interaction/:uid/2fa/totp', twoFactorController.verifyTotpCode);

// Recovery code
router.get('/interaction/:uid/2fa/recovery', twoFactorController.showRecoveryChallenge);
router.post('/interaction/:uid/2fa/recovery', twoFactorController.verifyRecoveryCode);

// 2FA enrollment (forced by org policy or self-service)
router.get('/interaction/:uid/2fa/setup', twoFactorController.showSetupChoice);
router.get('/interaction/:uid/2fa/setup/email', twoFactorController.setupEmail);
router.post('/interaction/:uid/2fa/setup/email', twoFactorController.confirmSetupEmail);
router.get('/interaction/:uid/2fa/setup/totp', twoFactorController.showSetupTotp);
router.post('/interaction/:uid/2fa/setup/totp/verify', twoFactorController.verifySetupTotp);
router.get('/interaction/:uid/2fa/setup/recovery-codes', twoFactorController.showRecoveryCodes);
router.post('/interaction/:uid/2fa/setup/recovery-codes/confirm', twoFactorController.confirmRecoveryCodes);
```

### Template Pages (2FA additions)

```
templates/default/pages/
├── 2fa-email-challenge.hbs         # Enter email OTP code
├── 2fa-totp-challenge.hbs          # Enter authenticator code
├── 2fa-recovery-challenge.hbs      # Enter recovery code
├── 2fa-setup-choice.hbs            # Choose 2FA method (email or TOTP)
├── 2fa-setup-email.hbs             # Confirm email OTP enrollment
├── 2fa-setup-totp.hbs              # QR code + manual secret + verification code
├── 2fa-setup-recovery-codes.hbs    # Display 10 recovery codes (save them!)
└── 2fa-setup-complete.hbs          # 2FA setup success
```

### Email Templates (2FA additions)

```
templates/default/emails/
├── email-otp.hbs                   # "Your verification code is: 123456" (HTML)
└── email-otp.txt.hbs               # Plaintext version
```

### i18n Translations (2FA additions)

```
locales/default/en/
├── 2fa-challenge.json              # Challenge page translations
├── 2fa-setup.json                  # Setup page translations
└── 2fa-recovery.json               # Recovery code translations
```

### System Configuration Keys

| Config Key | Default | Description |
|-----------|---------|-------------|
| `email_otp_ttl` | 600 | Email OTP code validity in seconds (10 min) |
| `email_otp_max_active` | 3 | Max active codes per user |
| `totp_window` | 1 | TOTP time step tolerance (±1 = 90 sec window) |
| `recovery_code_count` | 10 | Number of recovery codes generated |
| `rate_limit_2fa_verify_max` | 5 | Max 2FA verification attempts per window |
| `rate_limit_2fa_verify_window` | 900 | 2FA verify window in seconds (15 min) |
| `rate_limit_2fa_resend_max` | 3 | Max "resend code" requests per window |
| `rate_limit_2fa_resend_window` | 900 | Resend window in seconds |

### Audit Events

| Event | Event Type | Category |
|-------|-----------|----------|
| Email OTP sent | `user.2fa.email_otp.sent` | `authentication` |
| Email OTP verified | `user.2fa.email_otp.verified` | `authentication` |
| Email OTP failed | `user.2fa.email_otp.failed` | `security` |
| TOTP verified | `user.2fa.totp.verified` | `authentication` |
| TOTP failed | `user.2fa.totp.failed` | `security` |
| Recovery code used | `user.2fa.recovery.used` | `security` |
| Recovery code failed | `user.2fa.recovery.failed` | `security` |
| 2FA enrolled (email) | `user.2fa.enrolled.email` | `admin` |
| 2FA enrolled (TOTP) | `user.2fa.enrolled.totp` | `admin` |
| 2FA disabled | `user.2fa.disabled` | `admin` |
| 2FA reset by admin | `user.2fa.admin_reset` | `admin` |
| Recovery codes regenerated | `user.2fa.recovery.regenerated` | `admin` |
| Org 2FA policy changed | `org.2fa_policy.changed` | `admin` |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ENCRYPTION_KEY` | Yes (if TOTP used) | 32-byte hex key for AES-256-GCM TOTP secret encryption |

---

## Integration Points

### With RD-02 (Database Schema)
- 4 new tables: `user_2fa_settings`, `totp_secrets`, `totp_recovery_codes`, `email_otp_codes`
- 1 column added to `organizations`: `two_factor_policy`

### With RD-04 (Organizations)
- `two_factor_policy` field on organization
- CLI/API to update org 2FA policy

### With RD-06 (Users)
- 2FA settings linked to user via `user_2fa_settings`
- User show/detail includes 2FA status

### With RD-07 (Auth Workflows)
- 2FA challenge inserted between password verification and `interactionFinished()`
- New interaction pages for challenge and enrollment
- Magic link login SKIPS 2FA (email possession = second factor)
- Additional email template for OTP codes

### With RD-09 (CLI)
- `porta user 2fa status <id>` — show 2FA method and enrollment status
- `porta user 2fa disable <id>` — force-disable 2FA
- `porta user 2fa reset <id>` — reset (disable + invalidate recovery codes)
- `porta org update <slug> --2fa-policy <policy>` — set org 2FA policy

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| TOTP library | speakeasy, otplib, otpauth | `otpauth` | Modern, actively maintained, excellent TS support |
| QR code library | qrcode, qrcode-terminal | `qrcode` | Generates data URLs for HTML embedding |
| Secret storage | Plaintext, hashed, encrypted | AES-256-GCM encrypted | Secrets must be decryptable for verification; encryption protects at rest |
| Recovery code hash | SHA-256, bcrypt | bcrypt | Low entropy codes need brute-force resistance |
| Email OTP hash | SHA-256, bcrypt | SHA-256 | Codes are 6-digit + short-lived; SHA-256 is sufficient and fast |
| Magic link + 2FA | Require 2FA, skip 2FA | Skip 2FA | Magic link is already 2FA (email possession = second factor) |
| TOTP algorithm | SHA-1, SHA-256, SHA-512 | SHA-1 | Standard for maximum authenticator app compatibility |

---

## Acceptance Criteria

1. [ ] Email OTP: code sent after password login, valid for 10 minutes
2. [ ] Email OTP: code verification completes login flow
3. [ ] Email OTP: expired/used code rejected with clear error
4. [ ] TOTP: QR code shown during enrollment, scannable by Google Authenticator
5. [ ] TOTP: manual base32 secret shown for manual entry
6. [ ] TOTP: enrollment requires verification code before activation
7. [ ] TOTP: codes from authenticator app accepted (±30 sec tolerance)
8. [ ] Recovery codes: 10 codes generated and displayed during TOTP setup
9. [ ] Recovery codes: each code works exactly once
10. [ ] Recovery codes: when all used, user forced to re-enroll
11. [ ] Org policy `optional`: users can choose to enable/disable 2FA
12. [ ] Org policy `required_*`: users without 2FA redirected to setup on login
13. [ ] Org policy `required_any`: user can choose email or TOTP
14. [ ] Magic link login skips 2FA challenge
15. [ ] Rate limiting on OTP/TOTP verification attempts
16. [ ] Rate limiting on "resend code" requests
17. [ ] TOTP secrets encrypted at rest (AES-256-GCM)
18. [ ] `ENCRYPTION_KEY` required when TOTP is enabled
19. [ ] All 2FA events audit-logged
20. [ ] CLI: `porta user 2fa status/disable/reset` commands work
21. [ ] CLI: `porta org update --2fa-policy` works
22. [ ] 2FA challenge pages are i18n-aware and use org branding
