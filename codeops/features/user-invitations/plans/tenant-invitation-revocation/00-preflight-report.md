# Preflight Report: Tenant Invitation Revocation

> **Status**: ✅ PREFLIGHT PASSED — all 8 findings resolved
> **Iteration**: 2 (bounded recheck after user-approved fixes)
> **Artifact**: Full implementation plan at codeops/features/user-invitations/plans/tenant-invitation-revocation
> **Last Updated**: 2026-10-30 12:57
> **CodeOps Artifact Schema**: 1
> **Target manifest SHA-256**: 684f0b850718dad7a593c6b4906d2856432a0dca9b14ffdecd2abf9a25b48aef

SAME-SESSION REVIEW: The parent authored this plan. Five fresh independent auditor contexts scanned the full target; a sixth blind challenger verified the consequential findings. A human security/domain review remains useful for this sensitive boundary. Findings concern the plan only, not unrelated context artifacts.

## Codebase context and scope

TypeScript ESM, Koa, PostgreSQL, Redis and existing SDK HTTP transport. Recon examined invitation creation/acceptance and row locks, actor middleware, audit transactions, strict limiter, server mounting, migration runner, SDK domain/types, integration/E2E fixtures and exact structure/type-test contracts. Sources and existing CodeOps workflows are context; the eight plan files are the audit/modification target. Strict scope and the original/minimum design in 00-index remain frozen; AR #1–9 decisions are not reopened. No implementation, new machinery or optional feature is proposed by this audit.

## Coverage

| Dimensions | Independent session | Findings |
| --- | --- | --- |
| 1 Ambiguities; 3 Logical contradictions; 12 Consistency | ses_e73688cceffeJlYoPD0hUFw1nH | PF-004/005 |
| 2 Implicit assumptions; 13 Codebase alignment (all ten checks) | ses_e73688c65ffeFgQ9yu5nYR5biO | PF-001/002/006 |
| 4 Completeness; 5 Dependencies; 11 Ordering | ses_e73688c53ffe41cf3rtmmy138Q | PF-002/003/007 |
| 6 Feasibility; 8 Security; 9 Edge cases; web/concurrency/migration lenses | ses_e73688c13ffeDE2E3UyMSquWza | PF-004/008 |
| 7 Testability; 10 Scope creep | ses_e73688bf8ffeA3DvJ3gwAFN3y0 | PF-002 |
| Blind consequential finding challenge | ses_e73639c84ffe0QuV6VVCgTy17n | Major findings upheld; separate spec/implementation tasks must remain |

Severity totals: 0 critical, 3 major, 5 minor, 0 observations. New product-security design defects: none found. Adversarial checks covered guessed ownership, deleted applications, real lock ordering, false-success auditing, timing claims and unknown-outcome retries; accepted tradeoffs remain AR-owned. PostgreSQL grounding: ALTER TABLE Description requires ACCESS EXCLUSIVE unless noted; Read Committed waiting updates recheck predicates (PostgreSQL documentation, ALTER TABLE and Transaction Isolation §13.2.1).

## Findings and decisions

### PF-001 — Exact test inventory impact 🟠 MAJOR

**Dimensions:** 4, 13. **Location:** 07 test placements; 99 new test tasks/structure gate.
**Evidence:** repo-tests/monorepo/server-package.spec.test.mjs:410–447 asserts exactly 379 server/55 SDK files. Mandatory placements add seven server/two SDK files.
**Problem:** Required structure verification will fail without acknowledging the affected exact-count contract.
**Options:** Reconcile actual inventories while preserving exact assertions, or consolidate new specifications into existing files and update the planned placements.
**Recommendation:** Include the existing structure fixture in authorized test-maintenance scope; verify actual resulting counts, never weaken to minimum assertions. Avoid speculative counts when the final file set differs.
**User Decision:** User selected “Apply all (Recommended)” for PF-001–PF-008; approved this exact existing inventory fixture change, preserving strict assertions. Applied in plan; execution must verify actual counts.

### PF-002 — New SDK type oracle is not registered 🟠 MAJOR

