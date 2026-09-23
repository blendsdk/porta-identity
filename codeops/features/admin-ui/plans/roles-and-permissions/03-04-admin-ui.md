# Admin UI: Roles and Permissions

> **Document**: 03-04-admin-ui.md
> **Parent**: [Index](00-index.md)

## Overview

Add Roles and Permissions to the existing maximized Application TabView and one focused Roles
operation to User details. Reuse immutable projections, validated SDK adapters, intent-driven
controllers, focused dialogs, DataGrid, and Layout DSL without a generic CRUD framework (AR-5,
AR-10).

## Direct Module Boundaries

Create only files that own real behavior: shared RBAC projections/validation and SDK operations;
Application RBAC controller/pages/dialogs; and User Roles controller/dialog. Existing Application
and User shells mount these owners, pass current immutable IDs/capabilities/session epoch, and
forward the established authentication transition. Empty façade layers are prohibited (AR-10).

After the feature-local RBAC adapter exists, the production Admin command passes one lazy factory
containing the SDK role, permission, and user-role domains through the existing session seam. The
session exposes one narrow RBAC operation bundle to both Application and User owners. This is direct
composition, not a general dependency-injection layer. RBAC capability booleans and their UserInfo
mapping are added before the Application tabs consume them (AR-13, AR-19).

The exact split may combine a state type with its single consumer when that remains below project
size limits. Existing files must not cross the approximately 700-line ceiling.

## Application Tabs

Roles and Permissions follow Overview and Modules. Both always render complete DataGrids, including
zero rows. Selected-row operations stay visible-disabled without selection or capability. Add also
stays visible-disabled without its exact capability. Created/Updated values use
`formatAdminDateTime` (AR-5).

Focused role and permission dialogs implement the RD fields and local validation. Manage
permissions shows assigned permissions and adds/removes one selected permission per request. Add
requires role update plus permission read. Every generic Edit, Delete, and Manage permissions
control for a canonical built-in record renders disabled with one fixed reason; server rejection
remains authoritative (AR-3, AR-5, AR-15).

## User Roles Dialog

User details exposes Roles with role-read capability. The dialog shows Application, Name, and Slug;
application ID is the safe fallback. Add requires role assign plus application read, then selects
one application and one unassigned role. Remove requires role assign, selection, and confirmation.
All dispatches re-read active organization/user/session context and reject late results (AR-4–AR-5).

## Mutation State and Reauthentication

Each successful mutation normally reloads the affected authoritative collection. If a reduction
returns `reauthenticationRequired: true`, its controller treats the mutation as definite success,
aborts owned work, clears protected state/dialogs, advances through the shell's existing session-
epoch transition, and requests authentication without reload. Unknown outcomes retain validated
state and require explicit read-only Reload. Reload reconciles authoritative state and never
repeats the uncertain mutation; a later mutation is always a new deliberate action (AR-4, AR-7,
AR-14).

## Layout and Validation

- Layout DSL owns all geometry; buttons use natural measured widths.
- Dialogs use padding 1 and multiline descriptions with useful height.
- Grids and operation rows are separated by an empty row; navigation remains separate.
- At 80×24 and 48×12 every action remains keyboard reachable through existing bounded compact
  patterns.
- Remote UUIDs, ownership, timestamps, nullable text, slug syntax, and control characters are
  validated before state publication (AR-5, AR-10).

## Error Handling

| Error case                                 | Handling                                             | AR Ref            |
| ------------------------------------------ | ---------------------------------------------------- | ----------------- |
| Missing capability/selection               | Visible-disabled action with fixed reason            | AR-5              |
| Invalid remote row                         | Reject whole collection as `Invalid server response` | AR-5–AR-6         |
| Stale organization/user/application result | Ignore; retain current context                       | AR-4–AR-5         |
| Definite session invalidation              | Clear protected state and open authentication        | AR-7              |
| Indeterminate mutation                     | Preserve state and require read-only Reload          | AR-4, AR-7, AR-14 |

## Testing Requirements

- Specification tests for empty grids, tabs, focused fields, validation, capability matrices,
  direct mapping mutations, compact reachability, stale context, and reauthentication.
- Implementation tests for sorting/selection, focus restoration, cancellation, and render cleanup.
- Existing terminal PTY coverage remains sufficient; no browser UI harness is added (AR-10–AR-11).
