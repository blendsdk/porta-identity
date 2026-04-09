# RBAC Repository & Cache: RBAC & Custom Claims

> **Document**: 04-rbac-repository-and-cache.md
> **Parent**: [Index](00-index.md)

## Overview

Implement PostgreSQL repositories and Redis cache for the RBAC module. Covers three repository files (role, permission, mapping) and one cache file, following established patterns from `src/organizations/repository.ts` and `src/organizations/cache.ts`.

## Architecture

### File Structure

```
src/rbac/
  role-repository.ts       # PostgreSQL CRUD for roles table
  permission-repository.ts # PostgreSQL CRUD for permissions table
  mapping-repository.ts    # Role-permission and user-role join tables
  cache.ts                 # Redis cache for roles and user-role resolution
```

### Splitting Rationale

The repository is split into three files because:
1. **Roles** and **Permissions** are independent entities with separate CRUD
2. **Mapping repository** handles the join tables (`role_permissions` and `user_roles`) — distinct from entity CRUD
3. Each file stays within the 200-500 line guideline

## Implementation Details

### Role Repository — `src/rbac/role-repository.ts`

```typescript
import { getPool } from '../lib/database.js';
import type { Role, RoleRow, CreateRoleInput, UpdateRoleInput } from './types.js';
import { mapRowToRole } from './types.js';

/**
 * Insert a new role into the database.
 */
export async function insertRole(input: CreateRoleInput): Promise<Role> { /* ... */ }

/**
 * Find a role by its UUID.
 */
export async function findRoleById(id: string): Promise<Role | null> { /* ... */ }

/**
 * Find a role by application ID and slug.
 */
export async function findRoleBySlug(applicationId: string, slug: string): Promise<Role | null> { /* ... */ }

/**
 * Update a role by ID. Only provided fields are updated (dynamic SET).
 */
export async function updateRole(id: string, input: UpdateRoleInput): Promise<Role> { /* ... */ }

/**
 * Delete a role by ID.
 */
export async function deleteRole(id: string): Promise<boolean> { /* ... */ }

/**
 * List all roles for an application.
 */
export async function listRolesByApplication(applicationId: string): Promise<Role[]> { /* ... */ }

/**
 * Check if a role slug exists for a given application.
 * Used for uniqueness validation before insert/update.
 */
export async function roleSlugExists(applicationId: string, slug: string, excludeId?: string): Promise<boolean> { /* ... */ }

/**
 * Count users assigned to a role.
 * Used to check before deletion (prevent delete if users assigned).
 */
export async function countUsersWithRole(roleId: string): Promise<number> { /* ... */ }
```

**SQL Pattern** (following existing repository style):
```sql
-- insertRole
INSERT INTO roles (application_id, name, slug, description)
VALUES ($1, $2, $3, $4)
RETURNING *

-- findRoleById
SELECT * FROM roles WHERE id = $1

-- findRoleBySlug
SELECT * FROM roles WHERE application_id = $1 AND slug = $2

-- listRolesByApplication
SELECT * FROM roles WHERE application_id = $1 ORDER BY name ASC

-- countUsersWithRole
SELECT COUNT(*)::int FROM user_roles WHERE role_id = $1
```

### Permission Repository — `src/rbac/permission-repository.ts`

```typescript
/**
 * Insert a new permission.
 */
export async function insertPermission(input: CreatePermissionInput): Promise<Permission> { /* ... */ }

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
 */
export async function updatePermission(id: string, input: UpdatePermissionInput): Promise<Permission> { /* ... */ }

/**
 * Delete a permission by ID.
 */
export async function deletePermission(id: string): Promise<boolean> { /* ... */ }

/**
 * List permissions for an application, optionally filtered by module.
 */
export async function listPermissionsByApplication(
  applicationId: string,
  moduleId?: string
): Promise<Permission[]> { /* ... */ }

/**
 * Check if a permission slug exists for a given application.
 */
export async function permissionSlugExists(applicationId: string, slug: string): Promise<boolean> { /* ... */ }

/**
 * Count roles that have a specific permission assigned.
 * Used to check before deletion.
 */
export async function countRolesWithPermission(permissionId: string): Promise<number> { /* ... */ }
```

### Mapping Repository — `src/rbac/mapping-repository.ts`

Handles the join tables for role-permission and user-role relationships:

```typescript
// --- Role-Permission Mapping ---

/**
 * Assign multiple permissions to a role (bulk INSERT with ON CONFLICT DO NOTHING).
 */
export async function assignPermissionsToRole(roleId: string, permissionIds: string[]): Promise<void> { /* ... */ }

/**
 * Remove multiple permissions from a role.
 */
export async function removePermissionsFromRole(roleId: string, permissionIds: string[]): Promise<void> { /* ... */ }

/**
 * Get all permissions for a role (JOIN with permissions table).
 */
export async function getPermissionsForRole(roleId: string): Promise<Permission[]> { /* ... */ }

/**
 * Get all roles that have a specific permission.
 */
export async function getRolesWithPermission(permissionId: string): Promise<Role[]> { /* ... */ }

// --- User-Role Mapping ---

/**
 * Assign multiple roles to a user (bulk INSERT with ON CONFLICT DO NOTHING).
 * Tracks who assigned the role via assigned_by.
 */
export async function assignRolesToUser(
  userId: string,
  roleIds: string[],
  assignedBy?: string
): Promise<void> { /* ... */ }

/**
 * Remove multiple roles from a user.
 */
export async function removeRolesFromUser(userId: string, roleIds: string[]): Promise<void> { /* ... */ }

/**
 * Get all roles for a user (JOIN with roles table).
 */
export async function getRolesForUser(userId: string): Promise<Role[]> { /* ... */ }

/**
 * Get all permissions for a user (resolved through roles).
 * Joins user_roles → roles → role_permissions → permissions.
 * Returns deduplicated permission list.
 */
export async function getPermissionsForUser(userId: string): Promise<Permission[]> { /* ... */ }

/**
 * List users with a specific role within an organization.
 * Supports pagination.
 */
export async function getUsersWithRole(
  roleId: string,
  orgId: string,
  page: number,
  pageSize: number
): Promise<{ rows: UserRoleRow[]; total: number }> { /* ... */ }
```