**Dimensions:** 5, 7, 13. **Location:** 07 ST-22/file placement; 99 task 2.1.1.
**Evidence:** packages/sdk/tests/type-contracts/tsconfig.json:12–24 explicitly lists included files; SDK tsconfig excludes tests; sdk/package.json:37 invokes this dedicated project.
**Problem:** Vitest discovery does not compile this oracle, so ST-22 could be credited without checking types.
**Options:** Register the new filename in the existing type-contract project before red, or add its assertions to the already-included users-contract file.
**Recommendation:** Register the planned file and require SDK typecheck red/green. Reconcile its inventory under PF-001; no new runner.
**User Decision:** User selected “Apply all (Recommended)”; register the new filename in existing compiler project before red. Applied in plan.

### PF-003 — Red verification cannot supply automatic green commits 🟠 MAJOR

**Dimensions:** 4, 11. **Location:** 99 execution rule and Sessions 1.1/2.1.
**Evidence:** exec-plan commit-modes prohibits failed-verification commits; git-commit stops on failing gates. Separate specification and implementation tasks are mandatory under spec-first-ordering.
**Problem:** Confirmed per-verified-task automatic commits conflict with deliberately failing new specifications before implementation.
**Options:** Explicit commit deferral during each specification/red interval until corresponding green gate, or ask at each interval before deferring. Combining specification and implementation into a single task is rejected by specification-first ordering.
**Recommendation:** Approve bounded deferral: intended red is verified by recording the expected failure, marks progress but never authorizes a failing product commit; keep separate tasks, commit/push the accumulated work only after all affected specs and required checks are green, then resume normal automatic commits.
**User Decision:** User selected “Apply all (Recommended)” and explicitly approved intended-red commit deferral until corresponding specs and required checks are green; separate tasks remain. Applied in execution rule.

### PF-004 — “No SQL” contradicts authentication-first validation 🟡 MINOR

**Dimensions:** 3, 6, 9, 12. **Location:** 01 R7 versus 03-02 HTTP.
**Evidence:** tenant-user-auth.ts:197–208 and clients/repository.ts:164–165 may query before target-ID validation.
**Recommendation:** Say no invitation-revocation query/mutation after invalid IDs; allow existing authentication queries. Moving validation before auth would contradict AR #8 and is not recommended.
**User Decision:** User selected “Apply all (Recommended)”; clarify invitation SQL boundary without changing auth order. Applied in R7.

### PF-005 — SDK E2E cannot pass before SDK exists 🟡 MINOR

**Dimensions:** 3, 12. **Location:** 99 task 2.1.3 versus 07 ST-24.
**Evidence:** SDK method is first added in 99 task 2.2.1; current UsersDomain lacks it.
**Recommendation:** Remove Phase-1-green allowance and require ST-24 to invoke the actual new SDK method and record its red before SDK implementation. An HTTP-only test does not satisfy ST-24.
**User Decision:** User selected “Apply all (Recommended)”; actual SDK E2E must be red before SDK method. Applied in 07/99.

### PF-006 — Complete typed CLI fixture needs compatibility stub 🟡 MINOR

**Dimensions:** 4, 13. **Location:** 03-02 SDK impact; 99 task 2.2.1.
**Evidence:** packages/cli/tests/admin/session-wiring.impl.test.ts:143–159 constructs a complete UsersDomain; required additive member makes it statically incomplete. Current CLI compiler excludes tests, so this is not claimed as a demonstrated CI failure.
**Recommendation:** Authorize this exact fixture-only stub; no CLI production behavior. Do not broaden the excluded CLI feature scope.
**User Decision:** User selected “Apply all (Recommended)”; explicitly approved the exact typed CLI fixture stub only. Applied in impact and task.

### PF-007 — Final checkpoint must have its own CI confirmation 🟡 MINOR

**Dimensions:** 4, 11. **Location:** 99 tasks 2.3.5–6.
**Recommendation:** Reconcile substantive docs before final gates; after final evidence/status push, confirm CI on that exact final HEAD. Preserve assurance's distinct clean revision/tree provenance; docs-only updates do not silently expand assurance claims.
**User Decision:** User selected “Apply all (Recommended)”; final pushed evidence HEAD requires CI confirmation. Applied in final task.

