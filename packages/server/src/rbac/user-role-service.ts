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
import { auditFields, writeAuditLogInTransaction } from '../lib/audit-log.js';
import type { AuditActor, AuditRequestContext } from '../lib/audit-log.js';
import type { Role, Permission, UserRole } from './types.js';
import { getDatabaseTransactionClient, runDatabaseTransaction } from '../lib/database.js';
import { registerAuthorityCleanup } from '../lib/deletion-cleanup.js';
import { revokeAffectedAuthorityInTransaction } from '../lib/authority-revocation.js';
import { getApplicationBySlug } from '../applications/service.js';
import {
  ADMIN_ROLE_DEFINITIONS,
  getPermissionsForAdminRole,
  resolvePermissionsFromRoles,
} from '../lib/admin-permissions.js';
import { RoleApplicationBoundaryError, RoleDelegationError, RoleNotFoundError } from './errors.js';
import { UserNotFoundError } from '../users/errors.js';
import {
  lockControlPlaneOrganization,
  requireActiveSuperAdminSurvivor,
} from '../users/repository.js';

const ADMIN_APPLICATION_SLUG = 'porta-admin';

/** Inputs for one user-role mutation. */
export interface UserRoleMutationOptions {
  /** Authoritative organization UUID. */
  readonly organizationId: string;
  /** Target user UUID. */
  readonly userId: string;
  /** Requested role UUIDs. */
  readonly roleIds: readonly string[];
  /** Audit actor requesting the mutation. */
  readonly actor: AuditActor;
  /** Tenant application boundary; absent for Admin and internal callers. */
  readonly allowedApplicationId?: string;
  /** Trusted request metadata for the audit row. */
  readonly auditContext?: AuditRequestContext;
}

/** Reject a system actor and enforce the tenant application boundary. */
function requireRoleActorBoundary(
  actor: AuditActor,
  targets: ValidatedUserRoleTargets,
  allowedApplicationId: string | undefined,
): void {
  if (actor.kind === 'system') throw new RoleDelegationError();
  if (!allowedApplicationId) return;
  for (const role of targets.roles) {
    if (
      role.applicationId !== allowedApplicationId ||
      role.applicationId === targets.adminApplicationId
    ) {
      throw new RoleApplicationBoundaryError();
    }
  }
}

// ---------------------------------------------------------------------------
// Assignment management
// ---------------------------------------------------------------------------

/**
 * Assign roles to a user (bulk).
 *
 * Uses ON CONFLICT DO NOTHING for idempotent assignment. The service owns
 * the transaction so the assignment and audit row commit together. Admin
 * callers keep the delegation ceiling; tenant service actors are bounded to
 * their application and write `assigned_by = NULL`.
 *
 * @param options - Organization, target user, roles, actor, and tenant boundary
 */
export async function assignRolesToUser(options: UserRoleMutationOptions): Promise<void> {
  const { organizationId, userId, roleIds, actor, allowedApplicationId, auditContext } = options;
  const requestedRoleIds = [...new Set(roleIds)];
  if (requestedRoleIds.length === 0) return;

  await runDatabaseTransaction(async () => {
    const targets = await requireUserRoleTargets(organizationId, userId, requestedRoleIds);
    requireRoleActorBoundary(actor, targets, allowedApplicationId);
    if (actor.kind === 'user' && !allowedApplicationId) {
      await requireDelegableRoles(targets.roles, actor.userId, targets.adminApplicationId);
    }

    const assignedBy = actor.kind === 'user' ? actor.userId : undefined;
    const insertedRoleIds = await repoAssignRoles(
      organizationId,
      userId,
      requestedRoleIds,
      assignedBy,
    );
    if (insertedRoleIds.length === 0) return;

    const transaction = getDatabaseTransactionClient();
    if (!transaction) throw new Error('User role assignment requires an active transaction');
    await writeAuditLogInTransaction(transaction, {
      organizationId,
      eventType: 'user.roles.assigned',
      eventCategory: 'admin',
      userId,
      ...auditFields(actor, auditContext),
      metadata: { organizationId, roleIds: insertedRoleIds },
    });
    await registerAuthorityCleanup({
      userIds: [userId],
      grantIds: [],
      roleIds: [],
      revokeOidcState: false,
    });
  });
}

/**
 * Remove roles from a user (bulk).
 *
 * Owns the transaction so the removal and audit row commit together.
 * Tenant service actors are bounded to their application; Admin user actors
 * keep the canonical survivor guard.
 *
 * @param options - Organization, target user, roles, actor, and tenant boundary
 * @returns Whether the actor must authenticate again
 */
export async function removeRolesFromUser(
  options: UserRoleMutationOptions,
): Promise<{ reauthenticationRequired: boolean }> {
  const { organizationId, userId, roleIds, actor, allowedApplicationId, auditContext } = options;
  if (roleIds.length === 0) return { reauthenticationRequired: false };

  return runDatabaseTransaction(async () => {
    await lockControlPlaneOrganization(organizationId);
    const targets = await requireUserRoleTargets(organizationId, userId, [...roleIds]);
    requireRoleActorBoundary(actor, targets, allowedApplicationId);
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
    const transaction = getDatabaseTransactionClient();
    if (!transaction) throw new Error('User role removal requires an active transaction');
    await writeAuditLogInTransaction(transaction, {
      organizationId,
      eventType: 'user.roles.removed',
      eventCategory: 'admin',
      userId,
      ...auditFields(actor, auditContext),
      metadata: { organizationId, roleIds: removedRoleIds },
    });
    await registerAuthorityCleanup({
      userIds: [userId],
      grantIds: revoked.grantIds,
      roleIds: [],
      revokeOidcState: true,
    });
    return {
      reauthenticationRequired: actor.kind === 'user' && actor.userId === userId,
    };
  });
}

// ---------------------------------------------------------------------------
// Query operations
// ---------------------------------------------------------------------------

/**
 * Get all roles assigned to a user.
 *
 * @param organizationId - Authoritative organization UUID
 * @param userId - User UUID
 * @param applicationId - Optional application filter; omit to return every application
 * @returns Array of Role objects
 */
export async function getUserRoles(
  organizationId: string,
  userId: string,
  applicationId?: string,
): Promise<Role[]> {
  return applicationId
    ? getRolesForOrganizationUser(organizationId, userId, applicationId)
    : getRolesForOrganizationUser(organizationId, userId);
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
 * @param applicationId - Optional application filter; omit to return every application
 * @returns Deduplicated array of Permission objects
 */
export async function getUserPermissions(
  organizationId: string,
  userId: string,
  applicationId?: string,
): Promise<Permission[]> {
  return applicationId
    ? getPermissionsForOrganizationUser(organizationId, userId, applicationId)
    : getPermissionsForOrganizationUser(organizationId, userId);
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
  return [...new Set(roles.map((role) => role.slug))];
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
  return [...new Set(permissions.map((permission) => permission.slug))];
}
