# RD-01: SDK admin contract alignment

> **Feature**: sdk-server-contract-drift
> **Status**: Planning Complete
> **Source issue**: GitHub #159, GitHub #160
> **CodeOps Artifact Schema**: 1

## Summary

Make `@portaidentity/sdk` describe and call the server's Admin API truthfully across the
organizations, users, user-claims, user-roles, two-factor, export, and history surfaces. Adopters
must be able to complete every admin workflow — including slug validation, sorted lists, cursor
history, optimistic-concurrency writes, claim-value management, and effective-permission reads —
without bypassing the typed helpers.

## Context

GitHub issue #159 documents five organization-domain drift defects; issue #160 documents six
user-domain drift defects. Both were found while building a console client that had to fall back to
the SDK transport with locally maintained schemas for every affected route. Verification of the
issues against this repository (recorded in the plan's `02-current-state.md`) also found related
defects: the claim-definition types describe a resource that does not exist, and the
claim-definition CLI surface uses the same phantom fields. Application and client history is
deferred to a separate server defect: their routes call `getEntityHistory` with unsupported entity
types and answer `500`.

## Functional Requirements

### Must Have

- **R1 — Slug validation truth.** `organizations.validateSlug(slug)` returns the server's
  `{ isValid: boolean; error?: string }` result. The SDK documents that a malformed or reserved
  slug yields a `400` (`PortaValidationError`) and a well-formed but taken slug yields
  `200 { isValid: false, error }`.
- **R2 — Sort parameter truth.** The shared list parameters use `sortBy` / `sortOrder`; any list
  call the SDK makes for organizations sends those names. No public list method silently drops a
  sort preference.
- **R3 — History pagination.** The organization, user, and standalone-user `getHistory` methods
  return `HistoryResult` (`{ data, hasMore, nextCursor }`) and accept optional
  `{ limit?, after?, eventType? }`, mapped to the server's `limit`, `after`, and `event_type`
  query names. The standalone user history is pinned to the same result shape without parameters,
  matching its route. Application and client history is deferred to a separate server defect:
  their routes call `getEntityHistory` with unsupported entity types and answer `500`.
- **R4 — Write ETags.** The SDK's `organizations.update`, `users.create`, `users.update`,
  `usersById.update`, and `twoFactor.setPolicy` return `ETagResponse<T>`, and
  `twoFactor.setPolicy` also accepts an optional `etag` argument for the `If-Match` header, so
  callers can pass the fresh token back without a re-read. Four of the five server routes already
  emit the header; the user create route gains a one-line `setETagHeader` addition so all user
  write paths behave alike.
- **R5 — Claim values on real routes.** The phantom `userClaims` namespace is removed. Claim-value
  operations live on `customClaims` and address the real application-scoped routes:
  - `getValuesForUser(appId, userId)` — list, returning `UserClaimWithDefinition[]`
  - `getValue(appId, claimId, userId)` — single value, returning `UserClaimValue`
  - `setValue(appId, claimId, userId, value)` — upsert, returning the stored value
  - `deleteValue(appId, claimId, userId)` — delete
- **R6 — Claim-definition types are truthful.** `CustomClaimDefinition` mirrors the server
  (`claimName`, `claimType`, `description`, `includeInIdToken`, `includeInAccessToken`,
  `includeInUserinfo`, timestamps); the create/update inputs and existing definition methods use it.
- **R7 — Effective permissions.** `userRoles.getEffectivePermissions(orgId, userId)` returns the
  resolved `Permission[]` and documents the `admin:role:read` requirement.
- **R8 — Typed export document.** `users.exportData()` returns a `UserDataExport` type mirroring the
  server document; extra fields the server may add later do not break callers.
- **R9 — Reserved `new` slug.** The server reserves `new`, a conventional create-action segment
  that reserved system or future static routes can claim. The operator documentation explains the
  behavior, that an existing tenant named `new` remains reachable by UUID, and that no API slug
  rename exists (a direct database slug change is documented).
- **R10 — CLI claim commands.** `porta user claims list|set|remove` accept a required `--app`
  application scope and use the corrected SDK methods.

### Should Have

- **R11 — Documentation parity.** `docs/guide/sdk.md` states the history envelope, sort parameter
  names, ETag behavior on writes, and the removed/renamed types. `docs/api/organizations.md`
  documents slug-validation semantics and the reserved word.
- **R12 — Migration notes.** `packages/sdk/CHANGELOG.md` records the breaking type and parameter
  changes under `Unreleased` with a short migration example.

### Won't Have (Out of Scope)

- A generated SDK or shared schema package; OpenAPI export.
- Keeping `sort`/`order`/`available`/`UserClaimEntry` as compatibility aliases.
- Changes to server route shapes, permissions, or response payloads beyond the `new` reservation.
- Fixing the portability manifest's JSON keys (`claim_definitions`, `user_claim_values`), which are
  a versioned manifest contract, not SQL.
- Release version bumps, publishing, or release-note generation.
- Adding `ETag` to writes where the server does not emit one (organization create, claim writes).

## Technical Requirements

### Compatibility

- The corrections are a breaking change to the SDK's TypeScript surface. They ship in a minor
  release with a changelog migration note (clean break, no aliases).
- Server URL paths, methods, and permissions are unchanged, so existing HTTP clients that call the
  transport directly keep working.

### Security

- The SDK must not weaken admin authorization: every method continues to call the same route, and
  documentation for claim and permission methods names the exact permission (`admin:claim:read`,
  `admin:claim:update`, `admin:role:read`).
- The `new` slug reservation removes a conventional create-action word that system or future
  static routes could claim.
- The GDPR export remains authorized by `admin:user:read` plus organization membership; typing the
  document changes no access control.

### Performance

- No behavior change beyond HTTP parameter names; all methods remain single requests. No caching,
  batching, or retry logic is added.

## Acceptance Criteria

1. A write through `organizations.update`, `users.create`, `users.update`, `usersById.update`, or
   `twoFactor.setPolicy` exposes the response ETag, and the next `If-Match` write succeeds without
   a re-read.
2. For the organization, user, and standalone-user methods, `getHistory({ limit, after, eventType })`
   reaches the server as `limit`/`after`/`event_type` and returns every page through `nextCursor`.
3. Claim-value methods call routes that exist and require `applicationId`.
4. Effective permissions are returned by one typed method.
5. `exportData()` returns a typed document.
6. The server rejects `new` as an organization slug and accepts every other previously valid slug.
7. The CLI claim commands operate against a real application scope.
8. Every corrected behavior is covered by a test or a type-level oracle that fails against the
   pre-change code; documentation criteria are verified by `yarn docs:build` and review.
9. `docs/guide/sdk.md`, `docs/api/organizations.md`, and `packages/sdk/CHANGELOG.md` describe the
   final contracts.

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|---|---|---|---|---|
| Slug-validation contract | Server-native result / keep `available` and map | Server-native `{ isValid, error? }` | Callers need the server's error text; mapping invents a shape | AR-2 |
| Sort parameter names | Rename to `sortBy`/`sortOrder` / translate at call sites | Rename | Matches server and existing `UserListParams`; old fields never worked | AR-3 |
| History scope | Supported SDK-fixable entities / issue-listed only | Organizations, users, standalone users | Application/client history is deferred: their server routes answer `500` and need a separate server fix | AR-4 |
| ETag writes | Server-emitting writes / every write | The five writes that emit an ETag, adding the missing one-line emission to user create | Honest types; the create route is corrected so all user write paths behave alike | AR-5, AR-17 |
| Claims surface | Merge into `customClaims` / keep `userClaims` | Merge | One truthful claim surface; real routes are application-scoped | AR-6, AR-7 |
| Claim type names | `CustomClaimDefinition` etc. / keep `ClaimDefinition` | Server-aligned names | Removes the collision with a nonexistent resource | AR-7, AR-15 |
| Compatibility | Clean break / deprecation window | Clean break with changelog | Precedent in 1.11.0; smaller surface | AR-10 |
| `new` slug remediation | Validation only / data migration | Validation only | Applied migrations are immutable; UUID access and rename remain available | AR-11 |
| CLI fix | Add `--app` / leave broken | Add `--app` and align the `porta app claim` definition fields | The CLI is shipped and already broken against a phantom route | AR-12, AR-14 |

> **Traceability:** every scope decision references its Ambiguity Register entry. See
> `../../plans/sdk-contract-truth/00-ambiguity-register.md`.

## Dependencies

- Existing server routes and services only; no new migration.
- `unwrapWithEtag` and `HistoryResult` already exist in the SDK.
- Integration verification requires PostgreSQL, Redis, and MailHog (`yarn docker:up`).
