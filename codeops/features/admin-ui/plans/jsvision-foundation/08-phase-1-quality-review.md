# Phase 1 Quality Review

> **Date**: 2026-08-27
> **Phase baseline tree**: `e6bfa24b7549a57686d5fe13c7728aeb5fe319b7`
> **Scope mode**: strict
> **Disposition**: Complete — accepted corrections and scoped verification passed

## Review Result

The mandatory correctness/API and authentication-security reviews found eight unique Major defects
and one Minor defect. Auto-design accepted the smallest technical corrections inside the already
authorized Phase 1 scope. No finding is waived or dismissed.

| Finding         | Severity | Accepted correction                                                                                                                                                   |
| --------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RV-001 / SA-002 | Major    | Fetch UserInfo from the selected origin and validated organization path, require ID-token subject continuity, and persist/display only its allowlisted live identity. |
| RV-002 / SA-001 | Major    | Route interactive login through the existing kernel lock and owner-only atomic credential writer.                                                                     |
| RV-003 / SA-006 | Major    | Race injected UI waits against the operation signal, dispose the real callback listener on abort, and prevent persistence from starting after cancellation.           |
| RV-004 / SA-005 | Major    | Runtime-validate discovery, credential, and token JSON; bind the discovered HTTPS issuer to the selected origin and safe organization slug.                           |
| SA-003          | Major    | Latch every post-dispatch refresh rejection or invalid response so a possibly rotated grant is never replayed.                                                        |
| SA-004          | Major    | Reserve a credential path in-process before opening a POSIX lock descriptor, while retaining a strong handle reference until the owning operation ends.               |
| SA-007          | Major    | Discard remote callback and token error text at the boundary and return only bounded authentication categories.                                                       |
| SA-008          | Major    | Construct the UserInfo endpoint internally from the normalized selected origin and validated organization slug before attaching a bearer token.                       |
| RV-005          | Minor    | Remove the test-only callback listener and exercise cancellation through the production coordinator and random-port callback server.                                  |

## Verification and Re-review

Closure requires the focused Phase 1 selectors, affected CLI/SDK package verification, and
repository structure tests to pass on Node 24 LTS. One bounded independent re-review will inspect
only the correction diff; its result is recorded here before the Phase 1 checkpoint is committed.

## Bounded Re-review Result

The single permitted bounded re-review closed RV-001–RV-005 and SA-002–SA-004 plus SA-006–SA-008.
It found three residual Major defects; auto-design accepted and corrected all three without another
review pass.

| Finding         | Severity | Accepted correction                                                                                                                                                       |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SA-R01          | Major    | Create and chmod the owner-only credential directory before the first login opens its persistent lock file; prove the fresh-directory path.                               |
| SA-R02          | Major    | Reject SDK credential snapshots that omit a non-empty, parseable expiry instead of treating them as non-expiring.                                                         |
| RV-R01 / SA-R03 | Major    | Make the pre-persistence signal check final: once persistence begins, return its definite committed result or propagate its sanitized failure despite later cancellation. |

## Closure Evidence

On Node 24.20.0, focused CLI authentication/session/credential selectors passed 87 tests and focused
SDK refresh selectors passed 41 tests. Final package verification passed 35 CLI files with 405 tests
and 33 SDK files with 412 tests, including lint, typecheck, build, and test. Repository structure
verification passed all 79 contracts. Server implementation and server verification remained out of
scope.
