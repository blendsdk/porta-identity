# Execution Plan: Automated Release

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-09-25 10:28
> **Progress**: 0/11 tasks (0%)
> **CodeOps Artifact Schema**: 1

## Overview

Replace the manual release-preparation step with a manual-triggered, otherwise automated release:
one `workflow_dispatch` press bumps, writes notes, commits, tags, publishes, creates the GitHub
Release, dispatches Docker, and syncs `develop` safely.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Tasks |
| ----- | ----- | ----- |
| 1 | Release contract specifications (red) | 2 |
| 2 | Workflow and scripts | 3 |
| 3 | Documentation and rehearsal | 3 |
| 4 | Rollout | 3 |

**Total: 11 tasks across 4 phases**

> **⚠️ EXECUTION RULE — APPLIES TO EVERY AGENT EXECUTING THIS PLAN:**
>
> The task checkboxes below are the single source of truth for progress. Mark `[~]` on
> implementation, promote to `[x]` on verify pass, update the Progress header after every task, and
> resume from the first `[~]` else the first `[ ]`. Timestamps come from `date '+%Y-%m-%d %H:%M'`.

---

## Phase 1: Release contract specifications (red)

### Step 1.1: Specifications

**Reference**: [07-testing-strategy.md](07-testing-strategy.md) · AR-2, AR-3, AR-4, AR-5, AR-6, AR-7, AR-8, AR-9, AR-10, AR-11
**Objective**: Rewrite the release contract oracle to the automated-release topology.

- [ ] 1.1.1 [spec-author] Rewrite `repo-tests/monorepo/release.spec.test.mjs` and `repo-tests/monorepo/release-hardening.spec.test.mjs` for ST-1..ST-7
- [ ] 1.1.2 Run `yarn test:structure` and verify the new assertions FAIL against the current workflow (red phase)

**Deliverables**:
- Contract specs express the new topology
- Red phase recorded

**Verify**: `yarn test:structure`

---

## Phase 2: Workflow and scripts

### Step 2.1: Implement

**Reference**: [03-01](03-01-release-workflow.md), [03-02](03-02-develop-sync.md)
**Objective**: Rebuild the release workflow and adjust the scripts.

- [ ] 2.1.1 Rebuild `.github/workflows/release.yml`: `workflow_dispatch` (bump/dry_run), gate, bump, preflight, publish, explicit commit/tag push, GitHub Release, Docker dispatch, develop sync, idempotency
- [ ] 2.1.2 Update `package.json` `release:publish` to drop `--git-push` (keep `--provenance`); keep `release:prepare`
- [ ] 2.1.3 Run `yarn test:structure` and verify it PASSES (green phase)

**Deliverables**:
- Workflow implements the spec
- Contract specs green

**Verify**: `yarn test:structure`

---

## Phase 3: Documentation and rehearsal

### Step 3.1: Docs and rehearsal

**Reference**: [03-01](03-01-release-workflow.md) · AR-12
**Objective**: Document the operator flow and rehearse the release safely.

- [ ] 3.1.1 Update `techdocs/guides/releasing.md` and `AGENTS.md` for the manual-release flow, inputs, `OPENAI_API_KEY`, and develop-sync semantics
- [ ] 3.1.2 Run a `dry_run` rehearsal (`gh workflow run release.yml --ref feat/automated-release -f dry_run=true`) and confirm no external change
- [ ] 3.1.3 Run `yarn verify` and record the counts

**Deliverables**:
- Docs updated
- Dry-run rehearsal passes with no external change
- `yarn verify` green

**Verify**: `yarn verify`

---

## Phase 4: Rollout

### Step 4.1: Deploy and release

**Objective**: Land the workflow and perform the first automated release.

- [ ] 4.1.1 Merge `feat/automated-release` into `develop` (PR, CI green)
- [ ] 4.1.2 Merge `develop` into `main` (deploys the new workflow; no automatic release fires because the workflow no longer declares `workflow_run`)
- [ ] 4.1.3 Trigger `Release` on `main` (`bump=auto`) and verify the version bump, notes, tag, npm publish, GitHub Release, Docker dispatch, and `develop` sync

**Deliverables**:
- New workflow live on `main`
- First automated release verified end to end

**Verify**: manual verification of the release artifacts + `yarn verify` on the released revision

---

## Dependencies

```
Phase 1 (specs, red)
    ↓
Phase 2 (workflow + scripts, green)
    ↓
Phase 3 (docs + dry-run rehearsal)
    ↓
Phase 4 (rollout + first release)
```

---

## Success Criteria

1. ✅ `Release` is `workflow_dispatch` only with `bump` and `dry_run`; no `workflow_run`.
2. ✅ One manual run completes bump → notes → tag → publish → GitHub Release → Docker → develop sync with no manual bump work.
3. ✅ `dry_run` changes nothing external.
4. ✅ Re-runs are idempotent; `develop` is never force-pushed.
5. ✅ The rewritten contract specs and `yarn verify` pass.
6. ✅ Post-completion project re-analysis (handled by the exec-plan skill).
