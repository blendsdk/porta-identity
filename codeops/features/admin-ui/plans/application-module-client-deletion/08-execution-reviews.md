# Execution Quality Reviews: Record Deletion and Lifecycle Simplification

> **Status**: Phase 4 review passed
> **Last Updated**: 2026-09-06 21:49
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

## Phase 4: Five-Surface Admin UI, Documentation, and Final Evidence

**Review boundary:** `73b231b3` plus the Task 4 implementation and documentation working tree
**Scope mode:** Strict
**Verification before review:** CLI lint/typecheck/build and 1,055 tests, 96 structure tests,
documentation build, 132 browser tests, six packed Admin CLI journey checks, and the focused server
route, unit, integration, E2E, and penetration-test gates passed.

| ID      | Severity | Lens        | Finding                                                                                      | Minimum correction                                                                                              | Ruling      |
| ------- | -------- | ----------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------- |
| RV4-001 | 🟠 Major | Correctness | The control-plane organization marker was discarded, so its Delete action could be enabled  | Retain the marker, disable Delete in the chooser, and reject direct control-plane deletion                      | ✅ Accepted |
| RV4-002 | 🟠 Major | Correctness | An organization deletion failure was retained in state but never displayed                  | Pass the retained failure into the organization chooser                                                        | ✅ Accepted |
| RV4-003 | 🟠 Major | Correctness | Reload after application or module deletion failure could republish stale errors after logout | Stop failure publication when authoritative reload removes the projection                                     | ✅ Accepted |
| RV4-004 | 🟠 Major | Correctness | Public documentation still described removed archive and role restrictions                 | Align the affected public documentation with physical deletion and the exact control-plane rules               | ✅ Accepted |
| SA4-001 | 🟠 Major | Security    | Inactive confidential clients could not open Secrets to revoke an active secret             | Permit secret loading for inactive confidential clients while preserving organization and confidentiality checks | ✅ Accepted |
| SA4-002 | 🟠 Major | Security    | Maximum-length valid targets could hide cascade details or overflow destructive buttons     | Keep warnings fixed, scroll full target details, bound labels, and focus Keep                                  | ✅ Accepted |
| RV4-005 | 🟡 Minor | Correctness | Client API documentation reported `200` for bodyless secret revocation                      | Document `204 No Content`                                                                                       | ✅ Corrected |
| RV4-006 | 🟡 Minor | Correctness | Admin UI application documentation still advertised Archive and a workspace warning        | Describe Delete and dialog-local scope notices                                                                 | ✅ Corrected |
| RV4-007 | 🟡 Minor | Correctness | The shared layout comment claimed long activation labels remain unchanged                   | Document the intentional ellipsis on redundant destructive-button target text                                  | ✅ Corrected |
| RV4-008 | 🟠 Major | Correctness | The organization chooser emitted Delete without terminating its modal session                | Route the one organization-specific command through the dialog's standard terminating-command path             | ✅ Accepted and corrected |

The user accepted all major corrections. The minimum implementation uses one small shared Layout
DSL helper across five dialogs and adds no workflow layer, service, dependency, or support system.
Both remediation re-reviews passed with no remaining critical, major, or minor findings. They
confirmed inactive-client secret revocation, control-plane protection, retained failure display,
authentication-loss reconciliation, full inspectable targets at 48×12, bounded action labels, and
Keep as the initial focus. The final manual oracle exposed RV4-008 before commit. Its immutable
regression failed with the same unhandled command, then passed after a single specialized dialog
handled that command through JSVision's existing enabled-state and validity boundary. A narrow
correctness re-review reported no findings. The live Admin UI then deleted the organization and
reloaded the authoritative list; organization, user, application, module, and client deletion all
passed in the same reset playground.
