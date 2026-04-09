# RBAC Service: RBAC & Custom Claims

> **Document**: 05-rbac-service.md
> **Parent**: [Index](00-index.md)

## Overview

Implement the service layer for the RBAC module. Three service files handle business logic, validation, cache orchestration, and audit logging for roles, permissions, and user-role assignments. This includes the claims-building functions that will be called from the OIDC account finder during token issuance.

## Architecture

### File Structure

```
src/rbac/
  role-service.ts       # Role CRUD with slug validation, deletion guards, audit
  permission-service.ts # Permission CRUD with slug format validation, deletion guards, audit
  user-role-service.ts  # User-role assignment, claims building (token hot path)
```

### Splitting Rationale

Three service files because each manages a distinct concern:
1. **Role service** — Entity CRUD for roles (app-scoped)
2. **Permission service** — Entity CRUD for permissions (app-scoped, module-linked)
3. **User-role service** — Assignment management + claims building (the token integration point)

## Implementation Details

### Role Service — `src/rbac/role-service.ts`

```typescript
/**
 * Create a new role for an application.
 * - Auto-generates slug from name if not provided
 * - Validates slug format
 * - Ensures slug uniqueness within the application
 * - Audit logs the creation
 */
export async function createRole(input: CreateRoleInput): Promise<Role> {
  // 1. Generate slug if not provided
  // 2. Validate slug format
  // 3. Check slug uniqueness within application
  // 4. Insert via repository
  // 5. Cache the new role
  // 6. Audit log: role.created
  // 7. Return created role
}

/**
 * Find a role by ID. Cache-first, falls back to DB.
 */
export async function findRoleById(id: string): Promise<Role | null> { /* ... */ }

/**
 * Find a role by application ID and slug.
 */
export async function findRoleBySlug(applicationId: string, slug: string): Promise<Role | null> { /* ... */ }

/**
 * Update a role by ID.
 * - If slug changes, validates new slug format and uniqueness
 * - Invalidates cache
 * - Audit logs the update
 */
export async function updateRole(id: string, input: UpdateRoleInput): Promise<Role> { /* ... */ }

/**
 * Delete a role by ID.
 * - If force=false (default): throws RbacValidationError if users are assigned
 * - If force=true: deletes role (CASCADE removes user_roles and role_permissions)
 * - Invalidates cache
 * - Audit logs the deletion
 */
export async function deleteRole(id: string, force?: boolean): Promise<void> { /* ... */ }

/**
 * List all roles for an application.
 */
export async function listRolesByApplication(applicationId: string): Promise<Role[]> { /* ... */ }

/**
 * Assign permissions to a role.
 * - Validates all permission IDs exist
 * - Delegates to mapping repository
 * - Invalidates all user RBAC caches (permissions may have changed)
 * - Audit logs: role.permissions.assigned
 */
export async function assignPermissionsToRole(
  roleId: string,
  permissionIds: string[]
): Promise<void> { /* ... */ }

/**
 * Remove permissions from a role.
 * - Delegates to mapping repository
 * - Invalidates all user RBAC caches
 * - Audit logs: role.permissions.removed
 */
export async function removePermissionsFromRole(
  roleId: string,
  permissionIds: string[]
): Promise<void> { /* ... */ }

/**
 * Get all permissions assigned to a role.
 */
export async function getPermissionsForRole(roleId: string): Promise<Permission[]> { /* ... */ }
```

**Audit Events:**
| Operation | Event Type | Category |
|-----------|-----------|----------|
| Role created | `role.created` | `admin` |
| Role updated | `role.updated` | `admin` |
| Role deleted | `role.deleted` | `admin` |
| Permissions assigned to role | `role.permissions.assigned` | `admin` |
| Permissions removed from role | `role.permissions.removed` | `admin` |

### Permission Service — `src/rbac/permission-service.ts`

```typescript
/**
 * Create a new permission for an application.
 * - Validates slug format (module:resource:action)
 * - Ensures slug uniqueness within the application
 * - Audit logs the creation
 */
export async function createPermission(input: CreatePermissionInput): Promise<Permission> {
  // 1. Validate permission slug format (module:resource:action)
  // 2. Check slug uniqueness within application
  // 3. Insert via repository
  // 4. Audit log: permission.created
  // 5. Return created permission
}

/**
 * Find a permission by ID.
 */
export async function findPermissionById(id: string): Promise<Permission | null> { /* ... */ }

/**
 * Find a permission by application ID and slug.
 */
export async function findPermissionBySlug(applicationId: string, slug: string): Promise<Permission | null> { /* ... */ }

/**
 * Update a permission by ID (name and description only — slug is immutable).
 * - Audit logs the update
 */
export async function updatePermission(id: string, input: UpdatePermissionInput): Promise<Permission> { /* ... */ }

/**
 * Delete a permission by ID.
 * - If force=false (default): throws RbacValidationError if assigned to any role
 * - If force=true: deletes permission (CASCADE removes role_permissions)
 * - Invalidates all user RBAC caches
 * - Audit logs the deletion
 */
export async function deletePermission(id: string, force?: boolean): Promise<void> { /* ... */ }

/**
 * List permissions for an application, optionally filtered by module.
 */
export async function listPermissionsByApplication(
  applicationId: string,
  moduleId?: string
): Promise<Permission[]> { /* ... */ }

/**
 * Get all roles that have a specific permission.
 */
export async function getRolesWithPermission(permissionId: string): Promise<Role[]> { /* ... */ }
```

