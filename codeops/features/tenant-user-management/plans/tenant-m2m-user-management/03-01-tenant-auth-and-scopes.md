# Tenant Auth and Scopes: Tenant-Scoped M2M User Management

> **Document**: 03-01-tenant-auth-and-scopes.md
> **Parent**: [Index](00-index.md)

## Overview

This component turns the invite-specific tenant auth middleware into a reusable tenant actor resolver. The CRUD surface accepts service clients only; the existing invite route keeps its dual service/user actor behavior. The resolver enforces the organization boundary, the client/application boundary, the required OAuth scope, and the active confidential-client status.

## Architecture

### Current Architecture

`requireTenantInviteAuth(provider)` in `packages/server/src/middleware/tenant-invite-auth.ts` resolves a `ClientCredentials` token or an `AccessToken`, authorizes the actor, checks `org:user:invite`, and stores `ctx.state.tenantInviteActor`. The route in `packages/server/src/routes/tenant-invitations.ts` uses that state and the invite service.

### Proposed Changes

- Rename the provider contract to `TenantTokenProvider` (keep a type alias for the old name during the refactor if useful).
- Introduce `TenantActor` with `kind: 'service' | 'user'`, `applicationId`, `organizationId`, and `displayName`; service actors include `clientId`; user actors include `userId` and `permissions`.
- Introduce `requireTenantActorAuth(options)` with:
  - `provider: TenantTokenProvider`
  - `allowedActorKinds: readonly TenantActorKind[]`
  - `requiredScope: string`
  - `requiredPermission?: string` (defaults to the scope for user actors)
- The middleware resolves the token in the existing order: `ClientCredentials` first, then `AccessToken`.
- A valid token whose actor kind is not allowed receives a fixed `403` denial. A missing/invalid token receives `401`.
- State key: `ctx.state.tenantActor`; remove `tenantInviteActor` after all callers/tests are updated.
- Preserve the existing `recordSecurityDecision` decision points and `recordSecurityReference` actor/tenant references at the same boundaries; add a regression matrix for them.
- The custom `TenantActor` is the only actor shape consumed by routes; the rate limiter and audit mapper read it.

## Implementation Details

### Scope Constants

Add to `packages/server/src/oidc/scopes.ts`:

```typescript
/** Read tenant users and their role assignments. */
export const TENANT_USER_READ_SCOPE = 'org:user:read';

/** Create, update, activate, deactivate, and assign roles for tenant users. */
export const TENANT_USER_WRITE_SCOPE = 'org:user:write';

/** Permanently delete a tenant user. */
export const TENANT_USER_DELETE_SCOPE = 'org:user:delete';

/** Existing invitation scope. */
export const TENANT_INVITE_SCOPE = 'org:user:invite';
```

Add the three new values to the provider `scopes` array in `packages/server/src/oidc/configuration.ts` next to `TENANT_INVITE_SCOPE`.

### Actor Contract

```typescript
export type TenantActorKind = 'service' | 'user';

export type TenantActor =
  | {
      readonly kind: 'service';
      readonly clientId: string;
      readonly clientName: string;
      readonly applicationId: string;
      readonly organizationId: string;
      readonly displayName: string;
    }
  | {
      readonly kind: 'user';
      readonly userId: string;
      readonly applicationId: string;
      readonly organizationId: string;
      readonly displayName: string;
      readonly permissions: ReadonlySet<string>;
    };
```

### Middleware Contract

```typescript
export interface TenantAuthOptions {
  readonly provider?: TenantTokenProvider;
  readonly allowedActorKinds: readonly TenantActorKind[];
  readonly requiredScope: string;
  readonly requiredPermission?: string;
}

export function requireTenantActorAuth(options: TenantAuthOptions): Middleware;
```

Service authorization:

- Token has `clientId` and the required scope.
- Client exists, is active, and is confidential.
- `client.organizationId === route orgId`.
- Client metadata scope includes the required scope.
- `isTenantBoundary(orgId, client.applicationId)` is true: application is not `porta-admin` and organization is not the super-admin organization.
- Actor: `kind='service'`, `clientId`, `clientName`, `applicationId`, `organizationId`, `displayName=clientName`.

User authorization (invite only):

