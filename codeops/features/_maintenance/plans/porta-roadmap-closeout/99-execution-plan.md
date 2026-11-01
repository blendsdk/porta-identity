# Execution Plan: Porta Roadmap Closeout

> **Parent**: [Index](00-index.md)
> **Implements**: _maintenance/T-07
> **Status**: Preflighted — iteration 2 verified; ready for execution; staged outside the repository
> **Last Updated**: 2026-11-01 13:33
> **Progress**: 27/44 tasks (61%)
> **CodeOps Artifact Schema**: 1

## Execution Contract

Execute only after switching to Build mode and promoting this plan. Apply `exec-plan`; this
file is the sole mutable task-progress authority for the closeout. Original plans remain the
authorities for their pre-existing tasks. Do not duplicate these checkboxes in another ledger.

- Mark implementation `[~]` immediately with a real timestamp. Mark `[x]` only after that task's
  verification passes. Update this header and the maintenance row after each transition.
- Record `[!]` plus a concrete blocker when an active obligation cannot pass. Resume the first
  `[~]`, otherwise the first `[ ]`; never skip a failed security gate.
- All checkpoints use the git-commit skill, with push mode for authorized publication. Use the
  project's narrow local policy; full verification is CI's authoritative gate.
- For a demonstrated defect, insert its exact specification/red/repair/green/implementation-test
  subtasks under the current phase **before** implementation, following 03-02. Update the total;
  require the additional ruling when AR-4/11 applies. Do not implement excluded campaigns.
- Capture each phase's actual starting revision/tree using the existing execution workflow.
  A table below describing intended work is not verification evidence.
- Terminal exception (AR-15): 6.3.2 is verified by publishing the final metadata/handoff commit;
  its CI is observed afterward and recorded in the handoff, not another checkbox or commit.
- Every provenance-bound run starts clean; record intermediate notes outside the worktree until
  it finishes. No source-plan edits while a capture/validation/compatibility run is active.

## Phases

| Phase | Scope | Tasks | Depends on |
| --- | --- | ---: | --- |
| 1 | Establish ownership and reconcile historical delivery | 7 | Approved staged plan |
| 2 | Reconcile tenant and assurance security evidence | 6 | 1 |
| 3 | Complete pnpm compatibility, coverage and reviewed baseline | 11 | 2 |
| 4 | Complete remote dependency and cache evidence | 6 | 3; normal CI runs may accumulate earlier |
| 5 | Final source-owner and feature-roadmap review | 5 | 1–4 |
| 6 | Integrate, reconcile portfolio and verify final develop | 7 | 5 |

**Total: 42 tasks.** Conditional repairs add explicit bounded tasks only when justified by an
actual failure. Existing source-owner aliases and paths are defined in 02.

## Phase 1 — Historical Delivery and Ownership

> **Reasoning**: high — distinguish historical provenance from present-source verification
> **Lenses**: data and migration; distributed and concurrent
> **Phase baseline tree**: 3844c413dddd0c255f49f6508e6540b6c6b2ed17
> **Expected modification set**: closeout plan docs and evidence; automated-release, deferred-invitation, tenant, assurance and portfolio records; pnpm owner metadata; no product source unless an authorized bounded repair is inserted
> **Scope mode**: strict

### 1.1 Specifications and initial evidence

- [x] 1.1.1 Verify `origin/develop` is `c73cc744` (fetch first), the workspace is clean and T-07 is available; create the separate execution branch/session from `origin/develop`, promote this document set including `08-closeout-evidence.md` and `00-preflight-report.md`, and register the maintenance row. Check exact protected-path and AR-12/13 needs before runners. Protected-path check: read-only fingerprint of `~/.porta/credentials.json`; isolated homes under `test-harness/.assurance-runtime/compat`. — `00-index.md`, maintenance roadmap; 03-03 Branch and Artifact Ownership; AR-6/11/12/13. ✅ (completed: 2026-11-01 01:36)
- [x] 1.1.2 Freeze original task obligations and ST-1–3/ST-17 acceptance in `08-closeout-evidence.md`; inspect the candidate merge/CI/release records and record the initial stale-status or missing-proof findings. This is artifact validation, not a fabricated code-test red. — 03-01 Evidence Contract. ✅ (completed: 2026-11-01 09:23)

### 1.2 Source-record corrections

