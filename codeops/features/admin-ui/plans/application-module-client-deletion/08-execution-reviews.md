# Execution Quality Reviews: Record Deletion and Lifecycle Simplification

> **Status**: Phase 2 review passed
> **Last Updated**: 2026-09-06 17:14
> **CodeOps Artifact Schema**: 1

## Phase 1: Session and OIDC Authority Foundation

**Review boundary:** `2e719427..73320617`
**Scope mode:** Strict
**Verification:** 2,946 unit, 402 integration, and 96 structure tests passed before review.

| ID     | Severity | Lens        | Finding                                                                                   | Proposed minimum correction                                                                                                    | Ruling        |
| ------ | -------- | ----------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| RV-001 | 🟠 Major | Correctness | Resolved ioredis pipeline command errors are not inspected, so publication can report success | Reject null pipeline results and any command error tuple; prove tracking persists and `upsert` rejects                         | ✅ Accepted   |
| SA-001 | 🟠 Major | Security    | Present malformed authority fields can be ignored until a cached artifact has no references  | Distinguish absence from malformed presence, reject malformed fields/maps, and add immutable fail-closed regressions            | ❌ Rejected   |
| SA-002 | 🟠 Major | Security    | Non-awaited, error-swallowing Session tracking revocation permits logout/republish races      | Make revocation propagate and await it before Session Redis deletion; add ordering, failure, and concurrency regression coverage | ✅ Accepted   |

No critical or minor finding was reported. The correctness review stopped after RV-001 as required
by the major-finding gate. The security audit completed its assigned lenses.

The user rejected SA-001 because Porta and `oidc-provider` are the only expected writers and the
product has no legacy deployment data. Adding generalized malformed-cache handling would be
disproportionate to the current boundary. RV-001 and SA-002 were accepted as concrete failures in
Porta's own Redis publication and logout paths.

The accepted corrections pass 30 authority specifications, 73 focused unit tests, all 2,950 server
unit tests, all 402 server integration tests, 96 repository structure tests, and server typecheck.

The single remediation re-review passed with no critical, major, or minor findings. It confirmed
that the changes are minimal, PostgreSQL revocation completes before Redis deletion, concurrent
Session publication cannot clear `revoked_at`, and a Redis deletion failure leaves a payload that
the PostgreSQL authority check rejects.

## Phase 2: Atomic Deletion, Routes, Audit, Cleanup, and Invitations

**Review boundary:** `f6c56a15..8ee6d008` plus Task 2.13 documentation and stale-test cleanup
**Scope mode:** Strict
**Verification:** Server lint/typecheck, 2,906 unit, 422 integration, 127 E2E, 223 pentest, 96
structure, 15/15 operational protocol assurance, and the documentation build passed. Operational
security assurance reported zero product failures, zero execution failures, and four registered
incomplete observability cases.

| ID      | Severity | Lens        | Finding                                                                                  | Minimum correction                                                                                 | Ruling      |
| ------- | -------- | ----------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------- |
| RV2-001 | 🟠 Major | Correctness | User deletion could register and await a stale post-commit user-cache write              | Make the existing membership guard use the live repository lookup                                  | ✅ Accepted |
| RV2-002 | 🟠 Major | Correctness | Task 2.13 removed the real-server inactive-client token rejection assertion              | Restore the existing E2E case with retained status `inactive`                                      | ✅ Accepted |
| RV2-003 | 🟡 Minor | Correctness | Unreachable whole-client `revoked` vocabulary remained in secret creation                | Remove the dead branch and retain secret-level revocation                                           | ✅ Accepted |
| RV2-004 | 🟡 Minor | Correctness | The custom-claim data-model section described nonexistent tables and columns             | Align the diagram and tables with migration 007                                                     | ✅ Accepted |
| SA2-001 | 🟠 Major | Security    | UUID-shaped organization slugs made destructive target selection ambiguous              | Give exact UUID IDs deterministic precedence in the existing locked query and add collision coverage | ✅ Accepted |
| SA2-002 | 🟠 Major | Security    | Module capture omitted permissions that PostgreSQL could cascade by `module_id`          | Capture every permission with the target `module_id` and prove affected-user revocation             | ✅ Accepted |

The user accepted all six narrow corrections after an independent overengineering challenge. The
challenge confirmed that no new lookup service, middleware mode, UUID resolver, schema restriction,
foreign key, trigger, repair migration, worker, queue, or normalization system was needed.

Both remediation re-reviews passed with no critical, major, or minor findings. They confirmed live
tenant membership checks do not touch Redis, UUID syntax selects the ID row deterministically,
module deletion captures every permission its foreign key deletes, and the lifecycle/documentation
cleanup retains the intended inactive-client and secret-revocation behavior.
