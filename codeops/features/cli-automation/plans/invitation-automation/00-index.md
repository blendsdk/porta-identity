# CLI Invitation Automation Implementation Plan

> **Feature**: CLI-wide JSON errors, invitation claim input and bulk email-file invitations
> **Status**: Complete — 49/49 tasks verified; all six repair CI jobs passed; final documentation checkpoint CI observed separately
> **Created**: 2026-11-03
> **Implements**: cli-automation/T-01
> **CodeOps Artifact Schema**: 1

## Overview

Bundle A implements GitHub [#180](https://github.com/blendsdk/porta-identity/issues/180),
[#183](https://github.com/blendsdk/porta-identity/issues/183) and
[#181](https://github.com/blendsdk/porta-identity/issues/181), in that order. This is a full
standalone plan: [01-requirements](01-requirements.md) owns the requirements; there is no upstream
RD. T-01 is its roadmap identity, not a lightweight mini-plan classification (AR-1/4/16).

The user approved the public behaviour in AR-12. Eligible technical choices were resolved under
auto-design policy v1 with provenance in AR-13–16. No product implementation or successful
execution is implied by plan creation. [99-execution-plan](99-execution-plan.md) is the only task
progress authority. It records the requested auto-commit mode for later exec-plan use (AR-5).

## Minimum-Sufficient Baseline

**Original goal:** Make the conventional CLI usable for classified automation failures and
invitation claims, then invite an email file through the existing SDK/API.

**Smallest viable design:** Extend the existing error boundary and parsers; register a focused
bulk invitation command with bounded file input and a direct sequential SDK loop (AR-13–15).

**Excluded machinery:** New dependencies, server bulk endpoints, queues/workers, generalized
execution frameworks, persistent reports/resume storage, custom signal supervision and new CI
gates were considered and rejected. **Approved complexity:** None.

## Document Index

| Document                                              | Owner                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| [00-ambiguity-register](00-ambiguity-register.md)     | User/delegated decisions and semantic gate                       |
| [00-preflight-report](00-preflight-report.md)         | Formal audit findings, resolutions and reviewed-content identity |
| [01-requirements](01-requirements.md)                 | Scope and acceptance requirements                                |
| [02-current-state](02-current-state.md)               | Observed source baseline and risks                               |
| [03-01-json-errors](03-01-json-errors.md)             | Error schema and CLI-wide integration                            |
| [03-02-invitation-claims](03-02-invitation-claims.md) | Claim grammar and single-invite wiring                           |
| [03-03-bulk-invitations](03-03-bulk-invitations.md)   | File, dispatch and result contract                               |
| [07-testing-strategy](07-testing-strategy.md)         | Immutable ST cases and verification commands                     |
| [08-execution-evidence](08-execution-evidence.md)     | Verification, qualifications and final acceptance mapping        |
| [99-execution-plan](99-execution-plan.md)             | Authoritative verified task checklist                            |

## Quick Reference

Public invocation examples are owned by 03-02 §Command and 03-03 §Command. Error examples are owned
by 03-01 §Wire contract. AR-12 owns the public approval, not the historical challenger proposal.

## Specialist Agents

**None** — the specialist-gap check found no standing capability missing from generic dynamic
packets. The public CLI contracts, existing SDK boundary, project security invariants and three
focused component specifications fit a bounded packet. `packages/cli/src/error-handler.ts:81`,
`packages/cli/src/parsers.ts:155` and `packages/sdk/src/types/users.ts:239` provide the relevant
conventions; no new protocol, storage engine or recurring unpacketable domain is introduced.

Execution still requires independent phase review, API-surface review and the security audit
coverage in 07. This negative specialist result never waives those gates (AR-16).

## Navigation and integration

[Feature roadmap](../../00-roadmap.md). Its portfolio cascade is intentionally deferred until
integration into `develop`; this branch must not edit sibling roadmap state (AR-10/16).
Before an execution session, `/compact` is useful because this planning chain
contains substantial historical release and branch-cleanup context.