- [x] 1.2.1 Reconcile automated-release tasks 4.1.1/4.1.2 and their index/header against exact historical merges/CI; retain the existing release proof and chronology. — Automated release owner in 02; ST-1/ST-3. ✅ (completed: 2026-11-01 09:24)
- [x] 1.2.2 Reconcile deferred-invitation 7.1.4–7.1.6 using the failed main run, the successful develop-dispatched run and the main no-op; close 7.1.5 under AR-14, close 7.1.6 only on verified artifacts, and keep a precise blocker for missing proof. Correct the plan index status and its `Progress` header to match the proved tasks. — Deferred invitations owner; ST-1–3; AR-14. ✅ (completed: 2026-11-01 09:25)
- [x] 1.2.3 Correct current integration statements in the later-invitation owners, T-06/main v1.15.0 state, the user-invitations portfolio cell and the deferred-invitation index as supported; preserve past scope decisions. — Later invitations owner; 03-01 Historical Rollout Reconciliation. ✅ (completed: 2026-11-01 09:27)

### 1.3 Validation and hardening

- [x] 1.3.1 Independently review historical closure, unique-task counts, links and failure preservation; resolve findings before treating source tasks as verified. — `08-closeout-evidence.md`, touched owners; ST-1–3/ST-17. ✅ (completed: 2026-11-01 09:39)
- [x] 1.3.2 Run `pnpm test:changed` (which includes structure) and the document validation checklist; checkpoint the proved source corrections through the git-commit skill. — 07 Verification Commands; AR-7. ✅ (completed: 2026-11-01 09:41)

**Verify:** ST-1–3/ST-17 artifact checks and the applicable 07 gates. No new automated tests for
Markdown-only work. An unavailable historical artifact is not a reason to release again.

## Phase 2 — Tenant and Assurance Evidence

> **Reasoning**: high — exact security observations and restricted successor credit
> **Lenses**: web application; data and migration
> **Phase baseline tree**: 8de3ba5a626bdba82a7ff414d7084ba29ced3987
> **Expected modification set**: closeout evidence; tenant-management plan/index/roadmap; assurance umbrella, remaining-work and feature summary; no product source unless an authorized bounded repair is inserted
> **Scope mode**: strict

### 2.1 Specifications and baseline

- [x] 2.1.1 Freeze the retained tenant probe/observer obligations and map umbrella tasks 8.7c/9.6b/9.6c to successor evidence and M2; validate ST-4–8 before editing any outcome. — Tenant management, assurance umbrella and successors; 03-01. ✅ (completed: 2026-11-01 09:43)
- [x] 2.1.2 Obtain exact current tenant proof from retained admissible evidence or a fresh clean-checkpoint production-security run; record every selected case, relevant rejection event, observer difference, exit and cleanup. If a failure requires repair, insert the specification/red/repair/green tasks under the current phase in this plan, following 03-02 first. — Existing `human-auth-recovery.spec.test.ts`; ST-4–6. ✅ (completed: 2026-11-01 11:05; green run `069b36ff` after 2.1.3/2.1.4)
- [x] 2.1.3 Repair the audit-visibility race: await the rate-limit rejection audit write in `packages/server/src/routes/interactions.ts` and `packages/server/src/routes/password-reset.ts` before rendering the 429; preserve the response/error shape and every existing assertion. The existing live oracle is the red proof; do not add a weaker duplicate. — 03-02 Bounded Repair; AR-4/7; ST-16. ✅ (completed: 2026-11-01 10:15)
- [x] 2.1.4 Repair the live audit observer to poll for a bounded window, then run the focused tests and rerun the exact production-security harness; record both throttle cases, wrong-tenant cases, the required rejection event, observer set, exit and cleanup. If the event is still missing or an observer disappears, keep 2.1.2 blocked. — ST-5/ST-6; 07. ✅ (completed: 2026-11-01 11:05; green run `069b36ff`)

### 2.2 Source-record reconciliation

- [x] 2.2.1 Reconcile tenant task 5.1.3, index and handoff with the admitted exact evidence, then its feature row. Preserve the original failures and explain changed observer/exit semantics. Apply the chosen tenant counter rule (`n/a (task-only)` or a documented task count) so the feature and portfolio agree. — Tenant management owner; ST-5/ST-6. ✅ (completed: 2026-11-01 11:07)
- [x] 2.2.2 Reconcile the assurance umbrella's three successor-covered blockers and update its remaining-work/feature summary; leave any full obligation that depends on M2 incomplete, and retain all named AR-10 follow-ups. — Assurance umbrella and `00-remaining-work.md`; ST-7/ST-8. ✅ (completed: 2026-11-01 11:10)

