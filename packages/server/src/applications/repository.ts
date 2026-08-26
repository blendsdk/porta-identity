/**
 * Application repository — PostgreSQL data access layer.
 *
 * Provides CRUD operations for the `applications` and `application_modules`
 * tables using parameterized queries. Each function acquires the pool via
 * `getPool()` and returns mapped Application/ApplicationModule objects.
 *
 * This module is the sole interface to the database for application
 * data. The service layer composes repository + cache + validation.
 *
 * Key patterns:
 * - Dynamic UPDATE query builder for partial updates
 * - Paginated listing with optional status/search filters
 * - Whitelisted sort columns to prevent SQL injection
 * - All rows mapped through `mapRowToApplication()` / `mapRowToModule()`
 * - Module slug uniqueness scoped to parent application (composite key)
 */

import { getPool } from '../lib/database.js';
import type {
  Application,
  ApplicationRow,
  ApplicationModule,
  ApplicationModuleRow,
  ListApplicationsOptions,
  PaginatedResult,
} from './types.js';
import { mapRowToApplication, mapRowToModule } from './types.js';
import { decodeCursor, buildCursorResult } from '../lib/cursor.js';
import type { CursorPaginatedResult } from '../lib/cursor.js';

// ===========================================================================
// Application CRUD
// ===========================================================================

// ---------------------------------------------------------------------------
// Insert
// ---------------------------------------------------------------------------

/** Input data for inserting a new application row */
export interface InsertApplicationData {
  name: string;
  slug: string;
  description?: string | null;
}

/**
 * Insert a new application into the database.
 *
 * Uses RETURNING * to get the full row back in a single round trip.
 * The slug must be unique (enforced by the DB unique constraint).
 *
 * @param data - Application data to insert
 * @returns The newly created application
 * @throws If slug already exists (unique constraint violation)
 */
