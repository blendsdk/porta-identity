# Ambiguity Register: PostgreSQL-Backed Global Configuration

> **Status**: Phase 2 execution authorized; AR-20 publication evidence remains pending
> **Last Updated**: 2026-09-16 18:55

| #     | Category                     | Ambiguity / Gap                                                                                                              | Options Presented                                                                                                                                                                                                                                                                                                                                                             | User Decision                                                                                                                                                                                                     | Status      |
| ----- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| AR-1  | Scope                        | What is the planning target and modification boundary?                                                                       | Implement all RD-03 Must/Should criteria within `production-readiness`; read related code/docs for context; modify only this plan set and the feature roadmap during planning.                                                                                                                                                                                                | Imported from approved RD-03 and the user's instruction to proceed.                                                                                                                                               | ✅ Resolved |
| AR-2  | Scope & security             | Which values are editable, and what stays external or internal?                                                              | Closed 18-key catalog / arbitrary keys; keep bootstrap, infrastructure, root secrets, and internal rows outside the public surface.                                                                                                                                                                                                                                           | Imported from requirements AR-13–AR-14 and approved RD-03 AC-01–AC-10. Use the closed catalog and uniform non-enumerating errors.                                                                                 | ✅ Resolved |
| AR-3  | Technical                    | How do runtime changes propagate?                                                                                            | Existing process-local cache with local post-commit clear / distributed invalidation machinery.                                                                                                                                                                                                                                                                               | Imported from requirements AR-14/AR-19 and PF-010. Keep the existing 60-second cache, clear locally after commit, and require restart for provider-startup lifetimes.                                             | ✅ Resolved |
| AR-4  | Technical                    | How is the catalog shared across workspaces and SQL?                                                                         | Server runtime catalog plus API-driven clients and contract tests / new shared package or generator.                                                                                                                                                                                                                                                                          | Imported from PF-007. Keep one server runtime catalog; SDK owns small public types; API metadata drives CLI/Admin UI; SQL parity is verified by tests.                                                            | ✅ Resolved |
| AR-5  | Data & migration             | What happens to existing public configuration values?                                                                        | Overwrite all canonical keys with exact native JSONB defaults and delete obsolete public rows / inspect and preserve legacy values.                                                                                                                                                                                                                                           | Imported from PF-006 and approved RD-03 AC-15. Overwrite directly; keep internal rows; document Down as a no-op.                                                                                                  | ✅ Resolved |
| AR-6  | Integration & audit          | Which transaction and audit boundary owns updates?                                                                           | Config routes own one existing transaction, one specialized audit row, and a post-commit cache clear / generic mutation wrapper or generalized audit framework.                                                                                                                                                                                                               | Imported from PF-004. Exclude config mutations from the generic wrapper and reuse existing transaction/audit/post-commit facilities.                                                                              | ✅ Resolved |
| AR-7  | Data & integration           | How are supported locales defined and exposed?                                                                               | Small tested server allowlist with API `allowedValues` / runtime filesystem discovery.                                                                                                                                                                                                                                                                                        | Imported from PF-005. Use `SUPPORTED_LOCALES`, initially `en`, and verify every required namespace.                                                                                                               | ✅ Resolved |
| AR-8  | Behavioral & edge cases      | When do changed duration and limit values affect existing state?                                                             | Apply the approved per-storage timing rules / rewrite database or Redis state.                                                                                                                                                                                                                                                                                                | Imported from PF-008–PF-009. Preserve absolute and Redis expiries; read recovery TTL at artifact creation; use current lockout duration on the next eligibility check; apply changed maxima on the next decision. | ✅ Resolved |
| AR-9  | Behavioral                   | How do runtime fallback and authoritative Admin reads differ?                                                                | Runtime typed getters use catalog defaults with fixed safe warnings; Admin reads/updates fail with fixed safe `503` / return fallback values through Admin APIs.                                                                                                                                                                                                              | Imported from PF-002–PF-003. Keep runtime resilience separate from authoritative Admin responses.                                                                                                                 | ✅ Resolved |
| AR-10 | API                          | What are successful single and batch response shapes?                                                                        | Single entry plus `restartRequired`; batch entries plus `restartRequired` / force both to arrays.                                                                                                                                                                                                                                                                             | Imported from PF-011. Use the natural single-resource and collection envelopes in RD-03.                                                                                                                          | ✅ Resolved |
| AR-11 | UX                           | How is the global workspace reached and how are its four groups edited?                                                      | A: top-level `System Configuration…` menu command opening one full-page four-tab workspace with one workspace-wide Save/Cancel footer / B: one long form surface with the same footer.                                                                                                                                                                                        | User accepted A.                                                                                                                                                                                                  | ✅ Resolved |
| AR-12 | Behavioral & security        | What exact fixed public errors and runtime warning fields are planned?                                                       | A: safe `error` + required `code` (+ `requestId` on `503`), and warning `{ event: 'system-config-fallback', key, reason }` with `missing\|invalid\|unavailable` / B: codes only and one undifferentiated warning reason.                                                                                                                                                      | User accepted A.                                                                                                                                                                                                  | ✅ Resolved |
| AR-13 | CLI & UX                     | How does conventional `porta config` convert and explain values?                                                             | A: fetch catalog metadata, reject non-catalog keys, parse the positional string to the declared native scalar, and show type/range/mode in list/get output / B: add per-key generated subcommands.                                                                                                                                                                            | User accepted A.                                                                                                                                                                                                  | ✅ Resolved |
| AR-14 | Technical & naming           | What is the smallest implementation partition?                                                                               | A: one server catalog module plus focused edits to existing runtime/routes; extend existing SDK/CLI modules; add the established Admin UI service/state/workspace/controller quartet; migration `030`; no new package/framework / B: add a shared config subsystem or generator.                                                                                              | User accepted A.                                                                                                                                                                                                  | ✅ Resolved |
| AR-15 | Non-functional               | Which verification and coverage contract governs execution?                                                                  | A: RD-03 focused specs, affected workspace verifies, `yarn test:structure`, `yarn test:ui`, `yarn docs:build`, `yarn assurance:harness --project security --profile production-security`, clean-revision `yarn assurance:compat --select p1-admin`, and final `yarn verify`; use project coverage defaults / B: omit the separate UI, docs, security, or compatibility gates. | User accepted A.                                                                                                                                                                                                  | ✅ Resolved |
| AR-16 | UX                           | What exact derived duration text satisfies AC-21?                                                                            | A: show one largest exact whole unit (`60 seconds` → `1 minute`, `3600` → `1 hour`, `604800` → `7 days`); otherwise show exact seconds / B: build compound text such as `1 hour, 1 minute`.                                                                                                                                                                                   | User accepted A.                                                                                                                                                                                                  | ✅ Resolved |
| AR-17 | UX & naming                  | How are catalog labels and descriptions named?                                                                               | A: use concise human labels derived directly from the approved keys and one-sentence operational descriptions; keep exact key/type/unit/range/mode visible in metadata / B: expose technical key names as labels.                                                                                                                                                             | User accepted A.                                                                                                                                                                                                  | ✅ Resolved |
| AR-18 | Execution workflow (runtime) | How can per-task automatic commits coexist with intentionally failing specification tests and green pre-commit gates?        | Defer automatic commit/push until the phase reaches a fully verified green checkpoint; keep specification-first ordering and per-task progress updates. Red-suite commits and weakened verification are rejected.                                                                                                                                                             | User approved: "you may, proceed" on 2026-09-16. Automatic commit/push at passing verification checkpoints; all gates and product scope unchanged.                                                                | ✅ Resolved |
| AR-19 | Execution workflow (runtime) | How can mandatory production-security assurance run before commit when its provenance check requires a clean committed tree? | A: green root/workspace/structure/UI, unpublished local candidate commit, clean-revision security gate, push only after security passes / B: temporary clean verification worktree and candidate revision.                                                                                                                                                                    | User approved A: "i approve" on 2026-09-16. Timing exception only; all security gates remain mandatory before push.                                                                                               | ✅ Resolved |