- Token has `accountId` and `clientId`.
- Client exists, is active, belongs to the route org, and passes the tenant boundary.
- User is active and belongs to the route org.
- `buildPermissionClaims(user.id, client.applicationId)` includes the required permission.
- Actor: `kind='user'`, `userId`, `applicationId`, `organizationId`, `displayName`, `permissions`.

Denial mapping:

| Condition | Status | Body |
| --- | --- | --- |
| Missing/invalid Authorization or token | `401` | Fixed authentication error |
| Valid token, wrong actor kind | `403` | Fixed forbidden error |
| Service token missing scope | `403` | Fixed forbidden error |
| Client inactive/public/wrong org/not tenant boundary | `403` | Fixed forbidden error |
| User missing permission/membership | `403` | Fixed forbidden error |

### Route Scope Map

| Route | Allowed actors | Required scope |
| --- | --- | --- |
| `GET /` | service | `org:user:read` |
| `GET /:userId` | service | `org:user:read` |
| `POST /` | service | `org:user:write` |
| `PUT /:userId` | service | `org:user:write` |
| `POST /:userId/deactivate` | service | `org:user:write` |
| `POST /:userId/activate` | service | `org:user:write` |
| `GET /:userId/roles` | service | `org:user:read` |
| `GET /:userId/roles/permissions` | service | `org:user:read` |
| `PUT /:userId/roles` | service | `org:user:write` |
| `DELETE /:userId/roles` | service | `org:user:write` |
| `DELETE /:userId` | service | `org:user:delete` |
| `POST /invite` | service or user | `org:user:invite` |

### Rate Limiting

The route layer uses the authenticated `ctx.state.tenantActor`:

- `TENANT_USER_WRITE_RATE_LIMIT = { max: 300, windowSeconds: 3600 }`
- `TENANT_USER_DELETE_RATE_LIMIT = { max: 60, windowSeconds: 3600 }`
- Existing `TENANT_INVITE_RATE_LIMIT = { max: 30, windowSeconds: 3600 }`

Keys:

```text
ratelimit:tenant-user:write:<organizationId>:<clientId>
ratelimit:tenant-user:delete:<organizationId>:<clientId>
ratelimit:tenant-invite:client:<organizationId>:<clientId>
```

The limiter sets `X-RateLimit-Limit` and `X-RateLimit-Remaining`; a denied request returns `429`, `Retry-After`, and a fixed message. It logs a bounded warning with the actor kind and organization, never the token or secret. No new read limiter is added; reads are authenticated and audited.

### Integration Points

- `packages/server/src/routes/tenant-users.ts` imports the resolver and applies it per route.
- `packages/server/src/routes/tenant-invitations.ts` is retired; all imports and tests move to `tenant-users.ts`, and no re-export shim remains.
- The invite route passes `allowedActorKinds: ['service', 'user']`; CRUD passes `['service']`.
- Existing invite tests must be updated to the new state key and optional provider contract, while preserving the behavior assertions.

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| --- | --- | --- |
| Provider not initialized | `500 Server configuration error`; log a bounded event | AR-18 |
| Invalid/foreign organization | `403 Forbidden` at the authentication boundary | AR-7 |
| Absent user in an authenticated existing organization | `404 User not found` | AR-7 |
| Missing bearer token | `401 Authentication required` | AR-6 |
| Malformed/empty token | `401 Invalid token` | AR-6 |
| Valid token, wrong actor kind | `403 Forbidden` | AR-2 |
| Missing scope/permission | `403 Forbidden` | AR-3 |
| Cross-organization client | `403 Forbidden` | AR-5 |
| Admin application or super-admin organization | `403 Forbidden` | AR-6 |
| Rate limit exceeded | `429 Too Many Requests` with `Retry-After` | AR-17 |

## Testing Requirements

- Unit tests for the resolver matrix: service valid, service wrong scope, service wrong org, service inactive/public, service admin app, service super-admin org, user token on CRUD, user token on invite, missing token.
- Unit tests for the scope map and rate-limit keys.
- Regression tests for the existing invite route.
- Regression tests for security decision/reference instrumentation on every denial and success path.
- Integration tests that exchange real client credentials for a token and call the tenant routes.
- Pentest tests for cross-tenant and scope escalation attempts.

## Traceability

- AR-2, AR-3, AR-5, AR-6, AR-7, AR-17, AR-18, AR-24.
- Requirements R1, R2, R9, R12, R17.
