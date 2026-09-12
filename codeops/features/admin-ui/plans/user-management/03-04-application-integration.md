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

The production composition root in `packages/cli/src/commands/admin.ts` owns one memoized lazy
`PortaClient` closure per selected server. The organization and user providers both read their
narrow domain from that same closure, so neither provider creates an eager or duplicate client.
Focused command specifications prove the production `porta admin` path supplies both providers.

The controller is constructed only after the presentation, application, and dialog surface exist:

```ts
interface AdminUserController {
  readonly syncContext: (state: AdminConnectionState, sessionEpoch: number) => void;
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

The application owns a monotonic `sessionEpoch`. It increments when a verified session is first
established, replaced by reauthentication, or invalidated, including replacement by the same
subject on the same organization. The controller receives that explicit epoch rather than
inferring session identity from subject/organization equality. It retains one context key made
from `sessionEpoch` and the selected organization UUID. `syncContext()` behaves atomically:

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
7. on a genuinely indeterminate post-dispatch result, shows fixed `outcome-unknown`, leaves
   validated state unchanged, and does not repeat or assume the mutation;
8. on `session-invalid`, closes user UI and invokes the existing authentication gate.

For an indeterminate target-user mutation in a read-capable session, a new mutation remains
disabled until the operator deliberately activates the existing refresh/retry control and a
successful read reconciles the target. Create/invite-only sessions cannot reconcile by reading;
they show the same fixed outcome and require a new deliberate operator action before another
request. There is no automatic retry, polling, or multi-operator lock.

Purge success closes stale detail and refreshes the current page without guessing a replacement
row or patching the page locally.

## Application Changes

- `presentation.ts`: build the Users menu from exact capabilities and mount either landing or user
  workspace content; do not absorb user workflow logic.
- `application.ts`: construct the controller, forward user commands/cancel/resize/context changes,
  own and forward the session epoch, enforce bidirectional busy checks between user dialogs and the
  existing authentication/organization/Who Am I owners, and dispose the controller before terminal
  finalization. Existing handlers otherwise remain semantically unchanged.
- `application-runtime.ts`: expose the current abortable-dialog helper rather than duplicating it.
- `index.ts`: export only seams used by production wiring and focused tests.
- `session-service.ts`: supply exact capabilities and a lazy current users domain.

## Interaction with Organization Workflows

- A successful switch/create calls `syncContext()` with the current session epoch and newly
  selected organization before any Users command can run.
- Reauthentication clears user state before replacement login and does not restore it afterward.
- Organization chooser cancellation preserves the current selected organization and current user
  view because no context changed.
- Organization-operation failures do not alter current user state unless the verified context is
  actually invalidated.

## Error Handling

| Error case                              | Controller behavior                                                                               | AR Ref     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------- |
| Command lacks capability                | Dispatch nothing; retain fixed disabled reason                                                    | AR-4, AR-9 |
| Operation cancelled before request      | Dispatch nothing; restore invoking focus                                                          | AR-4       |
| Mutation cancelled after SDK invocation | Publish outcome-unknown over preserved state, ignore late result, and require deliberate recovery | AR-4, AR-9 |
| Final `401`                             | Clear user UI and enter existing authentication gate                                              | AR-4, AR-9 |
| `403` after enabled action              | Preserve state and show fixed unauthorized result                                                 | AR-9       |
| `404` from any user operation           | Preserve every validated user projection; only definite purge closes it                           | AR-9       |
| Indeterminate post-dispatch result      | Preserve state, show fixed outcome, and require deliberate reconciliation                         | AR-9       |
| Dispose/signal                          | Abort controller, remove modal/workspace, then existing terminal cleanup                          | AR-4       |

## Testing Requirements

- Application specifications cover independent command enablement, no-read create/invite,
  list→detail→action flows, reconciliation, context clearing, resize preservation, late-result
  quarantine, same-subject/same-organization session replacement, bidirectional modal exclusion,
  indeterminate mutation outcomes, authentication gate handoff, and disposal ordering.
- Implementation tests cover command registration, generation increments, submit guards, focus, and
  lazy users-domain construction.
- The packed playground proves authentication, organization selection, Users browse/detail, one
  owned create or invite flow with cleanup, menu restoration, Quit, and terminal restoration.
