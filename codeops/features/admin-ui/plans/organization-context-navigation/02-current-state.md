# Current State: Organization Context and Navigation

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

`porta admin` already owns server selection, global OIDC login, stored-session verification,
credential replacement, cancellation, terminal lifecycle, responsive rendering, and a packed
playground journey. The authenticated screen is still the RD-01 identity summary and exposes no
organization commands.

The SDK already supplies `organizations.listAll()` and `organizations.create()`. UserInfo already
contains `roles` and `permissions`, but the CLI validator currently discards both. JSVision 1.6.0
already provides the Dialog, Input, ListView, Button, menu, layout, signal, and capability primitives
needed by RD-02; no dependency is missing. (AR-1, AR-4)

### Relevant Files

| File                                                          | Current purpose                                        | Required change                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `packages/cli/src/admin/state.ts`                             | Connection-state union and public failure categories   | Add capabilities, narrow organization context, and operation state            |
| `packages/cli/src/admin/session-service.ts`                   | UserInfo verification and authentication-state mapping | Retain validated capabilities and prepare organization operations             |
| `packages/cli/src/admin/application.ts`                       | JSVision lifecycle, commands, modal host, cancellation | Orchestrate menus, dialogs, organization operations, and reconciliation       |
| `packages/cli/src/admin/presentation.ts`                      | Current summary, menu/status rows, responsive shell    | Replace summary with landing view and dynamic menus                           |
| `packages/cli/src/auth/login-coordinator.ts`                  | PKCE login and verified UserInfo retrieval             | Carry ephemeral capabilities from the already fetched UserInfo result         |
| `packages/cli/src/auth/types.ts`                              | Verified identity and auth result types                | Add the ephemeral verified admin-profile shape without persisting RBAC claims |
| `packages/cli/src/commands/admin.ts`                          | Command preflight and application wiring               | Supply a lazy server-bound SDK organization-domain factory                    |
| `packages/cli/src/client-factory.ts`                          | Existing authenticated SDK client construction         | Reuse unchanged after authentication                                          |
| `docker/admin-playground/tests/support/admin-cli-journey.mjs` | Packed login and terminal restoration journey          | Drive choose/create and clean the exact test organization                     |

### Code Analysis

- `application.ts` is 457 lines and already owns lifecycle-sensitive behavior. Adding dialog
  construction and response validation there would breach the project's preferred file size and
  mix responsibilities, so AR-1 adds exactly two focused files.
- `presentation.ts` rebuilds menu items when terminal geometry changes. The same existing mechanism
  can rebuild capability-aware labels without a new navigation framework.
- `session-service.ts` already validates live UserInfo and maps it into application state. Extending
  that boundary avoids a second `/me` request and keeps RBAC claims ephemeral.
- `createClient()` already binds the SDK to stored CLI credentials and the chosen server. A lazy
  domain factory avoids constructing it before first-run authentication or credential replacement.
- `listAll()` preserves server order and returns no partial list after a page error, matching AR-2
  and RD-02 without SDK changes.

## Gaps Identified

### Gap 1: Ephemeral Capabilities Are Discarded

**Current Behavior:** UserInfo validation returns only subject, email, and name.

**Required Behavior:** Independently validate roles and permissions, retain only two advisory
capability booleans, and preserve the exact legacy role exception. (03-01 §Capabilities)

### Gap 2: No Organization Operation Boundary

**Current Behavior:** The admin application has authentication operations only.

**Required Behavior:** Add one UI-neutral wrapper over the existing SDK domain that validates the
four-field context projection and maps failures to AR-3 categories. (03-01 §Operations)

### Gap 3: No Organization UI

**Current Behavior:** The main view prints identity details and the menu has Application/Session.

**Required Behavior:** Add the approved menus/dialogs and render only selected organization context
in the main view. (03-02)

### Gap 4: Authentication and Organization State Do Not Reconcile

**Current Behavior:** Successful reauthentication replaces only identity state.

**Required Behavior:** Reload capabilities and organizations, then refresh, clear, or preserve
selection according to RD-02 OC-11. (03-03 §Reauthentication)

## Dependencies

### Internal Dependencies

- RD-01 terminal lifecycle and authentication implementation.
- Existing CLI client factory and credential store.
- Existing SDK `OrganizationsDomain` and typed SDK errors.
- Existing admin playground, packed consumer, and PTY driver.

### External Dependencies

- JSVision 1.6.0 already pinned by the CLI.
- Node.js 24.20.0 LTS for planning and verification.
- PostgreSQL/Redis/playground services only for the existing packed live journey.

## Risks and Concerns

| Risk                                                           | Likelihood | Impact | Mitigation                                                                                                                             |
| -------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| A late list/create result mutates state after cancel or resize | Medium     | High   | Operation generation/ownership check before every state publication (AR-8)                                                             |
| A create result is indeterminate and the user submits again    | Low        | High   | Mark recovery required at dispatch; require successful list reload before Create re-enables (AR-8)                                     |
| Raw SDK errors or organization text reach the terminal         | Medium     | High   | Validate projections and map to AR-3 fixed text before presentation                                                                    |
| Existing application file becomes too large                    | High       | Medium | Two focused files only; keep application as orchestrator (AR-1)                                                                        |
| Packed test leaves tenant data behind                          | Medium     | Medium | Prove a high-entropy slug is test-owned, destroy it through the installed packed SDK in an inner `finally`, and verify absence (AR-10) |
