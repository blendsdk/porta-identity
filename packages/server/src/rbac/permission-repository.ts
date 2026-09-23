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
import type {
  Permission,
  PermissionRow,
  CreatePermissionInput,
  UpdatePermissionInput,
} from './types.js';
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
 * Find a permission through its authoritative application parent.
 *
 * @param applicationId - Parent application UUID
 * @param id - Permission UUID
 * @returns Permission or null if not found
 */
export async function findPermissionById(
  applicationId: string,
  id: string,
): Promise<Permission | null> {
  const pool = getPool();

  const result = await pool.query<PermissionRow>(
    'SELECT * FROM permissions WHERE application_id = $1 AND id = $2',
    [applicationId, id],
  );

  if (result.rows.length === 0) return null;
  return mapRowToPermission(result.rows[0]);
}

/**
 * Lock and return a permission through its authoritative application parent.
 *
 * @param applicationId - Parent application UUID
 * @param id - Permission UUID
 * @returns Locked permission or null when the parent-child pair does not exist
 */
export async function lockPermissionById(
  applicationId: string,
  id: string,
): Promise<Permission | null> {
  const result = await getPool().query<PermissionRow>(
    `SELECT * FROM permissions
     WHERE application_id = $1 AND id = $2
     FOR UPDATE`,
    [applicationId, id],
  );
  return result.rows[0] ? mapRowToPermission(result.rows[0]) : null;
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
 * @param applicationId - Parent application UUID
 * @param id - Permission UUID
 * @param input - Fields to update (name, description only)
 * @returns Updated permission
 * @throws Error if permission not found or no fields provided
 */
export async function updatePermission(
  applicationId: string,
  id: string,
  input: UpdatePermissionInput,
): Promise<Permission> {
  const pool = getPool();

  // Build dynamic SET clause — only name and description are updatable
  const setClauses: string[] = [];
  const values: unknown[] = [applicationId, id];
  let paramIndex = 3;

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

  const sql = `UPDATE permissions SET ${setClauses.join(', ')}
    WHERE application_id = $1 AND id = $2 RETURNING *`;
  const result = await pool.query<PermissionRow>(sql, values);

  if (result.rows.length === 0) {
    throw new Error('Permission not found');
  }

  return mapRowToPermission(result.rows[0]);
}

/**
 * Check whether a module belongs to an application before permission creation.
 *
 * The parent predicate prevents a globally valid module UUID from being attached
 * to a permission owned by another application.
 *
 * @param applicationId - Parent application UUID
 * @param moduleId - Module UUID supplied by the permission request
 * @returns True when the module exists beneath the application
 */
export async function lockPermissionModule(
  applicationId: string,
  moduleId: string,
): Promise<boolean> {
  const result = await getPool().query<{ id: string }>(
    `SELECT id FROM application_modules
     WHERE application_id = $1 AND id = $2
     FOR KEY SHARE`,
    [applicationId, moduleId],
  );
  return result.rows.length === 1;
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/** Lock, capture, and delete a permission through its authoritative application parent. */
export async function deletePermission(
  applicationId: string,
  permissionId: string,
): Promise<{
  permission: Permission;
  userIds: string[];
  roleIds: string[];
  grantIds: string[];
} | null> {
  const capture = await capturePermissionForDeletion(applicationId, permissionId);
  if (!capture) return null;
  await deleteCapturedPermission(applicationId, permissionId);
  return capture;
}

/** Lock and capture a permission without deleting it. */
export async function capturePermissionForDeletion(
  applicationId: string,
  permissionId: string,
): Promise<{
  permission: Permission;
  userIds: string[];
  roleIds: string[];
  grantIds: string[];
} | null> {
  const pool = getPool();
  const target = await pool.query<PermissionRow>(
    `SELECT * FROM permissions WHERE application_id = $1 AND id = $2 FOR UPDATE`,
    [applicationId, permissionId],
  );
  if (!target.rows[0]) return null;
  await pool.query(
    `SELECT role.id
     FROM roles role
     JOIN role_permissions mapping ON mapping.role_id = role.id
     WHERE mapping.permission_id = $1
       AND role.application_id = $2
     ORDER BY role.id
     FOR UPDATE OF role`,
    [permissionId, applicationId],
  );
  const graph = await pool.query<{
    user_ids: string[];
    role_ids: string[];
    grant_ids: string[];
  }>(
    `WITH affected_roles AS (
       SELECT mapping.role_id
       FROM role_permissions mapping
       JOIN roles role ON role.id = mapping.role_id
       WHERE mapping.permission_id = $1
         AND role.application_id = $2
     ), affected_users AS (
       SELECT DISTINCT assignment.user_id FROM user_roles assignment
       WHERE assignment.role_id = ANY(ARRAY(SELECT role_id FROM affected_roles))
     )
     SELECT
       ARRAY(SELECT user_id FROM affected_users ORDER BY user_id) AS user_ids,
       ARRAY(SELECT role_id FROM affected_roles ORDER BY role_id) AS role_ids,
       ARRAY(
         SELECT payload.id FROM oidc_payloads payload
         WHERE payload.type = 'Grant'
           AND payload.payload->>'accountId' = ANY(ARRAY(SELECT user_id::text FROM affected_users))
           AND payload.payload->>'clientId' = ANY(ARRAY(
             SELECT client_id FROM clients WHERE application_id = $2
           ))
         ORDER BY payload.id
       ) AS grant_ids`,
    [permissionId, applicationId],
  );
  return {
    permission: mapRowToPermission(target.rows[0]),
    userIds: graph.rows[0]!.user_ids,
    roleIds: graph.rows[0]!.role_ids,
    grantIds: graph.rows[0]!.grant_ids,
  };
}

/** Physically delete a permission previously locked through its parent. */
export async function deleteCapturedPermission(
  applicationId: string,
  permissionId: string,
): Promise<void> {
  await getPool().query('DELETE FROM permissions WHERE application_id = $1 AND id = $2', [
    applicationId,
    permissionId,
  ]);
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
export async function permissionSlugExists(applicationId: string, slug: string): Promise<boolean> {
  const pool = getPool();

  const result = await pool.query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM permissions WHERE application_id = $1 AND slug = $2) as exists',
    [applicationId, slug],
  );
  return result.rows[0].exists;
}
