# Technical Specification: Single-Use TOTP

> **Requirements**: AC-06–AC-11, AC-13
> **Decisions**: AR-1–AR-3, AR-6–AR-7, AR-9
> **CodeOps Artifact Schema**: 1

## Schema

Migration `028_totp_replay_protection.sql` adds nullable `BIGINT last_accepted_time_step` to
`user_totp` and check constraints for `algorithm = 'SHA1'`, `digits = 6`, and `period = 30`.
The Down section drops those named constraints and the new column only. Existing migration 012 is
not edited. `UserTotpRow.last_accepted_time_step` is `string | null`, matching `pg`'s default
`BIGINT` representation. Mapping validates a finite safe integer and exposes
`UserTotp.lastAcceptedTimeStep` as `number | null`.

## Validation Result

Replace the boolean helper with a matched-step result:

```ts
export interface TotpMatch {
  readonly timeStep: number;
}

export function verifyTotpCode(
  code: string,
  secret: string,
  parameters: { algorithm: string; digits: number; period: number },
  validationTime: number,
): TotpMatch | null;
```

The service supplies the stored parameters and captures `Date.now()` once per attempt. Only
SHA-1, six digits, and 30 seconds are supported. Any other stored values throw
`UnsupportedTotpConfigurationError('TOTP configuration is unsupported')` before constructing
`OTPAuth.TOTP`. Validation calls
`totp.validate({ token: code, timestamp: validationTime, window: 1 })`; the same captured instant
therefore determines both the accepted delta and persisted step. For that returned delta,
`timeStep = floor(validationTime / 30_000) + delta`.

This directly replaces the internal two-argument boolean `verifyTotpCode()` contract. The
`TotpMatch` type and `UnsupportedTotpConfigurationError` follow the existing two-factor barrel
exports. No compatibility wrapper or second validator is added.

## Atomic Repository Operations

Authentication uses one parameterized conditional update:

```text
UPDATE user_totp
SET last_accepted_time_step = candidate
WHERE id = loadedRowId
  AND user_id = loadedUserId
  AND verified = true
  AND (last_accepted_time_step IS NULL OR last_accepted_time_step < candidate)
```

Success is `rowCount === 1`. Zero rows is the ordinary invalid/replayed result. No retry follows.
For enrollment, a corresponding conditional update requires `verified = false`, sets
`verified = true` and the accepted step, then the same `runDatabaseTransaction()` enables TOTP on
the user. Any error rolls both writes back. Exact row ID prevents a replaced setup from being
consumed.

## Route Behavior

| Condition | Public result |
|---|---|
| malformed, mismatch, expired, older, equal, replay, CAS loss | Existing localized invalid-code result |
| unsupported stored parameters | Existing TOTP page, HTTP 503, new generic localized contact-admin message |
| enrollment `2fa_verify` budget exhausted | Existing enrollment page, HTTP 429, `Retry-After`, current pending secret/QR data |

Enrollment applies the same resolved organization/user `2fa_verify` key and configuration used by
normal verification only in the TOTP confirmation branch: after the email-setup early return and
before TOTP code validation. Email enrollment remains unchanged. Both the 429 and unsupported-state
503 paths use the same pending-setup rendering data from `getPendingTotpSetupInfo()`, preserving the
stored pending secret and regenerated QR. Neither path creates a new secret or recovery codes.

The unsupported-state event is exactly `totp-configuration-unsupported`. It contains no stored
parameter, secret, code, time step, encryption value, caught error, stack, or internal path.
Existing safe success/failure audit events and tenant boundaries remain unchanged.

## File Ownership

| Files | Change |
|---|---|
| `packages/server/migrations/028_totp_replay_protection.sql` | replay column and fixed-parameter checks |
| `packages/server/src/two-factor/types.ts` | persisted replay mapping |
| `packages/server/src/two-factor/totp.ts` | fixed-parameter validation and matched step |
| `packages/server/src/two-factor/errors.ts` | typed unsupported-state error |
| `packages/server/src/two-factor/index.ts` | updated TOTP type and error barrel exports |
| `packages/server/src/two-factor/repository.ts` | conditional consume/confirm SQL |
| `packages/server/src/two-factor/service.ts` | captured instant and atomic flows |
| `packages/server/src/routes/two-factor.ts` | rate limit plus uniform 429/503 rendering |
| `packages/server/locales/default/en/errors.json` | generic service-unavailable text |
