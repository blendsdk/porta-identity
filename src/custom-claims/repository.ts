/**
 * Custom claims repository — PostgreSQL data access layer.
 *
 * Provides CRUD operations for the `custom_claim_definitions` and
 * `custom_claim_values` tables using parameterized queries. Each function
 * acquires the pool via `getPool()` and returns mapped objects via the
 * type mapping functions.
 *
 * Definitions are scoped to an application with a unique (application_id,
 * claim_name) constraint. Values are per-user with a unique (user_id,
 * claim_id) constraint — upsert semantics via ON CONFLICT.
 *
 * Key patterns:
 * - Dynamic UPDATE for partial definition updates
 * - Upsert for claim values (INSERT ... ON CONFLICT DO UPDATE)
 * - Joined query for resolving user claim values with definitions
 *
 * Database tables: custom_claim_definitions, custom_claim_values
 * (see migration 007_custom_claims.sql)
 */

import { getPool } from '../lib/database.js';
import type {
  ClaimType,
  CustomClaimDefinition,
  CustomClaimDefinitionRow,
  CreateClaimDefinitionInput,
  UpdateClaimDefinitionInput,
  CustomClaimValue,
  CustomClaimValueRow,
  CustomClaimWithValue,
} from './types.js';
import { mapRowToDefinition, mapRowToValue } from './types.js';

// ===========================================================================
// Claim Definitions
// ===========================================================================

// ---------------------------------------------------------------------------
// Insert
// ---------------------------------------------------------------------------

/**
 * Insert a new claim definition into the database.
 *
 * Uses RETURNING * to get the full row back in a single round trip.
 * The (application_id, claim_name) pair must be unique (enforced by DB).
 * Token inclusion flags use DB defaults when not provided.
 *
 * @param input - Definition data to insert
 * @returns The newly created definition
 * @throws If (application_id, claim_name) already exists (unique constraint)
 */
