# Current State: Production Security Corrections

> **Observed**: 2026-09-12
> **CodeOps Artifact Schema**: 1

## Signing Keys

| Surface | Current behavior | Required correction |
|---|---|---|
| `routes/keys.ts` | Generate and rotate insert plaintext PEM; rotation is two queries | Encrypt inserts and rely on the existing Admin mutation transaction |
| `signing-keys.ts` | Bootstrap encrypts but performs an unlocked check/insert | Lock, recheck, and insert once in a short transaction |
| JWKS cache | An old in-flight load can install after `clearJwksCache()` | Guard cache installation with a local generation value |
| DB loading | Plaintext rows and incomplete encrypted rows are accepted | Reject with one bounded domain error and safe event |
| PEM conversion | Invalid PEM is logged and skipped | Fail the load; a partial signing set is unsafe |
| startup logging | May serialize an error object | Use fixed safe signing-state output only |

Reuse points are `generateES256KeyPair()`, `encryptPrivateKey()`, the `getPool()` transaction proxy,
`afterDatabaseCommit()`, `runDatabaseTransaction()`, `clearJwksCache()`, and the existing Admin
authentication/permission middleware.

## TOTP

| Surface | Current behavior | Required correction |
|---|---|---|
| `user_totp` | No accepted-step state | Migration 028 adds nullable `last_accepted_time_step` and fixed-parameter checks |
| `verifyTotpCode()` | Returns only boolean | Return the matched absolute step or `null` from one captured instant |
| repository | Loads and verifies by user ID | Add exact-row, user, state, and step conditional mutations |
| service | Verification reads then returns boolean; setup uses separate writes | Make consume atomic; make enrollment mutations one transaction |
| routes | Normal verification is limited; enrollment confirmation is not | Reuse `2fa_verify` and consistent 429 rendering |
| stored parameters | Present in the row but not enforced | Reject unsupported values before OTP construction with a typed error |

## Configuration and Operations

- Production validation checks each 64-hex-character root key separately but accepts equal values.
- Conventional key commands report success without telling the operator to restart every Porta
  process.
- Public production guidance is inconsistent, and the migration guide describes current signing
  encryption as future work.

## Existing Debt Deliberately Unchanged

`routes/two-factor.ts` and `two-factor/service.ts` already exceed the preferred file size. The
feature makes narrow edits and introduces no architectural split because a refactor is not needed
to satisfy RD-01.
