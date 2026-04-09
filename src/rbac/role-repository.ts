/**
 * Role repository — PostgreSQL data access layer.
 *
 * Provides CRUD operations for the `roles` table using parameterized
 * queries. Each function acquires the pool via `getPool()` and returns
 * mapped Role objects via `mapRowToRole()`.
 *
 * Roles are scoped to an application (application_id FK) with a unique
 * slug per application enforced by the DB constraint UNIQUE(application_id, slug).
 *
 * Key patterns:
 * - Dynamic UPDATE query builder for partial updates (name, slug, description)
 * - Simple list by application (no pagination — typically <100 roles per app)
 * - Slug existence check with optional excludeId for update scenarios
 * - User count for deletion guard (prevent deleting roles with assigned users)
 *
 * Database table: roles (see migration 006_roles_permissions.sql)
 */

import { getPool } from '../lib/database.js';
import type { Role, RoleRow, CreateRoleInput, UpdateRoleInput } from './types.js';
import { mapRowToRole } from './types.js';

// ---------------------------------------------------------------------------
// Insert
// ---------------------------------------------------------------------------

/**
 * Insert a new role into the database.
 *
 * Uses RETURNING * to get the full row back in a single round trip.
 * The (application_id, slug) pair must be unique (enforced by DB constraint).
 *
 * @param input - Role data to insert
 * @returns The newly created role
 * @throws If (application_id, slug) already exists (unique constraint violation)
 */
export async function insertRole(input: CreateRoleInput): Promise<Role> {
  const pool = getPool();

  const result = await pool.query<RoleRow>(
    `INSERT INTO roles (application_id, name, slug, description)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      input.applicationId,
      input.name,
      input.slug ?? null,
      input.description ?? null,
    ],
  );

  return mapRowToRole(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Find
// ---------------------------------------------------------------------------

/**
 * Find a role by its UUID.
 *
 * @param id - Role UUID
 * @returns Role or null if not found
 */
export async function findRoleById(id: string): Promise<Role | null> {
  const pool = getPool();

  const result = await pool.query<RoleRow>(
    'SELECT * FROM roles WHERE id = $1',
    [id],
  );

  if (result.rows.length === 0) return null;
  return mapRowToRole(result.rows[0]);
}

/**
 * Find a role by application ID and slug.
 *
 * @param applicationId - Application UUID
 * @param slug - Role slug (unique within application)
 * @returns Role or null if not found
 */
export async function findRoleBySlug(applicationId: string, slug: string): Promise<Role | null> {
  const pool = getPool();

  const result = await pool.query<RoleRow>(
    'SELECT * FROM roles WHERE application_id = $1 AND slug = $2',
    [applicationId, slug],
  );

  if (result.rows.length === 0) return null;
  return mapRowToRole(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Mapping from UpdateRoleInput keys to database column names.
 * Used by the dynamic query builder to construct SET clauses.
 */
const FIELD_TO_COLUMN: Record<string, string> = {
  name: 'name',
  slug: 'slug',
  description: 'description',
};

/**
 * Update a role's fields using a dynamic SET clause.
 *
 * Only explicitly provided fields (not undefined) are included in the
 * UPDATE statement. This allows partial updates without overwriting
 * fields that weren't specified. Null is a valid value for description
 * (clears it).
 *
 * @param id - Role UUID
 * @param input - Fields to update (only non-undefined fields are applied)
 * @returns Updated role
 * @throws Error if role not found or no fields provided
 */
export async function updateRole(id: string, input: UpdateRoleInput): Promise<Role> {
  const pool = getPool();

  // Build dynamic SET clause from provided fields
  const setClauses: string[] = [];
  const values: unknown[] = [id]; // $1 is always the ID
  let paramIndex = 2;

  for (const [field, column] of Object.entries(FIELD_TO_COLUMN)) {
    const value = input[field as keyof UpdateRoleInput];
    // Include the field if it's explicitly set (including null for clearing)
    if (value !== undefined) {
      setClauses.push(`${column} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    throw new Error('No fields to update');
  }

  const sql = `UPDATE roles SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`;
  const result = await pool.query<RoleRow>(sql, values);

  if (result.rows.length === 0) {
    throw new Error('Role not found');
  }

  return mapRowToRole(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Delete a role by ID.
 *
 * Returns true if a row was deleted, false if the role didn't exist.
 * CASCADE constraints will automatically remove related role_permissions
 * and user_roles entries.
 *
 * @param id - Role UUID
 * @returns true if deleted, false if not found
 */
export async function deleteRole(id: string): Promise<boolean> {
  const pool = getPool();

  const result = await pool.query(
    'DELETE FROM roles WHERE id = $1',
    [id],
  );

  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * List all roles for an application, ordered by name ascending.
 *
 * Returns a simple array (no pagination) since applications typically
 * have a manageable number of roles (<100).
 *
 * @param applicationId - Application UUID
 * @returns Array of roles for the application
 */
export async function listRolesByApplication(applicationId: string): Promise<Role[]> {
  const pool = getPool();

  const result = await pool.query<RoleRow>(
    'SELECT * FROM roles WHERE application_id = $1 ORDER BY name ASC',
    [applicationId],
  );

  return result.rows.map(mapRowToRole);
}

// ---------------------------------------------------------------------------
// Slug existence check
// ---------------------------------------------------------------------------

/**
 * Check if a role slug already exists for a given application.
 *
 * Used for uniqueness validation before insert or update. The optional
 * excludeId parameter allows excluding a specific role (for updates —
 * a role's own current slug should not block the update).
 *
 * @param applicationId - Application UUID
 * @param slug - Slug to check
 * @param excludeId - Optional role ID to exclude from the check
 * @returns true if the slug already exists
 */
export async function roleSlugExists(
  applicationId: string,
  slug: string,
  excludeId?: string,
): Promise<boolean> {
  const pool = getPool();

  if (excludeId) {
    const result = await pool.query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM roles WHERE application_id = $1 AND slug = $2 AND id != $3) as exists',
      [applicationId, slug, excludeId],
    );
    return result.rows[0].exists;
  }

  const result = await pool.query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM roles WHERE application_id = $1 AND slug = $2) as exists',
    [applicationId, slug],
  );
  return result.rows[0].exists;
}

// ---------------------------------------------------------------------------
// User count (deletion guard)
// ---------------------------------------------------------------------------

/**
 * Count users assigned to a role.
 *
 * Used by the service layer as a deletion guard: if users are assigned,
 * the role cannot be deleted without force=true.
 *
 * @param roleId - Role UUID
 * @returns Number of users with this role
 */
export async function countUsersWithRole(roleId: string): Promise<number> {
  const pool = getPool();

  const result = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::int as count FROM user_roles WHERE role_id = $1',
    [roleId],
  );

  return parseInt(result.rows[0].count, 10);
}
