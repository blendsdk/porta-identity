# Phase1 Quality Review: Policy and Storage

> **Status**: BLOCKED — SA-1-001 correction green; one scoped security re-review pending
> **Source checkpoint**: 317c28ba
> **Complete baseline tree**: 214d2a56df66af8413814e165d79497b98a4d1a3
> **Scope**: Strict Phase1 foundation only; no future authentication/route acceptance
> **Date**: 2026-11-05

The reviewed19-path diff includes the committed foundation and hardening changes, all eight test
files, actual inventory increases and this feature's execution evidence. No protected fixture or
operator file was rehashed by the baseline snapshot/diff. Later task-progress metadata does not
change the reviewed product bytes. No standing reviewer agents or new routing configuration exist.

| Partition                                                         | Agent                          | Result                                                    |
| ----------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------- |
| Correctness, maintainability, standards, concurrency, API surface | ses_e54b668b0ffeQKq7s0cTwoMKkQ | No findings; high confidence in static review             |
| Security, tenant/policy authority, ownership and migration safety | ses_e54b5ff33ffeEFMjhAcSR1a3v7 | SA-1-001 Major; static downgrade race requires correction |

The correctness reviewer read the full diff, all eight tests and governing contracts. It confirmed
strict whole-policy validation, native validated storage, distinct ownerless state, required
transaction ownership, client→binding→account locks and separate stored/public projections. It
did not rerun tests and made no whole-feature or security-partition claim. User-approved fixture
corrections were not treated as weakened assertions. No finding is waived or dismissed.

## Actual verification supplied to both reviewers

### SA-1-001 — Major: concurrent writers can cross the downgrade guard

Migration037 checks for flagged users/binding rows before acquiring write-excluding locks. A
writer may have uncommitted classification/ownership invisible to that check. The later destructive
DDL can wait for the writer and then erase its newly committed state without another check.
Evidence:037_service_account_invitations.sql:61–75 and existing migrator transaction options.
The initial report was static. Maintenance/draining advice does not enforce the approved refusal
invariant and is not an accepted-risk substitute. Actual reproduction/fix evidence follows.

The prior downgrade-safety task is reopened and downstream phase qualification blocked. Candidate
mechanisms are early write-excluding table locks in the same migration transaction, with lock
mode/order and snapshot behavior checked against the actual runner. Challenger
ses_e54acc8caffeH4WMMcL0Gvuw94 is independently reviewing those options before a delegated ruling.
No immutable oracle is changed. No risk is waived.

**Authority:** AI — delegated by --auto-design; AR-23; policy1; root bundle-c-20261104. Challenger
ses_e54acc8caffeH4WMMcL0Gvuw94 independently confirmed the root cause and recommended early ACCESS
EXCLUSIVE binding→users locks plus refusal of higher isolation. Parent inspected the actual
node-pg-migrate transaction defaults and wrappers. Weaker write locks need later DDL upgrades;
advisory cooperation adds unnecessary writer machinery. Early exclusivity costs read availability
during this destructive maintenance operation but establishes the approved atomic refusal.

**Observed red:** After an initial database-startup setup failure with no assertions run, readiness
was checked explicitly. Both flag-only and ownerless-marker-only writer barriers then reached a
real lock wait, committed their writer, and observed unsafe DOWN success under old SQL. The
REPEATABLE READ case also incorrectly succeeded. All three regression assertions failed before
the correction. No mutation or security assertion was retried away.

**Correction:** Explicit READ COMMITTED check, separate top-level ACCESS EXCLUSIVE locks on binding
then users, then the existing existence check and destructive work in the same transaction.
Reverse-order writers can still fail safely through deadlock detection; no claim of universal
deadlock freedom or automatic retry. The new regressions require the exact intended refusal,
not a generic timeout/deadlock. Original immutable expectations remain unchanged.

**Observed green:** All8 files/274 assertions pass, including both writer schedules and higher-
isolation refusal. Feature coverage remains96.55% statements/94.44% branches/100% functions/97.4%
lines. Focused regression lint passes. A scoped re-review of the fix is still required before
SA-1-001 is closed at the audit gate; the findings ledger records the authorized fix, not a waiver.

The fix checkpoint also passes the complete server unit category:251 files/4,417 assertions;
affected selection structure158/236 policy assertions; and server-wide lint/typecheck/build.
This remains a foundation selection, not full HTTP/production/packed/CI acceptance.

### Earlier selected results — insufficient to close SA-1-001

- Eight files/271 assertions pass on Node24, with real isolated PostgreSQL17/Redis8 for integration.
- Scoped feature coverage:96.55% statements,94.44% branches,100% functions,97.4% lines.
- Repository-only branches:89.65%; not described as90% for every file.
- Affected selection: structure158 and236 policy assertions; server-wide lint/typecheck/build pass.
- All immutable expected values remain unchanged. User-authorized fixture setup corrections and
  original/current oracle hashes are in the register and execution evidence.
- Native HTTP, production-security, packed compatibility and final full CI remain later obligations.

## Runtime teardown observed

Both task-owned --rm/tmpfs containers stopped and completed removal. An immediate first list saw
asynchronous removal still in progress; a subsequent explicit owned-name check and full inventories
confirmed no residue. Docker sets match the exact pre-task baseline:30 containers,19 networks,
76 volumes and92 images. No unrelated resource was touched. The owned verification worktree,
dependencies and active reviewer diff remain only for continuing feature verification; no Phase1
or whole-feature completion is declared while this review is pending.

The race correction subsequently started a fresh pair of separately named --rm/tmpfs services
from the same existing images. They are task-owned only and currently support fix verification;
their second teardown is pending. The earlier exact-baseline confirmation is historical, not a
claim that no fix-run containers are active now. Their IDs remain in the owned scratch state.