### 2.3 Review and validation

- [x] 2.3.1 Obtain independent security/provenance review of the case mapping and closure claims; resolve findings, retaining any required user ruling. — Phase evidence; AR-7/8/10. ✅ (completed: 2026-11-01 11:21)
- [x] 2.3.2 Run affected checks, structure and document validation; verify owned-run cleanup, record sanitized evidence and checkpoint. — 07 and 03-03; ST-19. ✅ (completed: 2026-11-01 11:23)

**Verify:** exact ST-4–8 outcomes; current production-security evidence where required. For a
security behavior repair, add pentest and applicable boundary gates under 07. M2 is not repaired
or silently dismissed by this phase.

## Phase 3 — pnpm Compatibility, Coverage and Baseline

> **Reasoning**: high — reviewed input identities and security-coverage comparability
> **Lenses**: data and migration; web application; distributed and concurrent
> **Phase baseline tree**: 7c3f98e582091a4d5c2d52a0c6eac03b1ad56c87
> **Expected modification set**: closeout evidence; ratchet baseline JSON and reviewed fixture only after the AR-9 value ruling; pnpm owner plan and metadata; generated coverage/result artifacts; no product source unless an authorized bounded repair is inserted
> **Scope mode**: strict

### 3.1 Specifications and red observation

- [x] 3.1.1 Freeze ST-9–12 and the existing immutable ratchet/coverage specifications; inventory all monitored inputs and exact compatibility selectors without changing expectations. — `assurance-ratchets.spec.test.ts`, coverage spec files in 07, `08-closeout-evidence.md`. ✅ (completed: 2026-11-01 11:24)
- [x] 3.1.2 Run the existing ratchet selector on the old baseline; record genuine stale-input failures or a justified already-green outcome. Any uncovered regression gets an independent `.spec.test.ts` and a distinct red run before repair. — `assurance-ratchets.impl.test.ts`; 03-02 Bounded Repair Procedure. ✅ (completed: 2026-11-01 11:25; stale inputs recorded)

### 3.2 Evidence, approval and implementation

- [x] 3.2.1 Run all five approved compatibility selectors serially from a clean checkpoint and retain each selector's package/source/image/fixture/cleanup proof. — Existing compatibility command; ST-12. ✅ (completed: 2026-11-01 11:33)
- [x] 3.2.2 Capture protocol/operational coverage with `coverage-baseline`; validate current pnpm dependency inventory, flush and source mapping. — Existing coverage command; ST-9. ✅ (completed: 2026-11-01 11:35)
- [x] 3.2.3 Capture security/production-security coverage separately; compare old/current paths, counts and monitored digests without changing the baseline. — Existing coverage command and baseline; ST-9/ST-10. ✅ (completed: 2026-11-01 11:37)
- [x] 3.2.4 Record the exact baseline/fixture proposal with the baseline coverage block and fixture block side by side, exact equality of source/run/digests/counts, and the two digest formulas; obtain independent review and the user's value-specific approval. Keep unexplained reductions or refused changes blocked. — `08-closeout-evidence.md`, ambiguity register; ST-10/ST-11; AR-9. ✅ (completed: 2026-11-01 13:23; independent review approve; user approved exact values)
- [x] 3.2.5 Apply only the approved values and review metadata to `ratchet-baselines.json` and `assurance-ratchets-requirements.ts`, keeping both files synchronized and preserving monitored scopes and no-promotion invariants. — 03-02 Reviewed Baseline Update; ST-11. ✅ (completed: 2026-11-01 13:25)
- [x] 3.2.6 Verify the unchanged ratchet specifications and implementation checks green; for any actual behavioral repair, verify its separate regression green before adding implementation checks. — Registered ratchet selector; ST-10/ST-11/ST-16. ✅ (completed: 2026-11-01 13:26; 10/10)

### 3.3 Hardening and source closeout

