/**
 * Mapping repository — PostgreSQL data access for RBAC join tables.
 *
 * Handles the role_permissions and user_roles join tables that link:
 * - Roles ↔ Permissions (which permissions a role grants)
 * - Users ↔ Roles (which roles a user has)
 *
 * Key patterns:
 * - Bulk INSERT with ON CONFLICT DO NOTHING for idempotent assignment
 * - Multi-table JOINs for permission resolution through roles
 * - DISTINCT for deduplicated permission lists across multiple roles
 * - Parameterized bulk VALUES lists for safe multi-row operations
 *
 * The permission resolution query (getPermissionsForUser) is the hot path
 * for token claims — it resolves user → roles → permissions in a single query.
 *
 * Database tables: role_permissions, user_roles (see migration 006_roles_permissions.sql)
 */

import { getPool } from '../lib/database.js';
import type { Role, RoleRow, Permission, PermissionRow, UserRole, UserRoleRow } from './types.js';
import { mapRowToRole, mapRowToPermission, mapRowToUserRole } from './types.js';

// ===========================================================================
// Role-Permission Mapping
// ===========================================================================

/**
 * Assign multiple permissions to a role (bulk insert).
 *
 * Uses ON CONFLICT DO NOTHING to make the operation idempotent —
 * already-assigned permissions are silently skipped. This allows
 * callers to assign without checking for existing assignments first.
 *
 * @param roleId - Role UUID
 * @param permissionIds - Array of permission UUIDs to assign
 */
