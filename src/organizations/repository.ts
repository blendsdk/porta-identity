/**
 * Organization repository — PostgreSQL data access layer.
 *
 * Provides CRUD operations for the `organizations` table using
 * parameterized queries. Each function acquires the pool via
 * `getPool()` and returns mapped Organization objects.
 *
 * This module is the sole interface to the database for organization
 * data. The service layer composes repository + cache + validation.
 *
 * Key patterns:
 * - Dynamic UPDATE query builder for partial updates
 * - Paginated listing with optional status/search filters
 * - Whitelisted sort columns to prevent SQL injection
 * - All rows mapped through `mapRowToOrganization()`
 */

import { getPool } from '../lib/database.js';
import type {
  Organization,
  OrganizationRow,
  ListOrganizationsOptions,
  PaginatedResult,
} from './types.js';
import { mapRowToOrganization } from './types.js';
import type { LoginMethod } from '../clients/types.js';
import { decodeCursor, buildCursorResult } from '../lib/cursor.js';
import type { CursorPaginatedResult } from '../lib/cursor.js';

// ---------------------------------------------------------------------------
// Insert
// ---------------------------------------------------------------------------

/** Input data for inserting a new organization row */
export interface InsertOrganizationData {
  name: string;
  slug: string;
  defaultLocale: string;
  brandingLogoUrl?: string | null;
  brandingFaviconUrl?: string | null;
  brandingPrimaryColor?: string | null;
  brandingCompanyName?: string | null;
  brandingCustomCss?: string | null;
  /**
   * Optional org-wide default login methods. When omitted, the DB
   * `DEFAULT ARRAY['password', 'magic_link']` clause applies. The
   * service layer is responsible for validation + normalization.
   */
  defaultLoginMethods?: LoginMethod[];
}

/**
 * Insert a new organization into the database.
 *
 * Uses RETURNING * to get the full row back in a single round trip.
 * The slug must be unique (enforced by the DB unique constraint).
 *
 * @param data - Organization data to insert
 * @returns The newly created organization
 * @throws If slug already exists (unique constraint violation)
 */
