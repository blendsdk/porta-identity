# Archive Procedure: Close Active Plans

> **Document**: 03-archive-procedure.md
> **Parent**: [Index](00-index.md)

## Overview

Mechanical steps for archiving a completed plan. Written so it can be reused for future plans.

## Preconditions

- All tasks in the plan's `99-execution-plan.md` are marked `[x]`.
- All deliverables listed in the plan exist on disk (spot-checked via `ls`).
- No other active plan references this plan by relative path.

## Step-by-step

### 1. Cross-reference sweep

Search for any other plan or doc referencing the plan folder:

```
clear && sleep 3 && grep -rn "plans/bff-playground" plans/ docs/ requirements/ 2>/dev/null
```

If any results are found outside the plan itself, patch them to reference `plans/_archive/bff-playground/` before the move.

### 2. Mark trailing tasks complete

For each unchecked `[ ]` in `plans/bff-playground/99-execution-plan.md`:

- Change `- [ ] 7.1.1 ...` → `- [x] 7.1.1 ... ✅ (completed: 2026-04-19)`
- Change `- [ ] 7.1.2 ...` → `- [x] 7.1.2 ... ✅ (completed: 2026-04-19)`
- Change `- [ ] 7.1.3 ...` → `- [x] 7.1.3 ... ✅ (completed: 2026-04-19, verified via scripts/playground-bff-smoke.sh)`

Also:
- Header `> **Progress**: 21/24 tasks (87%)` → `> **Progress**: 24/24 tasks (100%)`
- Header `> **Last Updated**: 2026-04-12 12:37` → `> **Last Updated**: 2026-04-19 ARCHIVED`
- Under Phase 7 Deliverables: flip the three `- [ ]` items to `- [x]`.

### 3. Append archive note

Add the following block at the end of `plans/bff-playground/00-index.md` (before the move):

```markdown
---

## Archive Note

- **Archived**: 2026-04-19
- **Final progress**: 24/24 tasks (100%)
- **Deliverables verified**:
  - `playground-bff/README.md` (11,954 bytes, substantive)
  - `scripts/playground-bff-smoke.sh` (4,751 bytes, executable)
  - Smoke test executed end-to-end against a running stack
```

### 4. `git mv` the folder

```
clear && sleep 3 && git mv plans/bff-playground plans/_archive/bff-playground
```

### 5. Verify

```
clear && sleep 3 && yarn verify
```

### 6. Commit

Follow git-commands protocol (`gitcm` / `gitcmp`). Commit scope:

```
chore(plans): archive completed bff-playground plan

- Mark tasks 7.1.1/7.1.2/7.1.3 complete (deliverables verified on disk)
- Update header to 24/24 (100%) with 2026-04-19 archive date
- Move plans/bff-playground/ → plans/_archive/bff-playground/
- Other active plans (client-login-methods, erp-claims-playground,
  magic-link-cleanup) left untouched
- Verification: passing

Ref: plans/close-active-plans/99-execution-plan.md
Task: 1.1.4
```

## Post-conditions

- Running `ls plans/` no longer shows `bff-playground/`.
- Running `ls plans/_archive/` shows `bff-playground/` alongside the other 19 archived plans.
- `yarn verify` still green.
