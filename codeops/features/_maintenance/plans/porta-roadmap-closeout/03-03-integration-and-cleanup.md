# Integration, Tracking and Cleanup

> **Parent**: [Index](00-index.md)
> **Requirements**: R8–10
> **Authority**: AR-5–8/10/11/15
> **CodeOps Artifact Schema**: 1

## Branch and Artifact Ownership

Begin new work from the current verified develop on a separate closeout feature branch/session;
fetch `origin` and branch from `origin/develop` (`c73cc744` at planning), not the local `develop`
that is 22 commits behind. Do not append to the already merged #196 branch. Preserve unfamiliar
work. Promote this staged plan only after leaving Plan mode, verify T-07 is available and register
it on the maintenance roadmap, including `08-closeout-evidence.md` and `00-preflight-report.md`.
Existing original plans retain their own task state (AR-5/6/11/15).

Use `exec-plan` for the execution loop. Use the git-commit skill for checkpoints and its push
mode for authorized publication; do not bypass hooks or branch policy. Commit mode is resolved
when execution starts. Full verify remains CI's gate except for the narrow local exceptions in
AGENTS.md (AR-5/7).

## Feature and Portfolio Synchronization

At each proved source-task transition, immediately update that feature's derived row before its
next verification/checkpoint. Preserve completed sibling rows and all named residuals. Maintain
the maintenance plan's own `[~]`/`[x]`/`[!]` task marks in 99 (AR-6/8/10).

On the feature branch, leave `codeops/00-roadmap.md` unchanged. After integration, reconcile it
from the actual source plans on develop using the existing roadmap workflow. Check the sync
engine's preview and preserve hand-maintained counters; never sweep unsupported legacy formats
into fabricated Ready/Done states (AR-8/11). At planning there was no `develop` branch protection
and no repository ruleset. Publish the portfolio/evidence as a single docs-only commit on
`develop` after the merge-revision CI; if protection or a ruleset is added and requires a PR, use
a second evidence-only PR and record its head and CI. Do not bypass protection, force-push, or
silently edit the portfolio on a feature branch.

## Review and CI Gates

1. Complete the applicable phase reviews and original-task evidence comparisons. Critical/major
   findings need an authorized ruling; missing reviewers do not lower the gate (AR-7).
2. Run final affected checks and validate links, counters and the actual diff. Include the final
   ratchet run on the PR head; a changed monitored digest reopens the baseline proposal (AR-9).
   The PR contains only the approved closeout scope and any explicitly authorized bounded repairs
   (AR-4/11/13).
3. Push the verified branch and open a PR to develop. Confirm all six branch jobs on the **exact
   current PR head**: monorepo verification, UI, OIDC harness, docs, production Docker build and
   production dependency audit. Recheck the head/base immediately before merging (AR-5/7).
4. Merge through the normal merge-commit flow. Observe all six jobs on the resulting develop
   commit. If develop changes materially during this process, reassess the affected evidence
   rather than claiming old results cover it (AR-5/8).
5. Reconcile portfolio/final evidence on the integration branch, validate that documentation-only
   checkpoint and publish through the permitted flow. Confirm CI on the final published head
   before the final handoff (AR-5/7/8).

No document must contain the hash of the commit that contains that same document. Record the
last result actually observed; GitHub checks and the final handoff identify the final metadata
commit's result. Do not prewrite “merged,” “passed,” or a completion timestamp for an event that
has not happened, and do not create an endless chain of self-referential evidence commits.

**Terminal rule (AR-15):** task 6.3.2 publishes the final metadata/handoff commit, including its
own `[x]` mark and the final evidence. No later commit is made. Its full CI is observed after
publication and recorded in the **external execution report**, not in a committed plan document;
the CI observation is not another checkbox. This is the only terminal exception to “mark `[x]`
only after verification”: the verification of 6.3.2 is publishing the final metadata, while
acceptance criterion 4 remains the external CI gate. If that final CI fails, record the failure
in the external report and do not claim completion; a corrective metadata commit requires explicit
user authorization and reopens 6.3.2. Otherwise the closeout remains incomplete.

Do not close unrelated GitHub issues or trigger a release/main-promotion workflow. A historical
publication check is a read operation, not publication authorization (AR-1/11).

## Resource and Evidence Cleanup

- Record baseline ownership before starting local infrastructure. Use existing lifecycle commands
  for repository stacks and runner-owned cleanup for assurance commands. Scratch resources need
  unique project identities; never remove another session's resources (AR-7).
- Record owned containers, networks, volumes, images, test installations and any scratch databases.
  Close/delete only those created by this execution. Never use a global prune operation.
- Capture sanitized evidence and required independent review before deleting task-owned generated
  run directories. Preserve pre-existing reports, developer worktrees and user files (AR-8/11).
- Verify with `docker ps -a`, `docker network ls` and `docker volume ls`; compare by ownership,
  not just total counts because other sessions may be active. Verify task-created images and
  installations separately. If cleanup fails, retain a blocked task and exact recovery command.
- Remove task-created temporary logs, diffs, credential-isolated test homes and scratch artifacts
  under the approved temp root. Protected runtime paths remain subject to exact path/purpose
  approval, including cleanup; never follow a symlink to a protected or unowned location.

## Final Handoff

Report the final develop commit and CI URL, each selected original task's disposition, the
value-specific baseline ruling, owned cleanup and the named AR-10 exclusions. Record the final CI
observation for the terminal metadata commit in the **external execution report**; do not add that
hash/result to a committed plan document and do not create another commit for it. If the final CI
fails, report the failure and do not claim completion; a corrective commit needs explicit user
authorization. State that GitHub issue #196 remains open pending main promotion/release or a
separate ruling. Use the original plan checklists for task status and the roadmap for the derived
summary. Do not present this closeout as a security certification or as completion of every
assurance RD (AR-8/10/15).
