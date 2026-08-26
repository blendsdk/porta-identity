/**
 * Role service — business logic for role management.
 *
 * Orchestrates role CRUD operations with slug validation, uniqueness
 * checks, deletion guards, cache management, and audit logging.
 * Also handles role-permission assignment operations.
 *
 * All write operations follow the pattern:
 *   validate → DB operation → cache invalidate/re-cache → audit log
 *
 * Uses fire-and-forget audit logging — audit failures never block
 * the primary operation.
 *
 * @see role-repository.ts — Database operations
 * @see mapping-repository.ts — Role-permission join table operations
 * @see cache.ts — Redis cache operations
 */

import {
  insertRole,
  findRoleById as repoFindRoleById,
  findRoleBySlug as repoFindRoleBySlug,
  updateRole as repoUpdateRole,
  deleteRole as repoDeleteRole,
  listRolesByApplication as repoListRolesByApplication,
  roleSlugExists,
  countUsersWithRole,
} from './role-repository.js';
import {
  assignPermissionsToRole as repoAssignPermissions,
  removePermissionsFromRole as repoRemovePermissions,
  getPermissionsForRole as repoGetPermissionsForRole,
} from './mapping-repository.js';
import {
  getCachedRole,
  setCachedRole,
  invalidateRoleCache,
  invalidateAllUserRbacCaches,
} from './cache.js';
import { generateRoleSlug, validateRoleSlug } from './slugs.js';
import { RoleNotFoundError, RbacValidationError } from './errors.js';
import { writeAuditLog } from '../lib/audit-log.js';
import type { Role, Permission, CreateRoleInput, UpdateRoleInput } from './types.js';

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
    throw new RbacValidationError(
      `Role slug "${slug}" already exists for this application.`,
    );
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
 * @param id - Role UUID
 * @returns Role or null if not found
 */
export async function findRoleById(id: string): Promise<Role | null> {
  // Try cache first
  const cached = await getCachedRole(id);
  if (cached) return cached;

  // Cache miss — query DB
  const role = await repoFindRoleById(id);
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
 * checks uniqueness within the application. Invalidates and re-caches
 * the role after update.
 *
 * @param id - Role UUID
 * @param input - Fields to update
 * @param actorId - Optional UUID of the admin performing the action
 * @returns Updated role
 * @throws RoleNotFoundError if role doesn't exist
 * @throws RbacValidationError if new slug is invalid or already exists
 */
export async function updateRole(
  id: string,
  input: UpdateRoleInput,
  actorId?: string,
): Promise<Role> {
  // Verify role exists (needed for applicationId if slug is changing)
  const existing = await repoFindRoleById(id);
  if (!existing) {
    throw new RoleNotFoundError(id);
  }

  // If slug is changing, validate format and uniqueness
  if (input.slug !== undefined && input.slug !== existing.slug) {
    if (!validateRoleSlug(input.slug)) {
      throw new RbacValidationError(
        `Invalid role slug format: "${input.slug}". Must be 1-100 chars, lowercase alphanumeric and hyphens.`,
      );
    }

    const slugTaken = await roleSlugExists(existing.applicationId, input.slug, id);
    if (slugTaken) {
      throw new RbacValidationError(
        `Role slug "${input.slug}" already exists for this application.`,
      );
    }
  }

  // Perform the update
  const updated = await repoUpdateRole(id, input);

  // Invalidate old cache and store updated role
  await invalidateRoleCache(id);
  await setCachedRole(updated);

  // Audit log (fire-and-forget)
  void writeAuditLog({
    eventType: 'role.updated',
    eventCategory: 'admin',
    actorId,
    metadata: { roleId: id, changes: input },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Delete a role by ID.
 *
 * By default (force=false), refuses to delete roles that have users
 * assigned. Pass force=true to delete regardless — CASCADE will
 * remove user_roles and role_permissions entries.
 *
 * @param id - Role UUID
 * @param force - If true, delete even if users are assigned
 * @param actorId - Optional UUID of the admin performing the action
 * @throws RoleNotFoundError if role doesn't exist
 * @throws RbacValidationError if users are assigned and force is false
 */
export async function deleteRole(
  id: string,
  force: boolean = false,
  actorId?: string,
): Promise<void> {
  // Verify role exists
  const existing = await repoFindRoleById(id);
  if (!existing) {
    throw new RoleNotFoundError(id);
  }

  // Deletion guard: check for assigned users
  if (!force) {
    const userCount = await countUsersWithRole(id);
    if (userCount > 0) {
      throw new RbacValidationError(
        `Cannot delete role "${existing.slug}": ${userCount} user(s) still assigned. Use force=true to override.`,
      );
    }
  }

  // Delete the role (CASCADE handles related records)
  await repoDeleteRole(id);

  // Invalidate caches
  await invalidateRoleCache(id);
  // User caches may be stale if role had users (force=true case)
  if (force) {
    await invalidateAllUserRbacCaches();
  }

  // Audit log (fire-and-forget)
  void writeAuditLog({
    eventType: 'role.deleted',
    eventCategory: 'admin',
    actorId,
    metadata: { roleId: id, slug: existing.slug, force },
  });
}

// ---------------------------------------------------------------------------
// Role-Permission management
// ---------------------------------------------------------------------------

/**
 * Assign permissions to a role.
 *
 * Delegates to the mapping repository for bulk insert. Invalidates
 * all user RBAC caches since user permissions may have changed.
 *
 * @param roleId - Role UUID
 * @param permissionIds - Array of permission UUIDs to assign
 * @param actorId - Optional UUID of the admin performing the action
 */
export async function assignPermissionsToRole(
  roleId: string,
  permissionIds: string[],
  actorId?: string,
): Promise<void> {
  if (permissionIds.length === 0) return;

  await repoAssignPermissions(roleId, permissionIds);

  // Invalidate all user RBAC caches — permissions through roles may have changed
  await invalidateAllUserRbacCaches();

  // Audit log (fire-and-forget)
  void writeAuditLog({
    eventType: 'role.permissions.assigned',
    eventCategory: 'admin',
    actorId,
    metadata: { roleId, permissionIds },
  });
}

/**
 * Remove permissions from a role.
 *
 * Delegates to the mapping repository. Invalidates all user RBAC
 * caches since user permissions may have changed.
 *
 * @param roleId - Role UUID
 * @param permissionIds - Array of permission UUIDs to remove
 * @param actorId - Optional UUID of the admin performing the action
 */
export async function removePermissionsFromRole(
  roleId: string,
  permissionIds: string[],
  actorId?: string,
): Promise<void> {
  if (permissionIds.length === 0) return;

  await repoRemovePermissions(roleId, permissionIds);

  // Invalidate all user RBAC caches
  await invalidateAllUserRbacCaches();

  // Audit log (fire-and-forget)
  void writeAuditLog({
    eventType: 'role.permissions.removed',
    eventCategory: 'admin',
    actorId,
    metadata: { roleId, permissionIds },
  });
}

/**
 * Get all permissions assigned to a role.
 *
 * @param roleId - Role UUID
 * @returns Array of permissions
 */
export async function getPermissionsForRole(roleId: string): Promise<Permission[]> {
  return repoGetPermissionsForRole(roleId);
}