- [x] 3.3.1 Run relevant existing ratchet/coverage implementation checks plus affected lint/typechecks and structure; independently review the adopted baseline and any bounded repair. Add implementation tests only for a demonstrated uncovered internal failure. — Existing `.impl.test.ts` files in 07. ✅ (completed: 2026-11-01 13:26; timing flake preserved, retry green)
- [x] 3.3.2 Commit a verified clean baseline checkpoint, then run current `assurance:validate` and ratchet checks without modifying the worktree; record exact outcomes and cleanup. — 03-02 and 07. ✅ (completed: 2026-11-01 13:27; validate `6367accb` exit 0; ratchet 10/10)
- [x] 3.3.3 Close pnpm task 4.6 only when the entire approved matrix is proved; update its source owner and sanitized evidence, correct the 4.6 material at lines 192/195/255 (bare `assurance:compat` and known-drift note), validate and checkpoint. Leave the 6.4 remote-gate notes at 214/235 for Phase 4. Remove only owned generated reports after review and evidence retention. — pnpm owner; ST-9–12/ST-19. ✅ (completed: 2026-11-01 13:28)

**Verify:** all five explicit compatibility selectors, both distinct captures, ratchet checks,
current validation and applicable workspace/structure gates in 07. Baseline approval is a live
user gate, not preauthorized by this plan.

## Phase 4 — Remote Dependency and Cache Gates

> **Reasoning**: high — security-monitoring ingestion and build-cache proof
> **Lenses**: data and migration; distributed and concurrent
> **Phase baseline tree**: a8a6a2e053be9871e7f0c6170c2fcbc9ee552fb0
> **Expected modification set**: closeout evidence; pnpm owner plan; existing harness compose/cache/log paths and GitHub repository security settings authorized by AR-12/AR-13; no product source or new CI workflow
> **Scope mode**: strict

### 4.1 Acceptance criteria and baseline observations

- [x] 4.1.1 Freeze ST-13–15 against current package manifests/lockfile metadata, expected graph identities, alert availability and both cache scopes. Inventory existing CI/Dependabot evidence, record the known disabled graph/alerts state and zero harness-cache keys, confirm AR-12/13 authorizations and exact paths, and distinguish missing access from actual processing failure. — pnpm task 6.4; 03-02; AR-12/13. ✅ (completed: 2026-11-01 13:30)

### 4.2 Prove the remote obligations

- [!] 4.2.1 Apply AR-12: record the prior disabled state, enable the dependency graph and Dependabot alerts, then verify lockfile graph ingestion, Dependabot processing and alert availability with read-only GitHub evidence. Record the `main`-targeting limitation of version-update PRs. If the settings change is declined or the graph still fails, keep 6.4 blocked; never downgrade pnpm or ignore the lockfile boot document. — ST-13/ST-14; AR-4/11/12. **Blocked: Dependabot alerts are enabled, but the graph parses only the pnpm boot document (`@pnpm/exe.*`); the project graph is not ingested.**
- [~] 4.2.2 Diagnose the observed zero `porta-harness-ci` keys and buffered build output; apply the AR-13 bounded repair to the existing compose cache/log path, naming exact files. Then verify actual cached-layer reuse in both existing Docker scopes across a first export run and a subsequent import run from ordinary pushes; record job URLs, cache keys/log lines and a terminal miss rule. — ST-14/ST-15; AR-13. ⏳ (implemented: 2026-11-01 13:33)
- [ ] 4.2.3 Reconcile pnpm task 6.4 and its feature row only after all original remote clauses are proved; correct the 6.4 remote-gate notes at lines 214/235, preserve any genuine access/product blocker, and leave the 4.6 drift/compat lines to 3.3.3. — pnpm owner; 03-01 Admissibility.

### 4.3 Review and checkpoint

- [ ] 4.3.1 Obtain independent release/dependency evidence review; resolve findings without broadening the original gate or treating zero alerts as successful ingestion. — Phase evidence; AR-7/8.
- [ ] 4.3.2 Run affected/structure/document checks, confirm resource ownership cleanup and checkpoint the remote closure evidence. — 07 and 03-03.

**Verify:** ST-13–15 plus applicable 07 checks. No new CI workflow, dependency policy or repository
security-setting change is authorized implicitly.

## Phase 5 — Final Source and Feature Reconciliation

> **Reasoning**: high — prevent falsely complete summaries and evidence gaps
> **Lenses**: data and migration

### 5.1 Acceptance and completeness review

