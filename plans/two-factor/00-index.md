# Two-Factor Authentication (2FA) Implementation Plan

> **Feature**: Add Email OTP and TOTP two-factor authentication to Porta v5
> **Status**: Planning Complete
> **Created**: 2026-04-09
> **Source**: [RD-12](../../requirements/RD-12-two-factor-authentication.md)

## Overview

Implements two-factor authentication (2FA) for Porta v5's multi-tenant OIDC provider. Supports two methods: **Email OTP** (6-digit code via email) and **TOTP** (authenticator app via RFC 6238). 2FA is configurable per organization via a `two_factor_policy` (`optional`, `required_email`, `required_totp`, `required_any`) and per user. Includes enrollment flows, login challenge flows, recovery codes, and admin CLI management.

The implementation adds a new `src/two-factor/` module following the project's existing functional architecture (types → errors → repository → cache → service), new database migration for 2FA tables, new Handlebars pages for setup/verify UI, a new email template for OTP codes, and modifications to the login interaction flow to insert a 2FA challenge step between password verification and consent.

## Document Index

| #  | Document                                         | Description                                   |
|----|--------------------------------------------------|-----------------------------------------------|
| 00 | [Index](00-index.md)                             | This document — overview and navigation       |
| 01 | [Requirements](01-requirements.md)               | Feature requirements and scope                |
| 02 | [Current State](02-current-state.md)             | Analysis of current implementation            |
| 03 | [Database Schema](03-database-schema.md)         | Migration 012 — 2FA tables and org changes    |
| 04 | [Two-Factor Module](04-two-factor-module.md)     | Core 2FA types, repository, service           |
| 05 | [Auth Integration](05-auth-integration.md)       | Login flow changes, templates, email OTP      |
| 06 | [TOTP & Recovery](06-totp-recovery.md)           | TOTP enrollment, verification, recovery codes |
| 07 | [CLI & Admin](07-cli-admin.md)                   | CLI commands and org policy management        |
| 08 | [Testing Strategy](08-testing-strategy.md)       | Test cases and verification                   |
| 99 | [Execution Plan](99-execution-plan.md)           | Phases, sessions, and task checklist          |

## Quick Reference

### 2FA Methods

| Method     | How It Works                                  | Security Level |
|------------|-----------------------------------------------|----------------|
| None       | Password or magic link only                   | Low            |
| Email OTP  | 6-digit code emailed after password login     | Medium         |
| TOTP       | 6-digit code from authenticator app (RFC 6238)| High           |

### Organization Policies

| Policy           | Behavior                                          |
|------------------|---------------------------------------------------|
| `optional`       | Users can enable 2FA, not required                |
| `required_email` | All users must complete email OTP after login     |
| `required_totp`  | All users must set up TOTP authenticator          |
| `required_any`   | Users must have at least one 2FA method enabled   |

### Key Decisions

| Decision                 | Outcome                                              |
|--------------------------|------------------------------------------------------|
| TOTP library             | `otpauth` (RFC 6238 compliant, well-maintained)      |
| QR code generation       | `qrcode` (SVG/data URI)                              |
| Secret encryption        | AES-256-GCM with key from env var                    |
| OTP storage              | SHA-256 hashed in DB (same as magic link tokens)     |
| Recovery code storage    | Argon2id hashed (same as passwords)                  |
| Time window              | ±1 step (30 sec each = ±30 sec tolerance)            |
| Recovery codes count     | 10 codes, 8-char alphanumeric, `XXXX-XXXX` format   |

## Related Files

### New Files
- `migrations/012_two_factor.sql` — 2FA tables + org column
- `src/two-factor/` — Full module (types, errors, repository, cache, service, crypto, otp, totp)
- `templates/default/pages/two-factor-setup.hbs` — Setup page
- `templates/default/pages/two-factor-verify.hbs` — Verify/challenge page
- `templates/default/emails/otp-code.hbs` — OTP email template
- `locales/default/en/two-factor.json` — i18n strings

### Modified Files
- `src/organizations/types.ts` — Add `twoFactorPolicy` field
- `src/organizations/repository.ts` — Handle new column
- `src/users/types.ts` — Add `twoFactorEnabled`, `twoFactorMethod` fields
- `src/routes/interactions.ts` — Insert 2FA challenge after login
- `src/auth/email-service.ts` — Add `sendOtpCode()` method
- `src/cli/commands/user.ts` — Replace 2FA stubs with real implementations
- `src/config/schema.ts` — Add `TWO_FACTOR_ENCRYPTION_KEY` env var
- `package.json` — Add `otpauth`, `qrcode` dependencies
