# Execution Plan: Two-Factor Authentication (RD-12)

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-09 23:45
> **Progress**: 62/62 tasks (100%) — ALL PHASES COMPLETE

## Overview

Implements two-factor authentication for Porta v5: Email OTP, TOTP (authenticator app), recovery codes, per-org policy, login flow integration, templates, CLI admin commands, and comprehensive tests.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
|-------|-------|----------|-----------|
| 1 | Dependencies & Database Migration | 1 | 30 min |
| 2 | Core 2FA Module — Types, Errors, Crypto | 2 | 60 min |
| 3 | Core 2FA Module — OTP, TOTP, Recovery | 2 | 60 min |
| 4 | Core 2FA Module — Repository & Cache | 2 | 60 min |
| 5 | Core 2FA Module — Service Layer | 2 | 60 min |
| 6 | Org & User Type/Repo Updates | 1 | 30 min |
| 7 | Auth Integration — Login Flow & Routes | 3 | 90 min |
| 8 | Templates & Email | 1 | 30 min |
| 9 | CLI Commands | 1 | 30 min |
| 10 | Unit Tests — Crypto, OTP, TOTP, Recovery | 2 | 60 min |
| 11 | Unit Tests — Repository, Service, Routes | 3 | 90 min |
| 12 | Integration Tests & Final Verification | 2 | 60 min |

**Total: ~22 sessions, ~11-12 hours**

---

## Phase 1: Dependencies & Database Migration

### Session 1.1: Install Dependencies & Create Migration

**Reference**: [Database Schema](03-database-schema.md)
**Objective**: Add npm deps and create migration 012

**Tasks**:

| # | Task | File |
|---|------|------|
| 1.1.1 | Install `otpauth`, `qrcode`, `@types/qrcode` | `package.json` |
| 1.1.2 | Add `TWO_FACTOR_ENCRYPTION_KEY` to config schema + .env.example | `src/config/schema.ts`, `.env.example` |
| 1.1.3 | Create migration 012 — org column, user columns, 3 new tables | `migrations/012_two_factor.sql` |
| 1.1.4 | Update migration SQL validation tests | `tests/unit/migrations.test.ts` |

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 2: Core 2FA Module — Types, Errors, Crypto

### Session 2.1: Types & Errors

**Reference**: [Two-Factor Module](04-two-factor-module.md)
**Objective**: Create foundational types and error classes

**Tasks**:

| # | Task | File |
|---|------|------|
| 2.1.1 | Create types (TwoFactorMethod, UserTotp, OtpCode, RecoveryCode, etc.) | `src/two-factor/types.ts` |
| 2.1.2 | Create error classes (TwoFactorError, TotpNotConfigured, OtpExpired, etc.) | `src/two-factor/errors.ts` |
| 2.1.3 | Create barrel export | `src/two-factor/index.ts` |

### Session 2.2: Crypto Module

**Tasks**:

| # | Task | File |
|---|------|------|
| 2.2.1 | Implement AES-256-GCM encrypt/decrypt for TOTP secrets | `src/two-factor/crypto.ts` |

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 3: Core 2FA Module — OTP, TOTP, Recovery

### Session 3.1: Email OTP & TOTP

**Reference**: [Two-Factor Module](04-two-factor-module.md), [TOTP & Recovery](06-totp-recovery.md)
**Objective**: Implement OTP generation/verification and TOTP via otpauth

**Tasks**:

| # | Task | File |
|---|------|------|
| 3.1.1 | Implement OTP code generation, SHA-256 hashing, verification | `src/two-factor/otp.ts` |
| 3.1.2 | Implement TOTP secret gen, URI, QR code, verification | `src/two-factor/totp.ts` |

### Session 3.2: Recovery Codes

**Tasks**:

| # | Task | File |
|---|------|------|
| 3.2.1 | Implement recovery code generation, Argon2id hash/verify | `src/two-factor/recovery.ts` |

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 4: Core 2FA Module — Repository & Cache

### Session 4.1: Repository

**Reference**: [Two-Factor Module](04-two-factor-module.md)
**Objective**: PostgreSQL CRUD for TOTP, OTP codes, recovery codes

**Tasks**:

| # | Task | File |
|---|------|------|
| 4.1.1 | Implement TOTP repository operations (insert, find, verify, delete) | `src/two-factor/repository.ts` |
| 4.1.2 | Implement OTP code repository operations (insert, find, mark used, cleanup) | `src/two-factor/repository.ts` |
| 4.1.3 | Implement recovery code repository operations (insert, find, mark used, delete) | `src/two-factor/repository.ts` |

