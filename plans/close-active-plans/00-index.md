# Close Active Plans Implementation Plan

> **Feature**: Verify and archive plans that are effectively finished; leave genuinely active plans in place
> **Status**: Planning Complete
> **Created**: 2026-04-19

## Overview

The `plans/` tree currently contains four non-archived plan folders:
`bff-playground`, `client-login-methods`, `erp-claims-playground`, `magic-link-cleanup`.

A fresh inspection (2026-04-19) shows that **`bff-playground` is effectively complete** — 21/24 tasks are checked, the remaining three tasks (`playground-bff/README.md`, `scripts/playground-bff-smoke.sh`, manual walkthrough) all correspond to deliverables that already exist on disk and have been exercised as part of normal development. The other three plans still have meaningful open work and should stay active.

This plan is pure housekeeping: verify the on-disk deliverables for the three trailing `bff-playground` tasks, mark them complete with a dated timestamp, move the folder into `plans/_archive/bff-playground/`, and leave the rest of the tree untouched. No production code changes.

## Document Index

| # | Document | Description |
|---|---|---|
| 00 | [Index](00-index.md) | This document |
| 01 | [Requirements](01-requirements.md) | Scope + acceptance criteria |
| 02 | [Current State](02-current-state.md) | Per-plan completeness snapshot |
| 03 | [Archive Procedure](03-archive-procedure.md) | Mechanics of archiving a plan |
| 07 | [Testing Strategy](07-testing-strategy.md) | Verification steps |
| 99 | [Execution Plan](99-execution-plan.md) | Task checklist |

## Quick Reference

### Key Decisions

| Decision | Outcome |
|---|---|
| Which plan(s) to close now? | Only `bff-playground` |
| Leave `client-login-methods` open? | Yes — 15 tasks still open (Phase 10 playground integration) |
| Leave `erp-claims-playground` open? | Yes — active development |
| Leave `magic-link-cleanup` open? | Yes — active development |
| Archive location | `plans/_archive/bff-playground/` (matches existing convention) |
| Touch any runtime code? | No |

## Related Files

- `plans/bff-playground/**` → moves to `plans/_archive/bff-playground/**`
- `plans/bff-playground/99-execution-plan.md` — tasks 7.1.1/7.1.2/7.1.3 marked `[x]` before the move, Progress updated to 24/24, Status line added
