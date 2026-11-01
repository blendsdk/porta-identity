# Evidence and Source-Plan Reconciliation

> **Parent**: [Index](00-index.md)
> **Requirements**: R1–4, R8, R10
> **Authority**: AR-8/10/11/14
> **CodeOps Artifact Schema**: 1

## Evidence Contract

During execution create one plan-local `08-closeout-evidence.md`. It records evidence, not another
task-state graph. Each proposed original-task completion must identify:

| Field | Required content |
| --- | --- |
| Obligation | Original owner path, task ID and precise acceptance clause |
| Source identity | Full commit/tree or historical release tag and ancestry; for live runs, dependency/image/fixture identities supplied by the runner |
| Scope | Exact command/selector, project/profile, selected case or observer IDs and applicable expectation version |
| Observation | Expected versus observed result, exit/classification, failed attempts and any excluded claim |
| Proof | Durable CI/PR/release URL or sanitized retained run facts/digests; say when original generated artifacts were removed |
| Review | Independent finding disposition and any exact user ruling |
| Cleanup | Runner cleanup outcome plus owned resource confirmation for new local work |
| Consequence | Whether that specific original task may change, and the residual obligation if not |

Use compact tables and factual summaries. Never copy secrets, credential-bearing logs, generated
runtime configuration or an entire artifact tree into the plan (AR-7/8/11).

## Admissibility

1. Distinguish a historical claim (“this version was published”) from a current-source claim
   (“this retained recovery case passes on the integration candidate”). Old evidence may prove
   the former but is not automatically current proof of the latter (AR-8).
2. Confirm the task, contract version, exact source and selected coverage. A skipped/cancelled
   job, absent case or exit-zero summary without the required observation is not a pass (AR-8).
3. Preserve failed attempts. A later success may supersede a diagnosed failure, but cannot erase
   it or replace an unresolved assertion with a smaller claim (AR-4/8).
4. Check every clause in composite tasks before marking them verified. For example, package
   publication, provenance, Docker publication and develop sync are separate obligations (AR-8).
5. Only a proved original obligation becomes `[x]`. Otherwise retain its existing blocked or
   incomplete state, append the exact reason and link its successor/residual. Do not regress a
   roadmap stage without the explicit ruling required by the roadmap workflow (AR-8/10).
6. New local evidence requires a clean committed checkpoint and unchanged source throughout the
   run. Keep execution notes outside the worktree until the command finishes (AR-7/8).

## Historical Rollout Reconciliation

For the automated-release owner, verify the two actual merges and their CI against the successful
release already recorded by task 4.1.3. Also record the current `main` release (v1.15.0,
`2026-10-30`) and confirm T-06's PR #206 merge `43cdddc2` is an ancestor, so T-06's “not released”
row is corrected rather than copied forward. Correct stale checkboxes/counts only after this
comparison. Do not trigger the workflow again (AR-1/8).

For deferred invitations, use PR #140/main CI and the relevant historical release lineage. Record
the failed main Release run `36353633426`, the successful develop-dispatched run `36357391953`
(which checked out `main`), and the later main no-op `36382460551`. Under AR-14, task 7.1.5 closes
on that recorded operational equivalence, not on tag ancestry. For task 7.1.6 check all named
artifacts and the develop sync, using existing retained public records. If an old artifact cannot
be verified, record that exact limitation and obtain a ruling; the plan cannot claim that
obligation proved or dispatch a replacement release (AR-1/8/14). Correct the deferred plan's
stale `Status: Planning Complete` index and the user-invitations portfolio “gated release pending”
cell from the verified v1.11.0 lineage.

For localization and revocation, append or update present-tense integration status only. Preserve
past statements that correctly describe the authority and scope at the time of implementation.
Do not rewrite historical “no merge authorized” decisions into retroactive authorization (AR-8/11).

## Tenant-Management Blocker

The original failed case is `password-reset-throttled-request`, with missing normalized rejection
evidence. Inventory its current expected facts, generated probe identity, event observation and
observer set before running anything. The previously approved ST-46 catalog correction did not
remove this password-reset obligation (AR-8).

The revocation summary's aggregate success and deleted reports do not establish exact case-level
closure. Use equivalent retained proof if available; otherwise run the registered production-security
harness afresh from a clean candidate. Preserve actual runner suite counts rather than copying the
ambiguous historical “7/7” shorthand (AR-7/8).

