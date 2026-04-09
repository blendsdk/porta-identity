# Token Integration & Routes: RBAC & Custom Claims

> **Document**: 07-token-integration-and-routes.md
> **Parent**: [Index](00-index.md)

## Overview

Integrate RBAC and custom claims into the OIDC token issuance flow and create admin API routes for managing roles, permissions, user-role assignments, and custom claims. This is the final integration layer that connects the new modules to the existing system.

## Architecture

### Changes to Existing Files

```
src/oidc/account-finder.ts   # Extend claims() to include RBAC + custom claims
src/server.ts                 # Mount new route handlers
```

### New Route Files

```
src/routes/roles.ts           # /api/admin/applications/:appId/roles
src/routes/permissions.ts     # /api/admin/applications/:appId/permissions
src/routes/user-roles.ts      # /api/admin/organizations/:orgId/users/:userId/roles
src/routes/custom-claims.ts   # /api/admin/applications/:appId/claims + user values
```

## Implementation Details

### Token Integration — Extending `src/oidc/account-finder.ts`

The existing `findAccount` function needs to be extended to include RBAC and custom claims in the token claims output. The change is minimal and additive — existing standard claims are preserved.

**Current flow:**
```typescript
claims(use, scope) → buildUserClaims(user, scopes)
```

**New flow:**
```typescript
claims(use, scope) → {
  ...buildUserClaims(user, scopes),      // existing OIDC standard claims
  roles: await buildRoleClaims(userId),  // NEW: role slugs
  permissions: await buildPermissionClaims(userId),  // NEW: permission slugs
  ...await buildCustomClaims(userId, appId, tokenType),  // NEW: custom claims
}
```

**Key considerations:**
1. The `use` parameter tells us the token type: `'id_token'`, `'userinfo'`, or `'access_token'` (for introspection)
2. Custom claims are filtered by token type (some only in access tokens, etc.)
3. RBAC claims (roles/permissions) are always included in all token types for now
4. The `applicationId` for custom claims must be resolved from the client context — the OIDC provider gives us the client ID, which we can look up to find the application

**Resolving applicationId:**
```typescript
// Inside claims(), we need the client's applicationId
// Option 1: Pass ctx through and read ctx.oidc.client
// Option 2: Accept clientId as parameter to claims() (needs wrapper)
// Chosen: Use the ctx parameter that findAccount already receives
```

### Route Pattern

All new routes follow the established pattern from `src/routes/organizations.ts`:
- Factory function that creates a `@koa/router` instance
- `router.use(requireSuperAdmin())` middleware
- Zod schemas for request validation
- Local `handleError()` function mapping domain errors to HTTP status codes
- JSON response bodies

### Roles Routes — `src/routes/roles.ts`

```
Factory: createRoleRouter()
Prefix:  /api/admin/applications/:appId/roles
Auth:    requireSuperAdmin()
```

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/` | createRole | Create a role for the application |
| GET | `/` | listRoles | List all roles for the application |
| GET | `/:roleId` | getRole | Get a role by ID |
| PUT | `/:roleId` | updateRole | Update a role |
| DELETE | `/:roleId` | deleteRole | Delete a role (query: `?force=true`) |
| GET | `/:roleId/permissions` | getRolePermissions | List permissions for a role |
| PUT | `/:roleId/permissions` | assignPermissions | Assign permissions to a role |
| DELETE | `/:roleId/permissions` | removePermissions | Remove permissions from a role |

**Zod Schemas:**
```typescript
const createRoleSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
});

const updateRoleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).nullable().optional(),
});

const permissionIdsSchema = z.object({
  permissionIds: z.array(z.string().uuid()).min(1),
});
```

### Permissions Routes — `src/routes/permissions.ts`

```
Factory: createPermissionRouter()
Prefix:  /api/admin/applications/:appId/permissions
Auth:    requireSuperAdmin()
```

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/` | createPermission | Create a permission for the application |
| GET | `/` | listPermissions | List permissions (query: `?moduleId=...`) |
| GET | `/:permId` | getPermission | Get a permission by ID |
| PUT | `/:permId` | updatePermission | Update a permission (name/description only) |
| DELETE | `/:permId` | deletePermission | Delete a permission (query: `?force=true`) |
| GET | `/:permId/roles` | getRolesWithPermission | List roles that have this permission |

**Zod Schemas:**
```typescript
const createPermissionSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(150),
  moduleId: z.string().uuid().optional(),
  description: z.string().max(1000).optional(),
});

const updatePermissionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
});

const listPermissionsSchema = z.object({
  moduleId: z.string().uuid().optional(),
});
```

### User-Roles Routes — `src/routes/user-roles.ts`

```
Factory: createUserRoleRouter()
Prefix:  /api/admin/organizations/:orgId/users/:userId/roles
Auth:    requireSuperAdmin()
```

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/` | getUserRoles | List roles for a user |
| PUT | `/` | assignRoles | Assign roles to a user |
| DELETE | `/` | removeRoles | Remove roles from a user |
| GET | `/permissions` | getUserPermissions | List resolved permissions for a user |

**Additional endpoint on the roles router:**

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/:roleId/users` | getUsersWithRole | List users with a role in an org (query: `?orgId=...&page=...&pageSize=...`) |

**Zod Schemas:**
```typescript
const roleIdsSchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1),
});
```

### Custom Claims Routes — `src/routes/custom-claims.ts`

