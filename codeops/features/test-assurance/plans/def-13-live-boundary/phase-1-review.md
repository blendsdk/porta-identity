# Phase 1 Review: Decision-log foundation

> **Document**: phase-1-review.md
> **Parent**: [Index](00-index.md)
> **Reviewed**: 2026-09-21
> **Scope**: `p1/decision-log.ts`, `p1/porta-log-source.ts` and their specs
> **Reviewer**: correctness-reviewer (independent)

## Verdict

`NEEDS FIX` — one CRITICAL, two MAJOR, five MINOR findings. All CRITICAL and MAJOR findings were
fixed as necessary corrections and re-verified.

## Findings and rulings

| ID  | Severity | Finding                                                                                                                                                                                   | Ruling                                                                                       |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| C1  | CRITICAL | `docker logs --timestamps` prefixes each line with an RFC3339 stamp, but the parser required a leading `{`, so real captures produced zero records and the two modules could not compose. | Fixed: the parser strips the timestamp prefix; a composition spec test was added.            |
| M1  | MAJOR    | A decision record missing `statusCode`/`outcome` was defaulted to `0`, and `statusClass(0)` returned `allow`, fabricating a present `result`/`public-outcome-class`.                      | Fixed: status is now optional and no outcome is derived when both are absent.                |
| M2  | MAJOR    | The specs never fed a timestamp-prefixed line through the parser and never composed capture→parse, so they could not catch C1 or M1.                                                      | Fixed: added a timestamp-prefixed parse test and a partial-record honesty test.              |
| m1  | MINOR    | `findExposedForbiddenFields` used stateful `RegExp.test`, so a caller-supplied `g`/`y` pattern changed results across calls.                                                              | Fixed: `lastIndex` is reset before and after each test; a determinism test was added.        |
| m2  | MINOR    | An unmapped symbolic field name silently fell through to `undefined`, hiding a requirement/field-name mismatch.                                                                           | Fixed: an unmapped field now throws.                                                         |
| m3  | MINOR    | Any object under `securityDecision` was classified as a decision and `eventName` was defaulted, fabricating `event-class`.                                                                | Fixed: classification now requires `eventName === 'security.decision.v1'`.                   |
| m4  | MINOR    | Completion was also matched on `parsed.eventName`, which production never emits (it emits `msg`).                                                                                         | Fixed: the unused branch was removed.                                                        |
| m5  | MINOR    | `checked` returns only stdout, so container stderr is dropped.                                                                                                                            | Report-only: pino writes operational logs to stdout, so the impact is low. Left as accepted. |

## Clean observations

- No `codeops/`/`plans/`/`requirements/` references and no RD/DEF/task ids in code or comments.
- No dead code, no unsafe casts; doc comments on every exported entity.
- Container resolution and `docker logs` argument construction are shell-free, use fixed arguments, and place `--` before the container id.

## Re-verification after fixes

| Command                                                                        | Result     |
| ------------------------------------------------------------------------------ | ---------- |
| `npx tsx --test test-harness/assurance/tests/p1-decision-log.spec.test.ts`     | 11/11 pass |
| `npx tsx --test test-harness/assurance/tests/p1-porta-log-source.spec.test.ts` | 4/4 pass   |
| assurance typecheck                                                            | pass       |
| harness lint                                                                   | pass       |

## Re-review (one pass, fix diff)

Verdict: `FIXED`. The independent correctness re-review confirmed each finding was resolved with no
regression, that the new tests assert real invariants, that the `readSymbolicField` switch has no
unreachable branch, and that the timestamp regex matches Docker's RFC3339Nano output without
stripping unrelated content. No CRITICAL or MAJOR findings remain. Fixed as commit `65f56008`.
