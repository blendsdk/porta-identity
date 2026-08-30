# Applications and OIDC Clients Implementation Plan

> **Feature**: Global application definitions and organization-scoped OIDC client administration
> **Status**: Planning Complete
> **Created**: 2026-08-30
> **Implements**: admin-ui/RD-04
> **CodeOps Artifact Schema**: 1

## Overview

This plan adds two deliberately separate Admin UI workspaces. Applications manages deployment-wide
application definitions and modules. OIDC Clients manages the active organization's protocol
configuration and confidential-client secrets. The visual distinction mirrors Porta's existing
ownership model instead of pretending applications are tenant-owned.

The implementation corrects only the server, SDK, and conventional CLI contracts required to make
that surface safe and truthful. It follows the existing feature-specific Admin UI architecture,
JSVision Layout DSL, DataGrid, immutable state, dialog ownership, and session/context guards. It
does not introduce a generic entity or form framework (AR-1, AR-2).

## Document Index

| #     | Document                                                    | Description                                                      |
| ----- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| AR    | [Ambiguity Register](00-ambiguity-register.md)              | Zero-Ambiguity Gate decisions                                    |
| 00    | [Index](00-index.md)                                        | Overview and navigation                                          |
| 01    | [Requirements](01-requirements.md)                          | RD-04 delta and plan-local decisions                             |
| 02    | [Current State](02-current-state.md)                        | Existing implementation and gaps                                 |
| 03-01 | [Server Safety](03-01-server-safety-and-data.md)            | Validation, ownership, roles, runtime secrets                    |
| 03-02 | [SDK and CLI Contracts](03-02-sdk-and-cli-contracts.md)     | Public contract corrections                                      |
| 03-03 | [Admin State and Services](03-03-admin-state-services.md)   | Immutable projections and operation ownership                    |
| 03-04 | [Applications Workspace](03-04-applications-workspace.md)   | Global application and module UI                                 |
| 03-05 | [OIDC Clients Workspace](03-05-oidc-clients-workspace.md)   | Organization clients, configuration, and secrets UI              |
| 03-06 | [Application Integration](03-06-application-integration.md) | Navigation, session, organization, focus, and resize integration |
| 07    | [Testing Strategy](07-testing-strategy.md)                  | Immutable specification cases and verification                   |
| 99    | [Execution Plan](99-execution-plan.md)                      | Ordered phase and task checklist                                 |

## Quick Reference

### Operator Journey

1. Open **Applications** to manage global application definitions and modules.
2. Select an organization, then open **OIDC Clients** to manage that organization's clients.
3. Create or edit a client through one movable tabbed dialog.
4. Generate confidential-client secrets and record the plaintext shown once in its warning dialog.

### Key Decisions

| Decision             | Outcome                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------- |
| Scope                | Implement RD-04 only (AR-1)                                                                   |
| Architecture         | Reuse feature-specific controllers, services, state, and workspaces (AR-2)                    |
| Client editor        | One movable tabbed Layout DSL dialog with DataGrid collection editors (AR-3)                  |
| Secret overlap       | Use a narrow pre-provider validation/canonicalization bridge (AR-4)                           |
| Existing role repair | Add a new ordered idempotent SQL migration (AR-5)                                             |
| Completion gate      | Use Node 24 LTS and the full focused server, UI, docs, harness, and compatibility gate (AR-6) |
| Legacy secrets       | Require one modern-secret generation before legacy overlap works (AR-7)                       |
| Revocation timing    | Subsequent requests fail; an already validated request may finish (AR-8)                      |

## Related Files

- `packages/server/src/applications/`, `packages/server/src/clients/`, and their Admin routes
- `packages/server/src/middleware/client-secret-hash.ts` and OIDC configuration/mounting
- `packages/server/src/lib/admin-permissions.ts` and a new ordered migration
- `packages/sdk/src/domains/applications.ts`, `packages/sdk/src/domains/clients.ts`, and public types
- conventional application/client CLI commands under `packages/cli/src/commands/`
- Admin UI modules under `packages/cli/src/admin/`
- `docker/admin-playground/tests/support/admin-cli-journey.mjs`
- public Admin UI documentation under `docs/`
