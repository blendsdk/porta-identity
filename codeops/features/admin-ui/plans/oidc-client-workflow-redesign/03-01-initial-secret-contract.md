# Initial Secret Contract: OIDC Client Workflow Redesign

> **Document**: 03-01-initial-secret-contract.md
> **Parent**: [Index](00-index.md)

## Overview

This component carries an administrator's expiry choice into the automatically generated initial
secret and closes the existing past-expiry validation gap. Secret hashing, storage, revocation,
active-secret limits, authentication, and database representation remain unchanged (AR-1, AR-11).

## Architecture

### Current Architecture

`POST /api/admin/clients` validates `CreateClientInput`, creates the client, then calls the existing
secret service for confidential clients. `POST /api/admin/clients/:id/secrets` uses the same service
for rotation. The service stores Argon2id and SHA-256 derivatives and returns plaintext only from
the mutation response.

### Proposed Changes

Add optional `secretExpiresAt` to client creation and pass its validated `Date` to the existing
secret service. Add one strict route-local ISO-instant schema with a future-time refinement for
initial and rotated expiry. Add one route-local bounded control-free string schema for initial and
rotated labels. Do not change the service, repository, database, or OIDC provider path (AR-1, AR-7,
AR-11).

## Implementation Details

### Public Contract

```ts
export interface CreateClientInput {
  // Existing fields remain unchanged.
  secretLabel?: string;
  /** ISO expiry instant for the automatically generated initial secret. */
  secretExpiresAt?: string;
}
```

The API accepts the field only as an optional additive property. Omission continues to pass no
expiry and stores `null`, preserving existing callers and the explicit `Never` choice (AR-7,
AR-11).

### Validation

- Require an included value to use strict ISO datetime syntax with an explicit timezone, transform
  the accepted string to `Date`, then require its instant to be strictly later than request-time
  `Date.now()`.
- Reuse that strict ISO/future schema for rotated-secret `expiresAt`; parser-dependent date strings
  are rejected rather than becoming part of the public contract.
- Reuse one 0–255 character control-free route schema for initial `secretLabel` and rotated `label`.
  It rejects C0, DEL, and C1 control characters.
- Reject invalid or non-future values through the existing sanitized `400` validation path.
- Ignore `secretLabel` and `secretExpiresAt` operationally for public clients; no secret is created.
  The Admin UI omits both fields for public registration (AR-3, AR-6–AR-7, AR-11).

### Compatibility

Older SDK clients omit the new field and retain non-expiring initial secrets. New SDK clients work
against the updated server. No response shape, database row, discovery document, token endpoint, or
cached artifact changes. This is an additive mixed-version boundary (AR-1, AR-7, AR-11).

## Integration Points

| Boundary | Contract |
|---|---|
| Admin UI → SDK | Sends `secretExpiresAt` only for confidential registration with a dated choice |
| SDK → Admin API | Serializes the optional ISO string unchanged |
| Route → secret service | Passes the coerced future `Date` as `expiresAt` |
| Secret response → Admin UI | Returns existing one-time plaintext and expiry metadata |

## Error Handling

| Error Case | Handling Strategy | AR Ref |
|---|---|---|
| Malformed expiry | Existing sanitized validation response; create/generate does not run | AR-6, AR-11 |
| Parseable but non-ISO expiry | Existing sanitized validation response; create/generate does not run | AR-6, AR-11 |
| Expiry equal to or before request time | Sanitized validation response; no secret is stored | AR-6, AR-11 |
| Label contains C0, DEL, or C1 controls | Sanitized validation response; create/generate does not run | RD-04 validation |
| Omitted expiry | Store `null`; the secret remains valid until revoked | AR-7, AR-11 |
| Public client includes secret fields | Create no secret and return no plaintext | AR-3, AR-11 |
| Secret generation fails after client creation | Preserve the current mutation failure semantics; do not invent rollback or retry machinery | AR-1, AR-13 |

## Testing Requirements

- SDK type and request specifications for optional `secretExpiresAt`.
- Server route specifications for future, omitted, malformed, non-ISO, past, public-client, and
  control-character label cases.
- Existing secret hashing, one-time response, overlap, expiry, and revocation suites remain green.
- Retained OIDC harness proves no authentication regression.
