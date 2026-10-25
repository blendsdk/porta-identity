# SDK, CLI, and Documentation Contracts: Tenant-Scoped M2M User Management

> **Document**: 03-04-sdk-cli-docs-contracts.md
> **Parent**: [Index](00-index.md)

## Overview

The public SDK already maps the Admin user and user-role paths. With `apiPrefix: '/api'`, the same domains target the tenant routes. This component adds the additive type fields, updates the CLI audit/history presentation, and documents the new surface and its trust boundaries.

## Architecture

### Current Architecture

`createUsersDomain` uses `/organizations/:orgId/users` (`packages/sdk/src/domains/users.ts:105-226`). `createUserRolesDomain` uses `/organizations/:orgId/users/:userId/roles` (`packages/sdk/src/domains/user-roles.ts:44-83`). The Node transport accepts `apiPrefix` and the browser transport has the same option; the default prefix is `/api/admin`. The audit types expose only `actorId` (`sdk/types/audit.ts:10-31`), and history exposes only `actorId` (`sdk/types/common.ts:107-129`).

### Proposed Changes

- Add optional `emailVerified` and `phoneNumberVerified` to `CreateUserInput`.
- Add optional `emailVerified` to `UpdateUserInput`.
- Add `actorType`, `actorClientId`, and `actorClientName` to `AuditEntry` and `HistoryEntry`.
- Update the CLI audit and user-history display.
- Add tenant CRUD examples and scope/config guidance to the SDK README and public docs.
- Update the relevant techdocs and add an architecture decision record.
- No new SDK method, no new transport option, and no new dependency.

## Implementation Details

### SDK Types

```typescript
export interface CreateUserInput {
  organizationId: string;
  email: string;
  givenName?: string;
  familyName?: string;
  middleName?: string;
  nickname?: string;
  preferredUsername?: string;
  profileUrl?: string;
  pictureUrl?: string;
  websiteUrl?: string;
  gender?: string;
  birthdate?: string;
  zoneinfo?: string;
  locale?: string;
  phoneNumber?: string;
  phoneNumberVerified?: boolean;
  emailVerified?: boolean;
  address?: AddressInput;
  /** Optional only for the Admin API; the tenant surface rejects it. */
  password?: string;
}

export interface UpdateUserInput {
  // existing profile fields...
  phoneNumberVerified?: boolean;
  emailVerified?: boolean;
}

export interface AuditEntry {
  // existing fields...
  actorType?: 'user' | 'client' | 'system';
  actorClientId?: string | null;
  actorClientName?: string | null;
}

export interface HistoryEntry {
  // existing fields...
  actorType?: 'user' | 'client' | 'system';
  actorClientId?: string | null;
  actorClientName?: string | null;
}
```

The `password` field remains in `CreateUserInput` for Admin compatibility; the tenant server schema rejects it. Document that tenant callers must omit it.

These additive fields change the exact input-type contract. Update
`packages/sdk/tests/type-contracts/users-contract.spec.test.ts`: extend the expected
`CreateUserInput`/`UpdateUserInput` shapes and remove or replace the old negative assertions that
reject `phoneNumberVerified` on create and `emailVerified` on update. The server Admin duplicate-email
response remains `400`; only the tenant response is `409`.

### SDK Usage Contract

The tenant client is configured with:

```typescript
const client = createPortaClient({
  transport: createNodeTransport({
    baseUrl: 'https://porta.example.com',
    apiPrefix: '/api',
    auth: createClientCredentialsAuth({
      tokenEndpoint: 'https://porta.example.com/acme/token',
      clientId: process.env.PORTA_TENANT_CLIENT_ID!,
      clientSecret: process.env.PORTA_TENANT_CLIENT_SECRET!,
      scope: 'org:user:read org:user:write org:user:delete',
    }),
  }),
});
```

`apiPrefix: '/api'` must be explicit; the default remains `/api/admin`. The SDK's client-credentials provider sends `client_secret_post`; the tenant client must allow that method.

### CLI

`packages/cli/src/commands/audit.ts` currently prints `e.actorId ?? '—'` (`:84-93`). Change the actor formatter to:

