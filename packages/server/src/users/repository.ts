/**
 * User repository — PostgreSQL data access layer.
 *
 * Provides CRUD operations for the `users` table using parameterized
 * queries. Each function acquires the pool via `getPool()` and returns
 * mapped User objects (or raw password hashes for auth flows).
 *
 * This module is the sole interface to the database for user data.
 * The service layer composes repository + cache + validation.
 *
 * Key patterns:
 * - Dynamic UPDATE query builder for partial updates (~30 fields)
 * - Paginated listing with mandatory org scope, optional status/search filters
 * - Whitelisted sort columns to prevent SQL injection
 * - All rows mapped through `mapRowToUser()`
 * - password_hash is never returned in User objects (only via getPasswordHash)
 */

import { getPool } from '../lib/database.js';
import type { UserRow, UserListOptions, PaginatedResult, User } from './types.js';
import { mapRowToUser } from './types.js';
import { decodeCursor, buildCursorResult } from '../lib/cursor.js';
import type { CursorPaginatedResult } from '../lib/cursor.js';

// ---------------------------------------------------------------------------
// Insert
// ---------------------------------------------------------------------------

/**
 * Input data for inserting a new user row.
 *
 * The service layer is responsible for hashing passwords before calling
 * this function — `passwordHash` is the already-hashed value, not plaintext.
 */
export interface InsertUserData {
  organizationId: string;
  email: string;
  passwordHash?: string | null;
  emailVerified?: boolean;

  // OIDC Standard Claims (all optional)
  givenName?: string | null;
  familyName?: string | null;
  middleName?: string | null;
  nickname?: string | null;
  preferredUsername?: string | null;
  profileUrl?: string | null;
  pictureUrl?: string | null;
  websiteUrl?: string | null;
  gender?: string | null;
  birthdate?: string | null;
  zoneinfo?: string | null;
  locale?: string | null;
  phoneNumber?: string | null;

  // Address fields
  addressStreet?: string | null;
  addressLocality?: string | null;
  addressRegion?: string | null;
  addressPostalCode?: string | null;
  addressCountry?: string | null;
}

/**
 * Insert a new user into the database.
 *
 * Uses RETURNING * to get the full row back in a single round trip.
 * The email must be unique within the organization (enforced by the
 * DB unique constraint on (organization_id, email)).
 *
 * @param data - User data to insert (password must already be hashed)
 * @returns The newly created user
 * @throws If email already exists in the org (unique constraint violation)
 */
