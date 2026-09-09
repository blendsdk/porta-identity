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
  getRolesForOrganizationUser,
  getPermissionsForOrganizationUser,
  lockUserRoleTargets,
} from './mapping-repository.js';
import { writeAuditLog } from '../lib/audit-log.js';
import type { Role, Permission, UserRole } from './types.js';
import { getDatabaseTransactionClient } from '../lib/database.js';
import { writeAuditLogInTransaction } from '../lib/audit-log.js';
import { registerAuthorityCleanup } from '../lib/deletion-cleanup.js';
import { revokeAffectedAuthorityInTransaction } from '../lib/authority-revocation.js';
import { getApplicationBySlug } from '../applications/service.js';
import {
  ADMIN_ROLE_DEFINITIONS,
  getPermissionsForAdminRole,
  resolvePermissionsFromRoles,
} from '../lib/admin-permissions.js';
import { RoleDelegationError, RoleNotFoundError } from './errors.js';
import { UserNotFoundError } from '../users/errors.js';
import { requireActiveSuperAdminSurvivor } from '../users/repository.js';

const ADMIN_APPLICATION_SLUG = 'porta-admin';

// ---------------------------------------------------------------------------
// Assignment management
// ---------------------------------------------------------------------------

/**
 * Assign roles to a user (bulk).
 *
 * Uses ON CONFLICT DO NOTHING for idempotent assignment. Invalidates
 * the user's RBAC cache since their effective permissions may change.
 *
 * @param organizationId - Authoritative organization UUID
 * @param userId - User UUID
 * @param roleIds - Array of role UUIDs to assign
 * @param assignedBy - UUID of the admin performing the assignment
 */
export async function assignRolesToUser(
  organizationId: string,
  userId: string,
  roleIds: string[],
  assignedBy: string,
): Promise<void> {
  if (roleIds.length === 0) return;
  if (!getDatabaseTransactionClient()) {
    throw new Error('User role assignment requires an active database transaction');
  }
  const targets = await requireUserRoleTargets(organizationId, userId, roleIds);
  await requireDelegableRoles(targets.roles, assignedBy, targets.adminApplicationId);

  const insertedRoleIds = await repoAssignRoles(organizationId, userId, roleIds, assignedBy);
  if (insertedRoleIds.length === 0) return;
  await registerAuthorityCleanup({
    userIds: [userId],
    grantIds: [],
    roleIds: [],
    revokeOidcState: false,
  });

  // Audit log (fire-and-forget)
  void writeAuditLog({
    eventType: 'user.roles.assigned',
    eventCategory: 'admin',
    userId,
    actorId: assignedBy,
    metadata: { organizationId, roleIds: insertedRoleIds },
  });
}

/**
 * Remove roles from a user (bulk).
 *
 * Invalidates the user's RBAC cache since their effective permissions
 * may change.
 *
 * @param organizationId - Authoritative organization UUID
 * @param userId - User UUID
 * @param roleIds - Array of role UUIDs to remove
 * @param actorId - UUID of the admin performing the action
 * @returns Whether the actor must authenticate again
 */
export async function removeRolesFromUser(
  organizationId: string,
  userId: string,
  roleIds: string[],
  actorId: string,
): Promise<{ reauthenticationRequired: boolean }> {
  if (roleIds.length === 0) return { reauthenticationRequired: false };
  const transaction = getDatabaseTransactionClient();
  if (!transaction) {
    throw new Error('User role removal requires an active database transaction');
  }
  const targets = await requireUserRoleTargets(organizationId, userId, roleIds);
  if (targets.assignedRoleIds.length === 0) return { reauthenticationRequired: false };

  const removesExactSuperAdmin = targets.roles.some(
    (role) =>
      targets.assignedRoleIds.includes(role.id) &&
      role.applicationId === targets.adminApplicationId &&
      role.slug === ADMIN_ROLE_DEFINITIONS.SUPER_ADMIN.slug,
  );
  if (targets.user.status === 'active' && removesExactSuperAdmin) {
    await requireActiveSuperAdminSurvivor(organizationId, userId);
  }

  const revoked = await revokeAffectedAuthorityInTransaction([userId]);
  const removedRoleIds = await repoRemoveRoles(organizationId, userId, [
    ...targets.assignedRoleIds,
  ]);
  await writeAuditLogInTransaction(transaction, {
    eventType: 'user.roles.removed',
    eventCategory: 'admin',
    userId,
    actorId,
    metadata: { organizationId, roleIds: removedRoleIds },
  });
  await registerAuthorityCleanup({
    userIds: [userId],
    grantIds: revoked.grantIds,
    roleIds: [],
    revokeOidcState: true,
  });
  return { reauthenticationRequired: actorId === userId };
}

