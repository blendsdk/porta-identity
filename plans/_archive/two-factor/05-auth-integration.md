# Auth Integration: Login Flow & Templates

> **Document**: 05-auth-integration.md
> **Parent**: [Index](00-index.md)

## Overview

Modifies the login interaction flow to insert a 2FA challenge step, adds new Handlebars pages and email template, and integrates with the email service for OTP delivery.

## Login Flow Changes (`src/routes/interactions.ts`)

### Current Flow
```
POST /interaction/:uid/login
  → CSRF → rate limit → find user → check status → verify password
  → interactionFinished(login: { accountId })
```

### New Flow (with 2FA)
```
POST /interaction/:uid/login
  → CSRF → rate limit → find user → check status → verify password
  → check if 2FA required (org policy + user state)
  → IF 2FA required:
      store pendingLogin in interaction session (userId, email)
      → redirect to GET /interaction/:uid/two-factor
  → ELSE:
      → interactionFinished(login: { accountId })
```

### New Routes

```typescript
// Show 2FA verification page
GET /:orgSlug/interaction/:uid/two-factor → showTwoFactor()
  - Reads pending login from interaction session
  - If method=email, auto-send OTP code
  - Renders two-factor-verify.hbs with method, masked email

// Verify 2FA code submission
POST /:orgSlug/interaction/:uid/two-factor → verifyTwoFactor()
  - CSRF validation
  - Rate limit check (2fa:verify:{userId})
  - Verify OTP/TOTP/recovery code
  - If valid: interactionFinished(login: { accountId })
  - If invalid: re-render with error

// Resend OTP code (email method only)
POST /:orgSlug/interaction/:uid/two-factor/resend → resendOtpCode()
  - Rate limit check (2fa:resend:{userId})
  - Check max active codes (≤3)
  - Generate + send new code
  - Redirect back to two-factor page

// 2FA Setup page (when org requires but user hasn't enrolled)
GET /:orgSlug/interaction/:uid/two-factor/setup → showTwoFactorSetup()
POST /:orgSlug/interaction/:uid/two-factor/setup → processTwoFactorSetup()
```

### Pending Login Storage

Use the OIDC interaction session to store pending 2FA state:
```typescript
// After successful password verification, before 2FA:
const interaction = await provider.interactionDetails(ctx.req, ctx.res);
await provider.interactionResult(ctx.req, ctx.res, {
  ...interaction.result,
  twoFactor: {
    pendingAccountId: user.id,
    method: determineTwoFactorMethod(org, user),
    email: user.email,
  },
}, { mergeWithLastSubmission: true });
```

## New Templates

### `templates/default/pages/two-factor-verify.hbs`

Renders the 2FA code entry form. Context variables:
- `method`: 'email' | 'totp'
- `maskedEmail`: 'u***@test.com' (email method only)
- `error`: validation error message (if any)
- `csrfToken`: CSRF token for form
- `uid`: interaction UID
- `orgSlug`: organization slug
- `showResend`: boolean (email method only)
- `showRecoveryLink`: boolean

### `templates/default/pages/two-factor-setup.hbs`

Renders the TOTP enrollment page. Context variables:
- `method`: 'totp'
- `qrCodeDataUri`: QR code image (data URI)
- `totpSecret`: base32 secret for manual entry
- `csrfToken`: CSRF token
- `uid`: interaction UID
- `orgSlug`: organization slug

### `templates/default/emails/otp-code.hbs`

Email template for OTP code delivery:
- Subject: "Your verification code"
- Body: 6-digit code, expiry notice (10 min), org name

### `locales/default/en/two-factor.json`

i18n strings for 2FA pages and emails.

## Email Service Changes (`src/auth/email-service.ts`)

Add new function following existing pattern:
```typescript
export async function sendOtpCodeEmail(
  to: string,
  code: string,
  orgName: string,
  locale?: string,
): Promise<void>;
```

## Rate Limiting

New rate limit keys:
- `2fa:verify:{userId}` — 5 attempts per 5 min
- `2fa:resend:{userId}` — 3 resends per 5 min

## Config Changes (`src/config/schema.ts`)

Add to config schema:
```typescript
TWO_FACTOR_ENCRYPTION_KEY: z.string().length(64).optional(),
// 32 bytes hex-encoded, required when TOTP is used
```