export async function insertOrganization(data: InsertOrganizationData): Promise<Organization> {
  const pool = getPool();

  // Build the column list and value placeholders dynamically so we can omit
  // `default_login_methods` when not provided — letting the DB DEFAULT take
  // effect (back-compatible with callers that don't know about the column).
  const columns: string[] = [
    'name',
    'slug',
    'default_locale',
    'branding_logo_url',
    'branding_favicon_url',
    'branding_primary_color',
    'branding_company_name',
    'branding_custom_css',
  ];
  const values: unknown[] = [
    data.name,
    data.slug,
    data.defaultLocale,
    data.brandingLogoUrl ?? null,
    data.brandingFaviconUrl ?? null,
    data.brandingPrimaryColor ?? null,
    data.brandingCompanyName ?? null,
    data.brandingCustomCss ?? null,
  ];

  if (data.defaultLoginMethods !== undefined) {
    columns.push('default_login_methods');
    values.push(data.defaultLoginMethods);
  }

  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO organizations (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;

  const result = await pool.query<OrganizationRow>(sql, values);
  return mapRowToOrganization(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Find
// ---------------------------------------------------------------------------

/**
 * Find an organization by its UUID.
 *
 * @param id - Organization UUID
 * @returns Organization or null if not found
 */
export async function findOrganizationById(id: string): Promise<Organization | null> {
  const pool = getPool();

  const result = await pool.query<OrganizationRow>(
    'SELECT * FROM organizations WHERE id = $1',
    [id],
  );

  if (result.rows.length === 0) return null;
  return mapRowToOrganization(result.rows[0]);
}

/**
 * Find an organization by its slug.
 *
 * Returns organizations of any status (active, suspended, archived).
 * The caller (service/middleware) is responsible for status-based access control.
 *
 * @param slug - Organization slug
 * @returns Organization or null if not found
 */
export async function findOrganizationBySlug(slug: string): Promise<Organization | null> {
  const pool = getPool();

  const result = await pool.query<OrganizationRow>(
    'SELECT * FROM organizations WHERE slug = $1',
    [slug],
  );

  if (result.rows.length === 0) return null;
  return mapRowToOrganization(result.rows[0]);
}

/**
 * Find the super-admin organization (is_super_admin = TRUE).
 *
 * The partial unique index ensures at most one such org exists.
 *
 * @returns Super-admin organization or null if not yet seeded
 */
export async function findSuperAdminOrganization(): Promise<Organization | null> {
  const pool = getPool();

  const result = await pool.query<OrganizationRow>(
    'SELECT * FROM organizations WHERE is_super_admin = TRUE LIMIT 1',
  );

  if (result.rows.length === 0) return null;
  return mapRowToOrganization(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/** Fields that can be updated on an organization */
export interface UpdateOrganizationData {
  name?: string;
  status?: string;
  defaultLocale?: string;
  twoFactorPolicy?: string;
  defaultLoginMethods?: LoginMethod[];
  brandingLogoUrl?: string | null;
  brandingFaviconUrl?: string | null;
  brandingPrimaryColor?: string | null;
  brandingCompanyName?: string | null;
  brandingCustomCss?: string | null;
}

/**
 * Mapping from UpdateOrganizationData keys to database column names.
 * Used by the dynamic query builder to construct SET clauses.
 */
const FIELD_TO_COLUMN: Record<string, string> = {
  name: 'name',
  status: 'status',
  defaultLocale: 'default_locale',
  twoFactorPolicy: 'two_factor_policy',
  defaultLoginMethods: 'default_login_methods',
  brandingLogoUrl: 'branding_logo_url',
  brandingFaviconUrl: 'branding_favicon_url',
  brandingPrimaryColor: 'branding_primary_color',
  brandingCompanyName: 'branding_company_name',
  brandingCustomCss: 'branding_custom_css',
};

/**
 * Update an organization's fields using a dynamic SET clause.
 *
 * Only explicitly provided fields (not undefined) are included in the
 * UPDATE statement. This allows partial updates without overwriting
 * fields that weren't specified.
 *
 * The `updated_at` column is handled automatically by the DB trigger,
 * but we don't rely on it here — we just build the SET clauses for
 * the provided fields.
 *
 * @param id - Organization UUID
 * @param data - Fields to update (only non-undefined fields are applied)
 * @returns Updated organization
 * @throws Error if organization not found or no fields provided
 */
export async function updateOrganization(
  id: string,
  data: UpdateOrganizationData,
): Promise<Organization> {
  const pool = getPool();

  // Build dynamic SET clause from provided fields
  const setClauses: string[] = [];
  const values: unknown[] = [id]; // $1 is always the ID
  let paramIndex = 2;

  for (const [field, column] of Object.entries(FIELD_TO_COLUMN)) {
    const value = data[field as keyof UpdateOrganizationData];
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

  const sql = `UPDATE organizations SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`;
  const result = await pool.query<OrganizationRow>(sql, values);

  if (result.rows.length === 0) {
    throw new Error('Organization not found');
  }

  return mapRowToOrganization(result.rows[0]);
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
 * List organizations with pagination, optional status filter, search, and sorting.
 *
 * Executes two queries:
 * 1. COUNT query for total matching rows
 * 2. Data query with LIMIT/OFFSET for the current page
 *
 * Sort column and direction are whitelisted (not parameterized) since
 * they're SQL identifiers/keywords, not user data values.
 *
 * @param options - Pagination, filter, and sort options
 * @returns Paginated result with organizations and metadata
 */
export async function listOrganizations(
  options: ListOrganizationsOptions,
): Promise<PaginatedResult<Organization>> {
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
    `SELECT COUNT(*) as count FROM organizations ${whereClause}`,
    params,
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Fetch paginated data
  const offset = (page - 1) * pageSize;
  const dataResult = await pool.query<OrganizationRow>(
    `SELECT * FROM organizations ${whereClause} ORDER BY ${sortColumn} ${direction} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, pageSize, offset],
  );

  return {
    data: dataResult.rows.map(mapRowToOrganization),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ---------------------------------------------------------------------------
// List (cursor-based)
// ---------------------------------------------------------------------------

/** Options for cursor-based organization listing */
export interface ListOrganizationsCursorOptions {
  cursor?: string;
  limit?: number;
  status?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * List organizations with cursor-based keyset pagination.
 *
 * Uses `(sort_column, id) > (cursor_sort, cursor_id)` for efficient
 * paging without COUNT queries. Queries limit+1 rows to detect hasMore.
 *
 * Backward compatible: when no cursor is provided, returns the first page.
 *
 * @param options - Cursor pagination, filter, and sort options
 * @returns Cursor-paginated result with organizations
 */
export async function listOrganizationsCursor(
  options: ListOrganizationsCursorOptions,
): Promise<CursorPaginatedResult<Organization>> {
  const pool = getPool();
  const limit = Math.min(Math.max(1, options.limit ?? 25), 100);
  const sortColumn = ALLOWED_SORT_COLUMNS[options.sortBy ?? 'created_at'] ?? 'created_at';
  const direction = options.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const comparator = direction === 'ASC' ? '>' : '<';

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  // Cursor-based WHERE clause
  if (options.cursor) {
    const decoded = decodeCursor(options.cursor);
    if (decoded) {
      if (decoded.s === null) {
        // NULL sort values: skip rows with NULL, then compare by ID
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

  // Fetch limit + 1 to detect hasMore
  const sql = `SELECT * FROM organizations ${whereClause} ORDER BY ${sortColumn} ${direction}, id ${direction} LIMIT $${paramIndex}`;
  params.push(limit + 1);

  const result = await pool.query<OrganizationRow>(sql, params);
  const rows = result.rows.map(mapRowToOrganization);

  return buildCursorResult(
    rows,
    limit,
    (org) => sortColumn === 'name' ? org.name : org.createdAt.toISOString(),
    (org) => org.id,
  );
}

// ---------------------------------------------------------------------------
// Slug existence check
// ---------------------------------------------------------------------------

/**
 * Check if a slug is already taken in the database.
 *
 * Checks across all statuses (active, suspended, archived) because
 * slugs must be globally unique regardless of organization status.
 *
 * @param slug - Slug to check
 * @param excludeId - Optional org ID to exclude (useful for updates)
 * @returns true if the slug already exists
 */
export async function slugExists(slug: string, excludeId?: string): Promise<boolean> {
  const pool = getPool();

  if (excludeId) {
    const result = await pool.query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM organizations WHERE slug = $1 AND id != $2) as exists',
      [slug, excludeId],
    );
    return result.rows[0].exists;
  }

  const result = await pool.query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM organizations WHERE slug = $1) as exists',
    [slug],
  );
  return result.rows[0].exists;
}

// ---------------------------------------------------------------------------
// Hard delete
// ---------------------------------------------------------------------------

/**
 * Hard-delete an organization from the database.
 *
 * PostgreSQL CASCADE foreign keys automatically delete all child entities:
 * applications, clients, users, roles, permissions, claim definitions,
 * user claim values, user roles, branding assets, and admin sessions.
 * Audit log entries have their organization_id set to NULL (ON DELETE SET NULL).
 *
 * The `AND is_super_admin = FALSE` clause is a database-level safety check —
 * even if application code has a bug, the super-admin org cannot be deleted.
 *
 * @param id - Organization UUID
 * @returns true if the row was deleted, false if not found or super-admin
 */
export async function hardDeleteOrganization(id: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    'DELETE FROM organizations WHERE id = $1 AND is_super_admin = FALSE RETURNING id',
    [id],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Count all child entities that will be cascade-deleted with an organization.
 * Used for dry-run display and confirmation prompts.
 *
 * Runs all counts in a single query using scalar subqueries for efficiency.
 * Roles, permissions, and claim definitions are counted via their parent
 * application's organization_id join.
 *
 * @param orgId - Organization UUID
 * @returns Counts of each child entity type
 */
export async function getCascadeCounts(orgId: string): Promise<{
  applications: number;
  clients: number;
  users: number;
  roles: number;
  permissions: number;
  claim_definitions: number;
}> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM applications WHERE organization_id = $1)::int AS applications,
       (SELECT COUNT(*) FROM clients WHERE organization_id = $1)::int AS clients,
       (SELECT COUNT(*) FROM users WHERE organization_id = $1)::int AS users,
       (SELECT COUNT(*) FROM roles r
        JOIN applications a ON r.application_id = a.id
        WHERE a.organization_id = $1)::int AS roles,
       (SELECT COUNT(*) FROM permissions p
        JOIN applications a ON p.application_id = a.id
        WHERE a.organization_id = $1)::int AS permissions,
       (SELECT COUNT(*) FROM claim_definitions cd
        JOIN applications a ON cd.application_id = a.id
        WHERE a.organization_id = $1)::int AS claim_definitions`,
    [orgId],
  );
  return result.rows[0];
}