export async function insertDefinition(
  input: CreateClaimDefinitionInput,
): Promise<CustomClaimDefinition> {
  const pool = getPool();

  const result = await pool.query<CustomClaimDefinitionRow>(
    `INSERT INTO custom_claim_definitions
       (application_id, claim_name, claim_type, description,
        include_in_id_token, include_in_access_token, include_in_userinfo)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.applicationId,
      input.claimName,
      input.claimType,
      input.description ?? null,
      input.includeInIdToken ?? false,
      input.includeInAccessToken ?? true,
      input.includeInUserinfo ?? true,
    ],
  );

  return mapRowToDefinition(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Find
// ---------------------------------------------------------------------------

/**
 * Find a claim definition by its UUID.
 *
 * @param id - Definition UUID
 * @returns Definition or null if not found
 */
export async function findDefinitionById(id: string): Promise<CustomClaimDefinition | null> {
  const pool = getPool();

  const result = await pool.query<CustomClaimDefinitionRow>(
    'SELECT * FROM custom_claim_definitions WHERE id = $1',
    [id],
  );

  if (result.rows.length === 0) return null;
  return mapRowToDefinition(result.rows[0]);
}

/**
 * Find a claim definition by application ID and claim name.
 *
 * Used for duplicate checking and name-based lookups.
 *
 * @param applicationId - Application UUID
 * @param claimName - Claim name (unique within application)
 * @returns Definition or null if not found
 */
export async function findDefinitionByName(
  applicationId: string,
  claimName: string,
): Promise<CustomClaimDefinition | null> {
  const pool = getPool();

  const result = await pool.query<CustomClaimDefinitionRow>(
    'SELECT * FROM custom_claim_definitions WHERE application_id = $1 AND claim_name = $2',
    [applicationId, claimName],
  );

  if (result.rows.length === 0) return null;
  return mapRowToDefinition(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Mapping from UpdateClaimDefinitionInput keys to database column names.
 * Used by the dynamic query builder to construct SET clauses.
 */
const FIELD_TO_COLUMN: Record<string, string> = {
  description: 'description',
  includeInIdToken: 'include_in_id_token',
  includeInAccessToken: 'include_in_access_token',
  includeInUserinfo: 'include_in_userinfo',
};

/**
 * Update a claim definition's fields using a dynamic SET clause.
 *
 * Only explicitly provided fields (not undefined) are included in the
 * UPDATE statement. This allows partial updates without overwriting
 * fields that weren't specified. Null is a valid value for description
 * (clears it).
 *
 * @param id - Definition UUID
 * @param input - Fields to update (only non-undefined fields are applied)
 * @returns Updated definition
 * @throws Error if definition not found or no fields provided
 */
export async function updateDefinition(
  id: string,
  input: UpdateClaimDefinitionInput,
): Promise<CustomClaimDefinition> {
  const pool = getPool();

  // Build dynamic SET clause from provided fields
  const setClauses: string[] = [];
  const values: unknown[] = [id]; // $1 is always the ID
  let paramIndex = 2;

  for (const [field, column] of Object.entries(FIELD_TO_COLUMN)) {
    const value = input[field as keyof UpdateClaimDefinitionInput];
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

  const sql = `UPDATE custom_claim_definitions SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`;
  const result = await pool.query<CustomClaimDefinitionRow>(sql, values);

  if (result.rows.length === 0) {
    throw new Error('Claim definition not found');
  }

  return mapRowToDefinition(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Delete a claim definition by ID.
 *
 * CASCADE constraint automatically removes all associated claim values.
 *
 * @param id - Definition UUID
 * @returns true if deleted, false if not found
 */
export async function deleteDefinition(id: string): Promise<boolean> {
  const pool = getPool();

  const result = await pool.query(
    'DELETE FROM custom_claim_definitions WHERE id = $1',
    [id],
  );

  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * List all claim definitions for an application, ordered by claim name.
 *
 * Returns a simple array (no pagination) since applications typically
 * have a manageable number of custom claims.
 *
 * @param applicationId - Application UUID
 * @returns Array of definitions for the application
 */
export async function listDefinitionsByApplication(
  applicationId: string,
): Promise<CustomClaimDefinition[]> {
  const pool = getPool();

  const result = await pool.query<CustomClaimDefinitionRow>(
    'SELECT * FROM custom_claim_definitions WHERE application_id = $1 ORDER BY claim_name ASC',
    [applicationId],
  );

  return result.rows.map(mapRowToDefinition);
}

// ---------------------------------------------------------------------------
// Existence check
// ---------------------------------------------------------------------------

/**
 * Check if a claim name already exists for a given application.
 *
 * Used for uniqueness validation before insert. The optional excludeId
 * parameter allows excluding a specific definition (for future use if
 * name updates are ever supported).
 *
 * @param applicationId - Application UUID
 * @param claimName - Claim name to check
 * @param excludeId - Optional definition ID to exclude from the check
 * @returns true if the claim name already exists
 */
export async function claimNameExists(
  applicationId: string,
  claimName: string,
  excludeId?: string,
): Promise<boolean> {
  const pool = getPool();

  if (excludeId) {
    const result = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS(
        SELECT 1 FROM custom_claim_definitions
        WHERE application_id = $1 AND claim_name = $2 AND id != $3
      ) as exists`,
      [applicationId, claimName, excludeId],
    );
    return result.rows[0].exists;
  }

  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(
      SELECT 1 FROM custom_claim_definitions
      WHERE application_id = $1 AND claim_name = $2
    ) as exists`,
    [applicationId, claimName],
  );
  return result.rows[0].exists;
}

// ===========================================================================
// Claim Values
// ===========================================================================

// ---------------------------------------------------------------------------
// Upsert
// ---------------------------------------------------------------------------

/**
 * Set (upsert) a claim value for a user.
 *
 * Uses INSERT ... ON CONFLICT (user_id, claim_id) DO UPDATE to handle
 * both initial value setting and subsequent updates in a single query.
 * The value is stored as JSONB.
 *
 * @param userId - User UUID
 * @param claimId - Definition UUID
 * @param value - The claim value (must match definition's claim_type)
 * @returns The upserted claim value
 */
export async function upsertValue(
  userId: string,
  claimId: string,
  value: unknown,
): Promise<CustomClaimValue> {
  const pool = getPool();

  const result = await pool.query<CustomClaimValueRow>(
    `INSERT INTO custom_claim_values (user_id, claim_id, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, claim_id) DO UPDATE
       SET value = EXCLUDED.value, updated_at = NOW()
     RETURNING *`,
    [userId, claimId, JSON.stringify(value)],
  );

  return mapRowToValue(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Find value
// ---------------------------------------------------------------------------

/**
 * Get a claim value for a user and claim definition.
 *
 * @param userId - User UUID
 * @param claimId - Definition UUID
 * @returns Claim value or null if not set
 */
export async function findValue(
  userId: string,
  claimId: string,
): Promise<CustomClaimValue | null> {
  const pool = getPool();

  const result = await pool.query<CustomClaimValueRow>(
    'SELECT * FROM custom_claim_values WHERE user_id = $1 AND claim_id = $2',
    [userId, claimId],
  );

  if (result.rows.length === 0) return null;
  return mapRowToValue(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Delete value
// ---------------------------------------------------------------------------

/**
 * Delete a claim value for a user and claim definition.
 *
 * @param userId - User UUID
 * @param claimId - Definition UUID
 * @returns true if deleted, false if not found
 */
export async function deleteValue(
  userId: string,
  claimId: string,
): Promise<boolean> {
  const pool = getPool();

  const result = await pool.query(
    'DELETE FROM custom_claim_values WHERE user_id = $1 AND claim_id = $2',
    [userId, claimId],
  );

  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Joined queries (for token claims building)
// ---------------------------------------------------------------------------

/**
 * Row type for the joined definition+value query.
 * Column aliases prevent name collisions between the two tables.
 */
interface JoinedRow {
  def_id: string;
  application_id: string;
  claim_name: string;
  claim_type: string;
  description: string | null;
  include_in_id_token: boolean;
  include_in_access_token: boolean;
  include_in_userinfo: boolean;
  def_created_at: Date;
  def_updated_at: Date;
  val_id: string;
  user_id: string;
  claim_id: string;
  value: unknown;
  val_created_at: Date;
  val_updated_at: Date;
}

/**
 * Map a joined row to a CustomClaimWithValue object.
 *
 * Splits the aliased columns into separate definition and value objects.
 *
 * @param row - Joined row from the combined query
 * @returns Object with definition and value properties
 */
function mapJoinedRow(row: JoinedRow): CustomClaimWithValue {
  return {
    definition: {
      id: row.def_id,
      applicationId: row.application_id,
      claimName: row.claim_name,
      claimType: row.claim_type as ClaimType,
      description: row.description,
      includeInIdToken: row.include_in_id_token,
      includeInAccessToken: row.include_in_access_token,
      includeInUserinfo: row.include_in_userinfo,
      createdAt: row.def_created_at,
      updatedAt: row.def_updated_at,
    },
    value: {
      id: row.val_id,
      userId: row.user_id,
      claimId: row.claim_id,
      value: row.value,
      createdAt: row.val_created_at,
      updatedAt: row.val_updated_at,
    },
  };
}

/**
 * The SQL for joining claim values with their definitions.
 * Used by both getValuesForUser and getValuesForUserByApp.
 */
const JOINED_SELECT = `
  SELECT
    d.id AS def_id, d.application_id, d.claim_name, d.claim_type,
    d.description, d.include_in_id_token, d.include_in_access_token,
    d.include_in_userinfo, d.created_at AS def_created_at,
    d.updated_at AS def_updated_at,
    v.id AS val_id, v.user_id, v.claim_id, v.value,
    v.created_at AS val_created_at, v.updated_at AS val_updated_at
  FROM custom_claim_values v
  JOIN custom_claim_definitions d ON d.id = v.claim_id
