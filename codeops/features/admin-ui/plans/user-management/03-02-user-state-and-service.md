# User State and Service: User Management

> **Document**: 03-02-user-state-and-service.md
> **Parent**: [Index](00-index.md)

## Overview

Create a narrow boundary between untrusted SDK values and the terminal. `user-state.ts` owns only
immutable validated Admin UI projections; `user-service.ts` owns SDK calls, validation, and fixed
results. Neither module imports JSVision, persists user data, or creates a cache (AR-2, AR-4, AR-9).

## Capability State

Extend `AdminCapabilities` with six exact booleans:

```ts
readonly canReadUsers: boolean;
readonly canCreateUsers: boolean;
readonly canInviteUsers: boolean;
readonly canUpdateUsers: boolean;
readonly canManageUserLifecycle: boolean;
readonly canPurgeUsers: boolean;
```

`validateAdminCapabilities()` derives each from its exact `admin:user:*` permission or the exact
legacy `porta-admin` role. Invalid authorization arrays contribute no capability. Organization
capabilities remain unchanged (AR-1, AR-4).

## Immutable Projections

### User page and row

`AdminUserPage` owns `data`, `total`, `page`, `pageSize`, and `totalPages`. Each
`AdminUserListItem` contains only `id`, `organizationId`, `email`, nullable given/family name, and
exact status. Validation rejects the whole page for any malformed required field, inconsistent
pagination, duplicate UUID, cross-organization row, or control-bearing displayed text.

### User detail

`AdminUserDetail` contains only `id`, `organizationId`, `email`, `emailVerified`, `hasPassword`;
nullable `givenName`, `familyName`, `middleName`, `nickname`,
`preferredUsername`, `profileUrl`, `pictureUrl`, `websiteUrl`, `gender`, `birthdate`, `zoneinfo`,
`locale`, and `phoneNumber`; boolean `phoneNumberVerified`; nullable `addressStreet`,
`addressLocality`, `addressRegion`, `addressPostalCode`, and `addressCountry`; boolean
`twoFactorEnabled`; exact `status`; nullable `lastLoginAt`; non-negative `loginCount`; and
`createdAt`/`updatedAt`. It excludes `passwordChangedAt`, `twoFactorMethod`, lock and failed-login
fields, hashes, tokens, recovery material, metadata, and raw response values. Its ETag remains a
controller-owned update input and is never rendered.

### History and invitation preview

`AdminUserHistory` contains at most 20 rows with `eventType`, actor UUID or `System`, and timestamp,
plus `hasMore`. It does not retain metadata or `nextCursor`. `AdminInvitationPreview` contains only
bounded control-free `subject` and plain-text `text`; HTML is discarded before publication.

### View state

`AdminUserViewState` is a closed discriminated union with only: `closed`; `loading` with an
optional previous validated page/detail/history projection; `page` with one validated page and
optional fixed outcome; `detail` with one validated page, selected row, detail, controller-owned
ETag, and optional fixed outcome; `history` with the same validated page/selection/detail context,
ETag, validated history, and optional fixed outcome; and `failure` with a fixed failure and optional
previous validated projection. A validated page/detail/history remains available during a
recoverable request failure or cancelled operation; organization/session changes clear it (AR-4).

## Validation Rules

- IDs use the established UUID validator; every row/detail organization ID must equal the selected
  organization UUID.
- Status is exactly `active`, `inactive`, `suspended`, or `locked`.
- ISO timestamp fields must parse as finite timestamps; required timestamps cannot be null.
- booleans and bounded non-negative integers are exact types; `loginCount` is non-negative.
- displayed strings are bounded before retention and reject ASCII/C1 controls. Every locally
  entered text field also rejects ASCII/C1 controls before SDK invocation. User-specific local
  constants cap URLs at 2,048 characters, address street at 500, history event type at 255,
  invitation preview subject at 255, and invitation preview plain text at 10,000. These constants
  apply to local input and retained remote projections; an over-bound value rejects the owning
  input/projection rather than being truncated.
- nullable profile fields accept only null or their server-bounded string forms. Existing server
  maxima remain authoritative where present; the local constants above close the server-unbounded
  URL, street, event-type, and preview surfaces.
