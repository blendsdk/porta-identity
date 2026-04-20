# Requirements: Close Active Plans

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)

## Feature Overview

Verify completion of, and archive, the `bff-playground` plan. Leave the other three active plan folders in place. No production code is touched; this is documentation/plan hygiene only.

## Functional Requirements

### Must Have

- [ ] Confirm `playground-bff/README.md` exists and is non-trivial (> 1 KB)
- [ ] Confirm `scripts/playground-bff-smoke.sh` exists and is executable
- [ ] Run the smoke test script once against a running stack to prove it works
- [ ] Mark `bff-playground` tasks 7.1.1, 7.1.2, 7.1.3 as `[x]` with today's date
- [ ] Update the header of `plans/bff-playground/99-execution-plan.md`: Progress `24/24 tasks (100%)`, Last Updated to today
- [ ] Move `plans/bff-playground/` → `plans/_archive/bff-playground/` via `git mv`
- [ ] Leave `plans/client-login-methods/`, `plans/erp-claims-playground/`, `plans/magic-link-cleanup/` untouched
- [ ] `yarn verify` still passes after the move (no code was touched, but we re-run as a safety net)

### Should Have

- [ ] Short note appended to `plans/_archive/bff-playground/00-index.md` stating the archive date and that the plan finished at 100%

### Won't Have (Out of Scope)

- Finishing `client-login-methods` Phase 10 work
- Any changes to `src/`, `tests/`, `migrations/`, or `playground-bff/` code
- Any CI changes
- Consolidating or rewriting other plans

## Technical Requirements

### Compatibility

- Archive location must match the convention already used by the 19 existing archived plans: `plans/_archive/<plan-name>/`.
- Use `git mv` so history is preserved.

### Security

- N/A (documentation move only).

## Scope Decisions

| Decision | Options | Chosen | Rationale |
|---|---|---|---|
| Which plan(s) to archive | A. Only `bff-playground`. B. Also `client-login-methods`. C. All four. | A | Only `bff-playground` is effectively complete. The others have real open work. |
| How to archive | A. `git mv` the whole folder. B. Delete + re-add. | A | Preserves history. |
| Smoke test execution | A. Actually run it. B. Trust existence. | A | Low cost; validates the deliverable before archiving. |

## Acceptance Criteria

1. [ ] `plans/bff-playground/` no longer exists
2. [ ] `plans/_archive/bff-playground/` exists and contains all 9 plan documents
3. [ ] Archived `99-execution-plan.md` shows `24/24 tasks (100%)` with three new `[x]` timestamps
4. [ ] `client-login-methods`, `erp-claims-playground`, `magic-link-cleanup` directories unchanged
5. [ ] `yarn verify` passes
6. [ ] Change is committed with scope `chore(plans)` or `docs(plans)` per git conventions
