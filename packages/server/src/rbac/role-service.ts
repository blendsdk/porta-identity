/**
 * Role service — business logic for role management.
 *
 * Orchestrates application-scoped role CRUD and direct permission mappings.
 * Authority reductions revoke affected database state in the request transaction;
 * cache cleanup runs after commit. Canonical Porta Admin roles and mappings are
 * protected from generic mutation.
 *
 * @see role-repository.ts — Database operations
 * @see mapping-repository.ts — Role-permission join table operations
 * @see cache.ts — Redis cache operations
 */

import {
  insertRole,
  findRoleById as repoFindRoleById,
  lockRoleById,
  findRoleBySlug as repoFindRoleBySlug,
  updateRole as repoUpdateRole,
  captureRoleForDeletion,
  deleteCapturedRole,
  listRolesByApplication as repoListRolesByApplication,
  roleSlugExists,
} from './role-repository.js';
import {
  assignPermissionsToRole as repoAssignPermissions,
  removePermissionsFromRole as repoRemovePermissions,
  getPermissionsForRole as repoGetPermissionsForRole,
  getUserIdsForRole,
  lockRolePermissionTargets,
} from './mapping-repository.js';
import { getCachedRole, setCachedRole } from './cache.js';
import { generateRoleSlug, validateRoleSlug } from './slugs.js';
import { RoleNotFoundError, RbacValidationError } from './errors.js';
import { writeAuditLog } from '../lib/audit-log.js';
import type { Role, Permission, CreateRoleInput, UpdateRoleInput } from './types.js';
import { getDatabaseTransactionClient } from '../lib/database.js';
import { writeAuditLogInTransaction } from '../lib/audit-log.js';
import { registerAuthorityCleanup, registerDeletionCleanup } from '../lib/deletion-cleanup.js';
import { revokeAffectedAuthorityInTransaction } from '../lib/authority-revocation.js';
import { getApplicationBySlug } from '../applications/service.js';
import { ALL_ADMIN_ROLES } from '../lib/admin-permissions.js';

const ROLE_DELETED_EVENT = 'role.deleted';
const ADMIN_APPLICATION_SLUG = 'porta-admin';
const ADMIN_ROLE_SLUGS = new Set(ALL_ADMIN_ROLES.map((role) => role.slug));

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a new role for an application.
 *
 * Auto-generates a slug from the name if not explicitly provided.
 * Validates slug format and ensures uniqueness within the application.
 *
 * @param input - Role creation data
 * @param actorId - Optional UUID of the admin performing the action
 * @returns The newly created role
 * @throws RbacValidationError if slug is invalid or already exists
 */
