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

All 33 declared cases can be observed from existing Porta logs. The audit initially concluded that
no Porta product change is required, but an independent design challenge found that some raw-case
expectations may not match the product's honest behavior. `st52-header-crlf` expects `400`, yet the
request is well-formed HTTP and Porta neither reflects nor rejects the injected header, so the live
outcome is expected to be `200`. This is tracked as open decision AR-3 in the ambiguity register and
may require a requirement change. Every other case's outcome must be confirmed on the live stack.

| Surface                                           |                  Cases | Evidence source                       |
| ------------------------------------------------- | ---------------------: | ------------------------------------- |
| `/api/admin` (admin-api)                          | 11 raw + 18 admin = 29 | `security.decision.v1`                |
| `/health` (`st53-untrusted-*`)                    |                      3 | operational request-completion record |
| `/alpha/authorize` (`st52-unregistered-redirect`) |                      1 | operational request-completion record |

## Scope boundaries

This plan changes `test-harness/assurance/**`, the exact repository test inventory contract if files
are added, and this feature's CodeOps artifacts. It builds a raw HTTP transport because the oracle
requires exact raw octets. It does not change Porta product behavior; if a live run shows a genuine
product defect or an impossible requirement, that is escalated for a decision rather than patched
silently.

## Document Index

| #   | Document                                       | Description                              |
| --- | ---------------------------------------------- | ---------------------------------------- |
| 00  | [Index](00-index.md)                           | Overview and navigation                  |
| 00b | [Ambiguity Register](00-ambiguity-register.md) | Material decisions and their authority   |
| 99  | [Execution Plan](99-execution-plan.md)         | Specification-first implementation tasks |

## Related Files

- `test-harness/assurance/tests/p1-live-boundaries.spec.test.ts`
- `test-harness/assurance/tests/p1-live-contract.ts`
- `test-harness/assurance/tests/p1-live-adapter.ts`
- `test-harness/assurance/p1/decision-log.ts`
- `test-harness/assurance/p1/porta-log-source.ts`
- `test-harness/assurance/p1/raw-http-transport.ts`
- `test-harness/assurance/tests/tenant-admin-live-context.ts`
- `test-harness/assurance/production-exposure/live-adapter.ts`
- `test-harness/assurance/compat/admin-data-live.ts`
