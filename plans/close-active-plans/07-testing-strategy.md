# Testing Strategy: Close Active Plans

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

This plan changes only Markdown and folder location. There is nothing to unit-test; verification is limited to:

1. File-existence assertions (are the deliverables on disk?)
2. One end-to-end smoke test against a running stack (optional, best-effort)
3. Running the project's `yarn verify` command as a safety net

### Coverage Goals

- 100% of acceptance criteria in `01-requirements.md` covered by a concrete verification step below.

## Test Categories

### Pre-move verification

| # | Check | Command | Expected |
|---|---|---|---|
| 1 | README exists and is non-trivial | `stat -c '%s' playground-bff/README.md` | Output ≥ 1024 |
| 2 | Smoke script exists and is executable | `test -x scripts/playground-bff-smoke.sh && echo OK` | `OK` |
| 3 | No external references to `plans/bff-playground` path | `grep -rn "plans/bff-playground" plans/ requirements/ docs/ 2>/dev/null` | No results, OR only within the folder itself |

### Optional live smoke test (best-effort)

| # | Check | Command | Expected |
|---|---|---|---|
| 4 | Stack can be booted | `clear && sleep 3 && yarn docker:up` | Services healthy |
| 5 | Playground + BFF start | `clear && sleep 3 && yarn playground` (background) | BFF listens on port 4001 |
| 6 | Smoke script passes | `clear && sleep 3 && bash scripts/playground-bff-smoke.sh` | Exit code 0 |

If the environment can't bring up Docker (e.g. CI without daemon), skip 4–6 and rely on pre-move checks 1–3 plus `yarn verify`.

### Post-move verification

| # | Check | Command | Expected |
|---|---|---|---|
| 7 | Old path gone | `test ! -d plans/bff-playground && echo OK` | `OK` |
| 8 | New path present, 9 docs | `ls plans/_archive/bff-playground/*.md \| wc -l` | `9` |
| 9 | Progress header flipped | `grep 'Progress' plans/_archive/bff-playground/99-execution-plan.md` | Shows `24/24 tasks (100%)` |
| 10 | No unchecked tasks | `grep -c '^- \[ \]' plans/_archive/bff-playground/99-execution-plan.md` | `0` |
| 11 | Project verify still green | `clear && sleep 3 && yarn verify` | Exit code 0, all tests pass |

## Verification Checklist

- [ ] Pre-move checks 1–3 pass
- [ ] Either live smoke test passes, or skip is explicitly logged in the commit message
- [ ] Post-move checks 7–11 pass
- [ ] Acceptance criteria 1–6 from `01-requirements.md` all satisfied
