# Execution Plan: DEF-13 Live Boundary

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Status**: In Progress
> **Last Updated**: 2026-09-21 11:50
> **Progress**: 6/15 tasks (40%)
> **CodeOps Artifact Schema**: 1

## Overview

Build the P1 live boundary adapter in specification-first order behind the immutable oracle. The
adapter executes raw public requests, captures Porta's structured logs, correlates one
privacy-safe event per request, and reports honest observations.

## Execution Contract

The task checkboxes below are the single source of truth. On implementation mark the active task
`[~]` with the current date and update Progress/Last Updated. After its targeted command and the
phase gate pass, promote it to `[x]`. A specification RED succeeds only when the named immutable
assertion fails while the existing required lanes stay green. Fast-loop verification is used
throughout: harness typecheck, harness lint, and the narrowest `tsx --test` selector; `yarn
test:structure` before each commit; the operational evidence run once at the end. Open decision AR-3
must be resolved before task 2.2 can pass.

## Targeted Verification Bindings

| Phase | Required targeted commands                                                                                                               |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | none (read-only audit and design challenge)                                                                                              |
| 1     | `npx tsx --test test-harness/assurance/tests/p1-decision-log.spec.test.ts`; assurance typecheck; harness lint                            |
| 2     | `npx tsx --test test-harness/assurance/tests/p1-raw-http-transport.spec.test.ts`; then the raw half of `p1-live-boundaries.spec.test.ts` |
| 3     | the admin half of `p1-live-boundaries.spec.test.ts` under the operational lane                                                           |
| 4     | `yarn assurance:harness --project security --profile operational` once; `yarn test:structure`                                            |

The P1 oracle asserts `profile === 'operational'` for every raw case, so this lane runs under
`--profile operational` (AR-2). The plan's earlier production-security assumption was corrected.

---

## Phase 0: Case observability audit (complete)

- [x] 0.1 Enumerate the raw and admin cases with paths, profiles, and required fields; classify the emitting surface. (completed 2026-09-21 11:25; 33 cases: 29 admin-api, 3 /health, 1 /alpha/authorize)
- [!] 0.2 Confirm the live outcome of each raw case whose expectation may not match the product (`st52-header-crlf`, `st52-path-traversal`, `st54-unsupported-method`). Blocked: AR-3 pending the user's decision on changing the requirement or the product.
- [x] 0.3 Independent design challenge of the transport approach. (completed 2026-09-21 11:50; verdict REVISE — reuse `renderRawHttpRequest`, run the lane as operational, keep `correlatedLogCredit` out of scope; corrections applied to this plan and the ambiguity register)

## Phase 1: Decision-log foundation

- [x] 1.1 Add the pure decision-log parser, correlation, symbolic-field projection, and forbidden-field scan. (completed 2026-09-21 11:28; `test-harness/assurance/p1/decision-log.ts`)
- [x] 1.2 Add the immutable specification for parsing, honest projection, correlation, and forbidden scans. (completed 2026-09-21 11:30; 6/6 green)
- [x] 1.3 Add the bounded Porta container log source (`docker logs` with fixed arguments) behind the owned-run container resolution. (completed 2026-09-21 11:45; `test-harness/assurance/p1/porta-log-source.ts` resolves the single owned container by labels and reads a timestamped window with an injected runner)
- [x] 1.4 Phase gate: assurance typecheck, harness lint, and the decision-log spec all pass. (completed 2026-09-21 11:45; decision-log 6/6 and log-source 4/4 green; assurance typecheck and harness lint clean)

## Phase 2: Raw validation/exposure lane

- [ ] 2.1 Add the raw HTTP/1.1 transport over `node:tls`/`node:net` that reuses `renderRawHttpRequest` for framing, follows no redirects, and bounds the response.
- [ ] 2.2 Implement `observeValidationCase` for the 15 raw cases, reusing `LiveTenantAdminContext` for fixtures and state and correlating the decision-log window per request.
- [ ] 2.3 Phase gate: the raw half of `p1-live-boundaries.spec.test.ts` passes.

## Phase 3: Administrative-data lane

- [ ] 3.1 Implement `observeAdminDataCase` for the 18 admin cases with the full/limited/unprivileged identities, controls, state and audit observations, and recovery.
- [ ] 3.2 Phase gate: the admin half of `p1-live-boundaries.spec.test.ts` passes.

## Phase 4: Evidence and closeout

- [ ] 4.1 Register the P1 live suite in the harness selector under the operational lane.
- [ ] 4.2 Run the operational evidence once and record provenance.
- [ ] 4.3 Update the roadmap and remaining-work backlog and mark DEF-13 closed.

**Phase gate:** the adapter observes every declared case through a real boundary, the oracle passes,
and DEF-13 is recorded closed with named evidence.