export async function insertApplication(data: InsertApplicationData): Promise<Application> {
  const pool = getPool();

  const result = await pool.query<ApplicationRow>(
    `INSERT INTO applications (name, slug, description)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [data.name, data.slug, data.description ?? null],
  );

  return mapRowToApplication(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Find
// ---------------------------------------------------------------------------

/**
 * Find an application by its UUID.
 *
 * @param id - Application UUID
 * @returns Application or null if not found
 */
export async function findApplicationById(id: string): Promise<Application | null> {
  const pool = getPool();

  const result = await pool.query<ApplicationRow>(
    'SELECT * FROM applications WHERE id = $1',
    [id],
  );

  if (result.rows.length === 0) return null;
  return mapRowToApplication(result.rows[0]);
}

/**
 * Find an application by its slug.
 *
 * Returns applications of any status (active, inactive, archived).
 * The caller (service layer) is responsible for status-based access control.
 *
 * @param slug - Application slug
 * @returns Application or null if not found
 */
export async function findApplicationBySlug(slug: string): Promise<Application | null> {
  const pool = getPool();

  const result = await pool.query<ApplicationRow>(
    'SELECT * FROM applications WHERE slug = $1',
    [slug],
  );

  if (result.rows.length === 0) return null;
  return mapRowToApplication(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/** Fields that can be updated on an application */
export interface UpdateApplicationData {
  name?: string;
  status?: string;
  description?: string | null;
}

/**
 * Mapping from UpdateApplicationData keys to database column names.
 * Used by the dynamic query builder to construct SET clauses.
 */
const APP_FIELD_TO_COLUMN: Record<string, string> = {
  name: 'name',
  status: 'status',
  description: 'description',
};

/**
 * Update an application's fields using a dynamic SET clause.
 *
 * Only explicitly provided fields (not undefined) are included in the
 * UPDATE statement. This allows partial updates without overwriting
 * fields that weren't specified.
 *
 * The `updated_at` column is handled automatically by the DB trigger.
 *
 * @param id - Application UUID
 * @param data - Fields to update (only non-undefined fields are applied)
 * @returns Updated application
 * @throws Error if application not found or no fields provided
 */
export async function updateApplication(
  id: string,
  data: UpdateApplicationData,
): Promise<Application> {
  const pool = getPool();

  // Build dynamic SET clause from provided fields
  const setClauses: string[] = [];
  const values: unknown[] = [id]; // $1 is always the ID
  let paramIndex = 2;

  for (const [field, column] of Object.entries(APP_FIELD_TO_COLUMN)) {
    const value = data[field as keyof UpdateApplicationData];
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

  const sql = `UPDATE applications SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`;
  const result = await pool.query<ApplicationRow>(sql, values);

  if (result.rows.length === 0) {
    throw new Error('Application not found');
  }

  return mapRowToApplication(result.rows[0]);
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * Allowed sort columns — whitelisted to prevent SQL injection.
 * These are interpolated directly into the SQL ORDER BY clause.
 */
const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  name: 'name',
  created_at: 'created_at',
};

/**
 * List applications with pagination, optional status filter, search, and sorting.
 *
 * Executes two queries:
 * 1. COUNT query for total matching rows
 * 2. Data query with LIMIT/OFFSET for the current page
 *
 * Sort column and direction are whitelisted (not parameterized) since
 * they're SQL identifiers/keywords, not user data values.
 *
 * @param options - Pagination, filter, and sort options
 * @returns Paginated result with applications and metadata
 */
export async function listApplications(
  options: ListApplicationsOptions,
): Promise<PaginatedResult<Application>> {
  const pool = getPool();
  const { page, pageSize, status, search, sortBy, sortOrder } = options;

  // Build WHERE conditions
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (search) {
    // Search by name or slug using case-insensitive LIKE
    conditions.push(`(name ILIKE $${paramIndex} OR slug ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Whitelist sort column and direction to prevent SQL injection
  const sortColumn = ALLOWED_SORT_COLUMNS[sortBy ?? 'created_at'] ?? 'created_at';
  const direction = sortOrder === 'asc' ? 'ASC' : 'DESC';

  // Count total matching rows
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM applications ${whereClause}`,
    params,
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Fetch paginated data
  const offset = (page - 1) * pageSize;
  const dataResult = await pool.query<ApplicationRow>(
    `SELECT * FROM applications ${whereClause} ORDER BY ${sortColumn} ${direction} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, pageSize, offset],
  );

  return {
    data: dataResult.rows.map(mapRowToApplication),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ---------------------------------------------------------------------------
// List (cursor-based)
// ---------------------------------------------------------------------------

/** Options for cursor-based application listing */
export interface ListApplicationsCursorOptions {
  cursor?: string;
  limit?: number;
  status?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * List applications with cursor-based keyset pagination.
 *
 * Uses `(sort_column, id) > (cursor_sort, cursor_id)` for efficient
 * paging without COUNT queries. Queries limit+1 rows to detect hasMore.
 *
 * @param options - Cursor pagination, filter, and sort options
 * @returns Cursor-paginated result with applications
 */
export async function listApplicationsCursor(
  options: ListApplicationsCursorOptions,
): Promise<CursorPaginatedResult<Application>> {
  const pool = getPool();
  const limit = Math.min(Math.max(1, options.limit ?? 25), 100);
  const sortColumn = ALLOWED_SORT_COLUMNS[options.sortBy ?? 'created_at'] ?? 'created_at';
  const direction = options.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const comparator = direction === 'ASC' ? '>' : '<';

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (options.cursor) {
    const decoded = decodeCursor(options.cursor);
    if (decoded) {
      if (decoded.s === null) {
        conditions.push(`(${sortColumn} IS NOT NULL OR (${sortColumn} IS NULL AND id ${comparator} $${paramIndex}))`);
        params.push(decoded.i);
        paramIndex++;
      } else {
        conditions.push(`(${sortColumn}, id) ${comparator} ($${paramIndex}, $${paramIndex + 1})`);
        params.push(decoded.s, decoded.i);
        paramIndex += 2;
      }
    }
  }

  if (options.status) {
    conditions.push(`status = $${paramIndex}`);
    params.push(options.status);
    paramIndex++;
  }

  if (options.search) {
    conditions.push(`(name ILIKE $${paramIndex} OR slug ILIKE $${paramIndex})`);
    params.push(`%${options.search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM applications ${whereClause} ORDER BY ${sortColumn} ${direction}, id ${direction} LIMIT $${paramIndex}`;
  params.push(limit + 1);

  const result = await pool.query<ApplicationRow>(sql, params);
  const rows = result.rows.map(mapRowToApplication);

  return buildCursorResult(
    rows,
    limit,
    (app) => sortColumn === 'name' ? app.name : app.createdAt.toISOString(),
    (app) => app.id,
  );
}

// ---------------------------------------------------------------------------
// Slug existence check
// ---------------------------------------------------------------------------

/**
 * Check if an application slug is already taken in the database.
 *
 * Checks across all statuses (active, inactive, archived) because
 * slugs must be globally unique regardless of application status.
 *
 * @param slug - Slug to check
 * @param excludeId - Optional app ID to exclude (useful for updates)
 * @returns true if the slug already exists
 */
export async function slugExists(slug: string, excludeId?: string): Promise<boolean> {
  const pool = getPool();

  if (excludeId) {
    const result = await pool.query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM applications WHERE slug = $1 AND id != $2) as exists',
      [slug, excludeId],
    );
    return result.rows[0].exists;
  }

  const result = await pool.query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM applications WHERE slug = $1) as exists',
    [slug],
  );
  return result.rows[0].exists;
}

// ===========================================================================
// Module CRUD
// ===========================================================================

// ---------------------------------------------------------------------------
// Insert Module
// ---------------------------------------------------------------------------

/** Input data for inserting a new application module row */
export interface InsertModuleData {
  applicationId: string;
  name: string;
  slug: string;
  description?: string | null;
}

/**
 * Insert a new module into the database for a given application.
 *
 * Module slugs are unique within their parent application
 * (enforced by the composite UNIQUE constraint on application_id + slug).
 *
 * @param data - Module data to insert
 * @returns The newly created module
 * @throws If composite slug already exists (unique constraint violation)
 */
export async function insertModule(data: InsertModuleData): Promise<ApplicationModule> {
  const pool = getPool();

  const result = await pool.query<ApplicationModuleRow>(
    `INSERT INTO application_modules (application_id, name, slug, description)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.applicationId, data.name, data.slug, data.description ?? null],
  );

  return mapRowToModule(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Find Module
// ---------------------------------------------------------------------------

/**
 * Find a module by its UUID.
 *
 * @param id - Module UUID
 * @returns ApplicationModule or null if not found
 */
export async function findModuleById(id: string): Promise<ApplicationModule | null> {
  const pool = getPool();

  const result = await pool.query<ApplicationModuleRow>(
    'SELECT * FROM application_modules WHERE id = $1',
    [id],
  );

  if (result.rows.length === 0) return null;
  return mapRowToModule(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Update Module
// ---------------------------------------------------------------------------

/** Fields that can be updated on a module */
export interface UpdateModuleData {
  name?: string;
  status?: string;
  description?: string | null;
}

/**
 * Mapping from UpdateModuleData keys to database column names.
 * Used by the dynamic query builder to construct SET clauses.
 */
const MODULE_FIELD_TO_COLUMN: Record<string, string> = {
  name: 'name',
  status: 'status',
  description: 'description',
};

/**
 * Update a module's fields using a dynamic SET clause.
 *
 * Only explicitly provided fields (not undefined) are included in the
 * UPDATE statement. The `updated_at` column is handled by the DB trigger.
 *
 * @param id - Module UUID
 * @param data - Fields to update (only non-undefined fields are applied)
 * @returns Updated module
 * @throws Error if module not found or no fields provided
 */
export async function updateModule(
  id: string,
  data: UpdateModuleData,
): Promise<ApplicationModule> {
  const pool = getPool();

  // Build dynamic SET clause from provided fields
  const setClauses: string[] = [];
  const values: unknown[] = [id]; // $1 is always the ID
  let paramIndex = 2;

  for (const [field, column] of Object.entries(MODULE_FIELD_TO_COLUMN)) {
    const value = data[field as keyof UpdateModuleData];
    if (value !== undefined) {
      setClauses.push(`${column} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    throw new Error('No fields to update');
  }

  const sql = `UPDATE application_modules SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`;
  const result = await pool.query<ApplicationModuleRow>(sql, values);

  if (result.rows.length === 0) {
    throw new Error('Module not found');
  }

  return mapRowToModule(result.rows[0]);
}

// ---------------------------------------------------------------------------
// List Modules
// ---------------------------------------------------------------------------

/**
 * List all modules for a given application.
 *
 * Returns all modules regardless of status, ordered by name ascending.
 * No pagination — modules per application are expected to be small in number.
 *
 * @param applicationId - Application UUID
 * @returns Array of modules for the application
 */
export async function listModules(applicationId: string): Promise<ApplicationModule[]> {
  const pool = getPool();

  const result = await pool.query<ApplicationModuleRow>(
    'SELECT * FROM application_modules WHERE application_id = $1 ORDER BY name ASC',
    [applicationId],
  );

  return result.rows.map(mapRowToModule);
}

// ---------------------------------------------------------------------------
// Module slug existence check
// ---------------------------------------------------------------------------

/**
 * Check if a module slug is already taken within a given application.
 *
 * Module slugs are unique within their parent application (composite key).
 * This check looks at all statuses (active, inactive).
 *
 * @param applicationId - Application UUID
 * @param slug - Module slug to check
 * @param excludeId - Optional module ID to exclude (useful for updates)
 * @returns true if the slug already exists within the application
 */
export async function moduleSlugExists(
  applicationId: string,
  slug: string,
  excludeId?: string,
): Promise<boolean> {
  const pool = getPool();

  if (excludeId) {
    const result = await pool.query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM application_modules WHERE application_id = $1 AND slug = $2 AND id != $3) as exists',
      [applicationId, slug, excludeId],
    );
    return result.rows[0].exists;
  }

  const result = await pool.query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM application_modules WHERE application_id = $1 AND slug = $2) as exists',
    [applicationId, slug],
  );
  return result.rows[0].exists;
}
