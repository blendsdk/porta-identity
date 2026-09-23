# Testing Strategy: Production Security Corrections

> **Rule**: Each `*.spec.test.*` case is derived from RD-01 and is immutable after its red run.
> **CodeOps Artifact Schema**: 1

## 🚨 Specification Test Cases

### Signing Keys

| ID | Source | Input or action | Expected output or state |
|---|---|---|---|
| ST-01 | AC-01, AC-13 | Authorized Admin calls generate | `201`; row is ES256 ciphertext with IV/tag and `encrypted=true`; response/log has no private material |
| ST-02 | AC-02 | Force insertion failure after rotation retirement SQL | Existing active rows remain active, no row is added, no success is returned, cache is not cleared |
| ST-03 | AC-02–AC-03 | Complete authorized rotation | Old active rows retire, exactly one encrypted row becomes active, cache clears only after commit |
| ST-04 | AC-03 | Pause a cache-miss load, commit mutation/invalidate, then release old load | Old snapshot may return to its caller but is not cached; the next call reads committed rows |
| ST-05 | AC-04 | Start two `ensureSigningKeys()` calls against an empty table | Exactly one encrypted active row exists; after the lock transaction both callers reload and return usable JWKS containing it |
| ST-06 | AC-05 | Load plaintext row or encrypted row missing IV/tag | Throw `SigningKeyCryptoError('Signing key record is invalid')`; do not return keys |
| ST-07 | AC-05, AC-15, AR-3 | Load bad ciphertext or invalid private PEM through server startup and `porta init --verbose` | Emit `signing-key-record-invalid` with `kid` only and the fixed error; neither path exposes a caught error, crypto value, stack, or internal path |
| ST-08 | AC-13 | Call key mutations unauthenticated or without the exact permission | Existing `401`/`403`; no key row, status, or cache mutation |

Specification files:
`packages/server/tests/unit/security/signing-key-security.spec.test.ts` and
`packages/server/tests/integration/security/signing-key-storage.spec.test.ts`.

### TOTP Replay Protection

| ID | Source | Input or action | Expected output or state |
|---|---|---|---|
| ST-09 | AC-07, AC-11 | Inspect migration SQL, then apply and roll back migration 028 against PostgreSQL | Unit shape check finds nullable replay `BIGINT`, three named fixed-parameter checks, and bounded Down SQL; integration proves Up/Down schema behavior |
| ST-10 | AC-06 | Validate current, prior-window, and next-window codes at a fixed millisecond instant | Call OTPAuth with that exact `timestamp`; return the matching absolute step; invalid input returns `null`; time is sampled once |
| ST-11 | AC-06, AR-1, AR-9 | Validate with stored algorithm/digits/period outside SHA1/6/30 | Throw `UnsupportedTotpConfigurationError('TOTP configuration is unsupported')` before constructing/validating TOTP |
| ST-12 | AC-07 | Submit a valid code for a verified row with null/older replay state | One conditional update stores the matched step and verification succeeds |
| ST-13 | AC-07, AC-10 | Submit malformed, mismatched, expired, equal-step, older-step, or replayed code | Existing localized invalid-code result; replay state is unchanged; no automatic retry |
| ST-14 | AC-07 | Submit a valid step strictly greater than stored state | Conditional update advances state once and succeeds |
| ST-15 | AC-09 | Submit the same valid code concurrently twice for one row | Exactly one request succeeds; the other gets ordinary invalid-code behavior |
| ST-16 | AC-07 | Replace the TOTP row after validation but before consume | Conditional update affects zero rows; replacement row remains unchanged |
| ST-17 | AC-08 | Confirm pending enrollment with a valid code | One transaction stores step, verifies exact row, enables user TOTP, and commits |
| ST-18 | AC-08 | Force user update failure during enrollment confirmation | Transaction rolls back replay step, verified state, and user 2FA state |
| ST-19 | AC-08 | Authenticate immediately with the code used for successful enrollment | Ordinary invalid-code result because that absolute step is already consumed |
| ST-20 | AC-10, AR-2 | Exhaust resolved organization/user `2fa_verify`, then confirm TOTP enrollment; also perform email setup | TOTP returns HTTP 429 plus `Retry-After` and the same pending secret/QR without new setup/recovery data; email setup is unchanged |
| ST-21 | AC-06, AR-1 | Encounter unsupported stored parameters in login and enrollment | Both render their existing page at HTTP 503 with the same generic contact-admin meaning; enrollment preserves the same pending secret/QR without recovery regeneration |
| ST-22 | AC-10, AC-13, AR-3 | Capture responses/audit/logs for invalid, replay, and unsupported state | No parameter, code, secret, step, ciphertext, IV/tag, caught error, stack, SQL detail, or path |
| ST-23 | AC-07, AC-13 | Attempt CAS with wrong user/row/state, then create a password-login interaction | CAS produces zero matching mutation and leaves unrelated rows unchanged; interaction creation obtains the pending user through the existing organization-scoped `prepareUserForPasswordLogin(org.id, email)` boundary before any TOTP service use |