| AR-20 | Runtime verification | Existing session-expiry observer uses a retired string TTL; three forwarding observations remain registered incomplete. | A: align the existing observer to native 300 seconds after Phase 2, preserving natural-expiry assertions; B: separately accept only the exact registered observer gaps if all actual assertions and cleanup pass. | User delegated the choice. Select A; B not selected. Phase 2 may proceed; publication awaits corrected security evidence. | ⏳ Publication pending |

## Resolution Notes

### AR-20: Existing Security-Gate Contract Alignment (runtime)

**Status:** User delegated the choice: "make the best possible choice for me without
overcomplicating or overengineering". Select A: authorize the narrow observer alignment and
Phase 2 execution. Do not select B now. Publication remains blocked pending corrected gate
evidence. No incomplete security evidence is waived.
**Category:** Necessary existing test-contract alignment and evidence classification.

The clean Phase 1 candidate `cde6cd5a` passed root verification and all 133 browser tests.
Production-security returned exit 40. Its collector recorded eight passes, no product failures,
three registered forwarding-observer gaps and no execution failures. A later session-expiry
assertion failed at `human-auth-functional-session.ts:253`: its setup submits `{ value: '1' }`
and waits 1.5 seconds. The approved catalog requires native integer session TTL at least 300.
Runtime correctly rejects that legacy string and uses its safe default. Phase 1's legacy API
accepts only strings; valid native updates require the already-planned Phase 2 API. This stale
setup does not establish a product session-expiry vulnerability. Failed evidence remains in
`/tmp/porta-config-phase1-clean-production-security.log`; cleanup completed, no push occurred.

