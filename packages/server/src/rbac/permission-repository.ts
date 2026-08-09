/**
 * Permission repository — PostgreSQL data access layer.
 *
 * Provides CRUD operations for the `permissions` table using parameterized
 * queries. Each function acquires the pool via `getPool()` and returns
 * mapped Permission objects via `mapRowToPermission()`.
 *
 * Permissions are scoped to an application (application_id FK) with a
 * unique slug per application enforced by DB constraint UNIQUE(application_id, slug).
 * Permissions may optionally be linked to an application module (module_id FK).
 *
 * Key patterns:
 * - Slug is immutable after creation (only name and description can be updated)
 * - List supports optional module filter for scoped permission views
 * - Role count for deletion guard (prevent deleting permissions assigned to roles)
 *
 * Database table: permissions (see migration 006_roles_permissions.sql)
 */

import { getPool } from '../lib/database.js';
import type { Permission, PermissionRow, CreatePermissionInput, UpdatePermissionInput } from './types.js';
import { mapRowToPermission } from './types.js';

// ---------------------------------------------------------------------------
// Insert
// ---------------------------------------------------------------------------

/**
 * Insert a new permission into the database.
 *
 * Uses RETURNING * to get the full row back in a single round trip.
 * The (application_id, slug) pair must be unique (enforced by DB constraint).
 *
 * @param input - Permission data to insert
 * @returns The newly created permission
 * @throws If (application_id, slug) already exists (unique constraint violation)
 */
export async function insertPermission(input: CreatePermissionInput): Promise<Permission> {
  const pool = getPool();

  const result = await pool.query<PermissionRow>(
    `INSERT INTO permissions (application_id, module_id, name, slug, description)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.applicationId,
      input.moduleId ?? null,
      input.name,
      input.slug,
      input.description ?? null,
    ],
  );

  return mapRowToPermission(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Find
// ---------------------------------------------------------------------------

/**
 * Find a permission by its UUID.
 *
 * @param id - Permission UUID
 * @returns Permission or null if not found
 */
export async function findPermissionById(id: string): Promise<Permission | null> {
  const pool = getPool();

  const result = await pool.query<PermissionRow>(
    'SELECT * FROM permissions WHERE id = $1',
    [id],
  );

  if (result.rows.length === 0) return null;
  return mapRowToPermission(result.rows[0]);
}

/**
 * Find a permission by application ID and slug.
 *
 * @param applicationId - Application UUID
 * @param slug - Permission slug (unique within application)
 * @returns Permission or null if not found
 */
export async function findPermissionBySlug(
  applicationId: string,
  slug: string,
): Promise<Permission | null> {
  const pool = getPool();

  const result = await pool.query<PermissionRow>(
    'SELECT * FROM permissions WHERE application_id = $1 AND slug = $2',
    [applicationId, slug],
  );

  if (result.rows.length === 0) return null;
  return mapRowToPermission(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Update a permission by ID (name and description only — slug is immutable).
 *
 * Only explicitly provided fields (not undefined) are included in the
 * UPDATE statement. Null is a valid value for description (clears it).
 *
 * @param id - Permission UUID
 * @param input - Fields to update (name, description only)
 * @returns Updated permission
 * @throws Error if permission not found or no fields provided
 */
export async function updatePermission(
  id: string,
  input: UpdatePermissionInput,
): Promise<Permission> {
  const pool = getPool();

  // Build dynamic SET clause — only name and description are updatable
  const setClauses: string[] = [];
  const values: unknown[] = [id]; // $1 is always the ID
  let paramIndex = 2;

  if (input.name !== undefined) {
    setClauses.push(`name = $${paramIndex}`);
    values.push(input.name);
    paramIndex++;
  }

  if (input.description !== undefined) {
    setClauses.push(`description = $${paramIndex}`);
    values.push(input.description);
  }

  if (setClauses.length === 0) {
    throw new Error('No fields to update');
  }

  const sql = `UPDATE permissions SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`;
  const result = await pool.query<PermissionRow>(sql, values);

  if (result.rows.length === 0) {
    throw new Error('Permission not found');
  }

  return mapRowToPermission(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Delete a permission by ID.
 *
 * Returns true if a row was deleted, false if the permission didn't exist.
 * CASCADE constraints will automatically remove related role_permissions entries.
 *
 * @param id - Permission UUID
 * @returns true if deleted, false if not found
 */
export async function deletePermission(id: string): Promise<boolean> {
  const pool = getPool();

  const result = await pool.query(
    'DELETE FROM permissions WHERE id = $1',
    [id],
  );

  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * List permissions for an application, optionally filtered by module.
 *
 * Returns a simple array ordered by slug ascending. When moduleId is
 * provided, only permissions linked to that module are returned.
 *
 * @param applicationId - Application UUID
 * @param moduleId - Optional module UUID to filter by
 * @returns Array of permissions
 */
export async function listPermissionsByApplication(
  applicationId: string,
  moduleId?: string,
): Promise<Permission[]> {
  const pool = getPool();

  if (moduleId) {
    const result = await pool.query<PermissionRow>(
      'SELECT * FROM permissions WHERE application_id = $1 AND module_id = $2 ORDER BY slug ASC',
      [applicationId, moduleId],
    );
    return result.rows.map(mapRowToPermission);
  }

  const result = await pool.query<PermissionRow>(
    'SELECT * FROM permissions WHERE application_id = $1 ORDER BY slug ASC',
    [applicationId],
  );
  return result.rows.map(mapRowToPermission);
}

// ---------------------------------------------------------------------------
// Slug existence check
// ---------------------------------------------------------------------------

/**
 * Check if a permission slug already exists for a given application.
 *
 * Used for uniqueness validation before insert. Permission slugs are
 * immutable, so no excludeId parameter is needed (unlike roles).
 *
 * @param applicationId - Application UUID
 * @param slug - Slug to check
 * @returns true if the slug already exists
 */
export async function permissionSlugExists(
  applicationId: string,
  slug: string,
): Promise<boolean> {
  const pool = getPool();

  const result = await pool.query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM permissions WHERE application_id = $1 AND slug = $2) as exists',
    [applicationId, slug],
  );
  return result.rows[0].exists;
}

// ---------------------------------------------------------------------------
// Role count (deletion guard)
// ---------------------------------------------------------------------------

/**
 * Count roles that have a specific permission assigned.
 *
 * Used by the service layer as a deletion guard: if roles have this
 * permission, it cannot be deleted without force=true.
 *
 * @param permissionId - Permission UUID
 * @returns Number of roles with this permission
 */
export async function countRolesWithPermission(permissionId: string): Promise<number> {
  const pool = getPool();

  const result = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::int as count FROM role_permissions WHERE permission_id = $1',
    [permissionId],
  );

  return parseInt(result.rows[0].count, 10);
}
