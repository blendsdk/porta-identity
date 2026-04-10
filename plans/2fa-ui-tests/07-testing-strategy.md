# Testing Strategy: 2FA UI Tests

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

- All 12 previously-fixme tests passing
- Real end-to-end 2FA flows (no mocks)
- No regressions in existing 112 UI tests

## Verification Approach

### Email OTP Flow
1. Login → server sends OTP email → MailHog captures → extract code → enter → success
2. Validates: email delivery, OTP generation, OTP verification, interaction completion

### TOTP Flow
1. Login → TOTP verify page → generate code from known secret → enter → success
2. Validates: TOTP page rendering, code verification, interaction completion

### Recovery Code Flow
1. Login → 2FA page → switch to recovery → enter known code → success
2. Validates: recovery code UI, code verification, single-use behavior

## Verification Checklist

- [ ] All 12 previously-fixme tests pass (not skipped)
- [ ] All 112+ existing UI tests still pass
- [ ] `yarn verify` passes (1859+ unit tests)
- [ ] Total UI tests: 126+ (112 existing + 12 unblocked + 2 new seed users)
- [ ] No timing flakiness (TOTP codes validated within window)
