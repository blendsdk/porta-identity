# OIDC Client Workflow Redesign Implementation Plan

> **Feature**: Azure-inspired OIDC client registration and administration in the Porta Admin UI
> **Status**: Executing
> **Created**: 2026-09-07
> **Implements**: admin-ui/RD-04
> **CodeOps Artifact Schema**: 1

## Overview

This plan replaces the cramped OIDC client create/configure experience with compact registration
and a sectioned client-detail workflow. It exposes Porta's existing multi-URI, multi-login-method,
and secret-rotation capabilities without copying Azure features that Porta does not implement.

The work is primarily inside the terminal Admin UI. The only public contract addition carries the
chosen expiry for the automatically generated initial confidential-client secret through the SDK
and Admin API. No database, OIDC runtime, authorization, or infrastructure redesign is included
(AR-1, AR-9, AR-11).

## Minimum-Sufficient Baseline

**Original goal:** Make OIDC client registration, configuration, redirect URI management, login
methods, and credentials understandable and usable in the Admin UI.

**Smallest viable design:** Reuse the existing maximized workspace, controller/service boundaries,
array-replacement update endpoint, and JSVision 1.7.0 `GroupBox`, `DataGrid`, `DatePicker`, and Layout
DSL controls. Add one optional create field for initial-secret expiry (AR-1, AR-4–AR-8, AR-10–AR-11).

**Excluded machinery:** General form/editor frameworks, base dialog classes, schema-driven UI,
client-side OIDC policy engines, routers, new dependencies, database migrations, and Azure-only
capabilities (AR-9, AR-14).

**Approved complexity:** None. The dialog-file split is a mechanical responsibility split, not a
new abstraction (AR-14).

## Document Index

| # | Document | Description |
|---|---|---|
| AR | [Ambiguity Register](00-ambiguity-register.md) | Confirmed scope and design decisions |
| 00 | [Index](00-index.md) | Overview and navigation |
| 01 | [Requirements](01-requirements.md) | RD-04 revision delta |
| 02 | [Current State](02-current-state.md) | Existing implementation and gaps |
| 03-01 | [Secret Contract](03-01-initial-secret-contract.md) | API, SDK, validation, and compatibility |
| 03-02 | [Client Workflow](03-02-client-workflow.md) | Registration, detail sections, and navigation |
| 03-03 | [Focused Editors](03-03-focused-editors.md) | Authentication, protocol, login, and credentials |
| 07 | [Testing Strategy](07-testing-strategy.md) | Specification cases and verification |
| 99 | [Execution Plan](99-execution-plan.md) | Ordered implementation checklist |

## Quick Reference

### Operator Journey

1. Register a client with its identity, deployment type, first redirect URI, and optional initial
   confidential secret settings.
2. Store the generated secret from its one-time dialog when applicable.
3. Continue directly to Overview, then use focused sections to configure Authentication, Protocol,
   Login experience, Credentials, or Lifecycle (AR-3, AR-4, AR-12).

### Key Decisions

| Decision | Outcome |
|---|---|
| Product boundary | Admin UI redesign with one narrow server/SDK addition (AR-1) |
| Registration | Compact form; advanced settings after creation (AR-3) |
| Detail design | Six focused sections selected through one existing `ListBox` inside the module surface (AR-4) |
| Collections | Selected-row DataGrid CRUD, staged until Save (AR-5, AR-10) |
| Secret expiry | 6-month UI default, presets, future custom date, or warned Never (AR-6–AR-7) |
| Login experience | Inherit or independently select Password and Magic link (AR-8) |
| File structure | Direct responsibility split; stable facade file with obsolete shared-tab exports removed (AR-14) |

## Related Files

- `packages/server/src/routes/clients.ts`
- `packages/server/src/clients/validators.ts`
- `packages/sdk/src/types/clients.ts` and `packages/sdk/src/domains/clients.ts`
- `packages/cli/src/admin/client-dialogs.ts` and focused dialog modules created from it
- `packages/cli/src/admin/client-workspace.ts`
- `packages/cli/src/admin/client-controller.ts`
- `packages/cli/src/admin/application-client-features.ts`
- `packages/cli/src/admin/index.ts`
- corresponding server, SDK, CLI, structure, and retained harness tests
