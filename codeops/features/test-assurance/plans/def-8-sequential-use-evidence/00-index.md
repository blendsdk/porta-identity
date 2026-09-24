# DEF-8 Sequential-Use Delivered-Artifact Evidence Implementation Plan

> **Feature**: Live ST-46 black-box evidence for the magic-link, password-reset, and invitation delivered-artifact journeys
> **Status**: Planning Complete
> **Created**: 2026-09-24 13:00
> **Implements**: test-assurance/RD-05
> **CodeOps Artifact Schema**: 1

## Overview

Porta's human-authentication assurance defines the `ST-46` case: every unpredictable delivered
artifact (magic-link, password-reset, invitation) must be bound to its intended recipient and
tenant, expire at the configured boundary, and succeed only once sequentially. The immutable
requirement catalog and the boundary specification already exist, but the adapter seam that feeds
them (`createHumanAuthCasesContract()`) throws `HUMAN_AUTH_LIVE_ADAPTER_UNAVAILABLE` in live mode,
so ST-46 is currently asserted only from a self-fulfilling requirements rig.

This plan builds the missing live adapter. It observes the 21 ST-46 steps (6 positive controls and
15 negative probes across the three artifact kinds) through public HTTP, MailHog, and the
administrative APIs, and reports truthful observations that a new immutable live specification
compares against the requirement. It also closes one product gap discovered while planning: the
invitation invalid/used/expired path writes no rejection audit event, unlike magic-link and
password-reset.

The work is a black-box evidence capability, not new product behaviour. It reuses the existing live
adapter, observer, fixture, and lifecycle machinery; the only product change is one audit event.

## Minimum-Sufficient Baseline

**Original goal:** produce real ST-46 sequential-use evidence for magic-link, password-reset, and
invitation through the existing assurance seam (DEF-8).
**Smallest viable design:** implement live mode for the existing `HumanAuthCasesContract` seam by
reusing the existing live-adapter pattern (`human-auth-functional-live-adapter.ts`), the shared
observers (`human-auth-live-observers.ts`), the live context (`tenant-admin-live-context.ts`), the
`GET /api/admin/audit` API, and MailHog; add one immutable live spec and the selector/harness-block
wiring it needs.
**Excluded machinery:** no new harness framework, dependency, database access path, generalized
adapter registry, or new product endpoints.
**Approved complexity:** None (see AR-26).

## Document Index

| #     | Document                                                          | Description                                   |
| ----- | ----------------------------------------------------------------- | --------------------------------------------- |
| AR    | [Ambiguity Register](00-ambiguity-register.md)                    | Zero-Ambiguity Gate decisions (audit trail)   |
| 00    | [Index](00-index.md)                                              | This document — overview and navigation       |
| 01    | [Requirements](01-requirements.md)                                | RD-05 delta and plan-local decisions          |
| 02    | [Current State](02-current-state.md)                              | Analysis of the existing assurance harness    |
| 03-01 | [Live Adapter](03-01-live-adapter.md)                             | Seam, observation mapping, and adapter design |
| 03-02 | [Invitation Rejection Audit](03-02-invitation-rejection-audit.md) | The one product change                        |
| 03-03 | [Harness Wiring](03-03-harness-wiring.md)                         | Selector, harness block, TTL control          |
| 07    | [Testing Strategy](07-testing-strategy.md)                        | Spec test cases and verification              |
| 99    | [Execution Plan](99-execution-plan.md)                            | Phases, sessions, and task checklist          |

## Quick Reference

### Usage

```bash
# Service-free adapter/observer contract checks
yarn assurance:test --select human-auth-live
yarn assurance:test --select human-auth-recovery-specs

# Real ST-46 evidence against an owned production-security stack
yarn assurance:harness --project security --profile production-security
```

### Key Decisions

| Decision          | Outcome                                                                      |
| ----------------- | ---------------------------------------------------------------------------- |
| Coverage boundary | Live mode covers ST-46 only; other sentinels fail closed (AR-2)              |
| Step coverage     | All 21 ST-46 steps, controls before probes (AR-3)                            |
| Evidence source   | Public HTTP + MailHog + admin APIs only; no DB (AR-5)                        |
| Invitation audit  | Add the missing rejection audit event (AR-6)                                 |
| Expiry            | Catalog-minimum TTLs and one bounded wait (AR-7)                             |
| Log observation   | Admin audit API, normalized to the requirement class (AR-8)                  |
| Selector          | New `human-auth-recovery-specs`; keep `human-auth-live` service-free (AR-22) |

## Related Files

- `test-harness/assurance/tests/human-auth-cases-adapter.ts` — seam to extend (live branch).
- `test-harness/assurance/tests/human-auth-recovery-live-adapter.ts` — new live adapter (03-01).
- `test-harness/assurance/tests/human-auth-recovery.spec.test.ts` — new immutable live spec (03-01).
- `test-harness/assurance/scripts/run-command.ts` — selector and harness block (03-03).
- `packages/server/src/routes/invitation.ts` — invitation rejection audit event (03-02).
- `codeops/features/test-assurance/00-remaining-work.md`, `00-roadmap.md` — closure (AR-28).
