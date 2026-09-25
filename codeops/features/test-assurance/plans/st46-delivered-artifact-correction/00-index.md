# ST-46 Delivered-Artifact Requirement Correction Implementation Plan

> **Feature**: Correct the ST-46 delivered-artifact assurance specification (magic-link, password-reset, invitation) so it models bearer-token flows truthfully
> **Status**: Planning Complete
> **Created**: 2026-09-24 23:28
> **Implements**: test-assurance/RD-05
> **CodeOps Artifact Schema**: 1

## Overview

The `def-8-sequential-use-evidence` plan delivered the live ST-46 adapter and recorded three
truthful failures: `password-reset-wrong-recipient`, `invitation-wrong-recipient`, and
`invitation-throttled-request`. Those failures are not product defects. Password-reset and
invitation consumption have no recipient input to vary — the account is resolved from the token —
so an `invalid-artifact` expectation for a "wrong recipient" is unreachable by construction. And
invitation issuance is the admin-authenticated `POST /api/admin/organizations/:orgId/users/invite`
route, whose real control is the global admin per-IP limiter, not an equivalent-public-input
throttle.

This plan corrects the ST-46 probe catalogue to model those flows correctly, corrects the live
adapter to match, updates the immutable live specification's frozen shape and the affected
observation tests, aligns the declarative slice-profile catalog (a second ST-46) with the same
model, and clarifies the owning requirement RD-05 R5.7 so the correction traces to its source. It
changes no product behaviour. After the correction the production-security harness
passes ST-46 truthfully, removing the last open blockers to a production-readiness claim.

## Minimum-Sufficient Baseline

**Original goal:** close DEF-8 findings AR-29 and AR-30 so the production-security harness proves
ST-46 truthfully with no weakened security assertion.
**Smallest viable design:** remove the three unreachable probes from the ST-46 catalogue, remove
their steps and now-dead code from the live adapter, update the live spec's frozen probe count
(15 → 12) and the affected observation tests, add one clarifying clause to RD-05 R5.7, and re-run
the existing harness and verify commands. Reuses the existing catalogue, adapter, spec, fixtures,
and harness machinery.
**Excluded machinery:** no product change (no limiter, no audit event, no recipient-binding
rework), no new probe, no new harness, dependency, or framework.
**Approved complexity:** None.

## Document Index

| #   | Document                                                                        | Description                                              |
| --- | ------------------------------------------------------------------------------- | -------------------------------------------------------- |
| AR  | [Ambiguity Register](00-ambiguity-register.md)                                  | Zero-Ambiguity Gate decisions (audit trail)              |
| 00  | [Index](00-index.md)                                                            | This document — overview and navigation                  |
| 01  | [Requirements](01-requirements.md)                                              | Delta view of RD-05 and plan-local decisions             |
| 02  | [Current State](02-current-state.md)                                            | How the three probes fail today                          |
| 03  | [Catalogue Correction](03-01-st46-catalogue-correction.md)                      | ST-46 catalogue, adapter, and spec changes               |
| 03  | [RD-05 Clarification](03-02-rd05-clarification.md)                              | Owning requirement clarification and program traceability |
| 03  | [Slice-Profile Catalog Correction](03-03-slice-profile-catalog-correction.md)   | Second declarative ST-46 alignment         |
| 07  | [Testing Strategy](07-testing-strategy.md)                                      | Spec test cases and verification                         |
| 99  | [Execution Plan](99-execution-plan.md)                                          | Phases, sessions, and task checklist                     |

## Quick Reference

### Key Decisions

| Decision | Outcome | AR Ref |
| --- | --- | --- |
| Findings resolved | AR-29 + AR-30 only | AR-1 |
| Wrong-recipient amendment | Remove `password-reset-wrong-recipient` and `invitation-wrong-recipient` | AR-2, AR-3 |
| Invitation throttle amendment | Remove `invitation-throttled-request` | AR-4 |
| Owning requirement | Clarify RD-05 R5.7 in the same plan | AR-5, AR-10 |
| Safety proof | Retained probes + protected-state keys + token-to-owner binding | AR-6 |
| Product change | None | AR-13 |

### Key Files

| File | Change |
| --- | --- |
| `test-harness/assurance/tests/human-auth-recovery-case-requirements.ts` | Remove three probes; keep 6 controls |
| `test-harness/assurance/tests/human-auth-recovery-live-adapter.ts` | Remove three probe steps and dead code |
| `test-harness/assurance/tests/human-auth-recovery.spec.test.ts` | Frozen probe count 15 → 12 |
| `test-harness/assurance/tests/human-auth-recovery-observations.impl.test.ts` | Adjust affected observation tests |
| `test-harness/assurance/tests/human-auth-slice-profile-requirements.ts` | Align the declarative catalog with the clarified R5.7 |
| `test-harness/assurance/tests/human-auth-slice-profiles.spec.test.ts` | Narrow the blanket public-throttle assertion |
| `codeops/features/test-assurance/requirements/RD-05-security-risk-slice-assurance.md` | Clarify R5.7 |
| `codeops/features/test-assurance/plans/test-assurance-program/07`,`08` | Traceability/testing notes |
| `codeops/features/test-assurance/00-remaining-work.md`, `00-roadmap.md` | Backlog and roadmap bookkeeping |
