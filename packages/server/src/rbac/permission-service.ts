/**
 * Permission service — business logic for permission management.
 *
 * Orchestrates permission CRUD operations with slug format validation,
 * uniqueness checks, deletion guards, cache management, and audit logging.
 *
 * Permission slugs are application-defined claim values and are immutable after creation — only
 * name and description can be updated.
 *
 * All write operations follow the pattern:
 *   validate → DB operation → cache invalidate → audit log
 *
 * @see permission-repository.ts — Database operations
 * @see mapping-repository.ts — Role-permission lookups
 * @see cache.ts — Redis cache operations
 */

import {
  insertPermission,
  findPermissionById as repoFindPermissionById,
  lockPermissionById,
  lockPermissionModule,
  findPermissionBySlug as repoFindPermissionBySlug,
  updatePermission as repoUpdatePermission,
  capturePermissionForDeletion,
  deleteCapturedPermission,
  listPermissionsByApplication as repoListPermissionsByApplication,
  permissionSlugExists,
} from './permission-repository.js';
import { getRolesWithPermission as repoGetRolesWithPermission } from './mapping-repository.js';
import { normalizeRbacSlug, validatePermissionSlug } from './slugs.js';
import { PermissionNotFoundError, RbacValidationError } from './errors.js';
import { writeAuditLog } from '../lib/audit-log.js';
import type { Permission, Role, CreatePermissionInput, UpdatePermissionInput } from './types.js';
import { getDatabaseTransactionClient } from '../lib/database.js';
import { writeAuditLogInTransaction } from '../lib/audit-log.js';
import { registerDeletionCleanup } from '../lib/deletion-cleanup.js';
import { revokeAffectedAuthorityInTransaction } from '../lib/authority-revocation.js';
import { getApplicationBySlug } from '../applications/service.js';
import { ALL_ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';

const PERMISSION_DELETED_EVENT = 'permission.deleted';
const ADMIN_APPLICATION_SLUG = 'porta-admin';
const ADMIN_PERMISSION_SLUGS = new Set<string>(ALL_ADMIN_PERMISSIONS);

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a new permission for an application.
 *
 * Validates the exact claim value and ensures uniqueness within the application.
 *
 * @param input - Permission creation data
 * @param actorId - Optional UUID of the admin performing the action
 * @returns The newly created permission
 * @throws RbacValidationError if slug format is invalid or already exists
 */
export async function createPermission(
  input: CreatePermissionInput,
  actorId?: string,
): Promise<Permission> {
  const slug = normalizeRbacSlug(input.slug);
  if (!validatePermissionSlug(slug)) {
    throw new RbacValidationError(
      'Invalid permission slug. Must be 1-150 characters without control characters.',
    );
  }
  await guardCanonicalAdminPermission(input.applicationId, slug);
  if (input.moduleId) {
    if (!getDatabaseTransactionClient()) {
      throw new Error('Permission module validation requires an active database transaction');
    }
    if (!(await lockPermissionModule(input.applicationId, input.moduleId))) {
      throw new RbacValidationError('Permission module must belong to the selected application');
    }
  }

  // Check slug uniqueness within the application
  const exists = await permissionSlugExists(input.applicationId, slug);
  if (exists) {
    throw new RbacValidationError(`Permission slug "${slug}" already exists for this application.`);
  }

  // Insert the permission
  const permission = await insertPermission({ ...input, slug });

  // Audit log (fire-and-forget)
  void writeAuditLog({
    eventType: 'permission.created',
    eventCategory: 'admin',
    actorId,
    metadata: {
      permissionId: permission.id,
      applicationId: permission.applicationId,
      slug: permission.slug,
    },
  });

  return permission;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Find a permission by ID.
 *
 * @param applicationId - Parent application UUID
 * @param id - Permission UUID
 * @returns Permission or null if not found
 */
export async function findPermissionById(
  applicationId: string,
  id: string,
): Promise<Permission | null> {
  return repoFindPermissionById(applicationId, id);
}

/**
 * Find a permission by application ID and slug.
 *
 * @param applicationId - Application UUID
 * @param slug - Permission slug
 * @returns Permission or null if not found
 */
export async function findPermissionBySlug(
  applicationId: string,
  slug: string,
): Promise<Permission | null> {
  return repoFindPermissionBySlug(applicationId, slug);
}

/**
 * List permissions for an application, optionally filtered by module.
 *
 * @param applicationId - Application UUID
 * @param moduleId - Optional module UUID to filter by
 * @returns Array of permissions
 */
export async function listPermissionsByApplication(
  applicationId: string,
  moduleId?: string,
): Promise<Permission[]> {
  return repoListPermissionsByApplication(applicationId, moduleId);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Update a permission by ID (name and description only — slug is immutable).
 *
 * @param applicationId - Parent application UUID
 * @param id - Permission UUID
 * @param input - Fields to update (name, description only)
 * @param actorId - Optional UUID of the admin performing the action
 * @returns Updated permission
 * @throws PermissionNotFoundError if permission doesn't exist
 */
export async function updatePermission(
  applicationId: string,
  id: string,
  input: UpdatePermissionInput,
  actorId?: string,
): Promise<Permission> {
  if (!getDatabaseTransactionClient()) {
    throw new Error('Permission update requires an active database transaction');
  }
  const existing = await lockPermissionById(applicationId, id);
  if (!existing) {
    throw new PermissionNotFoundError(id);
  }
  await guardCanonicalAdminPermission(applicationId, existing.slug);

  const changed =
    (input.name !== undefined && input.name !== existing.name) ||
    (input.description !== undefined && input.description !== existing.description);
  if (!changed) return existing;

  // Perform the update (slug is not updatable at the repository level)
  const updated = await repoUpdatePermission(applicationId, id, input);

  // Audit log (fire-and-forget)
  void writeAuditLog({
    eventType: 'permission.updated',
    eventCategory: 'admin',
    actorId,
    metadata: { applicationId, permissionId: id, changes: input },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Delete a permission through its authoritative application parent.
 *
 * @param applicationId - Parent application UUID.
 * @param permissionId - Child permission UUID.
 * @param actorId - Actor identifier used for audit attribution when applicable.
 * @returns Whether the actor must authenticate again
 * @throws PermissionNotFoundError when the permission is absent from the requested boundary.
 */
export async function deletePermission(
  applicationId: string,
  permissionId: string,
  actorId?: string,
): Promise<{ reauthenticationRequired: boolean }> {
  const transaction = getDatabaseTransactionClient();
  if (!transaction) throw new Error('Permission deletion requires an active database transaction');
  const capture = await capturePermissionForDeletion(applicationId, permissionId);
  if (!capture) throw new PermissionNotFoundError(permissionId);
  await guardCanonicalAdminPermission(applicationId, capture.permission.slug);
  const revoked = await revokeAffectedAuthorityInTransaction(capture.userIds);
  await writeAuditLogInTransaction(transaction, {
    actorId,
    eventType: PERMISSION_DELETED_EVENT,
    eventCategory: 'admin',
    metadata: {
      applicationId,
      permissionId,
      slug: capture.permission.slug,
    },
  });
  await deleteCapturedPermission(applicationId, permissionId);
  await registerDeletionCleanup({
    resource: 'permission',
    targetId: permissionId,
    parentId: applicationId,
    userIds: capture.userIds,
    clientIds: [],
    publicClientIds: [],
    grantIds: revoked.grantIds,
    roleIds: capture.roleIds,
    permissionIds: [permissionId],
    claimIds: [],
    applicationIds: [applicationId],
  });
  return {
    reauthenticationRequired: actorId !== undefined && capture.userIds.includes(actorId),
  };
}

// ---------------------------------------------------------------------------
// Role lookups
// ---------------------------------------------------------------------------

/**
 * Get all roles that have a specific permission assigned.
 *
 * @param applicationId - Parent application UUID
 * @param permissionId - Permission UUID
 * @returns Array of roles with this permission
 */
export async function getRolesWithPermission(
  applicationId: string,
  permissionId: string,
): Promise<Role[]> {
  const permission = await repoFindPermissionById(applicationId, permissionId);
  if (!permission) throw new PermissionNotFoundError(permissionId);
  return repoGetRolesWithPermission(applicationId, permissionId);
}

/** Reject generic creation or mutation of canonical Porta Admin permissions. */
async function guardCanonicalAdminPermission(
  applicationId: string,
  permissionSlug: string,
): Promise<void> {
  if (!ADMIN_PERMISSION_SLUGS.has(permissionSlug)) return;
  const adminApplication = await getApplicationBySlug(ADMIN_APPLICATION_SLUG);
  if (adminApplication?.id === applicationId) {
    throw new RbacValidationError('Canonical Porta Admin permissions cannot be modified');
  }
}
