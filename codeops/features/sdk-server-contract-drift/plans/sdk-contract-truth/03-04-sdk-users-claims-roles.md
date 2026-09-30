# SDK Users, Claims, and Roles Domains: SDK–Server Contract Truth

> **Document**: 03-04-sdk-users-claims-roles.md
> **Parent**: [Index](00-index.md)
> **Implements**: RD-01 R4–R8

## Overview

This component corrects the SDK's user, claim, and role surfaces:

- user create/update return the response ETag;
- org-scoped user history accepts pagination parameters;
- `exportData()` returns a typed document;
- the phantom `userClaims` domain is deleted and its value operations move to `customClaims`,
  which also adopts the server's claim-definition shape;
- `userRoles` gains `getEffectivePermissions`.

## Architecture

### Current Architecture

- `users.create` / `users.update` call `unwrapData<User>` and drop the response ETag
  (`packages/sdk/src/domains/users.ts:137-154`).
- `users.getHistory` sends `params: undefined` (`:213-219`); the route accepts
  `limit`/`after`/`event_type` (`packages/server/src/routes/users.ts:435-447`).
- `users.exportData` is typed `Record<string, unknown>` (`:95-96`).
- `userClaims` calls `/organizations/:orgId/users/:userId/claims` (`user-claims.ts:17-33`), which
  does not exist.
- `ClaimDefinition` describes a nonexistent resource (`types/custom-claims.ts:9-45`).
- `userRoles` exposes only `list`/`assign`/`remove` (`user-roles.ts:31-37`).

### Proposed Changes

- Use `unwrapWithEtag` for the three user write methods.
- Add `HistoryParams` to org-scoped `getHistory` and map it to server query names.
- Mirror the server's `UserDataExport` as a type in `types/users.ts` and use it in the domain.
- Delete `domains/user-claims.ts` and its test; replace `types/user-claims.ts` with the new
  `UserClaimValue`/`UserClaimWithDefinition` types; remove the `UserClaimsDomain` client member and
  the stale `UserClaimValue`/`SetUserClaimInput` exports from `types/custom-claims.ts`; move the
  value methods into the custom-claims surface.
- Replace `ClaimDefinition`/`CreateClaimDefinitionInput`/`UpdateClaimDefinitionInput` with
  server-aligned `CustomClaimDefinition`/`CreateCustomClaimInput`/`UpdateCustomClaimInput` and
  correct the definition methods' types.
- Add `getEffectivePermissions` to `UserRolesDomain`.

## Implementation Details

### New Types/Interfaces

`packages/sdk/src/types/common.ts` — `HistoryParams` (owned by 03-03).

`packages/sdk/src/types/user-claims.ts`:

The old `UserClaimValue` (with `claimDefinitionId`) and `SetUserClaimInput` in
`types/custom-claims.ts` are removed; the new types below replace them.

```typescript
/**
 * Stored custom claim value for one user and one claim definition.
 * Mirrors the server's `CustomClaimValue` record.
 */
export interface UserClaimValue {
  id: string;
  userId: string;
  claimId: string;
  value: unknown;
  createdAt: string;
  updatedAt: string;
}

/**
 * A claim definition joined with the user's stored value.
 * Returned when listing all claim values for a user.
 */
export interface UserClaimWithDefinition {
  definition: CustomClaimDefinition;
  value: UserClaimValue;
}
```

`packages/sdk/src/types/custom-claims.ts`:

```typescript
/** Supported custom claim value types. */
export type ClaimValueType = 'string' | 'number' | 'boolean' | 'json';

/**
 * Custom claim definition owned by one application.
 * Mirrors the server's `CustomClaimDefinition`.
 */
export interface CustomClaimDefinition {
  id: string;
  applicationId: string;
  claimName: string;
  claimType: ClaimValueType;
  description: string | null;
  includeInIdToken: boolean;
  includeInAccessToken: boolean;
  includeInUserinfo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Input for creating a claim definition (claimName and claimType are immutable). */
export interface CreateCustomClaimInput {
  claimName: string;
  claimType: ClaimValueType;
  description?: string;
  includeInIdToken?: boolean;
  includeInAccessToken?: boolean;
  includeInUserinfo?: boolean;
}

/** Input for updating a claim definition (metadata and inclusion flags only). */
export interface UpdateCustomClaimInput {
  description?: string | null;
  includeInIdToken?: boolean;
  includeInAccessToken?: boolean;
  includeInUserinfo?: boolean;
}
```

`packages/sdk/src/types/users.ts`:

```typescript
/**
 * GDPR Article 20 export document for one user.
 * Mirrors the server's `UserDataExport`; treat unknown future fields as additive.
 */
export interface UserDataExport {
  exportedAt: string;
  user: { /* profile fields mirrored from the server document */ };
  organization: { id: string; name: string; slug: string };
  roles: Array<{
    roleId: string; roleName: string; roleSlug: string;
    applicationId: string; assignedAt: string;
  }>;
  customClaims: Array<{ claimName: string; value: unknown; applicationId: string }>;
  auditLog: Array<{
    id: string; eventType: string; eventCategory: string;
    description: string | null; createdAt: string;
  }>;
  twoFactor: { enabled: boolean; method: string | null };
  oidcSessions: number;
}
```

The exact field list mirrors `packages/server/src/users/gdpr.ts:21-66` and is written out in full
in the source file, not abbreviated here.

### New Functions/Methods

`packages/sdk/src/domains/users.ts`:

```typescript
create(input: CreateUserInput): Promise<ETagResponse<User>>;
update(orgId: string, userId: string, input: UpdateUserInput, etag?: string): Promise<ETagResponse<User>>;
getHistory(orgId: string, userId: string, params?: HistoryParams): Promise<HistoryResult>;
exportData(orgId: string, userId: string): Promise<UserDataExport>;
```