```
Factory: createCustomClaimRouter()
Prefix:  /api/admin/applications/:appId/claims
Auth:    requireSuperAdmin()
```

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/` | createDefinition | Create a claim definition |
| GET | `/` | listDefinitions | List claim definitions for the app |
| GET | `/:claimId` | getDefinition | Get a claim definition |
| PUT | `/:claimId` | updateDefinition | Update a claim definition |
| DELETE | `/:claimId` | deleteDefinition | Delete a claim definition |
| PUT | `/:claimId/users/:userId` | setValue | Set a claim value for a user |
| GET | `/:claimId/users/:userId` | getValue | Get a claim value for a user |
| DELETE | `/:claimId/users/:userId` | deleteValue | Delete a claim value |
| GET | `/users/:userId` | getUserValues | Get all claim values for a user |

**Zod Schemas:**
```typescript
const createDefinitionSchema = z.object({
  claimName: z.string().min(1).max(255),
  claimType: z.enum(['string', 'number', 'boolean', 'json']),
  description: z.string().max(1000).optional(),
  includeInIdToken: z.boolean().optional(),
  includeInAccessToken: z.boolean().optional(),
  includeInUserinfo: z.boolean().optional(),
});

const updateDefinitionSchema = z.object({
  description: z.string().max(1000).nullable().optional(),
  includeInIdToken: z.boolean().optional(),
  includeInAccessToken: z.boolean().optional(),
  includeInUserinfo: z.boolean().optional(),
});

const setValueSchema = z.object({
  value: z.unknown(), // Type validated by service layer against definition
});
```

### Server Integration — `src/server.ts`

Mount all new routers:

```typescript
// Existing
app.use(createOrganizationRouter().routes());
app.use(createApplicationRouter().routes());
app.use(createClientRouter().routes());
app.use(createUserRouter().routes());

// New — RBAC & Custom Claims (RD-08)
app.use(createRoleRouter().routes());
app.use(createPermissionRouter().routes());
app.use(createUserRoleRouter().routes());
app.use(createCustomClaimRouter().routes());
```

### Error Mapping in Routes

Each route file includes a `handleError()` function:

```typescript
function handleError(ctx: Context, err: unknown): void {
  if (err instanceof RoleNotFoundError || err instanceof PermissionNotFoundError || err instanceof ClaimNotFoundError) {
    ctx.throw(404, err.message);
  } else if (err instanceof RbacValidationError || err instanceof ClaimValidationError) {
    ctx.throw(400, err.message);
  } else if (err instanceof z.ZodError) {
    ctx.status = 400;
    ctx.body = { error: 'Validation failed', details: err.issues };
  } else {
    throw err;
  }
}
```

## Integration Points

### Account Finder → Token Claims Flow

```
1. OIDC Provider issues token
2. Calls findAccount(ctx, sub)
3. Returns OidcAccount with .claims(use, scope)
4. claims() is called:
   a. buildUserClaims(user, scopes)        → { sub, name, email, ... }
   b. buildRoleClaims(userId)              → ["crm-editor", "invoice-approver"]
   c. buildPermissionClaims(userId)        → ["crm:contacts:read", ...]
   d. buildCustomClaims(userId, appId, use) → { department: "Sales" }
5. Merge all → return to OIDC provider
6. Provider includes in token
```

### Resolving Application ID from Client Context

```
ctx.oidc.client.clientId
  → findClientByClientId()     [src/clients/service.ts]
  → client.applicationId
  → used for buildCustomClaims(userId, applicationId, tokenType)
```

## Error Handling

| Error Case | HTTP Status | Response |
|------------|-------------|----------|
| Role/Permission/Claim not found | 404 | `{ error: "Role not found: ..." }` |
| Validation error (slug format, reserved name, etc.) | 400 | `{ error: "..." }` |
| Zod validation error | 400 | `{ error: "Validation failed", details: [...] }` |
| Unauthorized (not super-admin) | 403 | `{ error: "Forbidden" }` |
| Unknown error | 500 | Let global error handler handle |

## Testing Requirements

### Account Finder Integration Tests
- Claims include roles when user has assigned roles
- Claims include permissions when user has roles with permissions
- Claims include custom claims filtered by token type
- Claims include all three (roles + permissions + custom) merged correctly
- Claims still include standard OIDC claims (backwards compatibility)
- No roles/permissions for user without assignments (empty arrays)
- No custom claims for user without values (empty object)

### Role Route Tests
- POST create role (valid + validation errors)
- GET list roles (empty + populated)
- GET single role (found + not found)
- PUT update role (valid + not found)
- DELETE role (no users + with users + force)
- GET role permissions
- PUT assign permissions (valid + invalid IDs)
- DELETE remove permissions

### Permission Route Tests
- POST create permission (valid + invalid slug format)
- GET list permissions (all + filtered by module)
- GET single permission (found + not found)
- PUT update permission
- DELETE permission (no roles + with roles + force)
- GET roles with permission

### User-Role Route Tests
- GET user roles
- PUT assign roles (valid + invalid IDs)
- DELETE remove roles
- GET user permissions (resolved)

### Custom Claim Route Tests
- POST create definition (valid + reserved name + duplicate)
- GET list definitions
- GET single definition
- PUT update definition
- DELETE definition
- PUT set value (valid type + invalid type)
- GET value
- DELETE value
- GET all values for user

### Server Mounting Tests
- New routes are mounted and accessible
- Super-admin middleware applied to all new routes
