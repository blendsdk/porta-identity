# Phase Reviews: Applications and OIDC Clients

> **Document**: 01-phase-reviews.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-08-30 14:11
> **Scope mode**: strict

## Phase 1: Server Safety, Runtime, and Role Data

**Baseline tree:** `69319bb66147243e3a4b8b4bf3f253d04f34c88f`

**Pre-review verification:** focused specifications 50/50; implementation regressions 20/20;
unit 2,904/2,904; integration 386/386; E2E 128/128; pentest 224/224; browser 132/132;
retained OIDC harness 6/6; protocol assurance 15/15; Node 24 `yarn verify` passed.

**Reviewers:** correctness/maintainability/standards/API reviewer; auth-protocol and
tenant-isolation security auditor; concurrency and migration auditor. The security auditor reported
no additional findings.

| ID | Severity | Finding | Resolution | State |
| --- | --- | --- | --- | --- |
| RV-C001 | Critical | Secret insertion opens a second connection inside the request transaction, so confidential create cannot see its uncommitted parent and rotation can escape request/audit rollback. | Reuse `runDatabaseTransaction` and the AsyncLocal transaction pool for the short parent-lock/count/insert unit. | Accepted — re-review passed |
| RV-C002 | Major | Migration precondition can race a concurrent legacy secret write. | Acquire a transaction-held `SHARE ROW EXCLUSIVE` lock on `client_secrets` before checking the bound and add a two-connection regression. | Accepted — re-review passed |
| RV-C003 | Major | Generation can pass the route eligibility read, race client revocation, then insert under a lock that checks only the parent ID. | Recheck confidential/non-revoked parent state while holding the insertion lock and translate failure to the absent-eligible-parent result. | Accepted — re-review passed |
| RV-C004 | Major | Legacy admission stays held through the provider request after Argon2 work finishes. | Release admission after bounded verification, then perform the credential-free hook/provider handoff outside the protected block. | Accepted — re-review passed |
| RV-C005 | Minor | Concurrent secret revokes can both report success and emit duplicate audit records. | Make the update conditional on active state and use the transition result to distinguish already-revoked from missing/cross-parent. | Accepted — re-review passed |
| RV-C006 | Major | Migration Down removes a mapping that may have existed before the migration. | Make Down a documented no-op because insertion provenance is indistinguishable. | Accepted — re-review passed |
| RV-001 | Major | Import validation substitutes a fake callback and persists an empty redirect list, bypassing the shared 1–10 rule. | Validate the real manifest and require redirect URIs for imported clients. | Accepted — re-review passed |
| RV-002 | Major | The active-secret cap throws an untyped error that becomes HTTP 500. | Raise the existing bounded client validation error and verify the fixed 4xx route category. | Accepted — re-review passed |

All resolutions are necessary corrections inside the confirmed Phase 1 behavior. Authority: AI —
delegated by `--auto-design`; category: internal correctness, concurrency, migration, and failure
mechanics. Objective: satisfy the approved server/security contract without scope expansion.
Rejected alternative: waive or defer findings despite a green suite; this would ship concrete
security and correctness defects. Strongest counterargument: several fixes require extra race
fixtures, but they test already approved invariants rather than new behavior. Confidence: High.
Hardening: three independent reviews, with the concurrency auditor providing concrete schedules.
Policy version: 1. Root invocation ID: `exec-rd04-20260830T1228`. Reopen trigger: a fix changes
product behavior or cannot preserve the immutable specification expectations.

**Re-review evidence:** all eight fixes were accepted; 6 focused files and 150 tests passed on
Node 24.20.0. The post-fix gate passed Node 24 `yarn verify`, the retained OIDC harness 6/6, and
operational protocol assurance 15/15. No critical or major finding remains.