**Recommendation A:** Keep Phase 1 unpublished, continue approved Phase 2 specification-first
work, and align only the existing observer setup to native `{ value: 300 }` plus its existing
restart and a 301.5-second natural-expiry wait. Preserve every expiry/list assertion. The existing
900-second suite budget accommodates the wait. Forced database/Redis expiry would change the
natural configured-lifetime oracle and add machinery; it is rejected. Run root/UI and clean
production-security verification at the complete Phase 2 checkpoint before publication.

**Separate recommendation B:** If every actual assertion and cleanup passes, accept only the
exact three pre-existing forwarding-observer gaps registered in `aggregate/registry.ts:10–49`
for this feature checkpoint. Retain and disclose `incomplete`, never claim a full security pass.
Unexpected gaps, assertion/execution/cleanup failures remain blocking. If not accepted, keep
publication blocked pending separately authorized assurance remediation.

**Exact scope amendment:** Existing
`test-harness/assurance/tests/human-auth-functional-session.ts` setup only; this register,
execution scope/checkpoint/evidence, testing-strategy enrollment and isolated feature roadmap.
Phase 2 product/test targets are already approved. No security-bound relaxation, assertion change,
new scenario, clock service, harness, worker or global policy rewrite is requested.

Independent challenge supports A as the smallest oracle-preserving correction; independent
audit classifies B's gaps as baseline observer limitations, not a new Phase 1 finding.
Confidence: High. The delegated decision authorizes A only. Reassess the registered observer
limitations after the corrected gate runs; do not expand assurance scope or publish meanwhile.

### AR-19: Clean-Revision Assurance Ordering (runtime)

**Category:** Execution workflow; narrow verification/commit timing exception.
**Status:** Resolved. User explicitly approved the recommended timing exception on 2026-09-16.

The production-security collector returned exit 30, `stage=collector`, with no observation artifact.
The evidence writer calls `inspectFoundationProvenance()` in
`test-harness/assurance/production-exposure/evidence.ts:157`; the provenance check in
`test-harness/assurance/scripts/source-provenance.ts:59–65` rejects any dirty source tree.
A read-only probe confirmed this exact rejection. Independent admission and constructor probes
passed; no product-security assertion failure was identified. Failed gate evidence remains in
`/tmp/porta-config-phase1-production-security.log`. The temporary diagnostic stack was stopped
successfully; no test assertion or provenance check changed.

**Recommendation:** After root/affected-workspace, structure and applicable UI gates pass, permit
one unpublished local candidate commit. Run production-security against that clean exact commit;
push only after security passes. On failure keep the candidate unpublished, preserve evidence,
fix and verify without weakening assertions. This changes gate ordering only, not product scope
or the requirement to pass every gate before publishing.

**Alternative considered:** A temporary clean verification worktree/commit can preserve literal
security-before-branch-commit ordering, but adds worktree/service/revision-transfer coordination
without useful additional protection over an unpublished candidate.

