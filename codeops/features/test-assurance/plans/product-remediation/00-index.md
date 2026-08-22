# Assurance Product Remediation Implementation Plan

> **Feature**: Close the four product/security gaps exposed by Porta's assurance program
> **Status**: Planning Complete
> **Created**: 2026-08-21
> **Implements**: test-assurance/RD-05
> **CodeOps Artifact Schema**: 1

## Overview

This plan fixes four independently confirmed gaps without weakening the tests that exposed them:
authentication enumeration work asymmetry, cross-tenant magic-link acceptance, contradictory
bulk/import/export behavior, and incomplete correlated security-decision events. The approved
contracts are owned by RD-05 and product-remediation AR-1 through AR-4.

The work is isolated on `fix/assurance-remediation`. It may change affected server, SDK, CLI,
database migration, tests, public docs, and maintainer techdocs. It does not change CI workflows,
publishing, deployment, release/merge policy, the completed assurance harness, or unrelated Porta
features.

## Document Index

| # | Document | Description |
| --- | --- | --- |
| AR | [Ambiguity Register](00-ambiguity-register.md) | Approved product/security decisions |
| 00 | [Index](00-index.md) | Overview and navigation |
| 01 | [Requirements](01-requirements.md) | RD-05 delta and local acceptance |
| 02 | [Current State](02-current-state.md) | Grounded defects and affected code |
| 03-01 | [Enumeration Resistance](03-01-enumeration-resistance.md) | Constant-work password and recovery dispatch |
| 03-02 | [Magic-Link Binding](03-02-magic-link-binding.md) | Tenant, interaction, transaction, and Redis binding |
| 03-03 | [Administrative Data](03-03-administrative-data.md) | Bulk, import, and export contracts |
| 03-04 | [Security Decisions](03-04-security-decisions.md) | Correlated terminal events and durable audit |
| 04 | [Phase 1 Quality Review](04-phase-1-quality-review.md) | Independent correctness and security findings |
| 05 | [Phase 2 Quality Review](05-phase-2-quality-review.md) | Tenant-bound magic-link correctness and security findings |
| 06 | [Phase 3 Quality Review](06-phase-3-quality-review.md) | Administrative-data correctness, security, and concurrency findings |
| 07-QG | [Phase 4 Quality Review](07-phase-4-quality-review.md) | Terminal-decision and durable-audit findings |
| 07 | [Testing Strategy](07-testing-strategy.md) | Immutable specification cases and verification |
| 08 | [Phase 5 Quality Review](08-phase-5-quality-review.md) | Closeout traceability, inventory, and ADR findings |
| 99 | [Execution Plan](99-execution-plan.md) | Specification-first implementation tasks |

## Quick Reference

| Decision | Outcome |
| --- | --- |
| Enumeration | Functional and design-level equivalence; timing diagnostics receive no security credit (AR-1) |
| Magic links | Reject tenant/interaction mismatch before consumption (AR-2) |
| Administrative data | Partial bulk, atomic import, strictly scoped exports (AR-3) |
| Security events | One privacy-safe terminal decision event per covered request (AR-4) |

## Related Files

- `packages/server/src/routes/interactions.ts`
- `packages/server/src/routes/password-reset.ts`
- `packages/server/src/routes/magic-link.ts`
- `packages/server/src/auth/magic-link-session.ts`
- `packages/server/src/lib/bulk-operations.ts`
- `packages/server/src/lib/data-import.ts`
- `packages/server/src/lib/data-export.ts`
- `packages/server/src/middleware/`
- `packages/server/migrations/`
- `packages/sdk/src/types/exports.ts`
- `docs/api/`
