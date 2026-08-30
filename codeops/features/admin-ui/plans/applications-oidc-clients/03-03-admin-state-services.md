# Admin State and Services: Applications and OIDC Clients

> **Document**: 03-03-admin-state-services.md
> **Parent**: [Index](00-index.md)

## Overview

Two narrow service/state/controller sets adapt validated SDK values to the terminal. Application
state is session-global; client state is additionally bound to the selected organization. The
implementation copies the proven user-management composition without extracting a generalized
framework (AR-2).

## Architecture

### Proposed Modules

- `application-state.ts`, `application-service.ts`, `application-controller.ts`, and small companion
  type files as needed.
- `client-state.ts`, `client-service.ts`, `client-controller.ts`, and small companion type files as
  needed.
- Minimal feature-local workspace/dialog contracts needed by those controllers; the concrete views
  remain in 03-04 and 03-05.

Files are split by responsibility before they approach the repository's size threshold. Shared
helpers are reused only when they already exist or when the exact same bounded primitive is needed
by both features; no entity abstraction is introduced (AR-2).

## Implementation Details

### Validated State

State admits only allowlisted, bounded, control-free remote fields and closed enum values. Phase 3
uses discriminated immutable unions for closed/loading/list/failure/indeterminate states. The
detail and selected-entity states are added with their concrete workspaces in 03-04 and 03-05 so
the controller contracts follow real view intents instead of speculative generic operations. A
failed read retains only a previously validated projection and never a partial page. Secret
plaintext is not a state field.

Application state holds the complete global catalog and selected application/module projection.
Client state carries its owning organization ID on every collection/detail/secret projection and
rejects a mismatched returned client, application, module, or secret before publication.

### Services

Services own SDK calls, response validation, fixed local failure categories, one definite-401
refresh replay through the established session service, and indeterminate mutation classification.
They do not own presentation, authorization policy, or secret persistence. Collection calls use
SDK `listAll` with no UI search/pagination controls.

Production session construction exposes the existing SDK application/client domains through
feature-specific operations. The capability snapshot parses every RD-04 application/client
permission, including the client-create plus app-read conjunction; tests cover both parsing and
production injection before controller behavior is implemented.

### Controllers and Ownership

Each controller owns at most one dialog or network operation. Phase 3 establishes list loading,
context transitions, reconciliation, and representative mutation ownership. Intent-specific detail,
module, lifecycle, update, and secret methods are added beside the concrete views in 03-04 and
03-05, reusing the same ownership rules. Every mutation rechecks capability, session, and the
relevant organization immediately before dispatch. Operation/session generations discard late
results. Organization changes clear only client state; authentication replacement or invalidation
clears both controllers. After an indeterminate mutation, another mutation stays blocked until
deliberate reload reconciles the entity.

The one-time plaintext returned by client/secret creation remains in the current synchronous
controller continuation only long enough to populate a non-editable warning view. It is never
written to JSVision's application clipboard. Closing/cancelling, context/session replacement,
resize recovery, reauthentication, or quit clears that reference.

## Integration Points

- Corrected SDK domains from `03-02-sdk-and-cli-contracts.md`
- existing `session-service.ts`, capability snapshot, application runtime, and organization state
- workspaces/dialogs in `03-04` and `03-05`

## Error Handling

| Error Case                                                    | Handling Strategy                                                           | Source         |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------- |
| Invalid remote field or enum                                  | Return fixed `invalid-response`; publish no unverified data                 | RD-04 security |
| Session or organization changes during operation              | Abort where possible and discard every late continuation                    | RD-04 AC-13    |
| Definite 401                                                  | Use the existing single refresh replay; otherwise enter authentication flow | RD-04 AC-14    |
| 403, conflict, validation, cancellation, or transport failure | No automatic mutation retry; retain prior validated projection              | RD-04 AC-14    |
| Indeterminate mutation                                        | Mark reconciliation required and block mutation until deliberate reload     | RD-04 AC-14    |
| Secret plaintext terminal transition                          | Clear the only controller/dialog reference synchronously                    | RD-04 AC-11    |

## Testing Requirements

- Specification tests for validation, all-or-nothing lists, ID/context rejection, state transitions,
  capability gates, refresh replay, indeterminate outcomes, and secret disposal.
- Implementation tests for generation races, abort behavior, dialog ownership, and reload recovery.
