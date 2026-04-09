# Current State: Two-Factor Authentication

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

Porta v5 currently has no 2FA support. The login flow goes directly from password verification to OIDC consent/token issuance. The CLI has **stub** 2FA commands (`porta user 2fa status/disable/reset`) that print "not yet implemented" warnings.

### Relevant Files

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `migrations/005_users.sql` | Users table | Add `two_factor_enabled`, `two_factor_method` columns |
| `migrations/002_organizations.sql` | Organizations table | Add `two_factor_policy` column |
| `src/organizations/types.ts` | Org types | Add `twoFactorPolicy` to `Organization` type |
| `src/organizations/repository.ts` | Org CRUD | Handle new `two_factor_policy` column in queries |
| `src/users/types.ts` | User types | Add `twoFactorEnabled`, `twoFactorMethod` fields |
| `src/users/repository.ts` | User CRUD | Handle new columns in queries |
| `src/routes/interactions.ts` | Login/consent flow | Insert 2FA challenge between login and consent |
| `src/auth/email-service.ts` | Email sending | Add `sendOtpCode()` for Email OTP |
| `src/auth/email-renderer.ts` | Email rendering | Render OTP email template |
| `src/auth/template-engine.ts` | Page rendering | Render 2FA setup/verify pages |
| `src/auth/rate-limiter.ts` | Rate limiting | Add 2FA rate limit keys |
| `src/cli/commands/user.ts` | User CLI | Replace 2FA stubs with real implementations |
| `src/config/schema.ts` | Config validation | Add `TWO_FACTOR_ENCRYPTION_KEY` |
| `src/oidc/account-finder.ts` | OIDC claims | No changes needed (2FA is auth-level, not claims) |

### Code Analysis

#### Login Flow (src/routes/interactions.ts — processLogin)

Current flow:
1. CSRF validation
2. Rate limit check
3. User lookup by org + email
4. Status check (inactive/suspended/locked)
5. Password verification (Argon2id)
6. **Directly calls** `interactionFinished(ctx, uid, { login: { accountId } })`
7. OIDC provider issues token

**2FA injection point**: After step 5 (password verified), before step 6 (interactionFinished). If user has 2FA enabled or org requires it, redirect to `/interaction/:uid/two-factor` instead of finishing the interaction.

#### Organization Types (src/organizations/types.ts)

Current `Organization` interface has: `id`, `name`, `slug`, `status`, `parentOrganizationId`, `settings`, `brandingLogoUrl`, `brandingPrimaryColor`, `createdAt`, `updatedAt`. No `twoFactorPolicy` field.

The `OrganizationRow` maps DB columns to the interface via `mapRowToOrganization()`.

#### User Types (src/users/types.ts)

Current `User` interface has many OIDC standard claim fields but no 2FA fields. The `UserRow` maps DB columns via `mapRowToUser()`.

#### CLI Stubs (src/cli/commands/user.ts — lines 540-574)

Existing stub:
```typescript
const twoFaCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: '2fa <action>',
  describe: 'Manage two-factor authentication',
  builder: (yargs) => yargs
    .command('status', 'Show 2FA status', {}, async (argv) => { warn('not yet implemented'); })
    .command('disable', 'Disable 2FA', {}, async (argv) => { warn('not yet implemented'); })
    .command('reset', 'Reset recovery codes', {}, async (argv) => { warn('not yet implemented'); }),
  handler: () => {},
};
```

#### Email Service (src/auth/email-service.ts)

Has `sendMagicLinkEmail()`, `sendPasswordResetEmail()`, `sendInvitationEmail()`. Pattern: render template → send via transport. Same pattern for `sendOtpCode()`.

#### Template Engine (src/auth/template-engine.ts)

`renderPage(templateName, data, locale?)` — loads from `templates/default/pages/`. Adding `two-factor-setup.hbs` and `two-factor-verify.hbs` follows the existing pattern.

## Gaps Identified

### Gap 1: No 2FA Database Tables

**Current**: No tables for TOTP secrets, OTP codes, or recovery codes.
**Required**: `user_two_factor` (TOTP config), `two_factor_otp_codes` (email OTP), `two_factor_recovery_codes`.
**Fix**: Migration 012.

### Gap 2: No Organization 2FA Policy

**Current**: Organizations have no `two_factor_policy` field.
**Required**: `optional` | `required_email` | `required_totp` | `required_any`.
**Fix**: ALTER TABLE + type/repository updates.

### Gap 3: No User 2FA State

**Current**: Users have no `two_factor_enabled` or `two_factor_method` fields.
**Required**: Boolean flag + method enum on users table.
**Fix**: ALTER TABLE + type/repository updates.

### Gap 4: No 2FA Challenge in Login Flow

**Current**: Login goes directly to interactionFinished.
**Required**: Insert 2FA challenge step between password verification and consent.
**Fix**: Modify processLogin in interactions.ts + add new routes.

### Gap 5: No TOTP/OTP Libraries

**Current**: No `otpauth` or `qrcode` dependencies.
**Required**: TOTP generation/verification and QR code rendering.
**Fix**: `yarn add otpauth qrcode` + `yarn add -D @types/qrcode`.

## Dependencies

### Internal Dependencies

- Organization module (add `twoFactorPolicy` field)
- User module (add 2FA state fields)
- Auth module (email service, rate limiter, template engine)
- Interaction routes (login flow modification)
- CLI commands (replace stubs)

### External Dependencies

- `otpauth` — TOTP generation and verification (RFC 6238)
- `qrcode` — QR code generation for TOTP enrollment
- `@types/qrcode` — TypeScript types for qrcode

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Login flow regression | Medium | High | Comprehensive E2E tests for existing login flow |
| TOTP time sync issues | Low | Medium | ±1 step window tolerance (±30 sec) |
| Encryption key management | Medium | High | Clear documentation, env var validation |
| Migration on existing data | Low | Medium | Non-breaking: new columns are nullable/have defaults |
