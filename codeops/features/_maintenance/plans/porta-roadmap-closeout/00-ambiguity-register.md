# Ambiguity Register: Porta Roadmap Closeout

> **Status**: ✅ GATE PASSED — all 15 decisions resolved (11 creation-time + 4 preflight); named exclusions retained
> **Last Updated**: 2026-11-01 00:30
> **CodeOps Artifact Schema**: 1

## Planning scope contract

| Boundary | Description |
| --- | --- |
| Planning target | `_maintenance/T-07`: coordinated active-work closeout, as confirmed in AR-3; deferred campaigns remain outside execution. |
| Context artifacts | Repository guidance, portfolio and feature roadmaps, linked execution plans and findings, existing verification commands, Git history and read-only GitHub merge/release/CI evidence. |
| Authorized planning modification set | Only this new document set under `/home/gevik/.opencode/plan/porta-roadmap-closeout/`. Plan mode prohibits repository edits. No upstream document, checklist, test, policy or workflow is changed during planning. |

## Decisions

| # | Category | Question / boundary | Recommendation or known decision | Authority / status |
| --- | --- | --- | --- | --- |
| 1 | Scope | May this work release or promote current work to main? | No. Historical release evidence may be read to reconcile old tasks; no new promotion, release or deployment. | User: “do not release just yet” — ✅ Resolved |
| 2 | Scope | Include Admin UI backlog implementation? | No. Preserve its backlog and record the current scheduling decision without inventing completion. | User: “admin ui can wait” — ✅ Resolved |
| 3 | Scope | Does closeout include the explicitly deferred assurance campaigns? | Close active unfinished work: historical release tracking, superseded assurance blockers, tenant-management evidence, pnpm verification and derived roadmaps. Preserve separately deferred campaigns and security decisions as open. | User selected “Active closeout (Recommended)” — ✅ Resolved |
| 4 | Behavior / technical | What happens if missing verification reveals an implementation defect? | Bounded repairs within existing components, with specification-first regression coverage when behavior changes. Security-oracle changes, baseline acceptance, dependency-policy changes and material new infrastructure require a separate explicit ruling. | User selected “Repair defects (Recommended)” — ✅ Resolved |
| 5 | Integration / success criteria | Where does execution finish? | Integration into develop followed by green post-merge CI, with an exact verified PR head. This planning request itself performs neither. | User selected “Merge to develop (Recommended)” — ✅ Resolved |
| 6 | Naming / ownership | Where should the plan be registered when execution is authorized? | `_maintenance/T-07`, slug `porta-roadmap-closeout`; future repository location `codeops/features/_maintenance/plans/porta-roadmap-closeout/`. Original plans own their existing task outcomes; this plan owns reconciliation and new verification work. | User selected “Approve (Recommended)” for plan ownership and checks — ✅ Resolved |
| 7 | Verification | Which gates apply? | Repository policy: manual document/link review plus task-count checks (the plan helper checks structure/`Implements`, not links); `pnpm test:changed` and `pnpm test:structure`; affected workspace checks if code changes; clean-checkpoint registered assurance/compatibility selectors and coverage evidence required by the original tasks; full `pnpm verify` in CI. Preserve failures, limitations and cleanup ownership. | User selected “Approve (Recommended)” for plan ownership and checks — ✅ Resolved |
| 8 | Data / security evidence | Can aggregate success or successor completion close an original task? | Only task-matched proof with revision, selector/profile, exact cases and cleanup. Preserve failed history. Refresh absent/current-source evidence with existing runners; rerun tenant production-security if exact retained probe evidence is unavailable. Successor completion never transfers broader assurance credit. | User selected “Approve complete contract” — ✅ Resolved |
| 9 | Verification / security baseline | Which concrete captures and compatibility selectors close pnpm 4.6? | Separate protocol/operational and security/production-security coverage with registered seed `coverage-baseline`. Run explicit compatibility selectors `compatibility`, `tenant-admin`, `admin-data`, `p1-admin`, `protocol`; the generic selector is not an aggregate. Review exact baseline changes independently and obtain the user's value-specific ruling before updating the baseline and reviewed fixture. Keep observation-only enforcement and both promotion flags false. | User selected “Approve complete contract” — ✅ Resolved |
| 10 | Scope / residual assurance | How should M2 and other deferred decisions appear after closeout? | Keep M2's missing control observations, DEF-23 timing authority, DEF-3/5/6/11/17/22 campaigns and consent follow-ups explicitly open, owner user, revisit when separately selected. Original tasks lacking their full required proof remain blocked/qualified; never count them Done merely to close this maintenance plan. Scope completion means the selected active gates pass and remaining named exclusions are truthfully recorded, not all assurance requirements complete. | User selected “Approve complete contract” — ✅ Resolved |
| 11 | Modification boundary | Which existing artifacts may execution reconcile? | The identified maintenance, automated-release, invitation, tenant-management and assurance execution plans/indexes/roadmaps, the tenant `08-handoff.md`, `00-remaining-work.md`, plan-local `08-closeout-evidence.md`, and the portfolio on develop; directly affected public/maintainer documentation only when an approved repair changes documented behavior, with exact paths named before editing. New plan-local evidence; baseline JSON and reviewed ratchet fixture only after the exact review ruling. A bounded repair is inside this boundary once its exact existing source/test paths and governing contract are named; a separate ruling is required only for an immutable oracle/expectation, reviewed baseline, dependency policy, workflow/configuration, or material support-surface change. Protected files and new support infrastructure require their own explicit authorization. | User selected “Approve complete contract” — ✅ Resolved |
| 12 | Verification / repository settings | May execution enable the dependency graph and Dependabot alerts? | Yes. Enable the repository dependency graph and Dependabot alerts, then re-observe ingestion and alert availability. Record the exact prior state (alerts disabled 403, graph SBOM 404, zero manifests) and the settings change. No silent change. | User selected “Enable and re-observe” (preflight PF-001) — ✅ Resolved |
| 13 | Verification / bounded repair | May execution repair the harness cache/log visibility? | Yes, a bounded diagnostic/repair of the existing compose cache wiring and build-log visibility. Name the exact existing paths before editing; no new workflow or security setting. Re-observe both cache scopes across two ordinary pushes. | User selected “Authorize bounded repair” (preflight PF-002) — ✅ Resolved |
| 14 | Historical evidence | Does the develop-dispatched Release run satisfy deferred-invitation 7.1.5? | Record the failed main run `36353633426`, the successful develop-dispatched run `36357391953` that checked out `main`, and the later main no-op `36382460551`; treat 7.1.5 as satisfied by that recorded operational equivalence and close 7.1.6 on verified artifacts. No re-release. | User selected “Accept develop-dispatched run” (preflight PF-004) — ✅ Resolved |
| 15 | Process / completion | How should terminal task 6.3.2 be split? | 6.3.2 publishes the final metadata/handoff commit (including its own mark); the final CI observation is recorded in the handoff as an external gate, with no later checkbox or commit. | User selected “Split terminal task” (preflight PF-005) — ✅ Resolved |

