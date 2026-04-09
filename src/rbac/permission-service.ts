/**
 * Permission service — business logic for permission management.
 *
 * Orchestrates permission CRUD operations with slug format validation,
 * uniqueness checks, deletion guards, cache management, and audit logging.
 *
 * Permission slugs follow the module:resource:action format (e.g.,
 * "crm:contacts:read") and are immutable after creation — only name
 * and description can be updated.
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
  findPermissionBySlug as repoFindPermissionBySlug,
  updatePermission as repoUpdatePermission,
  deletePermission as repoDeletePermission,
  listPermissionsByApplication as repoListPermissionsByApplication,
  permissionSlugExists,
  countRolesWithPermission,
} from './permission-repository.js';
import { getRolesWithPermission as repoGetRolesWithPermission } from './mapping-repository.js';
import { invalidateAllUserRbacCaches } from './cache.js';
import { validatePermissionSlug } from './slugs.js';
import { PermissionNotFoundError, RbacValidationError } from './errors.js';
import { writeAuditLog } from '../lib/audit-log.js';
import type { Permission, Role, CreatePermissionInput, UpdatePermissionInput } from './types.js';

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a new permission for an application.
 *
 * Validates that the slug follows the module:resource:action format
 * and ensures uniqueness within the application.
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
  // Validate permission slug format (module:resource:action)
  if (!validatePermissionSlug(input.slug)) {
    throw new RbacValidationError(
      `Invalid permission slug format: "${input.slug}". Must follow module:resource:action pattern with at least 3 colon-separated segments.`,
    );
  }

  // Check slug uniqueness within the application
  const exists = await permissionSlugExists(input.applicationId, input.slug);
  if (exists) {
    throw new RbacValidationError(
      `Permission slug "${input.slug}" already exists for this application.`,
    );
  }

  // Insert the permission
  const permission = await insertPermission(input);

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
 * @param id - Permission UUID
 * @returns Permission or null if not found
 */
export async function findPermissionById(id: string): Promise<Permission | null> {
  return repoFindPermissionById(id);
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
 * @param id - Permission UUID
 * @param input - Fields to update (name, description only)
 * @param actorId - Optional UUID of the admin performing the action
 * @returns Updated permission
 * @throws PermissionNotFoundError if permission doesn't exist
 */
export async function updatePermission(
  id: string,
  input: UpdatePermissionInput,
  actorId?: string,
): Promise<Permission> {
  // Verify permission exists
  const existing = await repoFindPermissionById(id);
  if (!existing) {
    throw new PermissionNotFoundError(id);
  }

  // Perform the update (slug is not updatable at the repository level)
  const updated = await repoUpdatePermission(id, input);

  // Audit log (fire-and-forget)
  void writeAuditLog({
    eventType: 'permission.updated',
    eventCategory: 'admin',
    actorId,
    metadata: { permissionId: id, changes: input },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Delete a permission by ID.
 *
 * By default (force=false), refuses to delete permissions that are
 * assigned to any role. Pass force=true to delete regardless —
 * CASCADE will remove role_permissions entries.
 *
 * @param id - Permission UUID
 * @param force - If true, delete even if assigned to roles
 * @param actorId - Optional UUID of the admin performing the action
 * @throws PermissionNotFoundError if permission doesn't exist
 * @throws RbacValidationError if assigned to roles and force is false
 */
export async function deletePermission(
  id: string,
  force: boolean = false,
  actorId?: string,
): Promise<void> {
  // Verify permission exists
  const existing = await repoFindPermissionById(id);
  if (!existing) {
    throw new PermissionNotFoundError(id);
  }

  // Deletion guard: check for assigned roles
  if (!force) {
    const roleCount = await countRolesWithPermission(id);
    if (roleCount > 0) {
      throw new RbacValidationError(
        `Cannot delete permission "${existing.slug}": assigned to ${roleCount} role(s). Use force=true to override.`,
      );
    }
  }

  // Delete the permission (CASCADE handles related records)
  await repoDeletePermission(id);

  // Invalidate user caches — permissions may have changed for users who had this
  if (force) {
    await invalidateAllUserRbacCaches();
  }

  // Audit log (fire-and-forget)
  void writeAuditLog({
    eventType: 'permission.deleted',
    eventCategory: 'admin',
    actorId,
    metadata: { permissionId: id, slug: existing.slug, force },
  });
}

// ---------------------------------------------------------------------------
// Role lookups
// ---------------------------------------------------------------------------

/**
 * Get all roles that have a specific permission assigned.
 *
 * @param permissionId - Permission UUID
 * @returns Array of roles with this permission
 */
export async function getRolesWithPermission(permissionId: string): Promise<Role[]> {
  return repoGetRolesWithPermission(permissionId);
}
