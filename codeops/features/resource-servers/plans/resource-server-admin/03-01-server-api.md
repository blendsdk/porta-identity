# Server API: Resource-Server Admin Management

> **Document**: 03-01-server-api.md
> **Parent**: [Index](00-index.md)

## Overview

This component owns the Admin API and persistence boundary for application-owned resource servers.
It adds a focused module under `packages/server/src/resource-servers/` and a nested router under
`packages/server/src/routes/resource-servers.ts`. The provider resolver in
`packages/server/src/oidc/resource-servers.ts` remains unchanged and continues to read the same
tables (AR-1, AR-2).

The behavioral contract is owned by [RD-01](../../requirements/RD-01-resource-server-admin.md).
This document specifies the implementation shape, types, validation, SQL, transactions, and error
mapping.

## Architecture

### Current Architecture

- `resource_servers`, `resource_server_scopes`, and `resource_server_namespace` already exist
  (`packages/server/migrations/038_resource_servers.sql:5`).
- `resolveResourceServerInfo` reads the rows for provider resolution
  (`packages/server/src/oidc/resource-servers.ts:56`).
- The application router family establishes admin auth, permission checks, and fixed error bodies
  (`packages/server/src/routes/applications.ts:145`).
- `runDatabaseTransaction` shares one request-owned PostgreSQL client
  (`packages/server/src/lib/database.ts:73`).
- `adminMutationAudit` wraps every non-excluded admin mutation and writes
  `admin.mutation.committed` (`packages/server/src/middleware/admin-mutation-audit.ts:42`).

### Proposed Changes

```text
packages/server/src/resource-servers/
├── types.ts          # Projection, inputs, row types
├── validators.ts     # Zod schemas and cross-field rules
├── errors.ts         # Typed domain errors for route mapping
├── repository.ts     # Parameterized SQL and row mapping
└── service.ts        # Application lookup, transactions, slug, orchestration

packages/server/src/routes/resource-servers.ts   # Nested Admin router
packages/server/src/server.ts                    # Mount the router
```

No migration, cache, provider change, or new permission constant is added.

## Implementation Details

### New Types

```ts
export interface ResourceServer {
  readonly id: string;
  readonly applicationId: string;
  readonly slug: string;
  readonly name: string;
  readonly identifier: string;
  readonly audience: string;
  readonly scopes: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateResourceServerInput {
  readonly name: string;
  readonly slug?: string;
  readonly identifier: string;
  readonly audience?: string | null;
  readonly scopes?: readonly string[];
}

export interface UpdateResourceServerInput {
  readonly name: string;
  readonly slug: string;
  readonly identifier: string;
  readonly audience?: string | null;
  readonly scopes?: readonly string[];
}
```

`ResourceServerRow` carries `scopes: string[] | null` from the aggregate query and is mapped by
`mapResourceServerRow`.

### Validation

`validators.ts` exports:

- `createResourceServerSchema`
- `updateResourceServerSchema`
- `resourceServerPathSchema` for `:appId` and `:resourceServerId`
- `normalizeScopes(scopes)` — trims nothing, rejects duplicates, rejects standard OIDC scopes, and
  returns a sorted unique array.

Validation rules are exactly those in RD-01 §Request Fields. The standard-scope list is imported
from `oidc/resource-servers.ts` (`STANDARD_OIDC_SCOPES`) so the registry and resolver cannot drift.

`audience` is `.nullish().transform((value) => value ?? undefined)`. The service sets
`audience = identifier` when the normalized value is undefined (AR-7 of the feature register).

### Repository

```ts
export async function listResourceServers(applicationId: string): Promise<ResourceServer[]>;
export async function findResourceServer(
  applicationId: string,
  idOrSlug: string,
): Promise<ResourceServer | null>;
export async function lockResourceServer(
  applicationId: string,
  idOrSlug: string,
): Promise<ResourceServer | null>;
export async function insertResourceServer(
  applicationId: string,
  data: NormalizedResourceServerInput,
): Promise<ResourceServer>;
export async function updateResourceServerRow(
  resourceServerId: string,
  data: NormalizedResourceServerInput,
): Promise<ResourceServer>;
export async function replaceResourceServerScopes(
  resourceServerId: string,
  scopes: readonly string[],
): Promise<void>;
export async function deleteResourceServerRow(resourceServerId: string): Promise<void>;
```

`listResourceServers` uses:

```sql
SELECT resource.id, resource.application_id, resource.slug, resource.name,
       resource.identifier, resource.audience, resource.created_at, resource.updated_at,
       COALESCE(array_agg(scope.scope ORDER BY scope.scope)
         FILTER (WHERE scope.scope IS NOT NULL), '{}') AS scopes
  FROM resource_servers resource
  LEFT JOIN resource_server_scopes scope ON scope.resource_server_id = resource.id
 WHERE resource.application_id = $1
 GROUP BY resource.id
 ORDER BY resource.name ASC, resource.identifier ASC
```

`findResourceServer` accepts UUID or slug scoped to the application. `lockResourceServer` uses
`FOR UPDATE` and is used only inside a transaction.

`insertResourceServer` inserts the parent row, then inserts scopes with one parameterized
`INSERT ... SELECT unnest($2::text[])`; the DB namespace trigger maintains identifier/audience
entries. `updateResourceServerRow` updates the row and `replaceResourceServerScopes` deletes and
re-inserts the complete registry. `deleteResourceServerRow` deletes the parent row; the foreign-key
cascade removes scopes and namespace rows.

