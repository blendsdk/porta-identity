/**
 * User-role service — user role assignment and claims building.
 *
 * Handles assigning/removing roles to/from users, retrieving user
 * roles and permissions, and building the claims arrays that get
 * injected into OIDC tokens.
 *
 * Token claim construction reads PostgreSQL directly. This makes role and
 * permission deletion authoritative even when an older Redis entry remains.
 *
 * @see mapping-repository.ts — Database operations for user-role join table
 * @see cache.ts — Redis cache for role/permission slug arrays
 */

import {
  assignRolesToUser as repoAssignRoles,
  removeRolesFromUser as repoRemoveRoles,
  getRolesForUser as repoGetRolesForUser,
  getPermissionsForUser as repoGetPermissionsForUser,
  getUsersWithRole as repoGetUsersWithRole,
} from './mapping-repository.js';
import { invalidateUserRbacCache } from './cache.js';
import { writeAuditLog } from '../lib/audit-log.js';
import type { Role, Permission, UserRole } from './types.js';

// ---------------------------------------------------------------------------
// Assignment management
// ---------------------------------------------------------------------------

/**
 * Assign roles to a user (bulk).
 *
 * Uses ON CONFLICT DO NOTHING for idempotent assignment. Invalidates
 * the user's RBAC cache since their effective permissions may change.
 *
 * @param userId - User UUID
 * @param roleIds - Array of role UUIDs to assign
 * @param assignedBy - Optional UUID of the admin performing the assignment
 */
export async function assignRolesToUser(
  userId: string,
  roleIds: string[],
  assignedBy?: string,
): Promise<void> {
  if (roleIds.length === 0) return;

  await repoAssignRoles(userId, roleIds, assignedBy);

  // Invalidate user's cached roles and permissions
  await invalidateUserRbacCache(userId);

  // Audit log (fire-and-forget)
  void writeAuditLog({
    eventType: 'user.roles.assigned',
    eventCategory: 'admin',
    userId,
    actorId: assignedBy,
    metadata: { roleIds },
  });
}

/**
 * Remove roles from a user (bulk).
 *
 * Invalidates the user's RBAC cache since their effective permissions
 * may change.
 *
 * @param userId - User UUID
 * @param roleIds - Array of role UUIDs to remove
 * @param actorId - Optional UUID of the admin performing the action
 */
export async function removeRolesFromUser(
  userId: string,
  roleIds: string[],
  actorId?: string,
): Promise<void> {
  if (roleIds.length === 0) return;

  await repoRemoveRoles(userId, roleIds);

  // Invalidate user's cached roles and permissions
  await invalidateUserRbacCache(userId);

  // Audit log (fire-and-forget)
  void writeAuditLog({
    eventType: 'user.roles.removed',
    eventCategory: 'admin',
    userId,
    actorId,
    metadata: { roleIds },
  });
}

// ---------------------------------------------------------------------------
// Query operations
// ---------------------------------------------------------------------------

/**
 * Get all roles assigned to a user.
 *
 * @param userId - User UUID
 * @returns Array of Role objects
 */
export async function getUserRoles(userId: string): Promise<Role[]> {
  return repoGetRolesForUser(userId);
}

/**
 * Get all permissions for a user (resolved through roles).
 *
 * @param userId - User UUID
 * @returns Deduplicated array of Permission objects
 */
export async function getUserPermissions(userId: string): Promise<Permission[]> {
  return repoGetPermissionsForUser(userId);
}

/**
 * List users with a specific role within an organization.
 *
 * Supports pagination for admin UI views.
 *
 * @param roleId - Role UUID
 * @param orgId - Organization UUID
 * @param options - Pagination options
 * @returns Paginated user-role assignments and total count
 */
export async function getUsersWithRole(
  roleId: string,
  orgId: string,
  options?: { page?: number; pageSize?: number },
): Promise<{ rows: UserRole[]; total: number }> {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 20;

  return repoGetUsersWithRole(roleId, orgId, page, pageSize);
}

// ---------------------------------------------------------------------------
// Token claims building (hot path)
// ---------------------------------------------------------------------------

/**
 * Build role claims for a user's token.
 *
 * Returns an array of role slugs (e.g., ["crm-editor", "invoice-approver"])
 * for inclusion in the token's custom claims.
 *
 * @param userId - User UUID
 * @returns Array of role slug strings
 */
export async function buildRoleClaims(userId: string): Promise<string[]> {
  const roles = await repoGetRolesForUser(userId);
  return roles.map((role) => role.slug);
}

/**
 * Build permission claims for a user's token.
 *
 * Returns an array of permission slugs (e.g., ["crm:contacts:read",
 * "crm:deals:write"]) for inclusion in the token's custom claims.
 *
 * @param userId - User UUID
 * @returns Array of permission slug strings
 */
export async function buildPermissionClaims(userId: string): Promise<string[]> {
  const permissions = await repoGetPermissionsForUser(userId);
  return permissions.map((permission) => permission.slug);
}
