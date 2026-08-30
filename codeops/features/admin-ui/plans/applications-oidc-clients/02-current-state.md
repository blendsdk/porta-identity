# Current State: Applications and OIDC Clients

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

The server already owns application, module, client, and secret persistence and Admin API routes.
The SDK exposes domains for those resources, but several type names, response shapes, identifiers,
and lifecycle methods do not match the routes. The conventional CLI consumes those contracts.

The Admin UI currently has working authentication, organization selection, and user administration.
User management supplies the reference architecture: a thin validated service, immutable view
state, a feature controller, Layout DSL views, DataGrid lists, movable dialogs, focus restoration,
and session/organization generation guards. Applications and OIDC Clients are not yet present.

### Relevant Files

| File                                                                | Purpose                             | Changes Needed                                                                          |
| ------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------- |
| `packages/server/src/applications/{service,repository,types}.ts`    | Global applications and modules     | Parent integrity, shared bounds/lifecycle correctness                                   |
| `packages/server/src/clients/{service,repository,validators}.ts`    | Clients and protocol configuration  | Shared compatibility validation and runtime PKCE truth                                  |
| `packages/server/src/clients/{secret-service,secret-repository}.ts` | Secret lifecycle                    | Parent integrity and overlapping-active-secret support                                  |
| `packages/server/src/middleware/client-secret-hash.ts`              | Provider credential prehash         | Extend narrowly into the AR-4 bridge                                                    |
| `packages/server/src/oidc/configuration.ts`                         | Provider metadata policy            | Honor supported persisted confidential PKCE choice                                      |
| `packages/server/src/lib/admin-permissions.ts`                      | Built-in role definitions           | Add organization-read to App Admin                                                      |
| `packages/server/migrations/`                                       | Installed database evolution        | Add ordered idempotent role correction (AR-5)                                           |
| `packages/sdk/src/domains/{applications,clients}.ts`                | Public SDK operations               | Align with real routes and response shapes                                              |
| `packages/sdk/src/types/`                                           | Public resource contracts           | Correct ownership, lifecycle, protocol, and secret types                                |
| `packages/cli/src/commands/`                                        | Conventional application/client CLI | Align calls and output with corrected SDK                                               |
| `packages/cli/src/admin/`                                           | Terminal Admin UI                   | Add feature-specific state, services, controllers, dialogs, workspaces, and integration |
| `docker/admin-playground/tests/support/admin-cli-journey.mjs`       | Packed terminal journey             | Extend through Applications and OIDC Clients                                            |

### Code Analysis

- `ApplicationsDomain` currently offers nonexistent restore and remove-module operations while
  omitting activate/deactivate operations.
- `ClientsDomain.create()` discards the server's optional one-time secret wrapper and exposes a
  nonexistent restore operation.
- `findForOidc()` supplies only the newest active SHA-256 secret, so a second active secret makes
  the older one unusable despite the database's rotation model.
- Migration 013 left pre-existing secrets without `secret_sha256`; their plaintext cannot be
  recovered for backfill.
- `secret-service.verify()` already resolves active, unexpired Argon2 hashes, which is the narrow
  validation seam for AR-4, but it currently returns on the first match despite its comment.
- The nested module and secret routes do not consistently make the parent identifier authoritative.

## Gaps Identified

### Gap 1: Server contract safety

**Current Behavior:** Admin/import validation and OIDC runtime policy can disagree; nested mutations
can ignore their parent; only one active secret reaches the provider.

**Required Behavior:** RD-04's shared validation, parent integrity, PKCE, rotation, and role rules.

**Fix Required:** Implement `03-01-server-safety-and-data.md` (AR-4, AR-5, AR-7, AR-8).

### Gap 2: Public SDK and CLI accuracy

**Current Behavior:** Types and operations describe fields and routes the server does not expose.

**Required Behavior:** Thin clients faithfully represent the existing corrected Admin API.

**Fix Required:** Implement `03-02-sdk-and-cli-contracts.md` (AR-1, AR-2).

### Gap 3: Admin UI feature surface

**Current Behavior:** There is no application or OIDC-client workspace.

**Required Behavior:** Two ownership-aware workspaces satisfying RD-04.

**Fix Required:** Implement `03-03` through `03-06` using the established architecture (AR-2, AR-3).

## Dependencies

### Internal Dependencies

- RD-01 application shell, authentication, focus, dialogs, and resize behavior.
- RD-02 selected organization and generation-safe context transitions.
- RD-03 DataGrid and feature-specific controller/service/state patterns.
- Existing server Admin auth, permissions, repositories, validators, audit logging, and SDK transport.

### External Dependencies

- Existing `oidc-provider` 9.x behavior; no provider fork or private-hook dependency is introduced.
- Existing JSVision `TabView`, `DataGrid`, dialog, and Layout DSL components.
- PostgreSQL for the ordered role migration and integration tests.

## Risks and Concerns

| Risk                                       | Likelihood | Impact | Mitigation                                                                                                                     |
| ------------------------------------------ | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Credential bridge weakens provider checks  | Low        | High   | Canonicalize only after validated match; retain provider method parsing and failure behavior; protocol/pentest coverage (AR-4) |
| Legacy-only client cannot authenticate     | Existing   | High   | Clear rotation path and regression tests; no impossible hash backfill (AR-7)                                                   |
| Late response publishes wrong organization | Medium     | High   | Reuse session plus organization generation ownership and validate returned IDs (AR-2)                                          |
| Plaintext secret survives a transition     | Low        | High   | One owner, no immutable state storage, synchronous discard on every terminal transition                                        |
| Large terminal form becomes unusable       | Medium     | Medium | Approved tabbed Layout DSL dialog and collection DataGrids (AR-3)                                                              |
| SDK correction breaks conventional CLI     | Medium     | Medium | Update SDK and conventional CLI together, then run clean-revision compatibility gates (AR-6)                                   |