```typescript
function auditActor(entry: AuditEntry): string {
  if (entry.actorType === 'client') {
    return entry.actorClientName
      ? `${entry.actorClientName} (${entry.actorClientId})`
      : (entry.actorClientId ?? '—');
  }
  return entry.actorId ?? '—';
}
```

`packages/cli/src/admin/user-service.ts` currently maps `actorId ?? 'System'` (`:265-280`). Use the same
client-first formatting for user history. The `AdminUserHistory` validator must accept
`actorType`, `actorClientId`, and `actorClientName`, and must validate the client strings with the
existing `isText`/`containsTerminalControl` helper (no terminal control characters). If a client
name or ID is invalid, degrade the label to a fixed placeholder such as `—` instead of failing the
whole history page. Sanitize the rendered actor string in `user-workspace.ts` as defense in depth.

### Public Documentation

Update:

- `docs/api/users.md`:
  - Add a “Tenant-scoped M2M user management” section with the route table, scopes, client configuration, create/update fields, delete safety, activation flow, and audit behavior.
  - Keep the existing tenant invite section; note that the new router also serves it.
  - State that the tenant create route rejects `password`, and that `emailVerified`/`phoneNumberVerified` are BFF assertions.
- `docs/api/audit.md`:
  - Document `actorType`, `actorClientId`, `actorClientName`, and the `user.read`/`user.listed` events.
- `packages/sdk/README.md`:
  - Add a tenant CRUD example with `apiPrefix: '/api'`.
  - Document the three scopes, client configuration, no-password flow, and audit attribution.
- `docs/guide/sdk.md` / `docs/guide/sdk-node.md` if they repeat client setup.

### Techdocs and ADR

Update:

- `techdocs/architecture/api-design.md`: add the tenant user surface alongside the Admin API; note the service-only M2M boundary and route table.
- `techdocs/architecture/security.md`: document the M2M client actor, three scopes, app-bound role boundary, delete separation, and audit durability.
- `techdocs/architecture/data-model.md`: document the `audit_log` actor columns and client attribution.
- `techdocs/decisions/index.md`: add ADR-017 “Tenant-Scoped M2M User Management” with context, decision, and consequences. It should record the service-only model, three scopes, app-bound roles, and first-class client audit.
- `techdocs/index.md`: refresh “Last Updated” if the techdocs process requires it.

### Contract Tests

- SDK type tests: create/update inputs accept the new optional fields; audit/history entries expose client fields.
- SDK domain tests: `users.create/list/get/update/delete`, lifecycle, and `userRoles` use the expected tenant paths when `apiPrefix: '/api'`.
- CLI tests: audit list and user history display a client name/ID; user actor remains unchanged.
- Docs build: `yarn docs:build`; link checks are covered by the build.

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| --- | --- | --- |
| Tenant caller sends `password` | Server rejects `400`; SDK docs say omit it | AR-20 |
| Tenant caller sends unsupported update field | Server rejects `400`; no silent ignore | AR-20 |
| SDK caller forgets `apiPrefix` | Calls Admin API and receives its auth error; docs make the prefix explicit | AR-4 |
| CLI receives a historical audit row without client fields | Display `actorId` or `—`; migration backfills known client rows | AR-21 |
| CLI client actor name contains terminal control characters | Validate with `isText`; display a fixed placeholder; sanitize at render; never fail the history page | AR-22 |
| Docs/techdocs link failure | `yarn docs:build` fails; fix before completion | AR-23 |

## Testing Requirements

- SDK type/contract tests for the additive fields, including updating the exact `users-contract.spec.test.ts` expectations and old negative assertions.
- SDK domain tests for tenant paths.
- CLI audit/history tests, including client-name-only, client-ID-only, missing actor, user actor, and terminal-control-character fallback.
- Documentation/techdocs build.
- No browser UI tests; there is no browser-facing change.

## Traceability

- AR-4, AR-9, AR-11, AR-14, AR-20, AR-22, AR-23, AR-24.
- Requirements R13–R15.