### Session 4.2: Cache

**Tasks**:

| # | Task | File |
|---|------|------|
| 4.2.1 | Implement Redis cache for user 2FA status | `src/two-factor/cache.ts` |

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 5: Core 2FA Module — Service Layer

### Session 5.1: Setup & Verification

**Reference**: [Two-Factor Module](04-two-factor-module.md)
**Objective**: Business logic for 2FA setup, verification, and management

**Tasks**:

| # | Task | File |
|---|------|------|
| 5.1.1 | Implement setup functions (setupEmailOtp, setupTotp, confirmTotpSetup) | `src/two-factor/service.ts` |
| 5.1.2 | Implement verification functions (verifyOtp, verifyTotp, verifyRecoveryCode) | `src/two-factor/service.ts` |
| 5.1.3 | Implement OTP email sending (sendOtpCode) | `src/two-factor/service.ts` |

### Session 5.2: Management & Policy

**Tasks**:

| # | Task | File |
|---|------|------|
| 5.2.1 | Implement management functions (status, disable, regenerateRecoveryCodes) | `src/two-factor/service.ts` |
| 5.2.2 | Implement policy functions (requiresTwoFactor, determineTwoFactorMethod) | `src/two-factor/service.ts` |
| 5.2.3 | Update barrel export with all public API | `src/two-factor/index.ts` |

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 6: Org & User Type/Repo Updates

### Session 6.1: Update Existing Modules

**Reference**: [Database Schema](03-database-schema.md)
**Objective**: Add 2FA fields to org and user types/repositories

**Tasks**:

| # | Task | File |
|---|------|------|
| 6.1.1 | Add `twoFactorPolicy` to Organization type, row mapping, repo queries | `src/organizations/types.ts`, `src/organizations/repository.ts` |
| 6.1.2 | Add `twoFactorEnabled`, `twoFactorMethod` to User type, row mapping, repo | `src/users/types.ts`, `src/users/repository.ts` |
| 6.1.3 | Update org service to handle new field in create/update | `src/organizations/service.ts` |
| 6.1.4 | Update user service to expose 2FA state | `src/users/service.ts` |

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 7: Auth Integration — Login Flow & Routes

### Session 7.1: Modify Login Flow

**Reference**: [Auth Integration](05-auth-integration.md)
**Objective**: Insert 2FA challenge into processLogin

**Tasks**:

| # | Task | File |
|---|------|------|
| 7.1.1 | Add 2FA check after password verification in processLogin | `src/routes/interactions.ts` |
| 7.1.2 | Store pending login in interaction session when 2FA required | `src/routes/interactions.ts` |

### Session 7.2: 2FA Routes — Verify

**Tasks**:

| # | Task | File |
|---|------|------|
| 7.2.1 | Implement GET showTwoFactor (render challenge page) | `src/routes/two-factor.ts` |
| 7.2.2 | Implement POST verifyTwoFactor (verify code + finish interaction) | `src/routes/two-factor.ts` |
| 7.2.3 | Implement POST resendOtpCode (rate-limited resend) | `src/routes/two-factor.ts` |

### Session 7.3: 2FA Routes — Setup

**Tasks**:

| # | Task | File |
|---|------|------|
| 7.3.1 | Implement GET showTwoFactorSetup (TOTP enrollment page) | `src/routes/two-factor.ts` |
| 7.3.2 | Implement POST processTwoFactorSetup (confirm enrollment + recovery codes) | `src/routes/two-factor.ts` |
| 7.3.3 | Register 2FA routes in server.ts | `src/server.ts` |

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 8: Templates & Email

### Session 8.1: Handlebars Templates & i18n

**Reference**: [Auth Integration](05-auth-integration.md)
**Objective**: Create 2FA UI pages, email template, i18n strings

**Tasks**:

| # | Task | File |
|---|------|------|
| 8.1.1 | Create two-factor-verify.hbs (code entry form) | `templates/default/pages/two-factor-verify.hbs` |
| 8.1.2 | Create two-factor-setup.hbs (TOTP QR + recovery codes) | `templates/default/pages/two-factor-setup.hbs` |
| 8.1.3 | Create otp-code.hbs email template | `templates/default/emails/otp-code.hbs` |
| 8.1.4 | Add sendOtpCodeEmail to email service | `src/auth/email-service.ts` |
| 8.1.5 | Create two-factor.json i18n strings | `locales/default/en/two-factor.json` |

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 9: CLI Commands

