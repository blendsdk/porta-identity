# Applications Workspace: Applications and OIDC Clients

> **Document**: 03-04-applications-workspace.md
> **Parent**: [Index](00-index.md)

## Overview

The Applications workspace presents deployment-wide application definitions and modules. Every
screen and mutation dialog states that scope concisely so an operator does not mistake the selected
organization for application ownership.

## Architecture

### Proposed Changes

Add a feature-specific workspace and movable dialogs wired to the application controller from
`03-03-admin-state-services.md`. Layout is expressed with the JSVision Layout DSL. DataGrid is used
for application and module rows; single-value metadata uses compact labels and inputs (AR-2).

## Implementation Details

### List and Detail

The workspace renders one full-height application DataGrid with Name, Slug, and textual Status.
Loading, empty, failed, and ready states replace the workspace content cleanly. A persistent notice
labels the data deployment-global. Opening a row shows safe detail, timestamps, actions, and the
module DataGrid while keeping the global warning visible.

### Application Dialogs

Create/edit dialogs are movable and use one-row name/slug inputs plus a bounded description editor.
Slug is create-only. Lifecycle confirmations name the application and state the exact effect owned
by RD-04. Archived applications render all mutations visible-disabled.

### Module Dialogs

Create/edit/deactivate dialogs carry the selected internal application UUID and validate returned
module ownership before publishing. Module grids show Name, Slug, and textual Status. No delete or
restore action exists.

### Capability Presentation

Unavailable actions remain visible with their fixed denial reason. Capability checks are advisory;
the controller rechecks before dispatch and the server remains authoritative.

## Integration Points

- application state/service/controller in `03-03-admin-state-services.md`
- `presentation.ts` commands and menu construction
- application runtime mounting, focus restoration, mouse routing, and modal ownership

## Error Handling

| Error Case                 | Handling Strategy                                                 | Source             |
| -------------------------- | ----------------------------------------------------------------- | ------------------ |
| Empty complete catalog     | Render an explicit empty DataGrid state with global notice        | RD-04 AC-02        |
| Partial list failure       | Publish no rows from the failed load                              | RD-04 AC-02, AC-14 |
| Archived application       | Keep detail readable; render every mutation visible-disabled      | RD-04 AC-04, AC-05 |
| Mismatched returned module | Show fixed invalid-response outcome and preserve validated detail | RD-04 AC-06        |
| Terminal becomes too small | Cancel modal ownership and enter established resize-only recovery | AR-3               |

## Testing Requirements

- Workspace/render tests for complete list, empty/failure/detail/module/lifecycle states.
- Dialog tests for Layout DSL use, one-row inputs, global notices, validation, movement, focus,
  resize recovery, keyboard/mouse reachability, and artifact-free redraw.