Specification files: `packages/server/tests/unit/two-factor/totp-replay.spec.test.ts`,
`packages/server/tests/unit/routes/two-factor-security.spec.test.ts`, and
`packages/server/tests/integration/security/totp-replay.spec.test.ts`, plus
`packages/server/tests/integration/migrations/totp-replay.spec.test.ts` for real Up/Down behavior.

### Configuration and Operations

| ID | Source | Input or action | Expected output or state |
|---|---|---|---|
| ST-24 | AC-14 | Parse production config with identical or case-different byte-equivalent 64-hex root keys, including with the safety escape hatch; then distinct keys | Every equivalent pair fails without disclosure or bypass; distinct values retain current successful validation |
| ST-25 | AC-12 | Complete non-JSON conventional generate and rotate, then run the JSON forms | Human output accurately distinguishes add-active from retire-all/create-new and requires restart/verification; JSON stays machine-only |
| ST-26 | AC-12 | Make either key command fail | Existing safe failure output; no success or restart-completed implication |
| ST-27 | AC-12 | Read `README.md`, environment, deployment, CLI infrastructure, Docker, and migration guidance | All six agree on distinct required 64-hex secrets, placeholders, accurate generate/rotate behavior, restart-all, verification, and current encryption/migration behavior |
| ST-28 | AC-12 | Scan published production examples/guidance | No usable key, MailHog production dependency, CI-only DNS, or automatic steady-state migration recommendation |

Specification files: `packages/server/tests/unit/config/production-key-separation.spec.test.ts`,
`packages/cli/tests/commands/key-restart-guidance.spec.test.ts`, and
`repo-tests/monorepo/production-security-guidance.spec.test.mjs`.

## Implementation Coverage

Existing signing crypto/loader/route/integration tests, TOTP migration/type/utility/repository/
service/route tests, production config tests, and CLI key tests are updated for internal contracts.
New `*.impl.test.ts` files cover cache-generation, lock, conditional-update, and rollback branches
without duplicating the immutable expectations.

## Verification Matrix

| Stage | Commands |
|---|---|
| Red/green | Focused Vitest/Node test files for the phase; record red before implementation |
| Per phase | Focused tests, affected lint/typecheck/build, and `yarn test:structure` |
| Final product | `yarn verify`; `yarn test:ui`; `yarn harness:test`; `yarn docs:build` |
| Security | `yarn assurance:harness --project security --profile production-security` |
| Compatibility | From a clean committed checkpoint: `yarn assurance:compat --select p1-admin` |

Coverage, mutation, fault, stability, report, and `assurance:all` are intentionally excluded
(AR-4). Infrastructure hardening is not applicable: no container, port, network service, image, or
deployment topology changes.
