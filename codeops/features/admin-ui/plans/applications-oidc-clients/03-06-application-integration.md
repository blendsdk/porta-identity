# Application Integration: Applications and OIDC Clients

> **Document**: 03-06-application-integration.md
> **Parent**: [Index](00-index.md)

## Overview

This component connects both workspaces to the existing shell without changing its ownership model.
It extends commands, menus, runtime orchestration, focus, resize recovery, and the packed playground
journey using the same boundaries already established for Organizations and Users (AR-2).

## Architecture

### Proposed Changes

- Add explicit application/client commands and permission-aware menu entries in `presentation.ts`.
- Add one small `application-client-features.ts` composition module for both feature controllers,
  capability-bound SDK operations, workspace mounting, and lifecycle forwarding. Keep
  `application.ts` as the shell owner and mount exactly one main workspace at a time.
- Route organization transitions only to the client controller; route authentication replacement,
  invalidation, reauthentication, quit, and disposal to both.
- Extend terminal input ownership so active movable dialogs handle Quit, Cancel, focus traversal,
  and mouse events before commands reach the underlying workspace.

## Implementation Details

### Navigation and Context

Applications is available whenever authenticated and `admin:app:read` is present, independent of
organization selection. OIDC Clients stays present but disabled until both organization context and
the required read capability exist. Create-client separately requires client-create plus app-read.

### Rendering and Focus

Workspace replacement clears the main content before mounting and focuses the actual focusable
child. Dialog close invalidates and redraws the covered region before restoring focus to the exact
invoker. Resize uses the established recovery threshold and never leaves modal or plaintext
ownership behind.

### Documentation and Playground

Update public Admin UI documentation with the global-application/organization-client ownership
model, permissions, operator workflows, the legacy-secret transition, and playground steps. Extend
the packed pseudo-terminal journey through authentication, application creation/module management,
organization client creation/configuration/rotation, context switching, and clean terminal exit.

## Integration Points

- `packages/cli/src/admin/{presentation,application,application-runtime,index}.ts`
- existing organization and user controller lifecycle hooks
- `docker/admin-playground/tests/support/admin-cli-journey.mjs`
- public Admin UI documentation under `docs/`

## Error Handling

| Error Case                              | Handling Strategy                                                                    | Source             |
| --------------------------------------- | ------------------------------------------------------------------------------------ | ------------------ |
| Command emitted while dialog owns input | Dialog handles it or deliberately delegates; no unhandled-command diagnostic         | RD-04 AC-16        |
| Organization changes during client view | Clear client workspace immediately; leave global application state correctly labeled | RD-04 AC-13        |
| Authentication is replaced              | Clear both feature states and any plaintext/dialog ownership                         | RD-04 AC-13        |
| Resize while secret dialog is open      | Discard plaintext and enter resize recovery with Quit reachable                      | RD-04 AC-11, AC-16 |
| Packed journey fails                    | Preserve primary failure and still verify terminal/process cleanup                   | AR-6               |

## Testing Requirements

- Presentation/runtime specification tests for menu availability, ownership transitions, focus,
  redraw, dialog command handling, resize, reauthentication, and quit.
- Packed Admin UI playground E2E covering the complete operator journey.
- Documentation build and focused assurance gates from AR-6.