The `UserExportData` alias in `domains/users.ts` is removed; `UserDataExport` replaces it.

`StandaloneUsersDomain.update` also returns `ETagResponse<User>`. The standalone `getHistory`
keeps its no-parameter signature and `HistoryResult` return, now pinned by a test.

`packages/sdk/src/domains/custom-claims.ts`:

```typescript
// Existing definition methods keep their routes; types become server-aligned.
list(appId: string, params?: ListParams): Promise<PaginatedResponse<CustomClaimDefinition>>;
listAll(appId: string, params?: Omit<ListParams, 'page' | 'cursor'>): Promise<CustomClaimDefinition[]>;
get(appId: string, claimId: string): Promise<CustomClaimDefinition>;
create(appId: string, input: CreateCustomClaimInput): Promise<CustomClaimDefinition>;
update(appId: string, claimId: string, input: UpdateCustomClaimInput): Promise<CustomClaimDefinition>;
delete(appId: string, claimId: string): Promise<void>;

// New value methods on the real application-prefixed routes (no application filtering).
getValuesForUser(appId: string, userId: string): Promise<UserClaimWithDefinition[]>;
getValue(appId: string, claimId: string, userId: string): Promise<UserClaimValue>;
setValue(appId: string, claimId: string, userId: string, value: unknown): Promise<UserClaimValue>;
deleteValue(appId: string, claimId: string, userId: string): Promise<void>;
```

Route mapping (all under `/applications/:appId/claims`):

| Method | HTTP | Path | Permission (documented) |
| --- | --- | --- | --- |
| `getValuesForUser` | GET | `/users/:userId` | `admin:claim:read` |
| `getValue` | GET | `/:claimId/users/:userId` | `admin:claim:read` |
| `setValue` | PUT | `/:claimId/users/:userId` body `{ value }` | `admin:claim:update` |
| `deleteValue` | DELETE | `/:claimId/users/:userId` | `admin:claim:update` |

The `:appId` segment is not a server-side value filter: the list route passes only `userId` and
returns values across all applications, and the single-value routes resolve by `claimId` plus
`userId` without verifying the definition's application. The JSDoc and `docs/guide/sdk.md` state
this explicitly.

`packages/sdk/src/domains/user-roles.ts`:

```typescript
/** Resolve the deduplicated permissions granted by all roles assigned to a user. */
getEffectivePermissions(orgId: string, userId: string): Promise<Permission[]>;
```

Route: `GET /organizations/:orgId/users/:userId/roles/permissions`, requires `admin:role:read`,
answers `{ data: Permission[] }`.

### Integration Points

- `packages/sdk/src/client.ts` and `packages/sdk/src/index.ts`: remove the `userClaims` member,
  the factory call, and the `UserClaimsDomain`/`SlugValidation` re-exports.
- `packages/sdk/src/domains/index.ts` and `types/index.ts`: remove user-claims domain/type exports
  and the stale `UserClaimValue`/`SetUserClaimInput` exports; export the new types.
- `packages/sdk/tests/type-compatibility/types.test.ts` is currently inert: it is excluded from
  every typecheck program, its server imports resolve to a nonexistent repo-root `src/`, and it
  imports a server `ClaimDefinition` symbol that does not exist (the server exports
  `CustomClaimDefinition`). It must be repaired (import paths into the server package, renamed
  type) and listed in a typechecked program, or its comparison moved into
  `packages/sdk/tests/type-contracts/`, before it can pin any field.
- `packages/sdk/src/agent.ts`: there are no `userClaims.*` catalog entries to remove; update the
  `customClaims.*` and `users.*` return strings, add the new `customClaims.getValuesForUser` /
  `setValue` / `deleteValue` and `userRoles.getEffectivePermissions` entries, and refresh the agent
  documentation counts.
- `packages/cli/src/commands/user-claim.ts` and `app-claim.ts` are updated in 03-05 to consume the
  new methods and fields.

## Code Examples

### Cursor loop over user history

```typescript
let page = await porta.users.getHistory(orgId, userId, { limit: 50, eventType: 'user.' });
const all = [...page.data];
while (page.nextCursor) {
  page = await porta.users.getHistory(orgId, userId, { after: page.nextCursor });
  all.push(...page.data);
}
```

### Claim values for one application

```typescript
const entries = await porta.customClaims.getValuesForUser(appId, userId);
for (const { definition, value } of entries) {
  console.log(definition.claimName, value.value);
}
```

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| --- | --- | --- |
| Missing claim value | Server answers `404` → `PortaNotFoundError` | AR-6 |
| Claim value type mismatch | Server answers `400` → `PortaValidationError` | AR-6 |
| Unknown claim ID | Server answers `404` → `PortaNotFoundError` | AR-6 |
| Value belongs to another application | Returned unchanged — the server does not filter values by `:appId`; documented behavior | AR-6 |
| Export database failure | Server answers `500` → `PortaServerError` | AR-1, AR-9 |
| Stale `If-Match` on user update | Existing `409` → `PortaConflictError` | AR-5, AR-17 |

> **Traceability:** every error-handling strategy references the Ambiguity Register entry that
> resolved it. See `00-ambiguity-register.md`.

## Testing Requirements

- Spec tests for ST-11–ST-15, ST-18–ST-21, ST-23, and ST-28 in the SDK domain and type-contract
  suites.
- The type-contract oracle (`packages/sdk/tests/type-contracts/`) is refreshed for the renamed
  types and the new `UserDataExport`; the repaired `type-compatibility` comparison is registered
  in a typechecked program.
- CLI command tests updated with the new SDK surface (03-05).