- list page must equal the requested page and pageSize must equal 20. `totalPages` must equal `0`
  when `total=0`, otherwise `ceil(total / 20)`. Row count must not exceed
  `max(0, total - (page - 1) * 20)`. A response for a page above `totalPages` is accepted only when
  `data` is empty; this is the truthful page-shrink result and the controller may then offer a
  deliberate previous-page request. Any other inconsistency or more than 20 rows rejects the whole
  page. A partial valid subset is never published.
- history is newest-first and contains at most 20 validated entries. Malformed or out-of-order data
  produces `invalid-response` rather than a partial history.

## Operations

`AdminUserOperations` is created from a lazy `UsersDomain` provider and exposes only the approved
UI operations: list, get, create, invite, preview, update, set/clear password, verify email,
lifecycle transitions, history, and purge. Each request receives the selected organization UUID
from the controller; input functions never accept a second organization source (AR-4).

Read results return validated projections. Mutation results return only definite success,
`session-invalid`, `outcome-unknown`, or a fixed failure. Once a mutation SDK call is invoked, any
non-HTTP rejection, HTTP `5xx`, cancellation, or malformed success maps to `outcome-unknown`
because the current SDK exposes no request-dispatch acknowledgement. It never represents local
validation, cancellation before SDK invocation, or a definite mapped HTTP `4xx`. Definite success does not patch
list/detail locally: the controller reloads only when `canReadUsers`; create/invite-only sessions
receive the fixed validated success projection.

## Input Validation

Dialog input is converted to exact SDK inputs in `user-service.ts`:

- search ≤255; exact optional status; page ≥1;
- email/profile/address bounds from the current server schemas;
- create excludes `phoneNumberVerified`; update excludes email and uses null only for an explicitly
  cleared field;
- password and confirmation must match and be 8–128 characters;
- invite names 1–255 when supplied, locale ≤10, message ≤500, and no roles/claims;
- suspend reason absent or ≤500; lock reason 1–500.

All locally entered text fields reject ASCII/C1 controls before SDK invocation; values are rejected,
not sanitized or truncated.

Invalid local input dispatches no SDK request. Password strings are passed directly from the active
dialog to one operation and are never included in `AdminUserViewState`.

## Failure Mapping

| Source                                                                                  | Fixed result       | State effect                                                   | AR Ref     |
| --------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------- | ---------- |
| Local validation / HTTP `400`                                                           | `validation`       | Preserve non-secret form fields; clear password fields         | AR-9       |
| Final `401` / failed refresh                                                            | `session-invalid`  | Existing authentication gate owns recovery                     | AR-4, AR-9 |
| HTTP `403`                                                                              | `unauthorized`     | Preserve validated user state                                  | AR-9       |
| HTTP `404`                                                                              | `not-found`        | Preserve every validated page/detail/history projection        | AR-9       |
| HTTP `409` or `412`                                                                     | `conflict`         | Preserve validated state; no merge UI                          | AR-9       |
| Other definite HTTP `4xx` status                                                        | `unavailable`      | Preserve validated state; reads may be manually retried        | AR-9       |
| Read transport failure or HTTP `5xx`                                                    | `unavailable`      | Preserve validated state; read may be manually retried         | AR-9       |
| Mutation rejection, HTTP `5xx`, cancellation, or malformed success after SDK invocation | `outcome-unknown`  | Preserve validated state; do not repeat or assume the mutation | AR-9       |
| Malformed read success                                                                  | `invalid-response` | Publish nothing from the response                              | AR-9       |

Only the shared SDK transport's single definite-401 refresh replay occurs. The service adds no
retry, polling, cache, or error-detail channel.

## Testing Requirements

- Capability specifications cover every exact permission, legacy role, malformed claim, and
  independent create/invite reachability.
- Service specifications cover page/detail/history/preview projection, every malformed response,
  all input bounds, mutation bodies, and fixed failures.
- Implementation tests cover validation helpers, ETag retention, no secret state, whole-response
  rejection, and lazy domain construction.
- Cross-tenant, terminal-control, duplicate-submit inputs, and raw-error exposure receive explicit
  security cases.
