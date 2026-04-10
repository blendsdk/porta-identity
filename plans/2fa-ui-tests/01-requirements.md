# Requirements: 2FA UI Tests

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)

## Feature Overview

Enable real end-to-end browser testing of all two-factor authentication flows in Porta. Currently 12 Playwright tests are marked `test.fixme()` because they cannot enable 2FA state that the server process recognizes. This plan seeds 2FA-enabled users during global setup so the server sees 2FA from startup.

## Functional Requirements

### Must Have

- [ ] Seed a user with email OTP 2FA enabled during global-setup
- [ ] Seed a user with TOTP 2FA enabled during global-setup (known secret)
- [ ] Seed recovery codes for the TOTP user (known plaintext)
- [ ] Capture TOTP secret and recovery codes in test fixtures (TestData)
- [ ] Email OTP tests: capture OTP from MailHog, enter in browser
- [ ] TOTP tests: generate valid TOTP code from known secret, enter in browser
- [ ] Recovery code tests: use known plaintext code, enter in browser
- [ ] All 12 previously-fixme tests passing (not skipped)

### Should Have

- [ ] TOTP code generation helper in test fixtures (reusable)
- [ ] OTP extraction helper shared across test files

### Won't Have (Out of Scope)

- Test API endpoint (not needed — seeding solves the problem)
- Testing 2FA enrollment/setup from scratch (would require org policy changes mid-test)
- Testing 2FA disable/reset flows via UI

## Technical Requirements

### Security

- TOTP secret must only exist in test environment (not production)
- `TWO_FACTOR_ENCRYPTION_KEY` env var must be set for AES-256-GCM encryption

### Compatibility

- Must work with existing Playwright test infrastructure
- Must not break existing 112 passing UI tests

## Acceptance Criteria

1. [ ] 12 previously-fixme 2FA tests now pass (not skipped)
2. [ ] Email OTP flow tested end-to-end via MailHog
3. [ ] TOTP flow tested with real code generation
4. [ ] Recovery code flow tested with real codes
5. [ ] All 112+ existing UI tests still pass
6. [ ] `yarn verify` passes (1859+ unit tests)
