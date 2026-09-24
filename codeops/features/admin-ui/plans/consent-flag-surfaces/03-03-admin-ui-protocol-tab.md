# Admin UI Protocol Tab: Consent Flag Surfaces

> **Document**: 03-03-admin-ui-protocol-tab.md
> **Parent**: [Index](00-index.md)
> **CodeOps Artifact Schema**: 1

## Overview

The embedded `porta admin` terminal application must render and save the consent flag on the client
Protocol tab. This document owns the UI model field, the strict projection, and the editor wiring.

## Architecture

### Current Architecture

- `packages/cli/src/admin/client-state.ts` defines the `AdminClient` UI model.
- `packages/cli/src/admin/client-service.ts` (`clientValue`) maps a validated server client into
  `AdminClient` and rejects a client where any known field has the wrong type.
- `packages/cli/src/admin/client-workspace.ts` (`protocolSection`) renders `requirePkce` as a
  JSVision `Switch` with a signal, an `isDirty()` check, and the value in the `save-protocol` input.

### Proposed Changes

Add `requireConsent: boolean` to `AdminClient`, validate and project it in `clientValue`, and add a
second `Switch` beside the PKCE switch in `protocolSection`, wired into `isDirty()` and the save
input. The Overview section, the registration dialog, and the controller stay unchanged.

## Implementation Details

### New Types/Interfaces

```ts
// packages/cli/src/admin/client-state.ts — AdminClient
interface AdminClient {
  // ...
  requirePkce: boolean;
  requireConsent: boolean;
  // ...
}
```

### New Functions/Methods

```ts
// client-service.ts — clientValue (strict, mirrors requirePkce)
if (typeof candidate.requireConsent !== 'boolean') {
  return undefined; // reject the untrusted shape
}
// ...project into the frozen AdminClient:
requireConsent: candidate.requireConsent,

// client-workspace.ts — protocolSection
const requireConsent = createSignal(client.requireConsent);
new Switch({
  value: requireConsent,
  label: 'Re~q~uire consent',
});
// isDirty():
requireConsent.peek() !== client.requireConsent ||
// save input:
requireConsent: requireConsent.peek(),
```

The label mnemonic must not collide with the existing PKCE switch's `~P~`. No default is derived in
the UI; the switch reflects the server value (AR-4, AR-17 thin-service boundary).

### Integration Points

- `AdminClient.requireConsent` mirrors the SDK `Client.requireConsent` from 03-01.
- The controller forwards the `save-protocol` input unchanged; no controller change is needed.
- Every Admin UI test fixture that builds an `AdminClient` must add the field once it is required.

## Code Examples

```ts
// The Protocol tab now offers two independent trust switches:
//   [x] PKCE required
//   [ ] Require consent
```

## Error Handling

| Error Case                                         | Handling Strategy                                                    | AR Ref |
| -------------------------------------------------- | -------------------------------------------------------------------- | ------ |
| Server client missing/non-boolean `requireConsent` | `clientValue` rejects the shape; the client is not rendered as valid | AR-4   |
| Switch unchanged                                   | `isDirty()` stays false; save does not send the field                | AR-4   |
| New client created without the field               | Registration dialog unchanged; server defaults to `false` (AR-5)     | AR-5   |

> **Traceability:** Every design choice references the Ambiguity Register entry that resolved it.
> See `00-ambiguity-register.md`.

## Testing Requirements

- Extend `packages/cli/tests/admin/oidc-client-editors.spec.test.ts` to assert the switch renders
  and the save input carries the value (ST-7, ST-8), and
  `packages/cli/tests/admin/application-client-state.spec.test.ts` for the strict projection (ST-9).
- Update all `AdminClient` fixtures listed by the compiler in the admin test suite.
