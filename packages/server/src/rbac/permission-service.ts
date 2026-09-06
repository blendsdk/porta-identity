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
 * Delete a permission using either the current force-aware call or a parent-qualified call.
 *
 * The ID/force form preserves the mounted API behavior, including cache invalidation and audit.
 * The application/permission form captures authority before applying the physical cascade.
 *
 * @param applicationIdOrId - Parent application UUID, or permission UUID for the force-aware call.
 * @param permissionIdOrForce - Child permission UUID, or force flag for the force-aware call.
 * @param actorId - Actor identifier used for audit attribution when applicable.
 * @returns Nothing for the force-aware call, otherwise the captured authority identifiers.
 * @throws PermissionNotFoundError when the permission is absent from the requested boundary.
 */
export function deletePermission(id: string, force?: boolean, actorId?: string): Promise<void>;
export function deletePermission(
  applicationId: string,
  permissionId: string,
  actorId?: string,
): Promise<{ permission: Permission; userIds: string[]; roleIds: string[]; grantIds: string[] }>;
export async function deletePermission(
  applicationIdOrId: string,
  permissionIdOrForce: string | boolean = false,
  actorId?: string,
): Promise<
  void | { permission: Permission; userIds: string[]; roleIds: string[]; grantIds: string[] }
> {
  if (typeof permissionIdOrForce === 'boolean') {
    const existing = await repoFindPermissionById(applicationIdOrId);
    if (!existing) throw new PermissionNotFoundError(applicationIdOrId);
    if (!permissionIdOrForce) {
      const roleCount = await countRolesWithPermission(applicationIdOrId);
      if (roleCount > 0) {
        throw new RbacValidationError(
          `Cannot delete permission "${existing.slug}": assigned to ${roleCount} role(s). Use force=true to override.`,
        );
      }
    }
    await repoDeletePermission(applicationIdOrId);
    if (permissionIdOrForce) await invalidateAllUserRbacCaches();
    void writeAuditLog({
      eventType: 'permission.deleted',
      eventCategory: 'admin',
      actorId,
      metadata: {
        permissionId: applicationIdOrId,
        slug: existing.slug,
        force: permissionIdOrForce,
      },
    });
    return;
  }

  const capture = await repoDeletePermission(applicationIdOrId, permissionIdOrForce);
  const permissionId = permissionIdOrForce;
  if (!capture) throw new PermissionNotFoundError(permissionId);
  return capture;
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