### Session 9.1: Replace 2FA Stubs

**Reference**: [CLI & Admin](07-cli-admin.md)
**Objective**: Real CLI implementations for 2FA management

**Tasks**:

| # | Task | File |
|---|------|------|
| 9.1.1 | Implement `porta user 2fa status` command | `src/cli/commands/user-2fa.ts` |
| 9.1.2 | Implement `porta user 2fa disable` command | `src/cli/commands/user-2fa.ts` |
| 9.1.3 | Implement `porta user 2fa reset` command | `src/cli/commands/user-2fa.ts` |
| 9.1.4 | Replace stubs in user.ts, import from user-2fa.ts | `src/cli/commands/user.ts` |

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 10: Unit Tests — Crypto, OTP, TOTP, Recovery

### Session 10.1: Crypto & OTP Tests

**Reference**: [Testing Strategy](08-testing-strategy.md)
**Objective**: Unit tests for pure crypto/OTP functions

**Tasks**:

| # | Task | File |
|---|------|------|
| 10.1.1 | Crypto unit tests (~10 tests) | `tests/unit/two-factor/crypto.test.ts` |
| 10.1.2 | OTP unit tests (~8 tests) | `tests/unit/two-factor/otp.test.ts` |
| 10.1.3 | Types + errors tests (~14 tests) | `tests/unit/two-factor/types.test.ts`, `tests/unit/two-factor/errors.test.ts` |

### Session 10.2: TOTP & Recovery Tests

**Tasks**:

| # | Task | File |
|---|------|------|
| 10.2.1 | TOTP unit tests (~10 tests) | `tests/unit/two-factor/totp.test.ts` |
| 10.2.2 | Recovery code unit tests (~10 tests) | `tests/unit/two-factor/recovery.test.ts` |

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 11: Unit Tests — Repository, Service, Routes

### Session 11.1: Repository Tests

**Reference**: [Testing Strategy](08-testing-strategy.md)
**Objective**: Unit tests for 2FA repository (mocked DB)

**Tasks**:

| # | Task | File |
|---|------|------|
| 11.1.1 | Repository unit tests (~20 tests) | `tests/unit/two-factor/repository.test.ts` |
| 11.1.2 | Cache unit tests (~8 tests) | `tests/unit/two-factor/cache.test.ts` |

### Session 11.2: Service Tests

**Tasks**:

| # | Task | File |
|---|------|------|
| 11.2.1 | Service unit tests (~25 tests) | `tests/unit/two-factor/service.test.ts` |

### Session 11.3: Route & CLI Tests

**Tasks**:

| # | Task | File |
|---|------|------|
| 11.3.1 | Two-factor route handler tests (~15 tests) | `tests/unit/routes/two-factor.test.ts` |
| 11.3.2 | CLI 2FA command tests (~10 tests) | `tests/unit/cli/commands/user-2fa.test.ts` |
| 11.3.3 | Update existing org/user type tests for new fields | Various |

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 12: Integration Tests & Final Verification

### Session 12.1: Integration Tests

**Reference**: [Testing Strategy](08-testing-strategy.md)
**Objective**: 2FA repository integration tests with real DB

**Tasks**:

| # | Task | File |
|---|------|------|
| 12.1.1 | 2FA repository integration tests (~15 tests) | `tests/integration/repositories/two-factor.repo.test.ts` |
| 12.1.2 | Update migration integration tests for migration 012 | `tests/integration/migrations.test.ts` |

### Session 12.2: Final Verification

**Tasks**:

| # | Task | File |
|---|------|------|
| 12.2.1 | Run full test suite, fix any regressions | N/A |
| 12.2.2 | Update .clinerules/project.md with 2FA module | `.clinerules/project.md` |

**Verify**: `clear && sleep 3 && yarn verify`

---

## Task Checklist (All Phases)

### Phase 1: Dependencies & Database Migration
- [x] 1.1.1 Install otpauth, qrcode, @types/qrcode ✅ (completed: 2026-04-09 19:28)
- [x] 1.1.2 Add TWO_FACTOR_ENCRYPTION_KEY to config schema + .env.example ✅ (completed: 2026-04-09 19:28)
- [x] 1.1.3 Create migration 012 ✅ (completed: 2026-04-09 19:29)
- [x] 1.1.4 Update migration SQL validation tests ✅ (completed: 2026-04-09 19:29)