export async function insertUser(data: InsertUserData): Promise<User> {
  const pool = getPool();

  const result = await pool.query<UserRow>(
    `INSERT INTO users (
       organization_id, email, password_hash, email_verified,
       given_name, family_name, middle_name, nickname,
       preferred_username, profile_url, picture_url, website_url,
       gender, birthdate, zoneinfo, locale, phone_number,
       address_street, address_locality, address_region,
       address_postal_code, address_country
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
     RETURNING *`,
    [
      data.organizationId,
      data.email,
      data.passwordHash ?? null,
      data.emailVerified ?? false,
      data.givenName ?? null,
      data.familyName ?? null,
      data.middleName ?? null,
      data.nickname ?? null,
      data.preferredUsername ?? null,
      data.profileUrl ?? null,
      data.pictureUrl ?? null,
      data.websiteUrl ?? null,
      data.gender ?? null,
      data.birthdate ?? null,
      data.zoneinfo ?? null,
      data.locale ?? null,
      data.phoneNumber ?? null,
      data.addressStreet ?? null,
      data.addressLocality ?? null,
      data.addressRegion ?? null,
      data.addressPostalCode ?? null,
      data.addressCountry ?? null,
    ],
  );

  return mapRowToUser(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Find
// ---------------------------------------------------------------------------

/**
 * Find a user by their UUID.
 *
 * @param id - User UUID
 * @returns User or null if not found
 */
export async function findUserById(id: string): Promise<User | null> {
  const pool = getPool();

  const result = await pool.query<UserRow>(
    'SELECT * FROM users WHERE id = $1',
    [id],
  );

  if (result.rows.length === 0) return null;
  return mapRowToUser(result.rows[0]);
}

/**
 * Find a user by email within a specific organization.
 *
 * Email comparison is case-insensitive because the `email` column
 * uses the CITEXT extension.
 *
 * @param orgId - Organization UUID
 * @param email - User email address
 * @returns User or null if not found
 */
export async function findUserByEmail(orgId: string, email: string): Promise<User | null> {
  const pool = getPool();

  const result = await pool.query<UserRow>(
    'SELECT * FROM users WHERE organization_id = $1 AND email = $2',
    [orgId, email],
  );

  if (result.rows.length === 0) return null;
  return mapRowToUser(result.rows[0]);
}

/**
 * Get the password hash for a user (active users only).
 *
 * Returns the raw Argon2id hash for password verification. Only returns
 * the hash if the user status is 'active' — inactive, suspended, and
 * locked users cannot authenticate.
 *
 * This is the only function that exposes password_hash; the User
 * interface replaces it with a `hasPassword` boolean.
 *
 * @param userId - User UUID
 * @returns Password hash string, or null if not found / not active / no password
 */
export async function getPasswordHash(userId: string): Promise<string | null> {
  const pool = getPool();

  const result = await pool.query<{ password_hash: string | null }>(
    "SELECT password_hash FROM users WHERE id = $1 AND status = 'active'",
    [userId],
  );

  if (result.rows.length === 0) return null;
  return result.rows[0].password_hash;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Fields that can be updated on a user.
 *
 * The service layer validates and transforms data before calling this
 * function. For example, passwords are hashed before being passed as
 * `passwordHash`.
 */
export interface UpdateUserData {
  email?: string;
  emailVerified?: boolean;
  passwordHash?: string | null;
  passwordChangedAt?: Date | null;

  // OIDC Standard Claims (optional, nullable for clearing)
  givenName?: string | null;
  familyName?: string | null;
  middleName?: string | null;
  nickname?: string | null;
  preferredUsername?: string | null;
  profileUrl?: string | null;
  pictureUrl?: string | null;
  websiteUrl?: string | null;
  gender?: string | null;
  birthdate?: string | null;
  zoneinfo?: string | null;
  locale?: string | null;
  phoneNumber?: string | null;
  phoneNumberVerified?: boolean;

  // Address fields
  addressStreet?: string | null;
  addressLocality?: string | null;
  addressRegion?: string | null;
  addressPostalCode?: string | null;
  addressCountry?: string | null;

  // Two-factor authentication fields
  twoFactorEnabled?: boolean;
  twoFactorMethod?: string | null;

  // Status fields
  status?: string;
  lockedAt?: Date | null;
  lockedReason?: string | null;
}

/**
 * Mapping from UpdateUserData keys to database column names.
 * Used by the dynamic query builder to construct SET clauses.
 */
const FIELD_TO_COLUMN: Record<string, string> = {
  email: 'email',
  emailVerified: 'email_verified',
  passwordHash: 'password_hash',
  passwordChangedAt: 'password_changed_at',
  givenName: 'given_name',
  familyName: 'family_name',
  middleName: 'middle_name',
  nickname: 'nickname',
  preferredUsername: 'preferred_username',
  profileUrl: 'profile_url',
  pictureUrl: 'picture_url',
  websiteUrl: 'website_url',
  gender: 'gender',
  birthdate: 'birthdate',
  zoneinfo: 'zoneinfo',
  locale: 'locale',
  phoneNumber: 'phone_number',
  phoneNumberVerified: 'phone_number_verified',
  addressStreet: 'address_street',
  addressLocality: 'address_locality',
  addressRegion: 'address_region',
  addressPostalCode: 'address_postal_code',
  addressCountry: 'address_country',
  twoFactorEnabled: 'two_factor_enabled',
  twoFactorMethod: 'two_factor_method',
  status: 'status',
  lockedAt: 'locked_at',
  lockedReason: 'locked_reason',
};

/**
 * Update a user's fields using a dynamic SET clause.
 *
 * Only explicitly provided fields (not undefined) are included in the
 * UPDATE statement. This allows partial updates without overwriting
 * fields that weren't specified. Setting a field to `null` clears it.
 *
 * The `updated_at` column is handled automatically by the DB trigger.
 *
 * @param id - User UUID
 * @param data - Fields to update (only non-undefined fields are applied)
 * @returns Updated user
 * @throws Error if user not found or no fields provided
 */
export async function updateUser(id: string, data: UpdateUserData): Promise<User> {
  const pool = getPool();

  // Build dynamic SET clause from provided fields
  const setClauses: string[] = [];
  const values: unknown[] = [id]; // $1 is always the ID
  let paramIndex = 2;

  for (const [field, column] of Object.entries(FIELD_TO_COLUMN)) {
    const value = data[field as keyof UpdateUserData];
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

  const sql = `UPDATE users SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`;
  const result = await pool.query<UserRow>(sql, values);

  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  return mapRowToUser(result.rows[0]);
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * Allowed sort columns — whitelisted to prevent SQL injection.
 * These are interpolated directly into the SQL ORDER BY clause.
 */
const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  email: 'email',
  given_name: 'given_name',
  family_name: 'family_name',
  created_at: 'created_at',
  last_login_at: 'last_login_at',
};

/**
 * List users within an organization with pagination, optional filters, and sorting.
 *
 * Unlike organization listing, user listing always requires an organization_id
 * scope — users are never listed across organizations.
 *
 * Executes two queries:
 * 1. COUNT query for total matching rows
 * 2. Data query with LIMIT/OFFSET for the current page
 *
 * Search is case-insensitive (ILIKE) across email, given_name, and family_name.
 *
 * @param options - Pagination, filter, and sort options (orgId is required)
 * @returns Paginated result with users and metadata
 */
export async function listUsers(options: UserListOptions): Promise<PaginatedResult<User>> {
  const pool = getPool();
  const { organizationId, page, pageSize, status, search, sortBy, sortOrder } = options;

  // Build WHERE conditions — org_id is always required
  const conditions: string[] = ['organization_id = $1'];
  const params: unknown[] = [organizationId];
  let paramIndex = 2;

  if (status) {
    conditions.push(`status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (search) {
    // Search across email, given_name, and family_name
    conditions.push(
      `(email ILIKE $${paramIndex} OR given_name ILIKE $${paramIndex} OR family_name ILIKE $${paramIndex})`,
    );
    params.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  // Whitelist sort column and direction to prevent SQL injection
  const sortColumn = ALLOWED_SORT_COLUMNS[sortBy ?? 'created_at'] ?? 'created_at';
  const direction = sortOrder === 'asc' ? 'ASC' : 'DESC';

  // Count total matching rows
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM users ${whereClause}`,
    params,
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Fetch paginated data
  const offset = (page - 1) * pageSize;
  const dataResult = await pool.query<UserRow>(
    `SELECT * FROM users ${whereClause} ORDER BY ${sortColumn} ${direction} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, pageSize, offset],
  );

  return {
    data: dataResult.rows.map(mapRowToUser),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ---------------------------------------------------------------------------
// List (cursor-based)
// ---------------------------------------------------------------------------

/** Options for cursor-based user listing */
export interface ListUsersCursorOptions {
  organizationId: string;
  cursor?: string;
  limit?: number;
  status?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * List users with cursor-based keyset pagination (org-scoped).
 *
 * @param options - Cursor pagination, filter, and sort options
 * @returns Cursor-paginated result with users
 */
export async function listUsersCursor(
  options: ListUsersCursorOptions,
): Promise<CursorPaginatedResult<User>> {
  const pool = getPool();
  const limit = Math.min(Math.max(1, options.limit ?? 25), 100);
  const sortColumn = ALLOWED_SORT_COLUMNS[options.sortBy ?? 'created_at'] ?? 'created_at';
  const direction = options.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const comparator = direction === 'ASC' ? '>' : '<';

  // Organization scope is always required
  const conditions: string[] = ['organization_id = $1'];
  const params: unknown[] = [options.organizationId];
  let paramIndex = 2;

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
    conditions.push(
      `(email ILIKE $${paramIndex} OR given_name ILIKE $${paramIndex} OR family_name ILIKE $${paramIndex})`,
    );
    params.push(`%${options.search}%`);
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const sql = `SELECT * FROM users ${whereClause} ORDER BY ${sortColumn} ${direction}, id ${direction} LIMIT $${paramIndex}`;
  params.push(limit + 1);

  const result = await pool.query<UserRow>(sql, params);
  const rows = result.rows.map(mapRowToUser);

  // Resolve sort value getter based on sort column
  const getSortValue = (u: User): string | number | null => {
    switch (sortColumn) {
      case 'email': return u.email;
      case 'given_name': return u.givenName ?? null;
      case 'family_name': return u.familyName ?? null;
      case 'last_login_at': return u.lastLoginAt?.toISOString() ?? null;
      default: return u.createdAt.toISOString();
    }
  };

  return buildCursorResult(rows, limit, getSortValue, (u) => u.id);
}

// ---------------------------------------------------------------------------
// Utility queries
// ---------------------------------------------------------------------------

/**
 * Check if an email already exists within an organization.
 *
 * Used by the service layer to check for duplicates before create/update.
 * An optional `excludeId` parameter allows excluding a specific user
 * (useful when updating a user's email — the existing email for that
 * user should not count as a duplicate).
 *
 * @param orgId - Organization UUID
 * @param email - Email to check (case-insensitive via CITEXT)
 * @param excludeId - Optional user ID to exclude from the check
 * @returns true if the email already exists
 */
export async function emailExists(
  orgId: string,
  email: string,
  excludeId?: string,
): Promise<boolean> {
  const pool = getPool();

  if (excludeId) {
    const result = await pool.query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM users WHERE organization_id = $1 AND email = $2 AND id != $3) as exists',
      [orgId, email, excludeId],
    );
    return result.rows[0].exists;
  }

  const result = await pool.query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM users WHERE organization_id = $1 AND email = $2) as exists',
    [orgId, email],
  );
  return result.rows[0].exists;
}

/**
 * Update login statistics for a user.
 *
 * Increments login_count and sets last_login_at to the current timestamp.
 * Called by the service layer's recordLogin() function after successful
 * authentication.
 *
 * @param id - User UUID
 */
export async function updateLoginStats(id: string): Promise<void> {
  const pool = getPool();

  // Also reset failed login counter on successful login
  await pool.query(
    `UPDATE users
     SET last_login_at = NOW(),
         login_count = login_count + 1,
         failed_login_count = 0,
         last_failed_login_at = NULL
     WHERE id = $1`,
    [id],
  );
}

/**
 * Atomic failed login counter increment with conditional auto-lock.
 *
 * Increments `failed_login_count` and sets `last_failed_login_at` in a
 * single UPDATE. If the new count reaches or exceeds `maxAttempts` and
 * the user is currently `active`, the status is changed to `locked`
 * with `locked_reason = 'auto_lockout'`.
 *
 * Returns the row's new status and count so the caller knows whether
 * a lock was triggered (for audit logging and cache invalidation).
 *
 * @param id - User UUID
 * @param maxAttempts - Threshold from system_config `max_failed_logins`
 * @returns New status and failed_login_count after the update
 */
export async function incrementFailedLoginCount(
  id: string,
  maxAttempts: number,
): Promise<{ status: string; failedLoginCount: number }> {
  const pool = getPool();

  const result = await pool.query<{ status: string; failed_login_count: number }>(
    `UPDATE users
     SET failed_login_count = failed_login_count + 1,
         last_failed_login_at = NOW(),
         status = CASE
           WHEN failed_login_count + 1 >= $2 AND status = 'active' THEN 'locked'
           ELSE status
         END,
         locked_at = CASE
           WHEN failed_login_count + 1 >= $2 AND status = 'active' THEN NOW()
           ELSE locked_at
         END,
         locked_reason = CASE
           WHEN failed_login_count + 1 >= $2 AND status = 'active' THEN 'auto_lockout'
           ELSE locked_reason
         END
     WHERE id = $1
     RETURNING status, failed_login_count`,
    [id, maxAttempts],
  );

  const row = result.rows[0];
  return {
    status: row?.status ?? 'active',
    failedLoginCount: row?.failed_login_count ?? 0,
  };
}

/**
 * Reset the failed login counter and unlock an auto-locked account.
 *
 * Used by `checkAutoUnlock` when the lockout cooldown has elapsed.
 * Only affects rows that are actually auto-locked — the WHERE clause
 * ensures we don't accidentally unlock manually-locked accounts.
 *
 * @param id - User UUID
 */
export async function resetFailedLoginCount(id: string): Promise<void> {
  const pool = getPool();

  await pool.query(
    `UPDATE users
     SET status = 'active',
         locked_at = NULL,
         locked_reason = NULL,
         failed_login_count = 0,
         last_failed_login_at = NULL
     WHERE id = $1
       AND status = 'locked'
       AND locked_reason = 'auto_lockout'`,
    [id],
  );
}

/**
 * Count the number of users in an organization.
 *
 * Useful for organization statistics, license enforcement, or rate limiting.
 *
 * @param orgId - Organization UUID
 * @returns Number of users in the organization
 */
export async function countByOrganization(orgId: string): Promise<number> {
  const pool = getPool();

  const result = await pool.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM users WHERE organization_id = $1',
    [orgId],
  );

  return parseInt(result.rows[0].count, 10);
}