export async function assignPermissionsToRole(
  roleId: string,
  permissionIds: string[],
): Promise<void> {
  if (permissionIds.length === 0) return;

  const pool = getPool();

  // Build parameterized VALUES list: ($1, $2), ($1, $3), ($1, $4), ...
  // $1 is always the roleId, subsequent params are permission IDs
  const valuesList: string[] = [];
  const params: unknown[] = [roleId];

  for (let i = 0; i < permissionIds.length; i++) {
    params.push(permissionIds[i]);
    valuesList.push(`($1, $${i + 2})`);
  }

  await pool.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     VALUES ${valuesList.join(', ')}
     ON CONFLICT DO NOTHING`,
    params,
  );
}

/**
 * Remove multiple permissions from a role.
 *
 * Silently succeeds if any of the permission IDs are not currently
 * assigned to the role.
 *
 * @param roleId - Role UUID
 * @param permissionIds - Array of permission UUIDs to remove
 */
export async function removePermissionsFromRole(
  roleId: string,
  permissionIds: string[],
): Promise<void> {
  if (permissionIds.length === 0) return;

  const pool = getPool();

  // Build parameterized IN list: $2, $3, $4, ...
  const placeholders = permissionIds.map((_, i) => `$${i + 2}`).join(', ');
  const params: unknown[] = [roleId, ...permissionIds];

  await pool.query(
    `DELETE FROM role_permissions WHERE role_id = $1 AND permission_id IN (${placeholders})`,
    params,
  );
}

/**
 * Get all permissions assigned to a role.
 *
 * JOINs role_permissions with permissions table to return full
 * Permission objects, ordered by slug for consistent output.
 *
 * @param roleId - Role UUID
 * @returns Array of permissions assigned to the role
 */
export async function getPermissionsForRole(roleId: string): Promise<Permission[]> {
  const pool = getPool();

  const result = await pool.query<PermissionRow>(
    `SELECT p.*
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
     ORDER BY p.slug ASC`,
    [roleId],
  );

  return result.rows.map(mapRowToPermission);
}

/**
 * Get all roles that have a specific permission assigned.
 *
 * JOINs role_permissions with roles table to return full Role objects,
 * ordered by name for consistent output.
 *
 * @param permissionId - Permission UUID
 * @returns Array of roles that have this permission
 */
export async function getRolesWithPermission(permissionId: string): Promise<Role[]> {
  const pool = getPool();

  const result = await pool.query<RoleRow>(
    `SELECT r.*
     FROM role_permissions rp
     JOIN roles r ON r.id = rp.role_id
     WHERE rp.permission_id = $1
     ORDER BY r.name ASC`,
    [permissionId],
  );

  return result.rows.map(mapRowToRole);
}

// ===========================================================================
// User-Role Mapping
// ===========================================================================

/**
 * Assign multiple roles to a user (bulk insert).
 *
 * Uses ON CONFLICT DO NOTHING to make the operation idempotent —
 * already-assigned roles are silently skipped. Tracks who performed
 * the assignment via the optional assignedBy parameter.
 *
 * @param userId - User UUID
 * @param roleIds - Array of role UUIDs to assign
 * @param assignedBy - Optional UUID of the admin who performed the assignment
 */
export async function assignRolesToUser(
  userId: string,
  roleIds: string[],
  assignedBy?: string,
): Promise<void> {
  if (roleIds.length === 0) return;

  const pool = getPool();

  // Build parameterized VALUES list
  // $1 = userId, $2 = assignedBy (or null), subsequent params = roleIds
  const valuesList: string[] = [];
  const params: unknown[] = [userId, assignedBy ?? null];

  for (let i = 0; i < roleIds.length; i++) {
    params.push(roleIds[i]);
    valuesList.push(`($1, $${i + 3}, $2)`);
  }

  await pool.query(
    `INSERT INTO user_roles (user_id, role_id, assigned_by)
     VALUES ${valuesList.join(', ')}
     ON CONFLICT DO NOTHING`,
    params,
  );
}

/**
 * Remove multiple roles from a user.
 *
 * Silently succeeds if any of the role IDs are not currently
 * assigned to the user.
 *
 * @param userId - User UUID
 * @param roleIds - Array of role UUIDs to remove
 */
export async function removeRolesFromUser(
  userId: string,
  roleIds: string[],
): Promise<void> {
  if (roleIds.length === 0) return;

  const pool = getPool();

  // Build parameterized IN list: $2, $3, $4, ...
  const placeholders = roleIds.map((_, i) => `$${i + 2}`).join(', ');
  const params: unknown[] = [userId, ...roleIds];

  await pool.query(
    `DELETE FROM user_roles WHERE user_id = $1 AND role_id IN (${placeholders})`,
    params,
  );
}

/**
 * Get all roles assigned to a user.
 *
 * JOINs user_roles with roles table to return full Role objects,
 * ordered by name for consistent output.
 *
 * @param userId - User UUID
 * @returns Array of roles assigned to the user
 */
export async function getRolesForUser(userId: string): Promise<Role[]> {
  const pool = getPool();

  const result = await pool.query<RoleRow>(
    `SELECT r.*
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1
     ORDER BY r.name ASC`,
    [userId],
  );

  return result.rows.map(mapRowToRole);
}

/**
 * Get all permissions for a user, resolved through their assigned roles.
 *
 * This is the hot path for token claims — it resolves the full chain:
 * user_roles → roles → role_permissions → permissions
 * in a single query. Results are deduplicated (DISTINCT) since a user
 * may have the same permission through multiple roles.
 *
 * @param userId - User UUID
 * @returns Deduplicated array of permissions the user has through their roles
 */
export async function getPermissionsForUser(userId: string): Promise<Permission[]> {
  const pool = getPool();

  const result = await pool.query<PermissionRow>(
    `SELECT DISTINCT p.*
     FROM user_roles ur
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = $1
     ORDER BY p.slug ASC`,
    [userId],
  );

  return result.rows.map(mapRowToPermission);
}

/**
 * List user-role assignments for a specific role within an organization.
 *
 * Supports pagination for admin UI views showing which users have a
 * particular role. JOINs with users table to filter by organization.
 *
 * @param roleId - Role UUID
 * @param orgId - Organization UUID (to scope users)
 * @param page - Page number (1-based)
 * @param pageSize - Number of results per page
 * @returns Paginated user-role assignments and total count
 */
export async function getUsersWithRole(
  roleId: string,
  orgId: string,
  page: number,
  pageSize: number,
): Promise<{ rows: UserRole[]; total: number }> {
  const pool = getPool();
  const offset = (page - 1) * pageSize;

  // Count total matching assignments
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::int as count
     FROM user_roles ur
     JOIN users u ON u.id = ur.user_id
     WHERE ur.role_id = $1 AND u.organization_id = $2`,
    [roleId, orgId],
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Fetch paginated data
  const dataResult = await pool.query<UserRoleRow>(
    `SELECT ur.*
     FROM user_roles ur
     JOIN users u ON u.id = ur.user_id
     WHERE ur.role_id = $1 AND u.organization_id = $2
     ORDER BY ur.created_at DESC
     LIMIT $3 OFFSET $4`,
    [roleId, orgId, pageSize, offset],
  );

  return {
    rows: dataResult.rows.map(mapRowToUserRole),
    total,
  };
}