Unique violations (`23505`) are translated to `ResourceServerConflictError` in the service, not
leaked as SQL errors.

### Service

```ts
export async function listResourceServersForApplication(
  appIdOrSlug: string,
): Promise<ResourceServer[]>;

export async function getResourceServerForApplication(
  appIdOrSlug: string,
  idOrSlug: string,
): Promise<ResourceServer>;

export async function createResourceServerForApplication(
  appIdOrSlug: string,
  input: CreateResourceServerInput,
): Promise<ResourceServer>;

export async function updateResourceServerForApplication(
  appIdOrSlug: string,
  idOrSlug: string,
  input: UpdateResourceServerInput,
): Promise<ResourceServer>;

export async function deleteResourceServerForApplication(
  appIdOrSlug: string,
  idOrSlug: string,
): Promise<void>;
```

Application resolution reuses `getApplicationById` and `getApplicationBySlug`; a missing application
throws `ApplicationNotFoundError`. Slug generation reuses `generateSlug`/`validateSlug` from
`applications/slugs.ts`; an omitted create slug is generated from `name` and validated before the
insert. Update requires the explicit slug.

Create and update run inside `runDatabaseTransaction`; update locks the row first, writes the row,
and replaces scopes in the same transaction. Delete locks the row and deletes it in a transaction.
No cache invalidation is needed because resource-server reads are not cached.

### Routes

`createResourceServerRouter()` uses:

```ts
const router = new Router({
  prefix: '/api/admin/applications/:appId/resource-servers',
});
router.use(requireAdminAuth());
```

| Route | Permission | Handler |
| --- | --- | --- |
| `GET /` | `ADMIN_PERMISSIONS.APP_READ` | parse route, list, `200 { data }` |
| `POST /` | `ADMIN_PERMISSIONS.APP_UPDATE` | parse body, create, `201 { data }` |
| `GET /:resourceServerId` | `ADMIN_PERMISSIONS.APP_READ` | parse route, get, `200 { data }` |
| `PUT /:resourceServerId` | `ADMIN_PERMISSIONS.APP_UPDATE` | parse body, update, `200 { data }` |
| `DELETE /:resourceServerId` | `ADMIN_PERMISSIONS.APP_UPDATE` | parse route, delete, `204` |

`handleError` maps:

| Error | Status | Body |
| --- | --- | --- |
| `ZodError` | `400` | `{ error: 'Resource server request is invalid' }` |
| `ApplicationNotFoundError` | `404` | `{ error: 'Application not found' }` |
| `ResourceServerNotFoundError` | `404` | `{ error: 'Resource server not found' }` |
| `ResourceServerConflictError` | `409` | `{ error: 'Resource server conflicts with an existing identifier, audience, or slug' }` |
| anything else | `503` | `{ error: 'Resource server operation failed' }` |

Unexpected errors are logged with `errorName` only; never with the SQL, request body, identifiers, or
row values. The route does not set ETag headers (AR-10 of the feature register).

### Mounting

`server.ts` imports `createResourceServerRouter` and mounts it after the application router:

```ts
const resourceServerRouter = createResourceServerRouter();
app.use(resourceServerRouter.routes());
app.use(resourceServerRouter.allowedMethods());
```

The global `adminMutationAudit` remains mounted before these routers, so successful mutations are
audited automatically. The router must not opt out of that middleware.

## Code Examples

### Create with default audience

```json
{
  "name": "Billing API",
  "identifier": "https://billing.example.test",
  "scopes": ["billing:read", "billing:write"]
}
```

Response `201`:

```json
{
  "data": {
    "id": "…",
    "applicationId": "…",
    "slug": "billing-api",
    "name": "Billing API",
    "identifier": "https://billing.example.test",
    "audience": "https://billing.example.test",
    "scopes": ["billing:read", "billing:write"],
    "createdAt": "2026-11-09T00:00:00.000Z",
    "updatedAt": "2026-11-09T00:00:00.000Z"
  }
}
```

### Full replacement update

```json
{
  "name": "Billing API",
  "slug": "billing-api",
  "identifier": "https://billing.example.test",
  "audience": "https://api.billing.example.test",
  "scopes": ["billing:read"]
}
```

The previous `billing:write` row is removed in the same transaction.

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| --- | --- | --- |
| Invalid body or route parameter | Zod `400` fixed body | AR-1, RD-01 |
| Application not found | `404` fixed body | RD-01 |
| Foreign/unknown resource server | `404` fixed body | RD-01 |
| Duplicate identifier/audience/slug | `409` fixed body from `23505` | RD-01 |
| Unexpected storage failure | `503` fixed body; log error name only | RD-01 |
| Duplicate or standard OIDC scope | `400` fixed body before SQL | AR-8 of feature register |
| Delete race | Row lock, then `404` if already gone | RD-01 |

## Testing Requirements

- Unit tests for validators, slug reuse, audience normalization, standard-scope rejection, and error
  mapping.
- Integration tests for list/get/create/update/delete, ownership isolation, unique collisions,
  scope replacement, hard-delete cascade, audit rows, and permission failures.
- A provider-resolution check after delete (`invalid_target`) using the existing resolver test
  helpers.
- No new migration; existing `038` schema tests remain green.
