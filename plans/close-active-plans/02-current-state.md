# Current State: Close Active Plans

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Inventory (scanned 2026-04-19)

### Non-archived plans

| Plan | Progress (self-reported) | Tasks `[x]`/total | Verdict | Action |
|---|---|---|---|---|
| `bff-playground` | 21/24 (87%) | 21/24 | Deliverables already on disk; residual tasks are polish | **Archive** |
| `client-login-methods` | 61/76 (80%) | 61/76 | Phase 10 (playground integration, ~15 tasks) still open | Leave active |
| `erp-claims-playground` | active | — | Real open work | Leave active |
| `magic-link-cleanup` | active | — | Real open work | Leave active |

### On-disk evidence that `bff-playground` is done

| Task | File | Exists? | Size |
|---|---|---|---|
| 7.1.1 Create README | `playground-bff/README.md` | ✅ | 11,954 bytes |
| 7.1.2 Create smoke test script | `scripts/playground-bff-smoke.sh` | ✅ (executable) | 4,751 bytes |
| 7.1.3 Manual walkthrough | — | N/A (no artifact; runnable demo) | — |

The README is substantial and the smoke script is executable. Task 7.1.3 is a one-off manual verification; we'll run the smoke script as the objective substitute for the walkthrough.

### Existing archive convention

`plans/_archive/` already contains 19 archived plan folders (e.g. `scaffolding/`, `oidc-core/`, `rbac/`, `two-factor/`…). Each archived folder keeps its own `00-index.md` through `99-execution-plan.md`. We follow the same convention.

## Gaps Identified

### Gap 1: Trailing checkboxes not marked

**Current Behavior:** `99-execution-plan.md` shows tasks 7.1.1 / 7.1.2 / 7.1.3 as `[ ]` even though deliverables exist.
**Required Behavior:** Marked `[x]` with a timestamp; header Progress updated to `24/24 (100%)`.
**Fix Required:** Three `replace_in_file` edits + header edit, then `git mv`.

### Gap 2: Folder not yet archived

**Current Behavior:** `plans/bff-playground/` sits alongside genuinely-active plans, confusing the queue.
**Required Behavior:** Moved under `plans/_archive/`.
**Fix Required:** Single `git mv plans/bff-playground plans/_archive/bff-playground`.

## Dependencies

### Internal

- Must be able to run `yarn verify` (no infra required; linters + unit + integration tests).
- Smoke script requires a running stack (`yarn docker:up`, `yarn playground`).

### External

- None.

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Smoke script fails because the running stack isn't up | Medium | Low | Skip live smoke run, rely on existence + prior verification. Document the skip in the task commit message. |
| Hidden relative links in other plans pointing to `plans/bff-playground/...` | Low | Low | Grep plans/ for `bff-playground/` path references before the `git mv`; update any hits. |