Compare old expected exit 40 and current exit 0 by named observer/contract changes. Prove that
earlier incomplete observers were legitimately implemented or separately ruled on; never update
an expected exit merely because a command returned a different one. A missing retained probe,
new failed assertion or unexplained observer disappearance blocks closure (AR-8/10).

Only then amend the tenant task, index, handoff and derived row. State what changed since the old
failed run, the new source identity and which evidence resolves it (AR-8/11).

## Assurance Umbrella and Residuals

| Original task | Compare with | Rule |
| --- | --- | --- |
| 8.7c / DEF-8 | Completed sequential-use evidence and approved ST-46 correction | Map the current authorized contract and every retained issuance/delivery/binding/reuse clause; cite prior user-approved contract corrections rather than silently changing the old oracle. |
| 9.6b / DEF-13 | Live raw-boundary adapter and its resolved review findings | Admit only the response/state/log observations actually asserted; preserve M2's missing control observations. |
| 9.6c / DEF-13 | Administrative denial digest plus live admin-boundary evidence | Require the complete actor/action/target/result correlation obligation; preserve any control assertion that remains unproved. |
| 8.4 / DEF-23 | Named timing-authority gap | Remains blocked under AR-10; this plan collects no timing samples and chooses no statistical threshold. |

The two DEF-13 tasks may only be marked Done if their complete obligations are independently
shown to exclude the M2 residual; otherwise retain a qualified/blocked task and link M2. This
decision rule prevents a completed successor plan from granting blanket sentinel credit (AR-8/10).

Update `00-remaining-work.md` and the assurance roadmap to distinguish closed original causes from
the explicit residual. Keep the complete AR-10 owner/revisit information. The feature and its
requirements remain in progress while their defined work is open (AR-10).

## Legacy Counters and Metadata

Inventory unique execution tasks directly when the current helper rejects a legacy format.
Ignore example snippets and duplicate deliverable checklists. Compare actual IDs with the owning
phase tables, resolve any mismatch before changing the header, and retain IDs/meaning (AR-8/11).

Use the existing roadmap arithmetic for supported shapes. T-* task rows do not count as RD rows;
hand-maintained totals remain separately checked. A parser's “0 tasks” or portfolio “0/0” is not a
reason to fabricate completion or implement a new parser. Record any unresolved tool limitation
without treating it as unfinished product work (AR-8/11). The plan helper checks required
documents/`Implements`/task shape only; do not attribute link validation to it.

The tenant feature has one `T-01` row and zero `RD-*` rows. After 5.1.3 closes, apply the chosen
tenant counter rule (`n/a (task-only)` or a documented task count) and keep the portfolio cell
consistent. Also reconcile the T-06 “not released” row (v1.15.0 includes PR #206), the
user-invitations portfolio cell (deferred creation released in v1.11.0), the deferred-invitation
index status and `Progress` header, and the pnpm owner plan's 4.6 material (lines 192/195/255)
and 6.4 remote-gate notes (lines 214/235) in their owning phases. These are named metadata targets,
not optional prose cleanup (R8).

## Failure Handling

| Condition | Action |
| --- | --- |
| Missing, expired or inaccessible evidence | State exactly what cannot be proved; seek equivalent evidence, a scoped fresh check or a user ruling. |
| Evidence is from another revision/profile/contract | Do not transfer credit; collect a matching observation if the claim is current-source. |
| New failure in a required active gate | Apply the bounded repair procedure in 03-02; retain the failure and task block. |
| Final CI fails after 6.3.2 | Record the failure in the external execution report; do not claim completion; a corrective metadata commit requires explicit user authorization (AR-15). |
| Disabled remote security feature or unpopulated cache scope | Record the exact observed state; apply AR-12/AR-13 only as authorized; if the observation remains unavailable, keep the task blocked. |
| Proof depends on an AR-10 exclusion | Preserve the incomplete claim and named follow-up; do not implement the exclusion. |
| Counting or linkage ambiguity | Stop the affected metadata edit and resolve the exact owner/ID before proceeding. |

All failure dispositions follow AR-4/8/10/11/12/13/14. Acceptance cases are ST-1–8 and ST-17–18 in
[07](07-testing-strategy.md).
