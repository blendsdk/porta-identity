# Server Safety and Data: Applications and OIDC Clients

> **Document**: 03-01-server-safety-and-data.md
> **Parent**: [Index](00-index.md)

## Overview

This component makes the existing Admin API and OIDC runtime satisfy RD-04 without redesigning the
data model. It centralizes already-established protocol compatibility rules, makes nested parent
IDs authoritative, repairs the built-in App Admin role, and makes active secret overlap truthful.

## Architecture

### Current Architecture

Routes validate input, services enforce lifecycle rules, repositories execute parameterized SQL,
and `oidc-provider` loads one scalar `client_secret` through `findForOidc()`. A middleware currently
SHA-256-hashes Basic or post credentials before the provider compares them.

### Proposed Changes

1. Extract one server compatibility validator used by Admin create/update and import. Register the
   confidential-client `requirePkce` metadata so runtime uses the stored value while public
   authorization-code clients always require PKCE.
2. Change module update/deactivate and secret revoke service paths to accept both parent and child
   UUIDs and perform one parent-qualified mutation or lookup.
3. Require both `admin:client:create` and `admin:app:read` on client creation. Make secret
   listing, generation, and revocation parent-qualified to a confidential, non-revoked client.
   Enforce a maximum of 10 active, unexpired secrets per client in one short transaction that locks
   only the parent client row, counts, and inserts. This is not a UI or multi-operator locking model.
4. Update the built-in App Admin definition and add a new ordered, idempotent migration that grants
   `admin:org:read` to existing built-in role assignments (AR-5).
5. Extend the ordered migration with a precondition that rejects an existing client having more
   than 10 active, unexpired secrets. It changes no secret row and gives fixed guidance to revoke
   excess secrets with the prior server version before retrying the upgrade.
6. Replace the single unconditional prehash with the narrow AR-4 bridge for confidential Basic/post
   credentials. It checks indexed SHA-256 first, falls back to active legacy Argon2 hashes behind
   one-at-a-time per-process admission and the existing 30-per-5-minute limit under an
   issuer/client Redis key, obtains the latest active SHA-backed canonical value, and only then
   replaces the credential before provider comparison.

## Implementation Details

### Shared Protocol Compatibility

The validator accepts the RD-04 closed values and collection bounds. It rejects invalid public or
confidential combinations, wildcard/fragment redirect URIs, non-origin allowed origins, and control
characters before persistence. Admin routes and import call the same function; the Admin UI mirrors
the rules only for immediate feedback. No application-type policy beyond RD-04 is invented (AR-1).

### Nested Parent Integrity

Repositories use parameterized predicates containing both internal parent and child UUIDs. A child
that exists beneath another parent is indistinguishable from a missing child to the caller. Audit
records are emitted only after the parent-qualified mutation succeeds.

### Role Migration

The next migration updates only the built-in `porta-app-admin` role's permission mapping. It locates
the built-in role and `admin:org:read` permission by stable identifiers and inserts the missing
mapping with conflict-safe semantics. Re-running the migration logic cannot duplicate mappings.
Applied migrations remain untouched (AR-5).

### Active Secret Authentication Bridge

The bridge applies only when the provider is about to authenticate a confidential client using
`client_secret_basic` or `client_secret_post` (AR-4):

- preserve the provider's rejection of malformed Basic credentials and simultaneous authentication
  mechanisms;
- bound credential input before expensive verification and never log plaintext or hashes;
- match modern secrets by indexed SHA-256 without Argon2 work;
- check at most 10 active, unexpired legacy hashes sequentially only after modern matching fails;
  use a non-queuing try-acquire for one legacy batch per server process and reuse the existing
  30-per-5-minute policy under a post-parse issuer/client Redis key;
- return the established fixed 429 with Retry-After when either computational guard denies
  admission, without testing or classifying the credential as invalid;
- on a match, update only the request representation the provider reads, using the current active
  SHA-256 value returned by the repository;
- never rewrite on a mismatch, unknown/public/inactive client, missing canonical value, dependency
  error, or ambiguous credential source;
- preserve rate limiting and all downstream provider checks.

For a legacy-only client, validation cannot produce a provider comparison value. The Admin UI and
documentation require generating one modern secret once. After that, a matching still-active legacy
secret can canonicalize to the modern value during overlap (AR-7). Active-state reads occur for each
request. Revocation blocks later requests, while a request already validated may complete (AR-8).

## Integration Points

- `packages/server/src/routes/applications.ts` and `routes/clients.ts`
- `packages/server/src/applications/` and `packages/server/src/clients/`
- `packages/server/src/lib/data-import.ts`
- `packages/server/src/middleware/client-secret-hash.ts` and server middleware ordering
- `packages/server/src/oidc/configuration.ts`
- `packages/server/src/lib/admin-permissions.ts` and `packages/server/migrations/`

## Error Handling

| Error Case                                    | Handling Strategy                                                              | Source              |
| --------------------------------------------- | ------------------------------------------------------------------------------ | ------------------- |
| Invalid protocol combination or URL           | Reject with the existing bounded validation category before persistence        | RD-04 validation    |
| Module/secret belongs to another parent       | Return the same not-found response as an absent child; perform no mutation     | RD-04 AC-06, AC-12  |
| Client create lacks either permission         | Return forbidden before service dispatch                                       | RD-04 authorization |
| Secret mutation targets public/revoked client | Reject before insertion or mutation                                            | RD-04 AC-09, AC-12  |
| Secret list targets public/revoked client     | Return the same not-found response as an absent client                         | RD-04 AC-09, AC-12  |
| Client already has 10 active secrets          | Reject generation without inserting a row                                      | RD-04 security      |
| Upgrade finds more than 10 active secrets     | Abort safely with fixed pre-upgrade revocation guidance                        | AR-4                |
| Legacy process/Redis guard denies admission   | Return fixed 429/Retry-After without credential classification or guard detail | AR-4                |
| Invalid, expired, or revoked secret           | Preserve provider authentication failure; never canonicalize                   | AR-4                |
| Legacy-only secret has no canonical SHA value | Reject and require one modern-secret generation                                | AR-7                |
| Secret repository or verification error       | Fail closed and expose no credential or internal error                         | AR-4                |
| Concurrent revocation after validation        | Permit only the already validated request to finish; later requests fail       | AR-8                |

## Testing Requirements

- Unit and integration coverage for shared protocol validation and provider PKCE behavior.
- Route/service/repository coverage for the client-create permission conjunction, confidential
  client secret state, and parent-qualified module and secret mutations.
- Migration structure and live PostgreSQL idempotency coverage for the role correction.
- Migration precondition coverage for existing clients at 10 and 11 active secrets.
- Real-provider protocol and security tests for Basic/post multi-secret overlap, rejection paths,
  legacy transition, expiry, revocation, tenant binding, parsed-client computational limiting, and
  subsequent-request behavior across the accepted in-flight boundary.
