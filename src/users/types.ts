/**
 * User types and interfaces.
 *
 * Defines the data structures for the user model, including the full
 * database record, input types for create/update, and pagination helpers.
 * Also provides a mapping function to convert snake_case database rows
 * to camelCase TypeScript objects.
 *
 * Users belong to exactly one organization and their profile fields
 * follow the OIDC Standard Claims specification (OpenID Connect Core
 * 1.0, §5.1). The `password_hash` column is never exposed outside the
 * repository layer — the `User` interface only has a derived `hasPassword`
 * boolean.
 *
 * These types are the foundation that all other user modules depend on
 * (repository, cache, service, routes, claims).
 */

import type { PaginatedResult } from '../organizations/index.js';

// Re-export PaginatedResult so consumers can import from users module too
export type { PaginatedResult };

// ---------------------------------------------------------------------------
// User status
// ---------------------------------------------------------------------------

/**
 * User status values — matches the DB CHECK constraint.
 *
 * Lifecycle transitions:
 *   - active → inactive (deactivate), suspended (suspend), locked (lock)
 *   - inactive → active (reactivate)
 *   - suspended → active (unsuspend)
 *   - locked → active (unlock)
 */
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'locked';

// ---------------------------------------------------------------------------
// Full user record
// ---------------------------------------------------------------------------

/**
 * Full user record as used throughout the application.
 *
 * Maps to the `users` table columns (see migration 005), but converts
 * snake_case to camelCase and replaces `password_hash` with a derived
 * `hasPassword` boolean for security — the hash never leaves the
 * repository layer.
 */
export interface User {
  id: string;
  organizationId: string;

  // Authentication
  email: string;
  emailVerified: boolean;
  /** Derived from password_hash IS NOT NULL — the hash is never exposed */
  hasPassword: boolean;
  passwordChangedAt: Date | null;

  // OIDC Standard Claims (§5.1)
  givenName: string | null;
  familyName: string | null;
  middleName: string | null;
  nickname: string | null;
  preferredUsername: string | null;
  profileUrl: string | null;
  pictureUrl: string | null;
  websiteUrl: string | null;
  gender: string | null;
  /** ISO 8601 date string (YYYY-MM-DD) — stored as string per OIDC §5.1 */
  birthdate: string | null;
  zoneinfo: string | null;
  locale: string | null;
  phoneNumber: string | null;
  phoneNumberVerified: boolean;

  // Address (OIDC §5.1.1)
  addressStreet: string | null;
  addressLocality: string | null;
  addressRegion: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;

  // Status & lifecycle
  status: UserStatus;
  lockedAt: Date | null;
  lockedReason: string | null;
  lastLoginAt: Date | null;
  loginCount: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/**
 * Input for creating a new user.
 *
 * Only `organizationId` and `email` are required. All profile fields
 * are optional — they can be set later via update. A `password` field
 * (plaintext) is accepted and will be hashed before storage; omit it
 * for passwordless-only users.
 */
export interface CreateUserInput {
  organizationId: string;
  email: string;
  password?: string;

  // OIDC profile fields — all optional
  givenName?: string;
  familyName?: string;
  middleName?: string;
  nickname?: string;
  preferredUsername?: string;
  profileUrl?: string;
  pictureUrl?: string;
  websiteUrl?: string;
  gender?: string;
  birthdate?: string;
  zoneinfo?: string;
  locale?: string;
  phoneNumber?: string;
  phoneNumberVerified?: boolean;

  // Address
  address?: AddressInput;
}

/**
 * Input for updating an existing user (partial).
 *
 * All fields are optional. Setting a field to `null` clears it in the
 * database. Omitting a field leaves it unchanged.
 */
export interface UpdateUserInput {
  email?: string;
  emailVerified?: boolean;

  // OIDC profile fields — all optional, nullable to allow clearing
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

  // Address — individual fields, nullable to allow clearing
  address?: AddressInput;
}

/**
 * Address input — all fields optional/nullable.
 * Maps to the address_* columns in the users table.
 */
export interface AddressInput {
  street?: string | null;
  locality?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

// ---------------------------------------------------------------------------
// List/pagination options
// ---------------------------------------------------------------------------

/**
 * Options for listing users within an organization (paginated).
 * Supports filtering by status, text search across name/email,
 * and configurable sort order.
 */
export interface UserListOptions {
  organizationId: string;
  page: number;
  pageSize: number;
  status?: UserStatus;
  /** Searches across email, given_name, family_name (ILIKE) */
  search?: string;
  sortBy?: 'email' | 'given_name' | 'family_name' | 'created_at' | 'last_login_at';
  sortOrder?: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// Database row mapping
// ---------------------------------------------------------------------------

/**
 * Raw database row from the users table (snake_case columns).
 *
 * Includes `password_hash` which is needed by the repository layer
 * but must NEVER be exposed via the `User` interface.
 */
export interface UserRow {
  id: string;
  organization_id: string;
  email: string;
  email_verified: boolean;
  password_hash: string | null;
  password_changed_at: Date | null;
  given_name: string | null;
  family_name: string | null;
  middle_name: string | null;
  nickname: string | null;
  preferred_username: string | null;
  profile_url: string | null;
  picture_url: string | null;
  website_url: string | null;
  gender: string | null;
  /** DATE column — pg returns as string or Date depending on config */
  birthdate: string | null;
  zoneinfo: string | null;
  locale: string | null;
  phone_number: string | null;
  phone_number_verified: boolean;
  address_street: string | null;
  address_locality: string | null;
  address_region: string | null;
  address_postal_code: string | null;
  address_country: string | null;
  status: string;
  locked_at: Date | null;
  locked_reason: string | null;
  last_login_at: Date | null;
  login_count: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Map a database row to a User object.
 *
 * Converts snake_case column names from PostgreSQL to camelCase
 * TypeScript properties. The `password_hash` field is converted to
 * a `hasPassword` boolean — the hash itself is never included in the
 * User object. The `status` string is cast to `UserStatus` because
 * the DB CHECK constraint guarantees it is a valid value.
 *
 * @param row - Raw database row from the users table
 * @returns Mapped User object with camelCase properties
 */
export function mapRowToUser(row: UserRow): User {
  return {
    id: row.id,
    organizationId: row.organization_id,

    // Authentication — derive hasPassword from password_hash
    email: row.email,
    emailVerified: row.email_verified,
    hasPassword: row.password_hash !== null,
    passwordChangedAt: row.password_changed_at,

    // OIDC Standard Claims
    givenName: row.given_name,
    familyName: row.family_name,
    middleName: row.middle_name,
    nickname: row.nickname,
    preferredUsername: row.preferred_username,
    profileUrl: row.profile_url,
    pictureUrl: row.picture_url,
    websiteUrl: row.website_url,
    gender: row.gender,
    birthdate: row.birthdate,
    zoneinfo: row.zoneinfo,
    locale: row.locale,
    phoneNumber: row.phone_number,
    phoneNumberVerified: row.phone_number_verified,

    // Address
    addressStreet: row.address_street,
    addressLocality: row.address_locality,
    addressRegion: row.address_region,
    addressPostalCode: row.address_postal_code,
    addressCountry: row.address_country,

    // Status & lifecycle
    status: row.status as UserStatus,
    lockedAt: row.locked_at,
    lockedReason: row.locked_reason,
    lastLoginAt: row.last_login_at,
    loginCount: row.login_count,

    // Timestamps
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
