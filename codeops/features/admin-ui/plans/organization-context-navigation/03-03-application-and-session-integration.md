# Application and Session Integration: Organization Context and Navigation

> **Document**: 03-03-application-and-session-integration.md
> **Parent**: [Index](00-index.md)

## Overview

This component wires verified capabilities, the organization service, dialogs, and landing state
into the existing application lifecycle. It preserves the single-operation/modal owner model and
keeps server/token/credential policy outside presentation. (AR-1, AR-4, AR-6, AR-8)

## Architecture

### Current Architecture

`runAdminApplication()` owns one `currentController`, one fallback state, and command handlers for
authentication/retry/reauthentication/cancel/quit. `prepareAdminSession()` supplies authentication
operations after server selection.

### Proposed Changes

Extend the prepared session with a narrow `AdminOrganizationOperations` capability and reuse the
current controller/generation guard for all modal operations. Authentication retains physical
AbortSignal propagation; organization list/create use logical cancellation and reject late
completion. (AR-8)

## Implementation Details

### Production Wiring

`runAdminCommand()` passes `prepareAdminSession()` a lazy organization-domain factory:

```ts
() =>
  createClient({
    ...arguments_,
    server: selectedServer.origin,
  }).organizations;
```

The factory is invoked only after a verified session needs list/create, so first-run login and
cross-origin credential replacement complete before `createClient()` checks stored credentials.
`client-factory.ts` and the SDK remain unchanged. (AR-4)

Switching changes only the in-memory organization context and never changes issuer, selected server,
or credential-profile binding. The unchanged SDK may still transparently refresh and durably update
the global RD-01 session while performing an authorized request; switching does not initiate a
separate login or token exchange.

### Operation Ownership

- Retain at most one authentication, list, create, switch, or dialog operation owner.
- Give every operation an identity/generation checked before publishing state.
- Authentication operations continue using `AbortController` through every RD-01 network boundary.
- Organization cancellation ends the modal and invalidates its generation; it does not require SDK
  transport abort.
- At create dispatch, set `createRecoveryRequired`. Clear it on a validated success or a definite
  400/401/403/409 result. A final SDK-handled 401 is a definite pre-handler rejection; clear recovery
  before entering RD-01 session-invalid handling. Keep recovery after cancellation,
  unavailable/invalid response, or any outcome whose external result is uncertain. A successful
  complete list reload clears it. (AR-8)

### Initial Authentication and Choice

1. Complete login or stored-session verification and publish identity/capabilities atomically.
2. If no organization is selected, schedule the chooser after the authentication operation releases
   modal ownership.
3. Never select a row automatically, including a one-row list.
4. If read is unavailable, use 03-02's fixed no-list state and never call `listAll()`.
5. Cancel leaves the no-selection landing view and both top-level menus reachable.
6. Reauthenticate closes and releases the chooser before scheduling the existing authentication
   operation.

### Switch Flow

1. Open the chooser and load the complete list through the service.
2. Preserve SDK order and publish no partial data. (AR-2)
3. A confirmed valid row atomically replaces the selected projection and redraws.
4. Cancel or a fixed failure preserves the previous projection.
5. A service `session-invalid` result closes the modal and transitions through RD-01's
   unauthenticated handling.

### Create Flow

1. Open the create dialog only when `canCreateOrganizations` is true and recovery is not required.
2. Validate fields before dispatch; omit empty optionals.
3. Disable duplicate activation, mark dispatch recovery, and call the service once.
4. A validated success selects the returned projection and redraws.
5. Definite validation/authorization/conflict preserves selection and permits another explicit
   attempt after the dialog reports its fixed category.
6. Indeterminate/cancelled/unavailable/invalid-response outcomes preserve selection and require a
   successful list reload before Create re-enables. No automatic create retry occurs. (AR-8)

### Reauthentication

1. Failed/cancelled reauthentication retains the existing verified state unchanged.
2. Successful reauthentication atomically replaces identity/capabilities, then calls the narrow
   organization reconciliation operation when a selection exists.
3. A valid unique same-UUID result refreshes name, slug, and status.
4. `absent`, `matching-invalid`, or 403 clears selection and opens the organization choice state.
5. Transport/5xx or generic invalid-response preserves the prior projection with
   `Service unavailable` or `Invalid server response`; 401 follows RD-01 session-invalid handling.

### Resize, Quit, and Disposal

- Crossing below the recovery threshold cancels modal ownership before rendering the resize-only
  frame.
- Quit and process signals invalidate organization operations and physically abort authentication.
- Finalization unregisters every new command handler and keeps teardown exactly once.
- No promise continuation may mutate menus, dialogs, identity, selection, or content after disposal.

## Integration Points

- `state.ts`: authoritative running state types.
- `session-service.ts` and `login-coordinator.ts`: live capability flow.
- `organization-service.ts`: only SDK-facing admin-UI boundary.
- `organization-dialogs.ts`: dialog construction and result values.
- `presentation.ts`: dynamic menu/status/landing rendering.
- `application.ts`: sole state-transition and lifecycle coordinator.
- `commands/admin.ts`: lazy production SDK-domain wiring.

## Error Handling

| Error case                       | Application transition                                                                      | AR Ref     |
| -------------------------------- | ------------------------------------------------------------------------------------------- | ---------- |
| Organization 401                 | RD-01 unauthenticated/session-invalid flow                                                  | AR-6, AR-8 |
| Organization 403                 | Preserve selection for ordinary operation; clear during authoritative reauth reconciliation | AR-3, AR-6 |
| Transient reconciliation failure | Preserve selected projection and show fixed retryable category                              | AR-3       |
| Indeterminate create             | Preserve selection, block Create, require successful list reload                            | AR-8       |
| Cancel/resize/quit late result   | Reject publication by operation identity                                                    | AR-8       |

## Testing Requirements

- Initial auto-choice sequencing after verification releases its modal owner.
- Capability-aware command enablement and no unauthorized SDK request.
- Switch/create atomicity, recovery gate, duplicate suppression, and session-invalid transitions.
- Reauthentication refresh/clear/preserve matrix.
- Resize, quit, signal, disposal, and late-result invariants.
- Production command wiring uses the unchanged SDK client factory lazily.
