# Current State: User Management

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

The CLI already owns an embedded JSVision Admin UI with verified login, exact organization
selection, fixed sanitized errors, modal ownership, responsive rendering, terminal restoration, and
generation-based late-result rejection. The current authenticated state carries only organization
read/create capabilities. The presentation provides the hamburger and Organizations menus but no
Users workspace.

The SDK exposes organization-scoped and standalone user domains covering the required server
routes, but several types and method signatures do not faithfully represent those routes. The
ordinary `porta user` commands and SDK agent metadata consume those current signatures. The server
already owns all required endpoints, authorization, validation, lifecycle, super-admin protection,
history, and purge behavior; server implementation is not part of this plan (AR-1, AR-3).

### Relevant Files

| File                                                          | Purpose                                   | Changes Needed                                                          |
| ------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| `packages/sdk/src/types/users.ts`                             | Public user and input types               | Complete create/update inputs, exact list names, invitation result      |
| `packages/sdk/src/types/common.ts`                            | Pagination and history types              | Add the existing paginated history result shape                         |
| `packages/sdk/src/domains/users.ts`                           | User HTTP methods                         | Query mapping, invite result, reasons, history result                   |
| `packages/sdk/src/agent.ts`                                   | Current SDK operation metadata            | Align user parameters and return descriptions                           |
| `packages/cli/src/commands/user.ts`                           | Current non-interactive user CLI          | Remove email update drift; send reasons; consume invite/history results |
| `packages/cli/src/commands/admin.ts`                          | Production Admin UI composition root      | Supply organization/users domains from one memoized lazy SDK client     |
| `packages/cli/src/admin/state.ts`                             | Session and organization state            | Add exact user capability booleans only                                 |
| `packages/cli/src/admin/session-service.ts`                   | Live UserInfo validation and lazy domains | Derive user capabilities and provide the current users domain           |
| `packages/cli/src/admin/presentation.ts`                      | Shell menus and landing chrome            | Add independently enabled Users menu and workspace mounting seam        |
| `packages/cli/src/admin/application.ts`                       | Existing 705-line application coordinator | Thin user-controller registration only; no new workflow body            |
| `packages/cli/src/admin/application-runtime.ts`               | Modal/runtime helpers                     | Export the existing abortable-dialog behavior needed by user dialogs    |
| `packages/cli/src/admin/index.ts`                             | Admin module exports                      | Export only production/test integration seams                           |
| `docker/admin-playground/tests/support/admin-cli-journey.mjs` | Packed PTY journey                        | Add the bounded live Users proof and owned cleanup                      |
| `docs/guide/sdk.md`, `docs/cli/{overview,users}.md`           | Public SDK and CLI guidance               | Document corrected SDK contracts and Admin UI Users flow                |
| `packages/sdk/README.md`                                      | Published SDK package examples            | Correct only directly stale user contract examples                      |
| `packages/cli/README.md`                                      | Package CLI guidance                      | Keep embedded Admin UI and user command guidance truthful               |
| `techdocs/guides/admin-playground.md`                         | Maintainer journey                        | Document the exact manual/live test path                                |

### Existing Reference Patterns

- `organization-service.ts` validates untrusted SDK values into bounded immutable projections and
  maps errors to fixed categories.
- `organization-dialogs.ts` uses real JSVision controls with caller-owned cancellation and focus.
- `presentation.ts` rebuilds independently enabled menu items from current validated state.
- `application.ts` owns abort controllers and generation checks; it must not grow another complete
  feature workflow (AR-2, AR-4).
- `node-transport.ts` performs the inherited single definite-401 refresh replay.

## Gaps Identified

### Gap 1: Current SDK user drift

**Current behavior:** incomplete profile inputs, unsupported email update, wrong list parameter
names, invitation typed as `User`, reasonless suspend/lock, and history unwrapped as an array.

**Required behavior:** the exact current server contracts in [03-01](03-01-sdk-user-contracts.md).

**Fix required:** specification-first public type and domain corrections plus current CLI/agent and
packed P1 updates; no compatibility shims (AR-3).

### Gap 2: No validated user presentation boundary

**Current behavior:** raw SDK user values have no Admin UI projection or fixed user-operation
result type.

**Required behavior:** organization-scoped list/detail/history projections, exact capabilities, and
fixed failures.

**Fix required:** [03-02](03-02-user-state-and-service.md) user state and service modules.

### Gap 3: No Users UI or workflow

**Current behavior:** authenticated organization state renders only the landing view and
organization actions.

**Required behavior:** the RD-03 workspace, dialogs, and independently gated commands.

**Fix required:** [03-03](03-03-workspace-and-dialogs.md) and
[03-04](03-04-application-integration.md), using direct JSVision components (AR-2, AR-5).

## Dependencies

### Internal Dependencies

- Completed RD-01 terminal/application lifecycle and RD-02 organization/session context.
- Existing SDK transport refresh behavior and organization-scoped Admin API routes.
- Existing JSVision 1.6.0 packages already owned by the CLI.
- Existing packed Admin UI playground and registered `p1-admin` compatibility journey.

### External Dependencies

None added. The playground continues to use its existing Docker services and administrator
credential supplied at runtime.

## Risks and Concerns

| Risk                                                | Likelihood    | Impact | Mitigation                                                                          |
| --------------------------------------------------- | ------------- | ------ | ----------------------------------------------------------------------------------- |
| Cross-organization or late response enters the view | Low           | High   | Validate organization IDs and check controller generation before publication (AR-4) |
| Raw remote text injects terminal controls           | Medium        | High   | Bound and reject every displayed remote string before state publication (AR-9)      |
| Public SDK correction breaks current consumers      | Medium        | High   | Update current CLI/agent and run clean packed `p1-admin` assurance (AR-3, AR-6)     |
| Password survives a dialog exit                     | Low           | High   | Keep signals dialog-local and clear both buffers on every exit path                 |
| Existing application becomes harder to maintain     | High if grown | Medium | Keep only thin controller wiring in the 705-line file (AR-2)                        |
| Scope expands into later Admin UI features          | Medium        | Medium | Enforce RD-03 exclusions and user-specific modules only (AR-1)                      |