The independent challenger confirmed the recommendation as the smallest secure workflow.
Confidence: High. Exact proposed modification set: this register and the execution plan's
checkpoint timing policy/status/evidence. No global policy rewrite or security waiver is requested.

**AR-1:** Planning target: `production-readiness/RD-03`. Context artifacts include the approved RD,
its preflight report, requirements ambiguity register, existing plans, relevant source/tests, and
operator/developer documentation. The planning modification set is this plan folder plus the
feature roadmap. Upstream requirements remain read-only unless a necessary correction is proven
and separately authorized.

**AR-11:** Recommendation A follows the existing full-page workspace and tab patterns while keeping
all dirty values in one state model. Save sends one batch containing every changed value; Cancel or
workspace close uses the one approved discard confirmation. The footer remains visible while tabs
change.

**AR-12:** Recommendation A preserves the fixed public codes from RD-03 while giving operators a
safe request correlation only for an unavailable store. The warning fields are bounded and contain
neither stored content nor raw exceptions.

**AR-13:** Recommendation A preserves the current `config set <key> <value>` command and uses the
server-owned metadata already required by RD-03. Generated commands would duplicate the catalog and
add machinery.

**AR-14:** Recommendation A is the minimum-sufficient design grounded in the current direct config
route/runtime modules and the Admin UI's existing focused-workspace pattern. Option B is outside the
approved no-framework/no-generator boundary.

**AR-15:** Recommendation A is the approved RD-03 verification contract plus the repository's
documented docs and SDK/CLI compatibility gates. Specialized aggregate, coverage, mutation, fault,
or stability tooling is not part of routine execution.

**Gate confirmation:** On 2026-09-16, the user confirmed the complete register and accepted Option
A for AR-11–AR-15. All earlier entries retain their imported approved authority.

**AR-16:** Recommendation A is deterministic, keeps the exact stored seconds visible, and needs no
duration parser or localization subsystem. Compound formatting adds presentation logic without
improving configuration accuracy.

**AR-17:** Recommendation A keeps the UI readable while preserving every exact technical field in
API metadata and CLI output. The descriptions explain operational effect only; they do not create
new behavior.

**Final gate confirmation:** On 2026-09-16, the user accepted Option A for AR-16 and AR-17. The
register is complete and the plan-authoring gate is open.

## Approved Preflight Refinements

On 2026-09-16 the user approved all nine simplified preflight corrections. PF-001 refines the SDK
read signature to accept untrusted string keys while mutation keys remain closed. PF-002 refines
AR-9 and RD-03 AC-14: a valid update may replace corrupt targeted content without reading the old
value; missing rows and invalid readback still fail atomically. The exact upstream AC-14 amendment
was explicitly approved. PF-003–PF-009 add direct cache completion protection, existing test
enrollment/contract alignment, specification-first real migration coverage, a measured UI minimum
with existing resize guidance, raw-text/native-value equality and the correct criterion count.
No new architecture, framework, worker, compatibility or concurrent-editor behavior was approved.

## Runtime Execution Checkpoint

**AR-18:** The execution protocol requires commit/push after each verified task in auto-commit
mode, while the approved phase first authors missing-feature specifications and records red.
The commit skill and AGENTS.md prohibit committing failed workspace verification. The first new
catalog specification imports a module deliberately absent until task 1.2.1; its red collection
failure therefore cannot coexist with a green workspace test gate before that implementation.
The smallest correction is commit timing only: retain separate specification/red/implementation/
green tasks and automatic pushes, but checkpoint only after all applicable pre-commit gates pass.
No task is represented as product-verified before its required verification succeeds.
The exact modification set is this register, the execution plan's checkpoint policy and task
states, and the feature roadmap. No new machinery, security waiver or product change is proposed.
The independent specification author confirmed the conflict and recommended green checkpoints.
The user explicitly approved this commit-timing correction. Specification-authoring tasks are
verified by independent oracle review, formatting/lint and expected-red evidence, not represented
as passing product behavior. Implementation tasks retain focused checks; automatic checkpoints
wait for green specifications and every applicable pre-commit workspace/structure gate.
