# Phase Reviews: Applications and OIDC Clients

> **Document**: 01-phase-reviews.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-08-30 16:42
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

## Phase 2: SDK and Conventional CLI Contracts

**Baseline tree:** `605722dfa75b86fc94c52f2f1f45e7beff2eefe8`

**Pre-review verification:** focused SDK specifications 20/20; conventional CLI specifications
23/23; SDK 451/451; CLI 784/784; repository structure 96/96; Node 24 `yarn verify` passed.

**Reviewers:** correctness/maintainability/standards/API reviewer; security and terminal-output
auditor.

| ID | Severity | Finding | Resolution | State |
| --- | --- | --- | --- | --- |
| P2-RV-001 / RV-S001 | Major | Successful SDK responses were trusted without validating wrappers or the confidential/public one-time-secret invariant. | Validate every application/client response with fixed public errors; require a confidential create secret and reject a public create secret. | Accepted — re-review passed |
| P2-RV-002 / RV-S003 | Major | Conventional CLI help and a contract fixture implied that the generated OIDC `client_id` could target internal-UUID-only Admin routes. | Use and document internal client UUIDs for get/mutation/history operations; retain slug resolution only where the command actually performs it. | Accepted — re-review passed |
| P2-RV-003 / RV-S002 | Major | Stored server values could emit terminal control sequences in human CLI output, including the one-time plaintext display. | Sanitize C0, DEL, and C1 controls at human-output and readline prompt boundaries while leaving JSON serialization unchanged. | Accepted — final re-review passed |
| P2-RV-004 / RV-S004 | Major | Token endpoint authentication remained an unrestricted string and two approved public aliases were absent from the barrel. | Close the authentication-method union and export all approved aliases. | Accepted — re-review passed |
| RV-S005 | Minor | Empty list commands emitted a warning or no machine-readable result under `--json`. | Emit the valid empty page or array in JSON mode and retain the human warning otherwise. | Accepted — re-review passed |
| RV-S006 | Minor | Client list advertised application slugs but passed the value directly to a UUID-only server filter. | Document the existing list filter truthfully as an application UUID. | Accepted — re-review passed |
| P2-RV-005 | Major | Server list responses omitted required `effectiveLoginMethods` even though create/get/update already returned that approved projection. | Reuse the existing response decorator for offset and cursor client lists and add focused route regressions. | Accepted — re-review passed |

All resolutions are contract corrections inside the confirmed Phase 2 behavior. Authority: AI —
delegated by `--auto-design`; category: public-contract correctness, response validation, and safe
terminal rendering. Objective: make the existing SDK and CLI match the approved server contract
without a new command family, dependency, API, or generalized layer. Rejected alternative: weaken
the public projection or defer concrete mismatches to the UI phases. Confidence: High. Hardening:
two independent reviews plus focused post-fix SDK, CLI, and server gates. Policy version: 1. Root
invocation ID: `exec-rd04-20260830T1228`. Reopen trigger: a fix changes product behavior or cannot
preserve the approved contract.

Three immutable test corrections were necessary because their fixtures contradicted approved
behavior: the token authentication oracle now uses the closed server allowlist; internal client
routes use an internal UUID fixture; and later-page rejection fixtures contain valid first-page
entities so the intended transport failure is reached. These corrections do not broaden a product
expectation. The small server-route addition is the direct producer-side half of the already
approved required client projection.

**Post-fix evidence before re-review:** focused SDK tests 53/53 and its permanent type oracle
passed; focused CLI tests 123/123 and typecheck passed; SDK, CLI, and server lint passed; focused
server route tests 33/33 and server typecheck passed.

**Re-review evidence:** six findings passed the first fix re-review. The remaining terminal-output
finding exposed unsanitized readline confirmations; the shared prompt boundary and regression were
added, focused CLI tests passed 124/124, and the permitted final re-review accepted the fix. No
critical or major finding remains. The final Node 24 root `yarn verify` passed in 11m39s with SDK
455/455, CLI 792/792, server unit 2,913/2,913, integration 392/392, E2E 128/128, pentest 224/224,
and repository structure 96/96.

## Phase 3: Admin State, Services, and Controllers

**Baseline tree:** `b6ab2c17fdc06bdc250f6d7e1acfcf39ea01c7fd`

**Pre-review verification:** immutable specifications 58/58; focused implementation/specification
suite 63/63; CLI 855/855; repository structure 96/96; Node 24 `yarn verify` passed.

**Reviewers:** correctness/maintainability/plan reviewer; security, tenant-context, and plaintext
ownership auditor.

| ID | Severity | Finding | Resolution | State |
| --- | --- | --- | --- | --- |
| RV-P3-001 / P3-SEC-001 | Major | Client and secret operations accepted an organization UUID but could dispatch a foreign client UUID. | Resolve and validate the client against the selected organization before every existing-client operation, then add a no-dispatch table across all operation families. | Accepted — final re-review passed |
| RV-P3-002 / P3-SEC-003 | Major | Missing or failed one-time-secret presentation could silently lose plaintext, and controller continuations retained the create result during presentation. | Treat missing/failed presentation and malformed post-mutation responses as reconciliation-required; synchronously hand plaintext to a separate presenter continuation without retaining the result frame. | Accepted — final re-review passed |
| RV-P3-003 | Major | Phase 3 marked speculative detail/action controller APIs complete even though concrete view intents are defined in Phases 4 and 5. | Correct the design and execution tasks so Phase 3 owns list/context/reconciliation foundations and Phases 4/5 add exact controller intents beside their real views. | Accepted — final re-review passed |
| RV-P3-004 / P3-SEC-002 | Major | Retained client responses admitted incompatible protocol combinations, malformed URI/origin shapes, normalized timestamps, and arbitrary ETags. | Mirror the approved protocol relationships and safe URI/origin shapes; require canonical UTC instants and the server's exact weak-ETag format. | Accepted — final re-review passed |
| RV-P3-R001 | Major | Organization context could change while ownership preflight awaited, allowing a later mutation dispatch whose result was only quarantined afterward. | Carry the controller abort signal through mutation operations and check it after ownership preflight immediately before dispatch. | Accepted — final re-review passed |

All resolutions are narrow corrections inside the confirmed Phase 3 security and workflow
boundary. Authority: AI — delegated by `--auto-design`; category: response validation,
organization-context integrity, transient-secret ownership, and plan precision. No generalized UI
framework, dependency, persistence, polling, search, pagination control, or multi-operator behavior
was added. Two existing specification fixtures were corrected additively for the expanded exact
capability shape and the new lifecycle abort signal; no approved expectation was weakened.
Confidence: High. Hardening: two independent reviewers and two bounded re-review rounds. Policy
version: 1. Root invocation ID: `exec-rd04-20260830T1228`. Reopen trigger: a fix changes product
behavior beyond the approved organization-bound application/client administration contract.

**Re-review evidence:** final focused Phase 3 tests passed 84/84, CLI typecheck/lint passed, and
both reviewers reported no remaining critical or major finding. Final Node 24 `yarn verify` passed
in 10m47s with SDK 455/455, CLI 873/873, server unit 2,913/2,913, integration 392/392, E2E
128/128, pentest 224/224, and repository structure 96/96.
