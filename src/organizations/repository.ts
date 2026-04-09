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

  const result = await pool.query<OrganizationRow>(
    `INSERT INTO organizations (
       name, slug, default_locale,
       branding_logo_url, branding_favicon_url, branding_primary_color,
       branding_company_name, branding_custom_css
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      data.name,
      data.slug,
      data.defaultLocale,
      data.brandingLogoUrl ?? null,
      data.brandingFaviconUrl ?? null,
      data.brandingPrimaryColor ?? null,
      data.brandingCompanyName ?? null,
      data.brandingCustomCss ?? null,
    ],
  );

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
