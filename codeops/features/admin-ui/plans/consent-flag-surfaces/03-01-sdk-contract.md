# SDK Contract: Consent Flag Surfaces

> **Document**: 03-01-sdk-contract.md
> **Parent**: [Index](00-index.md)
> **CodeOps Artifact Schema**: 1

## Overview

The SDK is the typed contract every other surface builds on. It must expose `requireConsent` on the
client entity and the create/update inputs, and its response guard must validate the field. This
document owns the field name, placement, and guard behavior; the CLI and Admin UI docs cite it.

## Architecture

### Current Architecture

`packages/sdk/src/types/clients.ts` defines `Client` (a strict interface mirroring the server
response), `CreateClientInput`, and `UpdateClientInput`. `packages/sdk/src/domains/clients.ts`
defines `isClient`, a hand-written type guard that checks each field of a response object. There is
no runtime request schema; `create`/`update` pass the typed input object to the transport as the
body.

### Proposed Changes

Add the field next to `requirePkce` in all three types and add a guard check. No transport change is
needed because the input object is forwarded unchanged.

## Implementation Details

### New Types/Interfaces

```ts
// packages/sdk/src/types/clients.ts — Client
interface Client {
  // ...existing fields...
  requirePkce: boolean;
  /** When true, the authorization server shows the OIDC consent page for this client. */
  requireConsent: boolean;
  // ...existing fields...
}

// CreateClientInput / UpdateClientInput
interface CreateClientInput {
  // ...
  requireConsent?: boolean;
}
interface UpdateClientInput {
  // ...
  requireConsent?: boolean;
}
```

`requireConsent` is **required** on `Client` because the server always returns the column, and
**optional** on the inputs because the server defaults it to `false` (AR-5).

### New Functions/Methods

`isClient` gains one predicate that follows the existing `requirePkce` check exactly:

```ts
typeof value.requireConsent === 'boolean';
```

The guard remains a strict allowlist: a response object whose `requireConsent` is missing or not a
boolean fails `isClient`, matching how the guard treats every other known field (AR-1).

### Integration Points

- The CLI's SDK input object passes `requireConsent` through unchanged (03-02).
- The Admin UI mirrors the SDK `Client` shape in `AdminClient` (03-03).
- The SDK portability import type carries the persisted `require_consent` (03-04).

## Code Examples

### Example 1: Create a third-party client

```ts
const { client } = await portaclient.clients.create({
  organizationId: 'acme',
  applicationId: 'crm',
  clientName: 'ERP Connector',
  requireConsent: true,
});
```

## Error Handling

| Error Case                             | Handling Strategy                                                            | AR Ref |
| -------------------------------------- | ---------------------------------------------------------------------------- | ------ |
| A response is missing `requireConsent` | `isClient` returns false; the SDK raises its standard invalid-response error | AR-1   |
| `requireConsent` is not a boolean      | `isClient` returns false                                                     | AR-1   |
| An input omits `requireConsent`        | Field is not sent; the server keeps the default/existing value               | AR-5   |

> **Traceability:** Every design choice references the Ambiguity Register entry that resolved it.
> See `00-ambiguity-register.md`.

## Testing Requirements

- Update `packages/sdk/tests/clients-rd04.spec.test.ts`: fixture, `ExpectedClient`, and the enforced
  `expectTypeOf` exact-type oracle (ST-1, ST-3).
- Add a guard case proving a response missing or with a non-boolean `requireConsent` fails `isClient`
  (ST-2).
- Update any other SDK fixture that constructs a `Client` (`packages/sdk/tests/domains/`).