### PF-008 — Migration lock precondition unspecified 🟡 MINOR

**Dimensions:** 6, 9; data/migration lens. **Location:** 03-01 rollout.
**Evidence:** Existing migration runner lib/migrator.ts:25–38 sets no lock timeout. Nullable/no-backfill DDL still takes an ALTER TABLE lock; external deployment controls are unverified.
**Options:** Controlled maintenance/drained transactions, or explicitly bounded live lock/statement timeouts and abort handling.
**Recommendation:** Use existing controlled maintenance procedure: drain active invitation transactions, verify migration ledger/schema before enabling feature code, back up before any ownership-destroying down migration. No new deployment machinery or zero-downtime promise.
**User Decision:** User selected “Apply all (Recommended)”; existing controlled maintenance/drained transaction precondition, no new infrastructure. Applied in rollout.

## Hardening

Confidence: High on direct code/contract findings; Medium on external deployment locking, whose configuration is unverified. Hardening: combined repeated type-project findings; retained separate spec tasks and proposed only a bounded green-commit checkpoint. Challenger: converged on findings and rejected combining specification and implementation into one task.

## Reviewed content identity

Iteration 2, session `ses_e7355e655ffeSi9kFz76exqRwl`, independently verified every correction and rescanned all thirteen dimensions plus the three domain lenses. All PF-001–008 resolved; no new or residual finding. The 00-index status-only transition to preflight passed does not change semantics. First-scan manifest below is retained for provenance; corrected manifest follows after validation.

SHA-256 manifest uses sorted filenames plus a space plus each file SHA-256, newline-terminated. Report files and review notes are excluded.

```text
00-ambiguity-register.md 0612232480f969f8995403701300b3db68f03a6af381a70dadaab0a66e50d343
00-index.md d762a0cc03d3418036be2fc7e79ee08cfc6beceb2718e628eb5cf9b721dc17a7
01-requirements.md bba996a5ebeaa2ef737d5166e23f4c6fa100eec7048ee842bd661bded99047f5
02-current-state.md 1a3d328e258cd59780efa076d3aa0b739903f5d9674177f6c740a2c3d48d6b3d
03-01-storage-and-revocation.md 11512d9f862b4856d98d61bed76e0bfa761b13c176eb71dc59d2b164ed67b79a
03-02-api-and-sdk.md 094a24682d2958f3881e34d0115e1a8dc4cdbb53ffba34062a0e7f03daba8278
07-testing-strategy.md ef8cbce62f0ff54fa637175013583b39fc206669118d79ec52f3bf77d6cbd1ae
99-execution-plan.md b27e7e06a80c267ce5fd58caba1e562994af93f10f6497534363d9258c74caa9
```

Iteration-2 corrected manifest SHA-256: `0efc8dfef3e15b9737da3f882412e2129c25294dab62b1c4a669d9075d81e8ca`.

```text
00-ambiguity-register.md 0612232480f969f8995403701300b3db68f03a6af381a70dadaab0a66e50d343
00-index.md d39f92e97f6473d133a7e779794351d0978c00717ee9e1ab8df7ca29ee336e5b
01-requirements.md ad535ffceb3bc87983d53f1fdee0108b4592466af2f24cc2b15fc3896841accf
02-current-state.md 1a3d328e258cd59780efa076d3aa0b739903f5d9674177f6c740a2c3d48d6b3d
03-01-storage-and-revocation.md df0d080ca126dac596a2fa89a1ac776a48421b205e7467e549033be0a96fcc83
03-02-api-and-sdk.md 038bde48c9489f8f4fdae27599e0b390ff61b2494bb19abd0c8ecd8aebe21623
07-testing-strategy.md e3b8f418a99fa5be7dcd99c2643366d6b9587b2945fb7b475cee5d60f9e1744f
99-execution-plan.md 0f1628d40c2f9f7e4cad17678aa95a0701cd46f39707ffb823fdbf9d8c8c047a
```