## Evidence behind the questions

- `codeops/features/_maintenance/plans/pnpm-migration/99-execution-plan.md:192,214` retains two unfinished verification tasks. The same document at lines 195 and 235 records stale reviewed coverage-baseline digests; green branch CI alone does not resolve them.
- `codeops/features/test-assurance/00-remaining-work.md:17-24` explicitly separates deferred campaigns and a timing-authority decision from completed follow-up work.
- `codeops/features/test-assurance/plans/def-13-live-boundary/phase-4-review.md:62-69` retains a test-oracle limitation. Closing a superseded blocker must not erase it.
- `codeops/features/tenant-user-management/plans/tenant-m2m-user-management/99-execution-plan.md:230` names the exact failed recovery case. Newer passing evidence is recorded in `codeops/features/user-invitations/plans/tenant-invitation-revocation/00-phase2-quality-review.md:54-60`; case and provenance comparison is still required before changing the old outcome.
- Automated-release PRs #130 and #131 are merged. Release run `36137558382` succeeded; the original rollout checkboxes at `codeops/features/monorepo-migration/plans/automated-release/99-execution-plan.md:101-103` remain inconsistent.
- Deferred invitation creation was promoted through PR #140; its merge has passing CI run `36353238808`, and the feature merge is an ancestor of published tag `v1.11.0`. The old plan at lines 260-262 still has rollout/artifact-verification checkboxes open. Published artifact evidence must be checked rather than inferred solely from tag ancestry.

## Gate handling

The user confirmed the complete contract after the independent challenge. All material planning
decisions are resolved. Exact future baseline values and any unanticipated security-policy changes
remain execution-time approval gates; this plan does not preapprove them.
Administrative metadata cleanup never grants permission to weaken security assertions, silently
refresh reviewed baselines, classify unknown evidence as passing, or execute deferred work.
The preflight decisions PF-001–PF-015 are recorded in `00-preflight-report.md`; AR-12–15 are the
four decisions that changed execution authority or completion semantics.

## Independent evidence-contract challenge

- Role: read-only design challenger, session `ses_e6bee441cffeUa7E3DId2qFkL0`.
- Verdict: reuse exact historical evidence; perform both protocol and security captures;
  aggregate tenant evidence is insufficient; preserve M2 and the deferred security claims.
- Source: `test-harness/assurance/ratchets/index.ts:70-79,203-245` admits security captures only;
  `test-harness/assurance/tests/assurance-ratchets-requirements.ts:3-25` holds separately reviewed
  baseline fixtures; `test-harness/assurance/scripts/run-command.ts:1280-1295` requires an
  explicit compatibility selector.
- Confidence: High on closure rules; individual historical evidence remains subject to inspection.
- Hardening: refined the capture matrix and exact-case proof; no new subsystem proposed.

## Category coverage

Feature/scope gaps: AR-1–3 and AR-10. Behavior/edge cases: AR-4 and AR-8. Technical/integration:
AR-5–7 and AR-9. Data/security: AR-8–11. Non-functional: existing command timeouts, evidence
provenance and owned cleanup under AR-7; no new product performance target. UX/presentation:
truthful roadmap and checklist status under AR-8/10. Stakeholders: user owns reserved rulings
under AR-4/9/10. Naming: AR-6. No user-interface design or product API change is proposed.