`;

/**
 * Get all claim values for a user, joined with definitions.
 *
 * Returns values across all applications. Used for admin views.
 *
 * @param userId - User UUID
 * @returns Array of definition+value pairs
 */
export async function getValuesForUser(userId: string): Promise<CustomClaimWithValue[]> {
  const pool = getPool();

  const result = await pool.query<JoinedRow>(
    `${JOINED_SELECT} WHERE v.user_id = $1 ORDER BY d.claim_name ASC`,
    [userId],
  );

  return result.rows.map(mapJoinedRow);
}

/**
 * Get all claim values for a user within a specific application.
 *
 * This is the token claims hot path — scoped to the client's application.
 * Returns joined definition+value pairs so the caller can filter by
 * token type inclusion flags.
 *
 * @param userId - User UUID
 * @param applicationId - Application UUID
 * @returns Array of definition+value pairs for the application
 */
export async function getValuesForUserByApp(
  userId: string,
  applicationId: string,
): Promise<CustomClaimWithValue[]> {
  const pool = getPool();

  const result = await pool.query<JoinedRow>(
    `${JOINED_SELECT} WHERE v.user_id = $1 AND d.application_id = $2 ORDER BY d.claim_name ASC`,
    [userId, applicationId],
  );

  return result.rows.map(mapJoinedRow);
}
