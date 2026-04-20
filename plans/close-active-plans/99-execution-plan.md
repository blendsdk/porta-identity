# Execution Plan: Close Active Plans

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-19 23:30
> **Progress**: 0/6 tasks (0%)

## Overview

Housekeeping plan: verify that the `bff-playground` plan is effectively complete, mark its trailing tasks, and move it to `plans/_archive/`. No production code is modified. Other active plans are intentionally left in place.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
|---|---|---|---|
| 1 | Archive `bff-playground` | 1 | 30 min |

**Total: 1 session, ~30 min**

---

## Phase 1: Archive `bff-playground`

### Session 1.1: Verify deliverables, mark tasks, archive

**Reference**: [Archive Procedure](03-archive-procedure.md)
**Objective**: Close out `bff-playground` cleanly and move it under `plans/_archive/`.

**Tasks**:

| # | Task | File |
|---|---|---|
| 1.1.1 | Pre-move verification (README size, smoke script executable, no stray path refs) | `playground-bff/README.md`, `scripts/playground-bff-smoke.sh`, `plans/`, `requirements/` |
| 1.1.2 | Mark tasks 7.1.1/7.1.2/7.1.3 complete + update header in `99-execution-plan.md` | `plans/bff-playground/99-execution-plan.md` |
| 1.1.3 | Append "Archive Note" section to `00-index.md` | `plans/bff-playground/00-index.md` |
| 1.1.4 | `git mv plans/bff-playground plans/_archive/bff-playground` | `plans/` |
| 1.1.5 | Post-move verification (old path gone, new path has 9 docs, no `[ ]` tasks, verify green) | — |
| 1.1.6 | Commit via `gitcm` / `gitcmp` with `chore(plans): archive completed bff-playground plan` | — |

**Deliverables**:
- [ ] `plans/bff-playground/` removed
- [ ] `plans/_archive/bff-playground/` contains all 9 documents
- [ ] Archived `99-execution-plan.md` shows `24/24 tasks (100%)`
- [ ] `yarn verify` passes
- [ ] Change committed

**Verify**: `clear && sleep 3 && yarn verify`

---

## Task Checklist (All Phases)

### Phase 1: Archive `bff-playground`
- [ ] 1.1.1 Pre-move verification
- [ ] 1.1.2 Mark trailing tasks + update header
- [ ] 1.1.3 Append Archive Note to `00-index.md`
- [ ] 1.1.4 `git mv` folder to `_archive/`
- [ ] 1.1.5 Post-move verification + `yarn verify`
- [ ] 1.1.6 Commit

---

## Session Protocol

### Starting a Session

1. Start agent settings (if `scripts/agent.sh` exists): run `clear && sleep 3 && scripts/agent.sh start`
2. Reference this plan: "Implement Phase 1, Session 1.1 per `plans/close-active-plans/99-execution-plan.md`"

### Ending a Session

1. Run the project's verify command: `clear && sleep 3 && yarn verify`
2. Handle commit per the active commit mode
3. End agent settings (if `scripts/agent.sh` exists): run `clear && sleep 3 && scripts/agent.sh finished`
4. Compact the conversation with `/compact`

---

## Dependencies

```
1.1.1 → 1.1.2 → 1.1.3 → 1.1.4 → 1.1.5 → 1.1.6
```

All tasks are sequential; no parallelism.

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ All verification passing (`yarn verify`)
3. ✅ No warnings/errors
4. ✅ `plans/bff-playground/` no longer exists; `plans/_archive/bff-playground/` does
5. ✅ Other active plans are untouched
6. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
