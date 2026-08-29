# SDK User Contracts: User Management

> **Document**: 03-01-sdk-user-contracts.md
> **Parent**: [Index](00-index.md)

## Overview

Correct only the current user-domain mismatches named by UM-15 so the Admin UI and existing current
consumers share one truthful SDK. No server route, parallel transport, legacy alias, or unrelated SDK
surface is added (AR-1, AR-3).

## Architecture

### Current Architecture

`createUsersDomain()` delegates authenticated HTTP requests to the shared transport. Public types
live in `types/users.ts` and `types/common.ts`; ordinary CLI commands and `agent.ts` consume the same
domain. Query parameters currently pass through `toQueryParams()` without choosing offset versus
cursor names.

### Proposed Changes

Keep that architecture and correct its existing contracts:

1. complete persisted create/update profile inputs;
2. select offset or cursor list query names explicitly;
3. return the invitation result rather than a `User`;
4. carry suspend and lock reasons;
5. return the existing paginated history envelope for both user domains;
6. update only affected current CLI commands, agent metadata, tests, docs, and packed P1 proof.

## Public Contract

### Input and result types

The public inputs are exact rather than open-ended. `AddressInput` contains only optional
`street`, `locality`, `region`, `postalCode`, and `country`, each `string | null`.

`CreateUserInput` contains required `organizationId` and `email`, plus optional `password`,
`givenName`, `familyName`, `middleName`, `nickname`, `preferredUsername`, `profileUrl`,
`pictureUrl`, `websiteUrl`, `gender`, `birthdate`, `zoneinfo`, `locale`, `phoneNumber`, and
`address`. Its profile fields are non-null strings when supplied. It excludes
`phoneNumberVerified` while server issue #87 remains open.

`UpdateUserInput` contains only optional `givenName`, `familyName`, `middleName`, `nickname`,
`preferredUsername`, `profileUrl`, `pictureUrl`, `websiteUrl`, `gender`, `birthdate`, `zoneinfo`,
`locale`, and `phoneNumber`, each `string | null`; optional boolean `phoneNumberVerified`; and
optional `address` as `AddressInput`. It contains no `email`, `emailVerified`, password, status,
organization, or index signature. `undefined` leaves a field unchanged. Clearing address data sends
the intended nested address fields as `null`; top-level `address: null` is excluded because the
current route normalizes it to no change.

Add an exact invitation result:

```ts
export interface InviteUserResult {
  userId: string;
  email: string;
  created: boolean;
  invitationSent: boolean;
  expiresAt: string;
}
```

Add the existing history envelope to `types/common.ts` and export it through the existing index:

```ts
export interface HistoryResult {
  data: HistoryEntry[];
  hasMore: boolean;
  nextCursor: string | null;
}
```

`InviteUserInput` retains server-supported role/claim fields for existing SDK consumers, while the
Admin UI never supplies them. `InvitePreviewResult` remains subject/text/html because the SDK
faithfully exposes the server; the terminal service projects only safe subject and text (AR-3,
AR-5).

### List parameters

`UserListParams` is a closed interface with only `page`, `pageSize`, `cursor`, `search`, `status`,
`sortBy`, and `sortOrder`. `sortBy` is exactly `email | given_name | family_name | created_at |
last_login_at`; `sortOrder` is exactly `asc | desc`. It removes `sort`, `order`,
`organizationId`, and the broad string index signature. Request mapping is deterministic:

- when `cursor` is defined, send `cursor`, map `pageSize` to `limit`, and do not send `page` or
  `pageSize`;
- otherwise send offset `page` and `pageSize`;
- pass `search`, `status`, `sortBy`, and `sortOrder` unchanged in either mode.

The Admin UI supplies only offset `page`, `pageSize=20`, optional `search`, and optional `status`.
No cursor control enters the Admin UI (AR-3).

### Domain method signatures

```ts
invite(input: InviteUserInput): Promise<InviteUserResult>;
suspend(orgId: string, userId: string, reason?: string): Promise<void>;
lock(orgId: string, userId: string, reason: string): Promise<void>;
getHistory(orgId: string, userId: string): Promise<HistoryResult>;
```

The organization-scoped domain returns the server's existing paginated history envelope. The
standalone route wraps that same envelope as `{ data: HistoryResult }`; its SDK domain unwraps the
outer `data` property and preserves the real `hasMore` and `nextCursor` values without a server
change. RD-03 uses only the default first 20 history entries and does not expose history paging
parameters or controls. The standalone domain also receives the equivalent reason corrections.
Existing route paths, ETag behavior, purge confirmation header, and one-time transport refresh
remain unchanged.

## Current Consumer Alignment

- `porta user update` stops advertising or sending email updates.
- `porta user suspend` accepts an optional bounded `--reason`; `porta user lock` requires a bounded
  `--reason` and sends it.
- `porta user invite` reads the invitation result fields rather than treating it as a user.
- `porta user history` reads `result.data`; JSON output may print the full SDK envelope, while the
  Admin UI projection remains metadata-free.
- SDK agent definitions describe the exact list names, invitation result, reasons, and history
  envelope. Existing exports are updated without an alias.
- The packed P1 cursor consumer remains unchanged at its call site and proves `pageSize=2` becomes
  `limit=2` in the request.

## Error Handling

| Error case                              | Handling strategy                                                              | AR Ref     |
| --------------------------------------- | ------------------------------------------------------------------------------ | ---------- |
| Offset list parameters supplied         | Send only offset names                                                         | AR-3       |
| Cursor and `pageSize` supplied          | Send cursor plus mapped `limit`; omit offset fields                            | AR-3       |
| Transport final `401` or failed refresh | Preserve existing SDK error after its single refresh attempt                   | AR-3       |
| Malformed response                      | SDK returns the transport value; Admin UI service validates before publication | AR-3, AR-9 |
| Existing consumer compile failure       | Update that current consumer; do not add a compatibility shim                  | AR-3       |

## Testing Requirements

- Public-type and domain specification tests cover every contract above before source changes.
- A tracked focused TypeScript oracle at
  `packages/sdk/tests/type-contracts/users-contract.spec.test.ts` uses its own minimal
  `tsconfig.json`, the repository's existing TypeScript binary, positive assignments, and
  `@ts-expect-error` cases to prove every allowed create/update/address/list field, the exact
  invite, reason-bearing action, and history result signatures, and rejection of removed fields,
  top-level update `address: null`, invalid nullability, invalid sort values, and arbitrary keys.
  Vitest runtime files do not substitute for this compile-time oracle because the SDK build
  excludes `tests/`.
- Focused implementation tests cover query omission/mapping and unchanged route/header behavior.
- Current CLI and agent tests cover corrected arguments and result handling. User agent metadata
  uses user-specific positional parameters matching `executeTool`: `users.list` declares
  `orgId` followed by one optional `params` object; suspend declares optional `reason`; lock
  declares required `reason`; and history is represented by a `users.getHistory` tool with only
  `orgId` and `userId`. The shared `LIST_PARAMS` helper remains unchanged for unrelated domains.
  Executor tests assert the exact positional calls.
- The existing packed P1 current-SDK journey proves both cursor and offset raw requests.
- SDK and CLI package verification plus clean `p1-admin` assurance are mandatory (AR-6).
