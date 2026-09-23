# Roles and Permissions Implementation Plan

> **Feature**: Application-scoped RBAC administration and user role assignment
> **Status**: Planning Complete
> **Created**: 2026-09-09
> **Implements**: admin-ui/RD-05
> **CodeOps Artifact Schema**: 1

## Overview

This plan adds role and permission management to Application details and direct role assignment to
User details. It also closes the existing application-boundary defects in OIDC claims and Porta
Admin authorization before exposing those mutations in the terminal UI.

The implementation follows the repository's existing Koa route, PostgreSQL transaction, SDK
domain, conventional CLI, immutable Admin state, controller, focused-dialog, DataGrid, and Layout
DSL patterns. External applications keep independent live RBAC definitions; only the canonical
`porta-admin` definitions receive narrow control-plane protection (AR-1–AR-6).

## Minimum-Sufficient Baseline

**Original goal:** Manage application roles and permissions, their direct mappings, and selected-
organization user role assignments through the established Admin UI design.

**Smallest viable design:** Qualify existing queries and routes, reuse static Admin capability
definitions, add two narrow authority-cleanup helpers, correct existing SDK/CLI contracts, and add
feature-local terminal modules only where direct edits would exceed file-size limits (AR-3–AR-10).

**Excluded machinery:** schema migrations, policy/delegation engines, protected-record frameworks,
workers, queues, distributed locks, ETags, generic RBAC editors, routers, pagination, and new
dependencies (AR-1–AR-5, AR-9–AR-10).

**Approved complexity:** None. The shared helpers remove repeated security-sensitive behavior, and
the UI files are responsibility splits rather than new architectural layers (AR-9–AR-10).

## Document Index

|     # | Document                                              | Description                                            |
| ----: | ----------------------------------------------------- | ------------------------------------------------------ |
|    AR | [Ambiguity Register](00-ambiguity-register.md)        | Confirmed scope and implementation decisions           |
|    00 | [Index](00-index.md)                                  | Overview and navigation                                |
|    01 | [Requirements](01-requirements.md)                    | Thin RD-05 implementation delta                        |
|    02 | [Current State](02-current-state.md)                  | Existing implementation and verified gaps              |
| 03-01 | [Authority Boundaries](03-01-authority-boundaries.md) | Admin provenance and application-filtered OIDC claims  |
| 03-02 | [RBAC Mutations](03-02-rbac-mutations.md)             | Parent integrity, revocation, locking, and audit       |
| 03-03 | [SDK and CLI Contracts](03-03-sdk-cli-contracts.md)   | Public client and conventional command corrections     |
| 03-04 | [Admin UI](03-04-admin-ui.md)                         | Application tabs, focused dialogs, and User Roles flow |
|    07 | [Testing Strategy](07-testing-strategy.md)            | Immutable specification cases and verification         |
|    99 | [Execution Plan](99-execution-plan.md)                | Ordered implementation checklist                       |

## Quick Reference

### Usage Examples

```text
Applications → select application → Roles → Add/Edit/Delete/Manage permissions
Applications → select application → Permissions → Add/Edit/Delete
Users → select user → Roles → Add/Remove
```

An OIDC client receives only roles and permissions from its owning application. A foreign
application may reuse `admin` or even `porta-super-admin` as a local slug, but that role never gains
Porta Admin authority (AR-3, AR-8).

### Key Decisions

| Decision            | Outcome                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| Product boundary    | Direct RD-05 management only (AR-1–AR-2)                                                           |
| Admin authority     | Canonical application provenance plus static capabilities and assignment ceiling (AR-3)            |
| Revocation          | Short locked transaction plus detached targeted Redis cleanup (AR-4, AR-9)                         |
| Mutation result     | Explicit JSON `reauthenticationRequired`; true only for a committed actor-affecting change (AR-7)  |
| Claim application   | Trusted internal metadata; empty arrays on absence; no public/log disclosure (AR-8, AR-12)         |
| Terminal structure  | Small feature-local modules plus one lazy RBAC session factory (AR-10, AR-13)                      |
| Recovery            | Explicit read-only Reload; never replay an unknown mutation (AR-14)                                |
| Canonical records   | Generic CRUD immutable; reset/init is the sole writer (AR-15)                                      |
| Contract validation | Narrow SDK guards plus terminal projection validation (AR-16–AR-17)                                |
| Survivor protection | Reuse extracted repository-owned locking SQL (AR-18)                                               |
| Verification        | Workspace, structure, docs, harness, assurance, and compatibility commands; no root verify (AR-11) |

## Related Files

- `packages/server/src/{clients,middleware,oidc,rbac,routes,lib,users}/`
- `packages/sdk/src/{domains,types}/` and `packages/sdk/src/agent.ts`
- `packages/cli/src/commands/` and `packages/cli/src/admin/`, including production Admin-session wiring
- corresponding server, SDK, CLI, pentest, retained harness, and assurance tests
- `docs/api/rbac.md`, `docs/concepts/rbac.md`, `docs/guide/sdk-agent.md`, and CLI RBAC docs
