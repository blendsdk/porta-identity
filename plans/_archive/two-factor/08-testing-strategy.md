# Testing Strategy: Two-Factor Authentication

> **Document**: 08-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals
- Unit tests: ≥90% coverage for `src/two-factor/` module
- Integration tests: 2FA DB operations with real PostgreSQL
- Existing tests: Zero regressions (1,780 unit+integration pass)

## Unit Tests

| File | Tests | Description |
|------|-------|-------------|
| `tests/unit/two-factor/types.test.ts` | ~8 | Type mapping, row conversion |
| `tests/unit/two-factor/errors.test.ts` | ~6 | Error classes, messages |
| `tests/unit/two-factor/crypto.test.ts` | ~10 | AES-256-GCM encrypt/decrypt roundtrip, invalid key, tampered data |
| `tests/unit/two-factor/otp.test.ts` | ~8 | 6-digit generation, SHA-256 hash/verify, uniqueness |
| `tests/unit/two-factor/totp.test.ts` | ~10 | Secret generation, URI format, QR code, code verify with window |
| `tests/unit/two-factor/recovery.test.ts` | ~10 | Code generation, XXXX-XXXX format, Argon2id hash/verify |
| `tests/unit/two-factor/repository.test.ts` | ~20 | TOTP, OTP, recovery CRUD (mocked DB) |
| `tests/unit/two-factor/service.test.ts` | ~25 | Setup, verify, disable, policy logic (mocked deps) |
| `tests/unit/two-factor/cache.test.ts` | ~8 | Redis cache get/set/invalidate |
| `tests/unit/routes/two-factor.test.ts` | ~15 | Route handlers (mocked service) |
| `tests/unit/cli/commands/user-2fa.test.ts` | ~10 | CLI 2FA commands (mocked service) |

**Estimated: ~130 new unit tests**

## Integration Tests

| File | Tests | Description |
|------|-------|-------------|
| `tests/integration/repositories/two-factor.repo.test.ts` | ~15 | TOTP, OTP, recovery CRUD with real DB |

## Modified Test Updates

| File | Changes |
|------|---------|
| `tests/unit/organizations/types.test.ts` | Add `twoFactorPolicy` field tests |
| `tests/unit/organizations/repository.test.ts` | Test new column in CRUD |
| `tests/unit/users/types.test.ts` | Add `twoFactorEnabled/Method` field tests |
| `tests/unit/users/repository.test.ts` | Test new columns in CRUD |
| `tests/unit/routes/interactions.test.ts` | Test 2FA redirect logic in processLogin |

## Verification Checklist

- [ ] All existing 1,780 tests still pass
- [ ] New 2FA unit tests pass (≥130 tests)
- [ ] New 2FA integration tests pass
- [ ] No lint errors
- [ ] Build succeeds
- [ ] Migration runs cleanly