// ---------------------------------------------------------------------------
// Query operations
// ---------------------------------------------------------------------------

/**
 * Get all roles assigned to a user.
 *
 * @param organizationId - Authoritative organization UUID
 * @param userId - User UUID
 * @returns Array of Role objects
 */
export async function getUserRoles(organizationId: string, userId: string): Promise<Role[]> {
  return getRolesForOrganizationUser(organizationId, userId);
}

/** Read all roles for internal authority resolution without a route parent. */
export async function getUserRolesForAuthority(userId: string): Promise<Role[]> {
  return repoGetRolesForUser(userId);
}

/**
 * Get all permissions for a user (resolved through roles).
 *
 * @param organizationId - Authoritative organization UUID
 * @param userId - User UUID
 * @returns Deduplicated array of Permission objects
 */
export async function getUserPermissions(
  organizationId: string,
  userId: string,
): Promise<Permission[]> {
  return getPermissionsForOrganizationUser(organizationId, userId);
}

/**
 * List users with a specific role within an organization.
 *
 * Supports pagination for admin UI views.
 *
 * @param applicationId - Authoritative application UUID
 * @param roleId - Role UUID
 * @param orgId - Organization UUID
 * @param options - Pagination options
 * @returns Paginated user-role assignments and total count
 */
export async function getUsersWithRole(
  applicationId: string,
  roleId: string,
  orgId: string,
  options?: { page?: number; pageSize?: number },
): Promise<{ rows: UserRole[]; total: number }> {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 20;

  return repoGetUsersWithRole(applicationId, roleId, orgId, page, pageSize);
}

/** Locked and validated targets used by one user-role mutation. */
interface ValidatedUserRoleTargets {
  readonly user: { readonly id: string; readonly status: string };
  readonly roles: readonly Role[];
  readonly assignedRoleIds: readonly string[];
  readonly adminApplicationId: string | null;
}

/** Lock the target user and every requested role, then reject missing records. */
async function requireUserRoleTargets(
  organizationId: string,
  userId: string,
  roleIds: readonly string[],
): Promise<ValidatedUserRoleTargets> {
  const requestedRoleIds = [...new Set(roleIds)].sort();
  const targets = await lockUserRoleTargets(organizationId, userId, requestedRoleIds);
  if (!targets.user) throw new UserNotFoundError(userId);
  if (targets.roles.length !== requestedRoleIds.length) {
    const found = new Set(targets.roles.map((role) => role.id));
    const missing = requestedRoleIds.find((roleId) => !found.has(roleId));
    throw new RoleNotFoundError(missing ?? 'requested role');
  }
  const adminApplication = await getApplicationBySlug(ADMIN_APPLICATION_SLUG);
  return {
    user: targets.user,
    roles: targets.roles,
    assignedRoleIds: targets.assignedRoleIds,
    adminApplicationId: adminApplication?.id ?? null,
  };
}

/** Enforce the static capability ceiling for canonical Admin role assignments. */
async function requireDelegableRoles(
  roles: readonly Role[],
  actorId: string,
  adminApplicationId: string | null,
): Promise<void> {
  if (adminApplicationId === null) return;
  const requestedCapabilities = roles
    .filter((role) => role.applicationId === adminApplicationId)
    .flatMap((role) => getPermissionsForAdminRole(role.slug));
  if (requestedCapabilities.length === 0) return;

  const actorRoles = await repoGetRolesForUser(actorId, adminApplicationId);
  const actorCapabilities = new Set(
    resolvePermissionsFromRoles(actorRoles.map((role) => role.slug)),
  );
  if (requestedCapabilities.some((capability) => !actorCapabilities.has(capability))) {
    throw new RoleDelegationError();
  }
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
 * @param applicationId - Application UUID that owns the requested token authority
 * @returns Array of role slug strings
 */
export async function buildRoleClaims(userId: string, applicationId: string): Promise<string[]> {
  const roles = await repoGetRolesForUser(userId, applicationId);
  return roles.map((role) => role.slug);
}

/**
 * Build permission claims for a user's token.
 *
 * Returns an array of permission slugs (e.g., ["crm:contacts:read",
 * "crm:deals:write"]) for inclusion in the token's custom claims.
 *
 * @param userId - User UUID
 * @param applicationId - Application UUID that owns the requested token authority
 * @returns Array of permission slug strings
 */
export async function buildPermissionClaims(
  userId: string,
  applicationId: string,
): Promise<string[]> {
  const permissions = await repoGetPermissionsForUser(userId, applicationId);
  return permissions.map((permission) => permission.slug);
}