- [ ] 5.1.1 Audit the complete selected-owner evidence map: active pnpm/tenant obligations proved, historical rollout proof complete and assurance exclusions precisely retained. Resolve any unproved active claim before integration. — R1–8; ST-1–18.
- [ ] 5.1.2 Validate each touched original checklist/count against its derived feature row; apply the tenant `n/a`/task-count rule and the named T-06/portfolio/deferred-index/pnpm-owner metadata targets; verify the deferred plan's `Progress` header; inspect legacy formats directly where the helper cannot parse them; remember the helper does not check links. Update only the exact derived portfolio cells touched by this task; re-verify the full portfolio after merge. — 03-01 Legacy Counters and Metadata; ST-17/ST-18.

### 5.2 Final documentation

- [ ] 5.2.1 Reconcile only directly affected public/maintainer documentation if an approved repair changed its documented behavior; otherwise record that no architecture update is needed. Finish the plan-local evidence with explicit residual owners/revisit triggers. — `08-closeout-evidence.md`; AR-10/11.

### 5.3 Review and publication preparation

- [ ] 5.3.1 Complete independent final correctness/security review of the actual diff, source-task dispositions, reviewed baseline ruling and exclusions; obtain any critical/major finding rulings. — 03-03 Review and CI Gates.
- [ ] 5.3.2 Run final applicable local gates and document checks, including the final ratchet run on the PR head; a changed monitored digest reopens 3.2.4. Checkpoint/push through the git-commit skill in push mode and open the develop PR. Keep current unobserved merge/CI events pending. — 07; ST-19.

**Verify:** R1–10 acceptance mapping, no unproved active claim, no unresolved critical/major finding,
and applicable 07 local gates. No blanket claim that all assurance requirements are complete.

## Phase 6 — Integration, Portfolio and Final Handoff

> **Reasoning**: high — exact revision gates and cross-branch derived state
> **Lenses**: distributed and concurrent; data and migration

### 6.1 Verify the integration candidate

- [ ] 6.1.1 Confirm all six CI jobs pass on the exact PR head and recheck its diff/base against the verified source; include the final ratchet run and rerun affected proof if develop changed materially or a monitored digest changed. — 03-03; ST-19.
- [ ] 6.1.2 Confirm the selected active gates, independent reviews and cleanup have no unresolved blocker; ensure the only open items are the user-approved exclusions. — R1–10; AR-10.

### 6.2 Integrate and cascade

- [ ] 6.2.1 Merge the verified PR into develop using the normal merge-commit flow; record the observed merge, without touching main or a release workflow. — AR-1/5; 03-03.
- [ ] 6.2.2 Confirm all six post-merge develop CI jobs on the exact merge revision, run the ratchet selector on that revision, and retain the run URL. — 07 CI authoritative gate.
- [ ] 6.2.3 On the integration branch, reconcile `codeops/00-roadmap.md` and the maintenance completion summary from verified owners; preserve all AR-10 residuals and hand-maintained counter semantics. Publish as the single docs-only commit on develop after the merge-revision CI; if protection or a ruleset requires a PR, use a second evidence-only PR and record its head/CI. — ST-17/ST-18; 03-03.

### 6.3 Final verification and cleanup

- [ ] 6.3.1 Validate the integration metadata/links/counts using the 07 checklist, run structure and the final ratchet check, and verify owned cleanup. — 03-03 Review and CI Gates; 07.
- [ ] 6.3.2 Publish the final metadata/evidence/handoff commit (including this mark) through the git-commit skill in push mode; record the exact commit. No later evidence commit; its CI is observed and recorded in the external execution report under AR-15. If final CI fails, record the failure and stop; a corrective commit needs explicit user authorization. — ST-19; 03-03 Final Handoff.

**Verify:** exact-head final CI on the 6.3.2 metadata commit, clean workspace, owned cleanup and
truthful remaining-work summary. The CI observation is external to the task list and recorded in
the external execution report (AR-15); no later commit. If it fails, record the failure and stop;
a corrective commit needs explicit user authorization. Never mark a future event complete merely
to avoid a second check.

## Completion Boundary

This plan is complete when the selected active closeout obligations and all 42 tasks pass, with
any added bounded-repair tasks also verified. Remainders in AR-10 stay visibly open. If a required
baseline ruling, historical proof or active remote gate is unavailable, stop with the precise
blocked task instead of declaring the closeout complete.