### Phase 2: Core 2FA Module — Types, Errors, Crypto
- [x] 2.1.1 Create types ✅ (completed: 2026-04-09 19:33)
- [x] 2.1.2 Create error classes ✅ (completed: 2026-04-09 19:33)
- [x] 2.1.3 Create barrel export ✅ (completed: 2026-04-09 19:34)
- [x] 2.2.1 Implement AES-256-GCM crypto ✅ (completed: 2026-04-09 19:34)

### Phase 3: Core 2FA Module — OTP, TOTP, Recovery
- [x] 3.1.1 Implement OTP code generation/hashing/verification ✅ (completed: 2026-04-09 19:35)
- [x] 3.1.2 Implement TOTP secret/URI/QR/verification ✅ (completed: 2026-04-09 19:35)
- [x] 3.2.1 Implement recovery code generation/hashing/verification ✅ (completed: 2026-04-09 19:35)

### Phase 4: Core 2FA Module — Repository & Cache
- [x] 4.1.1 TOTP repository operations ✅ (completed: 2026-04-09 21:00, commit: 95851b7)
- [x] 4.1.2 OTP code repository operations ✅ (completed: 2026-04-09 21:00, commit: 95851b7)
- [x] 4.1.3 Recovery code repository operations ✅ (completed: 2026-04-09 21:00, commit: 95851b7)
- [x] 4.2.1 Redis cache for 2FA status ✅ (completed: 2026-04-09 21:00, commit: 95851b7)

### Phase 5: Core 2FA Module — Service Layer
- [x] 5.1.1 Setup functions (setupEmailOtp, setupTotp, confirmTotpSetup) ✅ (completed: 2026-04-09 21:00, commit: 95851b7)
- [x] 5.1.2 Verification functions (verifyOtp, verifyTotp, verifyRecoveryCode) ✅ (completed: 2026-04-09 21:00, commit: 95851b7)
- [x] 5.1.3 OTP email sending ✅ (completed: 2026-04-09 21:00, commit: 95851b7)
- [x] 5.2.1 Management functions (status, disable, regenerate) ✅ (completed: 2026-04-09 21:00, commit: 95851b7)
- [x] 5.2.2 Policy functions (requiresTwoFactor, determineTwoFactorMethod) ✅ (completed: 2026-04-09 21:00, commit: 95851b7)
- [x] 5.2.3 Update barrel export ✅ (completed: 2026-04-09 21:00, commit: 95851b7)

### Phase 6: Org & User Type/Repo Updates
- [x] 6.1.1 Add twoFactorPolicy to org types + repo ✅ (completed: 2026-04-09 21:00, commit: 95851b7)
- [x] 6.1.2 Add twoFactorEnabled/Method to user types + repo ✅ (completed: 2026-04-09 21:00, commit: 95851b7)
- [x] 6.1.3 Update org service for new field ✅ (completed: 2026-04-09 21:00, commit: 95851b7)
- [x] 6.1.4 Update user service for 2FA state ✅ (completed: 2026-04-09 21:00, commit: 95851b7)

### Phase 7: Auth Integration — Login Flow & Routes
- [x] 7.1.1 Add 2FA check in processLogin ✅ (completed: 2026-04-09 22:14, commit: f567b32)
- [x] 7.1.2 Store pending login in interaction session ✅ (completed: 2026-04-09 22:14, commit: f567b32)
- [x] 7.2.1 GET showTwoFactor route ✅ (completed: 2026-04-09 22:14, commit: f567b32)
- [x] 7.2.2 POST verifyTwoFactor route ✅ (completed: 2026-04-09 22:14, commit: f567b32)
- [x] 7.2.3 POST resendOtpCode route ✅ (completed: 2026-04-09 22:14, commit: f567b32)
- [x] 7.3.1 GET showTwoFactorSetup route ✅ (completed: 2026-04-09 22:14, commit: f567b32)
- [x] 7.3.2 POST processTwoFactorSetup route ✅ (completed: 2026-04-09 22:14, commit: f567b32)
- [x] 7.3.3 Register routes in server.ts ✅ (completed: 2026-04-09 22:14, commit: f567b32)