**Audit Events:**
| Operation | Event Type | Category |
|-----------|-----------|----------|
| Permission created | `permission.created` | `admin` |
| Permission updated | `permission.updated` | `admin` |
| Permission deleted | `permission.deleted` | `admin` |

### User-Role Service — `src/rbac/user-role-service.ts`

This is the most critical service — it handles user-role assignments and builds the claims that get injected into tokens.

```typescript
/**
 * Assign roles to a user (bulk).
 * - Validates all role IDs exist
 * - Delegates to mapping repository
 * - Invalidates user RBAC cache
 * - Audit logs: user.roles.assigned
 */
export async function assignRolesToUser(
  userId: string,
  roleIds: string[],
  assignedBy?: string
): Promise<void> { /* ... */ }

/**
 * Remove roles from a user (bulk).
 * - Delegates to mapping repository
 * - Invalidates user RBAC cache
 * - Audit logs: user.roles.removed
 */
export async function removeRolesFromUser(
  userId: string,
  roleIds: string[]
): Promise<void> { /* ... */ }

/**
 * Get all roles for a user.
 */
export async function getUserRoles(userId: string): Promise<Role[]> { /* ... */ }

/**
 * Get all permissions for a user (resolved through roles).
 */
export async function getUserPermissions(userId: string): Promise<Permission[]> { /* ... */ }

/**
 * List users with a specific role within an organization.
 * Supports pagination via PaginatedResult.
 */
export async function getUsersWithRole(
  roleId: string,
  orgId: string,
  options?: { page?: number; pageSize?: number }
): Promise<PaginatedResult<UserRole>> { /* ... */ }

// --- Token Claims Building (Hot Path) ---

/**
 * Build role claims for a user's token.
 * Returns array of role slugs: ["crm-editor", "invoice-approver"]
 * 
 * Cache-first: checks Redis for cached role slugs.
 * On cache miss: resolves from DB, caches result.
 */
export async function buildRoleClaims(userId: string): Promise<string[]> {
  // 1. Check cache for user role slugs
  // 2. If cached, return cached value
  // 3. If not cached, query DB for user's roles
  // 4. Extract slugs from roles
  // 5. Cache the slugs
  // 6. Return slugs
}

/**
 * Build permission claims for a user's token.
 * Returns array of permission slugs: ["crm:contacts:read", "crm:deals:write"]
 * 
 * Cache-first: checks Redis for cached permission slugs.
 * On cache miss: resolves from DB through roles, caches result.
 */
export async function buildPermissionClaims(userId: string): Promise<string[]> {
  // 1. Check cache for user permission slugs
  // 2. If cached, return cached value
  // 3. If not cached, query DB for user's permissions (through roles)
  // 4. Extract slugs from permissions
  // 5. Cache the slugs
  // 6. Return slugs
}
```

**Audit Events:**
| Operation | Event Type | Category |
|-----------|-----------|----------|
| Roles assigned to user | `user.roles.assigned` | `admin` |
| Roles removed from user | `user.roles.removed` | `admin` |

## Integration Points

### Claims Building Flow

```
Token Issuance Request
  → findAccount(ctx, sub)           [src/oidc/account-finder.ts]
    → findUserForOidc(sub)          [src/users/service.ts]
    → .claims(use, scope)
      → buildUserClaims(user, scopes)  [src/users/claims.ts — standard OIDC]
      → buildRoleClaims(user.id)       [src/rbac/user-role-service.ts — NEW]
      → buildPermissionClaims(user.id) [src/rbac/user-role-service.ts — NEW]
      → buildCustomClaims(...)         [src/custom-claims/service.ts — NEW]
      → merge all claims → return
```

## Error Handling

| Error Case | Handling Strategy |
|------------|-------------------|
| Role not found on update/delete | Throw `RoleNotFoundError` |
| Permission not found on update/delete | Throw `PermissionNotFoundError` |
| Duplicate slug | Throw `RbacValidationError` with descriptive message |
| Invalid permission slug format | Throw `RbacValidationError` |
| Delete role with assigned users (no force) | Throw `RbacValidationError` |
| Delete permission assigned to roles (no force) | Throw `RbacValidationError` |
| Non-existent role IDs in bulk assign | Throw `RbacValidationError` |
| Non-existent permission IDs in bulk assign | Throw `RbacValidationError` |

## Testing Requirements

### Role Service Tests
- Create role (with auto-slug, with provided slug)
- Create role (duplicate slug → validation error)
- Find role by ID (cache hit, cache miss, not found)
- Update role (name change, slug change with uniqueness check)
- Delete role (no users, with users no force → error, force → cascade)
- List roles by application
- Assign permissions to role (valid, invalid permission IDs)
- Remove permissions from role
- Get permissions for role
- Audit log called for all write operations

### Permission Service Tests
- Create permission (valid slug format)
- Create permission (invalid slug format → error)
- Create permission (duplicate slug → error)
- Find by ID/slug
- Update (name/description only)
- Delete (no roles, with roles no force → error, force → cascade)
- List by application (all, filtered by module)
- Get roles with permission
- Audit log called for all write operations

### User-Role Service Tests
- Assign roles to user (valid, invalid role IDs)
- Remove roles from user
- Get user roles
- Get user permissions (resolved through roles)
- Users with role in org (pagination)
- buildRoleClaims — cache hit returns cached slugs
- buildRoleClaims — cache miss queries DB and caches
- buildPermissionClaims — cache hit returns cached slugs
- buildPermissionClaims — cache miss queries DB and caches
- Cache invalidation on assign/remove
- Audit log called for assign/remove operations