export async function createRole(input: CreateRoleInput, actorId?: string): Promise<Role> {
  // Generate slug from name if not provided
  const slug = input.slug ?? generateRoleSlug(input.name);

  // Validate slug format
  if (!validateRoleSlug(slug)) {
    throw new RbacValidationError(
      `Invalid role slug format: "${slug}". Must be 1-100 chars, lowercase alphanumeric and hyphens.`,
    );
  }

  // Check slug uniqueness within the application
  const exists = await roleSlugExists(input.applicationId, slug);
  if (exists) {
    throw new RbacValidationError(`Role slug "${slug}" already exists for this application.`);
  }

  // Insert with the validated slug
  const role = await insertRole({ ...input, slug });

  // Cache the new role
  await setCachedRole(role);

  // Audit log (fire-and-forget)
  void writeAuditLog({
    eventType: 'role.created',
    eventCategory: 'admin',
    actorId,
    metadata: { roleId: role.id, applicationId: role.applicationId, slug: role.slug },
  });

  return role;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Find a role by ID. Cache-first, falls back to DB.
 *
 * @param applicationId - Parent application UUID
 * @param id - Role UUID
 * @returns Role or null if not found
 */
export async function findRoleById(applicationId: string, id: string): Promise<Role | null> {
  // Try cache first
  const cached = await getCachedRole(id);
  if (cached) return cached.applicationId === applicationId ? cached : null;

  // Cache miss — query DB
  const role = await repoFindRoleById(applicationId, id);
  if (role) {
    // Cache for future lookups
    await setCachedRole(role);
  }

  return role;
}

/**
 * Find a role by application ID and slug.
 *
 * @param applicationId - Application UUID
 * @param slug - Role slug
 * @returns Role or null if not found
 */
export async function findRoleBySlug(applicationId: string, slug: string): Promise<Role | null> {
  return repoFindRoleBySlug(applicationId, slug);
}

/**
 * List all roles for an application.
 *
 * @param applicationId - Application UUID
 * @returns Array of roles
 */
export async function listRolesByApplication(applicationId: string): Promise<Role[]> {
  return repoListRolesByApplication(applicationId);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Update a role by ID.
 *
 * If the slug is being changed, validates the new slug format and
 * checks uniqueness within the application. An actual slug change revokes
 * authority for users assigned to the role; metadata-only changes do not.
 *
 * @param applicationId - Parent application UUID
 * @param id - Role UUID
 * @param input - Fields to update
 * @param actorId - Optional UUID of the admin performing the action
 * @returns Updated role and whether the actor must authenticate again
 * @throws RoleNotFoundError if role doesn't exist
 * @throws RbacValidationError if new slug is invalid or already exists
 */
export async function updateRole(
  applicationId: string,
  id: string,
  input: UpdateRoleInput,
  actorId?: string,
): Promise<{ role: Role; reauthenticationRequired: boolean }> {
  const transaction = getDatabaseTransactionClient();
  if (!transaction) throw new Error('Role update requires an active database transaction');
  const existing = await lockRoleById(applicationId, id);
  if (!existing) {
    throw new RoleNotFoundError(id);
  }
  await guardCanonicalAdminRole(existing);

  const changed =
    (input.name !== undefined && input.name !== existing.name) ||
    (input.slug !== undefined && input.slug !== existing.slug) ||
    (input.description !== undefined && input.description !== existing.description);
  if (!changed) return { role: existing, reauthenticationRequired: false };

  // If slug is changing, validate format and uniqueness
  const requestedSlug = input.slug;
  const slugChanged = requestedSlug !== undefined && requestedSlug !== existing.slug;
  if (slugChanged) {
    if (!validateRoleSlug(requestedSlug)) {
      throw new RbacValidationError(
        `Invalid role slug format: "${requestedSlug}". Must be 1-100 chars, lowercase alphanumeric and hyphens.`,
      );
    }

    const slugTaken = await roleSlugExists(applicationId, requestedSlug, id);
    if (slugTaken) {
      throw new RbacValidationError(
        `Role slug "${requestedSlug}" already exists for this application.`,
      );
    }
  }

  const userIds = slugChanged ? await getUserIdsForRole(applicationId, id) : [];
  const revoked = slugChanged
    ? await revokeAffectedAuthorityInTransaction(userIds)
    : { grantIds: [] };
  const updated = await repoUpdateRole(applicationId, id, input);

  if (slugChanged) {
    await writeAuditLogInTransaction(transaction, {
      eventType: 'role.updated',
      eventCategory: 'admin',
      actorId,
      metadata: { applicationId, roleId: id, changes: input },
    });
  } else {
    void writeAuditLog({
      eventType: 'role.updated',
      eventCategory: 'admin',
      actorId,
      metadata: { applicationId, roleId: id, changes: input },
    });
  }
  await registerAuthorityCleanup({
    userIds,
    grantIds: revoked.grantIds,
    roleIds: [id],
    revokeOidcState: slugChanged,
  });

  return {
    role: updated,
    reauthenticationRequired: slugChanged && actorId !== undefined && userIds.includes(actorId),
  };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Delete a role through its authoritative application parent.
 *
 * @param applicationId - Parent application UUID.
 * @param roleId - Child role UUID.
 * @param actorId - Actor identifier used for audit attribution when applicable.
 * @returns Whether the actor must authenticate again
 * @throws RoleNotFoundError when the selected role does not exist within the requested boundary.
 */
export async function deleteRole(
  applicationId: string,
  roleId: string,
  actorId?: string,
): Promise<{ reauthenticationRequired: boolean }> {
  const transaction = getDatabaseTransactionClient();
  if (!transaction) throw new Error('Role deletion requires an active database transaction');
  const capture = await captureRoleForDeletion(applicationId, roleId);
  if (!capture) throw new RoleNotFoundError(roleId);
  await guardCanonicalAdminRole(capture.role);
  const revoked = await revokeAffectedAuthorityInTransaction(capture.userIds);
  await writeAuditLogInTransaction(transaction, {
    actorId,
    eventType: ROLE_DELETED_EVENT,
    eventCategory: 'admin',
    metadata: {
      applicationId,
      roleId,
      slug: capture.role.slug,
    },
  });
  await deleteCapturedRole(applicationId, roleId);
  await registerDeletionCleanup({
    resource: 'role',
    targetId: roleId,
    parentId: applicationId,
    userIds: capture.userIds,
    clientIds: [],
    publicClientIds: [],
    grantIds: revoked.grantIds,
    roleIds: [roleId],
    permissionIds: capture.permissionIds,
    claimIds: [],
    applicationIds: [applicationId],
  });
  return {
    reauthenticationRequired: actorId !== undefined && capture.userIds.includes(actorId),
  };
}

// ---------------------------------------------------------------------------
// Role-Permission management
// ---------------------------------------------------------------------------

/**
 * Assign permissions to a role.
 *
 * Validates every permission against the role's application and schedules
 * cache invalidation only for users assigned to the role.
 *
 * @param applicationId - Parent application UUID
 * @param roleId - Role UUID
 * @param permissionIds - Array of permission UUIDs to assign
 * @param actorId - Optional UUID of the admin performing the action
 */
export async function assignPermissionsToRole(
  applicationId: string,
  roleId: string,
  permissionIds: string[],
  actorId?: string,
): Promise<void> {
  if (permissionIds.length === 0) return;
  if (!getDatabaseTransactionClient()) {
    throw new Error('Role permission assignment requires an active database transaction');
  }

  const targets = await requireRolePermissionTargets(applicationId, roleId, permissionIds);
  await guardCanonicalAdminRole(targets.role);
  const insertedPermissionIds = await repoAssignPermissions(applicationId, roleId, permissionIds);
  if (insertedPermissionIds.length === 0) return;
  const userIds = await getUserIdsForRole(applicationId, roleId);
  await registerAuthorityCleanup({
    userIds,
    grantIds: [],
    roleIds: [],
    revokeOidcState: false,
  });

  // Audit log (fire-and-forget)
  void writeAuditLog({
    eventType: 'role.permissions.assigned',
    eventCategory: 'admin',
    actorId,
    metadata: { applicationId, roleId, permissionIds: insertedPermissionIds },
  });
}

/**
 * Remove permissions from a role.
 *
 * Validates every permission against the role's application. An actual
 * removal revokes affected authority; an absent mapping is a committed no-op.
 *
 * @param applicationId - Parent application UUID
 * @param roleId - Role UUID
 * @param permissionIds - Array of permission UUIDs to remove
 * @param actorId - Optional UUID of the admin performing the action
 */
export async function removePermissionsFromRole(
  applicationId: string,
  roleId: string,
  permissionIds: string[],
  actorId?: string,
): Promise<{ reauthenticationRequired: boolean }> {
  if (permissionIds.length === 0) return { reauthenticationRequired: false };
  const transaction = getDatabaseTransactionClient();
  if (!transaction) {
    throw new Error('Role permission removal requires an active database transaction');
  }
  const targets = await requireRolePermissionTargets(applicationId, roleId, permissionIds);
  await guardCanonicalAdminRole(targets.role);
  if (targets.assignedPermissionIds.length === 0) {
    return { reauthenticationRequired: false };
  }
  const userIds = await getUserIdsForRole(applicationId, roleId);
  const revoked = await revokeAffectedAuthorityInTransaction(userIds);
  const removedPermissionIds = await repoRemovePermissions(applicationId, roleId, [
    ...targets.assignedPermissionIds,
  ]);
  await writeAuditLogInTransaction(transaction, {
    eventType: 'role.permissions.removed',
    eventCategory: 'admin',
    actorId,
    metadata: { applicationId, roleId, permissionIds: removedPermissionIds },
  });
  await registerAuthorityCleanup({
    userIds,
    grantIds: revoked.grantIds,
    roleIds: [],
    revokeOidcState: true,
  });
  return {
    reauthenticationRequired: actorId !== undefined && userIds.includes(actorId),
  };
}

/**
 * Get all permissions assigned to a role.
 *
 * @param applicationId - Parent application UUID
 * @param roleId - Role UUID
 * @returns Array of permissions
 */
export async function getPermissionsForRole(
  applicationId: string,
  roleId: string,
): Promise<Permission[]> {
  const role = await repoFindRoleById(applicationId, roleId);
  if (!role) throw new RoleNotFoundError(roleId);
  return repoGetPermissionsForRole(applicationId, roleId);
}

/** Reject generic mutations of canonical Porta Admin role definitions and mappings. */
async function guardCanonicalAdminRole(role: Role): Promise<void> {
  if (!ADMIN_ROLE_SLUGS.has(role.slug)) return;
  const adminApplication = await getApplicationBySlug(ADMIN_APPLICATION_SLUG);
  if (adminApplication?.id === role.applicationId) {
    throw new RbacValidationError('Canonical Porta Admin roles cannot be modified');
  }
}

/** Lock and validate every target in one application-scoped mapping request. */
async function requireRolePermissionTargets(
  applicationId: string,
  roleId: string,
  permissionIds: readonly string[],
): Promise<{ role: Role; assignedPermissionIds: readonly string[] }> {
  const requestedPermissionIds = [...new Set(permissionIds)].sort();
  const targets = await lockRolePermissionTargets(applicationId, roleId, requestedPermissionIds);
  if (!targets.role) throw new RoleNotFoundError(roleId);
  if (targets.permissions.length !== requestedPermissionIds.length) {
    throw new RbacValidationError('Every permission must belong to the selected application');
  }
  return {
    role: targets.role,
    assignedPermissionIds: targets.assignedPermissionIds,
  };
}