**Key SQL for Permission Resolution** (the hot path for token claims):
```sql
-- getPermissionsForUser: resolve all permissions through assigned roles
SELECT DISTINCT p.*
FROM user_roles ur
JOIN role_permissions rp ON rp.role_id = ur.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE ur.user_id = $1
ORDER BY p.slug ASC
```

**Bulk Insert Pattern** (role-permission and user-role assignment):
```sql
-- assignPermissionsToRole (using VALUES list)
INSERT INTO role_permissions (role_id, permission_id)
VALUES ($1, $2), ($1, $3), ($1, $4)
ON CONFLICT DO NOTHING
```

### Redis Cache — `src/rbac/cache.ts`

```typescript
const ROLE_PREFIX = 'rbac:role:';
const USER_ROLES_PREFIX = 'rbac:user-roles:';
const USER_PERMISSIONS_PREFIX = 'rbac:user-perms:';
const CACHE_TTL = 300; // 5 minutes

/**
 * Get a cached role by ID.
 */
export async function getCachedRole(id: string): Promise<Role | null> { /* ... */ }

/**
 * Cache a role by ID.
 */
export async function setCachedRole(role: Role): Promise<void> { /* ... */ }

/**
 * Invalidate a cached role.
 */
export async function invalidateRoleCache(id: string): Promise<void> { /* ... */ }

/**
 * Get cached user role slugs (for token claims).
 */
export async function getCachedUserRoles(userId: string): Promise<string[] | null> { /* ... */ }

/**
 * Cache user role slugs.
 */
export async function setCachedUserRoles(userId: string, roleSlugs: string[]): Promise<void> { /* ... */ }

/**
 * Get cached user permission slugs (for token claims).
 */
export async function getCachedUserPermissions(userId: string): Promise<string[] | null> { /* ... */ }

/**
 * Cache user permission slugs.
 */
export async function setCachedUserPermissions(userId: string, permissionSlugs: string[]): Promise<void> { /* ... */ }

/**
 * Invalidate all user-related RBAC cache (roles + permissions).
 * Called when user-role assignments change.
 */
export async function invalidateUserRbacCache(userId: string): Promise<void> { /* ... */ }

/**
 * Invalidate all user caches for a role (when role-permission mapping changes).
 * Since we can't easily enumerate all users with a role from Redis,
 * this deletes by pattern using SCAN.
 */
export async function invalidateAllUserRbacCaches(): Promise<void> { /* ... */ }
```

**Caching Strategy:**
- Individual role objects cached by ID (for admin lookups)
- User role slugs cached by user ID (for token claims — hot path)
- User permission slugs cached by user ID (for token claims — hot path)
- TTL: 5 minutes (balance between freshness and performance)
- Invalidation on: role-permission changes, user-role changes
- Graceful degradation: cache miss falls through to DB, errors are swallowed

## Error Handling

| Error Case | Handling Strategy |
|------------|-------------------|
| DB connection failure | Let error propagate — caught by Koa error handler |
| Redis unavailable | Graceful degradation — fall through to DB query |
| Bulk insert partial failure | Use ON CONFLICT DO NOTHING — skip duplicates |
| Non-existent permission/role IDs in bulk | FK constraint violation — caught and thrown as validation error |

## Testing Requirements

### Role Repository Tests
- Insert role, verify returned fields
- Find by ID (found + not found)
- Find by slug (found + not found)
- Update role (partial update, dynamic SET)
- Delete role (exists + not exists)
- List by application (empty + populated)
- Slug exists check (true/false, with excludeId)
- Count users with role

### Permission Repository Tests
- Insert permission, verify returned fields
- Find by ID / slug
- Update (name + description only)
- Delete
- List by application (all + filtered by module)
- Slug exists check
- Count roles with permission

### Mapping Repository Tests
- Assign permissions to role (single + bulk)
- Remove permissions from role
- Get permissions for role (empty + populated)
- Get roles with permission
- Assign roles to user (single + bulk, with/without assignedBy)
- Remove roles from user
- Get roles for user
- Get permissions for user (resolved through roles)
- Users with role in org (pagination)
- ON CONFLICT DO NOTHING (duplicate assignment idempotent)

### Cache Tests
- Get/set/invalidate role cache
- Get/set user roles cache
- Get/set user permissions cache
- Invalidate user RBAC cache
- Graceful degradation on Redis error
- Cache miss returns null
