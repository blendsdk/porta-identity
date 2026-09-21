# DEF-13 Live Boundary Plan

> **Feature**: Build the P1 live boundary adapter that proves privacy-safe correlated rejection events
> **Status**: In Progress
> **Created**: 2026-09-21
> **Implements**: test-assurance/RD-05
> **CodeOps Artifact Schema**: 1

## Overview

DEF-13's product half is done: covered requests already emit one correlated `security.decision.v1`
event, and administrative permission denials now carry a protected target digest. The remaining
half is the independent verifier. `test-harness/assurance/tests/p1-live-adapter.ts` is still a
fail-closed stub, and `correlatedLogCredit` is hard-coded false.

The immutable oracle `test-harness/assurance/tests/p1-live-boundaries.spec.test.ts` requires the
adapter to execute every declared case through a real public boundary and observe control, probe,
state, prohibited effects, correlated log fields, forbidden fields, and recovery.

## Phase 0 audit result

All 33 declared cases can be observed from existing Porta logs; **no Porta product change is
required**.

| Surface                                           |                  Cases | Evidence source                       |
| ------------------------------------------------- | ---------------------: | ------------------------------------- |
| `/api/admin` (admin-api)                          | 11 raw + 18 admin = 29 | `security.decision.v1`                |
| `/health` (`st53-untrusted-*`)                    |                      3 | operational request-completion record |
| `/alpha/authorize` (`st52-unregistered-redirect`) |                      1 | operational request-completion record |

## Scope boundaries

This plan changes only `test-harness/assurance/**`, the exact repository test inventory contract if
files are added, and this feature's CodeOps artifacts. It does not change Porta product behavior,
CI workflows, publishing, or deployment policy.

## Document Index

| #   | Document                               | Description                              |
| --- | -------------------------------------- | ---------------------------------------- |
| 00  | [Index](00-index.md)                   | Overview and navigation                  |
| 99  | [Execution Plan](99-execution-plan.md) | Specification-first implementation tasks |

## Related Files

- `test-harness/assurance/tests/p1-live-boundaries.spec.test.ts`
- `test-harness/assurance/tests/p1-live-contract.ts`
- `test-harness/assurance/tests/p1-live-adapter.ts`
- `test-harness/assurance/p1/decision-log.ts`
- `test-harness/assurance/production-exposure/live-adapter.ts`
- `test-harness/assurance/compat/admin-data-live.ts`
