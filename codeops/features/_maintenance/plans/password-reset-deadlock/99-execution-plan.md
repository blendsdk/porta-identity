# Task T-10: Remove the password-reset deadlock under concurrent password changes

> **Type**: Task (lightweight) · **Feature**: _maintenance · **CodeOps Artifact Schema**: 1
> **Progress**: 9/9 tasks (100%)
> **Issue**: [#255](https://github.com/blendsdk/porta-identity/issues/255)
> **Pull request**: [#256](https://github.com/blendsdk/porta-identity/pull/256)
> **Branch**: `fix/password-reset-deadlock`

## Objective

Concurrent password-reset submissions for the same user must never fail with PostgreSQL `40P01`
(deadlock detected). Exactly one submission may win; every other submission must fail through the
existing consumed-token path. Password reset must stay atomic: token consumption, password change,
sibling-token invalidation, authority revocation and the audit row commit or roll back together.

## Root cause (verified from code and the observed stack)

`processResetPassword` runs these statements in one transaction, in this order:

1. `consumePasswordResetToken` locks the submitted `password_reset_tokens` row
   (`packages/server/src/routes/password-reset.ts:552`,
   `packages/server/src/auth/token-repository.ts:722-731`).
2. `setUserPassword` → `updateHumanPassword` locks the `users` row
   (`packages/server/src/routes/password-reset.ts:555`,
   `packages/server/src/users/repository.ts:230-236`).
3. `invalidateOtherPasswordResetTokens` locks the user's remaining token rows
   (`packages/server/src/routes/password-reset.ts:556`,
   `packages/server/src/auth/token-repository.ts:742-750`).

Two submissions with different valid tokens for the same user therefore lock in opposite orders:
the first holds the user row and waits for the second token row; the second holds its token row and
waits for the user row. PostgreSQL aborts one transaction with `40P01`.

The observed stack is in the issue: `invalidateOtherPasswordResetTokens` at
`packages/server/src/auth/token-repository.ts:743`, called from
`packages/server/src/routes/password-reset.ts:556`.

## Scope

**In scope:** the reset transaction lock order, one exported lock helper, extraction of the reset
transaction body into a testable function, a real-database concurrency regression test, and the
narrow verification suites.

**Out of scope:** a retry wrapper, schema or index changes, changing the token tables, the admin
set-password flow, invitation acceptance, magic-link locking, and any UI change.

## Confirmed decisions

| #   | Decision                                                                                                       | Reason                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| D-1 | Lock the `users` row first, then consume the token                                           | One lock order for every password-reset transaction removes the cycle                      |
| D-2 | Apply the same order to the whole reset transaction; no automatic retry                        | Root-cause fix; the transaction is small and a retry would hide future inversions          |
| D-3 | Extract the transaction body into `completePasswordReset` in the route module                  | Lets a real-database test run two completions concurrently without HTTP or test-only hooks |
| D-4 | Regression test asserts one success, one consumed-token failure, and no `40P01`                 | Encodes the user-visible rule, not a timing detail                                         |
| D-5 | No schema change                                                                              | The existing `password_reset_tokens(user_id)` index already supports the update            |
| D-6 | Deploy every server instance together                                                          | During a mixed-version rollout the older order can still deadlock once; retry was rejected |

## Smallest viable design

Add one repository primitive:

```sql
SELECT id FROM users WHERE id = $1 FOR UPDATE
```

Call it at the start of the reset transaction, before `consumePasswordResetToken`. The helper
returns `false` when the account disappeared, which rolls the transaction back through the existing
generic error path.

Extract the current transaction body into:

```ts
export async function completePasswordReset(input: CompletePasswordResetInput): Promise<void>
```

The route resolves the token, validates the request, then calls the function and keeps the existing
email and rendering steps. Behaviour outside the lock order is unchanged.

## Regression test

New file `packages/server/tests/integration/auth/password-reset-deadlock.impl.test.ts`:

1. Seed one organization and one interactive user with a password.
2. Insert two valid reset tokens for that user.
3. Start two `completePasswordReset` calls with different strong passwords at the same time.
4. Expect exactly one fulfilment and one `ResetTokenAlreadyConsumedError`; assert neither rejection
   carries SQLSTATE `40P01`.
5. Assert all tokens are used and the stored hash matches the winning password.
6. Repeat the race a few rounds to prove the lock order, not luck, prevents the deadlock.

The pre-fix run must fail with `40P01`; the post-fix run must pass consistently.

## Risks and mitigations

| Risk                                                                 | Mitigation                                                                                          |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Locking the user row blocks login bookkeeping for the same account    | The lock is held only for the short reset transaction; login updates are single statements           |
| Mixed-version rollout keeps the old order on some instances          | Documented: upgrade all instances together (D-6)                                                    |
| The concurrency test is timing-dependent                              | Two Argon2 hashes run inside both transactions, so both token rows are held before either user update |
| An extracted function changes route behaviour                         | The extraction is mechanical; existing unit tests and UI reset tests still cover the route          |

## Tasks

### 1. Reproduce

- [x] 1.1.1 Extract the transaction body into `completePasswordReset` without changing behaviour, export `ResetTokenAlreadyConsumedError` for assertions, and keep the route call sites intact ✅ (completed: 2026-11-25 22:50)
- [x] 1.1.2 Add the real-database concurrency regression test and run it red against the current lock order; record the `40P01` ✅ (completed: 2026-11-25 22:50)

### 2. Fix

- [x] 2.1.1 Add `lockUserForPasswordChange` to the users repository and service with a documented lock-order contract ✅ (completed: 2026-11-25 22:50)
- [x] 2.1.2 Call the lock before consuming the token in `completePasswordReset` ✅ (completed: 2026-11-25 22:50)
- [x] 2.1.3 Run the regression test green and repeat it to confirm stability ✅ (completed: 2026-11-25 22:50)

### 3. Verify

- [x] 3.1.1 Update the route unit-test mock and run the password-reset unit suite ✅ (completed: 2026-11-25 22:50)
- [x] 3.1.2 Run the affected integration suites and `pnpm test:pentest` ✅ (completed: 2026-11-25 22:50)
- [x] 3.1.3 Run `pnpm test:structure` and the active-package checks; record CI `pnpm verify` and the browser UI job ✅ (completed: 2026-11-25 22:50)
- [x] 3.1.4 Record the evidence, close the task, and remove task-created infrastructure ✅ (completed: 2026-11-25 22:50)

## Verification commands

```bash
pnpm --filter @portaidentity/server exec vitest run --project integration \
  tests/integration/auth/password-reset-deadlock.impl.test.ts
pnpm --filter @portaidentity/server test:unit
pnpm --filter @portaidentity/server test:integration
pnpm test:pentest
pnpm test:structure
```

## Success criteria

- The regression test fails with `40P01` before the fix and passes consistently after it.
- Concurrent resets for one user produce one success and one clean consumed-token failure.
- Password reset remains atomic and the audit event is still written inside the transaction.
- Affected unit, integration, pentest and structure suites pass, and CI is green.

## Evidence

| Check | Result |
| --- | --- |
| Regression before the fix | red — one round produced SQLSTATE `40P01` |
| Regression after the fix | green — 5 consecutive runs, 3 races per run |
| Server unit | 270 files, 4598 tests passed |
| Changed integration | 121 files, 1161 tests passed |
| Pentest | 51 files, 341 tests passed |
| Structure | 179 passed |
| Browser UI (CI-equivalent single worker) | 142 passed, including the account-lockout test |
| Typecheck and lint | passed |
| CI at `e31932d4` (runs `45707291412`, `45707324760`) | all six jobs passed: Verify Monorepo, UI Tests, OIDC Harness, Public Documentation, Production Docker Build, Production Dependency Audit |
| Merge | PR #256 merged as `5e66c0ff`; post-merge CI run `45767772131` passed; issue #255 closed on 2026-11-26 |

The local browser suite defaults to four workers, while CI sets one. Under four workers the reset
tests share one account and legitimately invalidate each other's links, so that local-only
configuration is not a product signal. The single-worker run matches CI.

## Residuals

- A mixed-version rollout can still hit `40P01` once, because an older instance keeps the old
  token-first order. Upgrade every server instance together, as with any migration.
- Local parallel browser runs keep the shared-account race described above; CI remains the
  authoritative browser gate.
