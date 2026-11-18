# Quality review: Machine-upload observer isolation

> **Date**: 2026-11-18
> **Status**: Passed — independent reviews and expanded integration verification complete
> **Baseline**: c800823ab103b38ffc1e2f6f15c8ca1cc024eb4e
> **Scope mode**: strict

Independent read-only correctness and security reviewers inspected the whole-task diff
and relevant transaction, route and fixture code. No production implementation changed.

| Review | Final result |
| --- | --- |
| Correctness, maintainability and standards | No findings; separate observer, deterministic regression and client cleanup confirmed |
| Security coverage | No findings; real upload, exact revocation/expiry denials and zero-side-effect assertions preserved |

## Corrected review evidence

The security reviewer initially reported SA-001 as a major ordering gap, and publication
was paused. The reviewer explicitly withdrew it as a factual false positive after
checking the actual outer transaction:

1. `routes/admin-invitations.ts:134` wraps the entire initial authentication and success
   callback in a transaction.
2. `lib/database.ts:74` reuses the outer owner for nested authentication work; the nested
   call does not issue COMMIT.
3. Initial expiry checking and the authentication-success callback therefore finish
   before the outer COMMIT at `lib/database.ts:84`.
4. Observing that COMMIT cannot move the initial expiry check after the test's clock
   change. Post-upload authentication remains explicit at `admin-invitations.ts:151-157`.

This is a correction of the reviewer's evidence, not an accepted risk or a waived
security finding. There are no unresolved findings and no additional instrumentation,
mock authentication or production hooks were introduced.

## Verification available at review

- The old observer reproduced the exact CI error despite an explicitly committed backend.
- The fixed full upload file passed all three cases with no skips.
- Server lint, typecheck and 179 structure contracts passed.
- Expanded service-account-directory integration verification passed: 602 tests across
  56 files. The earlier outer-command timeout is not recorded as a passing gate.
- Explicit final structure run passed all 179 contracts.
- Isolated test containers, network and volumes were removed with the scratch project's
  owned `down -v` command; inventories confirm no task-owned resources remain.

No architecture or public API change requires a technical-documentation edit.
