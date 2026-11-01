# Requirements: Porta Roadmap Closeout

> **Parent**: [Index](00-index.md)
> **Source**: Standalone user-approved maintenance scope; this document owns requirements
> **CodeOps Artifact Schema**: 1

## Required Outcomes

| ID | Requirement | Authority |
| --- | --- | --- |
| R1 | Inventory each selected original task, its acceptance obligation, available proof and exact unresolved part before changing its status. | AR-3/8 |
| R2 | Reconcile automated-release rollout and deferred-invitation historical rollout using task-matched merge, CI, publication, artifact and develop-sync evidence. Record the failed main Release attempt and the AR-14 operational equivalence; a new release is not a substitute for missing historical evidence. | AR-1/8/14 |
| R3 | Resolve the tenant-management verification blocker only after proving the exact retained recovery probe and comparing the applicable observer/case sets. Run fresh existing checks if retained evidence cannot establish that. | AR-7/8 |
| R4 | Reconcile superseded assurance blockers against their completed successors without transferring wider assurance credit; preserve M2 and the named deferred work. | AR-8/10 |
| R5 | Complete pnpm task 4.6: registered packed-client compatibility, protocol coverage, security coverage and independently reviewed baseline/fixture reconciliation under an explicit value-specific ruling. | AR-4/9 |
| R6 | Complete pnpm task 6.4: after the AR-12 settings authorization, prove dependency-graph ingestion and Dependabot alert availability, prove Dependabot lockfile processing, and prove cache reuse in both existing image-build scopes, including the AR-13 harness-cache repair and re-observation. General CI success is insufficient. | AR-7/8/12/13 |
| R7 | Repair discovered defects only through the smallest existing-component change and specification-first proof. Pause when a repair exceeds the approved component/authority boundary. | AR-4/11 |
| R8 | Refresh source plan metadata and derived feature/portfolio summaries truthfully. Original task owners remain authoritative; only this execution plan owns the closeout's task progress. | AR-6/8/11 |
| R9 | Integrate the verified work into develop, reconcile the portfolio on the integration branch and confirm CI on the final published integration revision. Record the terminal CI observation in the final handoff without creating another evidence commit (AR-15). | AR-5/7/15 |
| R10 | Preserve secrets, historical failure evidence, limitations and resource ownership; remove task-created infrastructure and temporary artifacts after retaining sanitized durable evidence. | AR-7/8/11 |

## Scope

The exact source-owner list and candidate evidence are in [02](02-current-state.md). Execution
may amend those owners' progress and append evidence; it may not rewrite earlier failures into
successes or change their original requirement meaning (AR-8/11).

Conditional baseline writes are limited to the existing baseline JSON and reviewed fixture
named in 02. This plan authorizes collecting and reviewing a proposal, not accepting its future
values. If the user declines a required correction, R5 remains blocked (AR-4/9).

All specialized verification uses existing selectors. There is no new workflow gate, source
generator, test harness, production migration, API surface or generalized reporting subsystem
(AR-4/7/11). AR-12 authorizes the repository settings change needed for dependency-graph and alert
evidence; AR-13 authorizes a bounded repair of the existing harness cache/log path; AR-14 records
the deferred-invitation release equivalence; AR-15 defines the terminal completion observation.

## Explicitly Excluded and Open

| Item | Owner | Revisit trigger |
| --- | --- | --- |
| Admin UI RD-07/08/09 | User | User selects Admin UI work again |
| Current develop-to-main promotion, release or deployment | User | Separate explicit authorization |
| DEF-3/6 protocol consistency and observation campaigns; DEF-22 real command-stage signals | User | Separate assurance campaign selection |
| DEF-5/11/17 deliberate-fault sensitivity campaigns | User | Separate assurance campaign selection |
| DEF-23 statistical timing hypothesis, power/noise contract and authority | User | Dedicated security design/ruling |
| DEF-13 M2 missing control observations in the immutable oracle | User | Dedicated oracle-change ruling and specification-first work |
| Connected-applications list/revoke and resource-server scopes/audience | User | Separate product requirement selection |
| GitHub issue #196 closure | User | Awaits main promotion/release or an explicit ruling; do not close unrelated issues |

These exclusions are explicit user decisions (AR-1–3/10). Do not rename them Done, remove them
from tracking, or claim “fully production ready.” If an old task also contains one of these
obligations, preserve its incomplete/qualified state with a precise link (R4).

## Compatibility and Non-functional Requirements

- Maintain supported Node/pnpm versions, existing public behavior and branch policy (AR-4/7).
- Keep `local-observation-only` and `promotionAuthorized: false` in both baseline sections;
  a rebaseline must not promote coverage to a CI or product-assurance claim (AR-9).
- Preserve existing timeouts, failure taxonomy and mandatory security assertions. Do not use
  retries, skipped tests or a reduced selector set to manufacture closure (AR-7/8).
- Run shared lifecycle infrastructure serially unless existing owner-fenced isolation is proven.
  Never disturb developer or another session's resources (AR-7).
- Use the existing command timeouts; no new product latency, load or coverage-percentage target
  is introduced by this documentation/verification closeout (AR-3/7).
- Evidence must name its source revision and scope. Later evidence-only commits do not retroactively
  change the revision tested by a capture (AR-8).

## Acceptance Criteria

1. Each selected original task has proved completion or a precise AR-10 exclusion; unresolved
   active pnpm or tenant gates prevent closeout completion (R1–6).
2. Every repaired behavior passes its unchanged contract and relevant category gates (R7).
3. Feature summaries and portfolio agree with their owners without inventing aggregate counts
   for legacy formats (R8).
4. Required independent reviews have no unresolved critical/major finding; the final metadata
   commit's full CI and separate branch jobs pass, and the result is recorded in the external
   execution report (AR-15).
5. Sanitized evidence is retained, ownership cleanup is verified, and the final handoff names
   remaining exclusions (R10).

No checkbox here duplicates execution status. The executable task list is solely in
[99](99-execution-plan.md).