### Phase 8: Templates & Email
- [x] 8.1.1 Create two-factor-verify.hbs ✅ (completed: 2026-04-09 22:14, commit: f567b32)
- [x] 8.1.2 Create two-factor-setup.hbs ✅ (completed: 2026-04-09 22:14, commit: f567b32)
- [x] 8.1.3 Create otp-code.hbs email template ✅ (completed: 2026-04-09 22:14, commit: f567b32)
- [x] 8.1.4 Add sendOtpCodeEmail to email service ✅ (completed: 2026-04-09 22:14, commit: f567b32)
- [x] 8.1.5 Create two-factor.json i18n ✅ (completed: 2026-04-09 22:14, commit: f567b32)

### Phase 9: CLI Commands
- [x] 9.1.1 Implement 2fa status command ✅ (completed: 2026-04-09 22:14, commit: f567b32)
- [x] 9.1.2 Implement 2fa disable command ✅ (completed: 2026-04-09 22:14, commit: f567b32)
- [x] 9.1.3 Implement 2fa reset command ✅ (completed: 2026-04-09 22:14, commit: f567b32)
- [x] 9.1.4 Replace stubs in user.ts ✅ (completed: 2026-04-09 22:14, commit: f567b32)

### Phase 10: Unit Tests — Crypto, OTP, TOTP, Recovery
- [x] 10.1.1 Crypto unit tests (13 tests) ✅ (completed: 2026-04-09 23:37)
- [x] 10.1.2 OTP unit tests (10 tests) ✅ (completed: 2026-04-09 23:37)
- [x] 10.1.3 Types + errors tests (24 tests) ✅ (completed: 2026-04-09 23:37)
- [x] 10.2.1 TOTP unit tests (14 tests) ✅ (completed: 2026-04-09 23:38)
- [x] 10.2.2 Recovery code unit tests (13 tests) ✅ (completed: 2026-04-09 23:38)

### Phase 11: Unit Tests — Repository, Service, Routes
- [x] 11.1.1 Repository unit tests (22 tests) ✅ (completed: 2026-04-09 23:39)
- [x] 11.1.2 Cache unit tests (9 tests) ✅ (completed: 2026-04-09 23:39)
- [x] 11.2.1 Service unit tests (30 tests) ✅ (completed: 2026-04-09 23:40)
- [x] 11.3.1 Route handler tests (13 tests) ✅ (completed: 2026-04-09 23:42)
- [x] 11.3.2 CLI 2FA command tests (10 tests) ✅ (completed: 2026-04-09 23:42)
- [x] 11.3.3 Update existing org/user tests ✅ (completed: 2026-04-09 23:42)

### Phase 12: Integration Tests & Final Verification
- [x] 12.1.1 2FA repository integration tests (17 tests) ✅ (completed: 2026-04-10 00:04)
- [x] 12.1.2 Update migration integration tests for migration 012 (8 new tests) ✅ (completed: 2026-04-10 00:04)
- [x] 12.2.1 Run full suite, fix regressions ✅ (completed: 2026-04-10 00:05)
- [x] 12.2.2 Update .clinerules/project.md ✅ (completed: 2026-04-09 23:45)

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X, Session X.X per `plans/two-factor/99-execution-plan.md`"
2. Read the referenced technical spec document

### Ending a Session

1. Run `clear && sleep 3 && yarn verify`
2. Handle commit per the active commit mode
3. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with [x]
3. Start new conversation for next session
4. Run `exec_plan two-factor` to continue

---

## Dependencies

```
Phase 1 (Dependencies & Migration)
    ↓
Phase 2 (Types, Errors, Crypto)  →  Phase 3 (OTP, TOTP, Recovery)
    ↓
Phase 4 (Repository & Cache)
    ↓
Phase 5 (Service Layer)
    ↓
Phase 6 (Org & User Updates)
    ↓
Phase 7 (Auth Integration)  →  Phase 8 (Templates & Email)  →  Phase 9 (CLI)
    ↓
Phase 10 (Unit Tests — Crypto)  →  Phase 11 (Unit Tests — Repo/Service/Routes)
    ↓
Phase 12 (Integration Tests & Verification)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All 12 phases completed
2. ✅ All verification passing (`yarn verify`)
3. ✅ Email OTP + TOTP + recovery code flows work
4. ✅ Per-org 2FA policy enforced
5. ✅ CLI admin commands functional
6. ✅ ~130 new unit tests + ~15 integration tests passing
7. ✅ No regressions in existing 1,780 tests
8. ✅ Documentation updated
9. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
