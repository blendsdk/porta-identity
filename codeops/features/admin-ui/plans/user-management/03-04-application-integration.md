# Application Integration: User Management

> **Document**: 03-04-application-integration.md
> **Parent**: [Index](00-index.md)

## Overview

Wire the SDK-backed user service, workspace, and dialogs into the existing application through one
small `user-controller.ts`. The existing application remains the owner of authentication,
organization switching, resize, signals, terminal restoration, and top-level command registration.
It delegates only user-specific workflow behavior (AR-2, AR-4, AR-7).

## Production Wiring

`AdminApplicationSession` gains an optional lazy `users` operation boundary alongside
`organizations`. `session-service.ts` creates it from the selected authenticated client without
constructing a second client or sending a request before a user command is activated.

The controller is constructed only after the presentation, application, and dialog surface exist:

```ts
interface AdminUserController {
  readonly syncContext: (state: AdminConnectionState) => void;
  readonly handleCommand: (command: string) => boolean;
  readonly cancelActiveOperation: () => void;
  readonly handleRecoverableGeometry: (recoverable: boolean) => void;
  readonly dispose: () => void;
}
```

The concrete factory receives the application, current-state reader, user operations, workspace,
dialog host, and a callback that enters the existing authentication gate. It exposes no public SDK
value and adds no application-wide service locator.

## Context and Generation Ownership

The controller retains one context key made from verified session generation and selected
organization UUID. `syncContext()` behaves atomically:

- same verified context: update capabilities without discarding validated user state;
- organization change, reauthentication, session invalidation, unauthorized/fatal state, or
  disposal: increment generation, abort user operation, remove modal, and clear workspace;
- resize below threshold: increment only operation generation, abort/remove modal, preserve
  validated workspace state;
- resize recovery: redraw preserved same-context state and restore focus.

Every asynchronous continuation captures both context and operation generations before dispatch.
It may publish only if neither changed and the controller remains active. A result from another
organization, old session, cancelled modal, or disposed application is ignored.

## Command Orchestration

### Browse and reads

Browse opens the workspace, requests page 1 with `pageSize=20`, and publishes only a validated
page. Search/filter/page/retry reuse the current validated query. Detail/history reads follow the
selected row UUID and selected organization UUID. Reads can be manually retried; there is no
automatic polling.

### Mutations

One modal operation owns a submit guard. The controller:

1. collects and locally validates dialog input;
2. disables duplicate submit and dispatches once;
3. lets the SDK transport perform only its existing definite-401 refresh replay;
4. on definite success, reloads detail/page only when read capability exists;
5. otherwise shows the fixed create/invite success projection;
6. on fixed failure, leaves validated state unchanged;
7. on `session-invalid`, closes user UI and invokes the existing authentication gate.

Purge success closes stale detail and refreshes the current page without guessing a replacement
row or patching the page locally.

## Application Changes

- `presentation.ts`: build the Users menu from exact capabilities and mount either landing or user
  workspace content; do not absorb user workflow logic.
- `application.ts`: construct the controller, forward user commands/cancel/resize/context changes,
  and dispose it before terminal finalization. Existing organization and authentication handlers
  remain semantically unchanged.
- `application-runtime.ts`: expose the current abortable-dialog helper rather than duplicating it.
- `index.ts`: export only seams used by production wiring and focused tests.
- `session-service.ts`: supply exact capabilities and a lazy current users domain.

## Interaction with Organization Workflows

- A successful switch/create calls `syncContext()` with the newly selected organization before any
  Users command can run.
- Reauthentication clears user state before replacement login and does not restore it afterward.
- Organization chooser cancellation preserves the current selected organization and current user
  view because no context changed.
- Organization-operation failures do not alter current user state unless the verified context is
  actually invalidated.

## Error Handling

| Error case                         | Controller behavior                                                      | AR Ref     |
| ---------------------------------- | ------------------------------------------------------------------------ | ---------- |
| Command lacks capability           | Dispatch nothing; retain fixed disabled reason                           | AR-4, AR-9 |
| Operation cancelled before request | Dispatch nothing; restore invoking focus                                 | AR-4       |
| Operation cancelled after request  | Ignore late result; no retry or local patch                              | AR-4       |
| Final `401`                        | Clear user UI and enter existing authentication gate                     | AR-4, AR-9 |
| `403` after enabled action         | Preserve state and show fixed unauthorized result                        | AR-9       |
| Dispose/signal                     | Abort controller, remove modal/workspace, then existing terminal cleanup | AR-4       |

## Testing Requirements

- Application specifications cover independent command enablement, no-read create/invite,
  list→detail→action flows, reconciliation, context clearing, resize preservation, late-result
  quarantine, authentication gate handoff, and disposal ordering.
- Implementation tests cover command registration, generation increments, submit guards, focus, and
  lazy users-domain construction.
- The packed playground proves authentication, organization selection, Users browse/detail, one
  owned create or invite flow with cleanup, menu restoration, Quit, and terminal restoration.
