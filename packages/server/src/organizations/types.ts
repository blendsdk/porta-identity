/**
 * Organization types and interfaces.
 *
 * Defines the data structures for the organization (tenant) model,
 * including the full database record, input types for create/update,
 * branding configuration, and pagination helpers. Also provides
 * a mapping function to convert snake_case database rows to
 * camelCase TypeScript objects.
 *
 * These types are the foundation that all other organization modules
 * depend on (repository, cache, service, routes).
 */

// ---------------------------------------------------------------------------
// Organization status
// ---------------------------------------------------------------------------

import type { TwoFactorPolicy } from '../two-factor/types.js';
import type { LoginMethod } from '../clients/types.js';

/** Organization status values — matches the DB CHECK constraint */
export type OrganizationStatus = 'active' | 'suspended' | 'archived';

// ---------------------------------------------------------------------------
// Full organization record
// ---------------------------------------------------------------------------

/**
 * Full organization record as stored in the database.
 * Maps to the `organizations` table columns (see migration 002).
 */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  isSuperAdmin: boolean;

  // Branding — per-tenant login page customization
  brandingLogoUrl: string | null;
  brandingFaviconUrl: string | null;
  brandingPrimaryColor: string | null;
  brandingCompanyName: string | null;
  brandingCustomCss: string | null;

  // Locale
  defaultLocale: string;

  // Two-factor authentication policy
  /** Controls whether 2FA is required for org members */
  twoFactorPolicy: TwoFactorPolicy;

  /**
   * Default login methods for all clients in this organization.
   *
   * Always non-empty (the DB column has `NOT NULL DEFAULT ARRAY['password',
   * 'magic_link']` and the service layer rejects empty inputs). A client
   * inherits this list when its own `loginMethods` is `null`.
   */
  defaultLoginMethods: LoginMethod[];

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/**
 * Input for creating a new organization.
 * Slug is auto-generated from name if not provided.
 */
export interface CreateOrganizationInput {
  name: string;
  slug?: string;
  defaultLocale?: string; // Defaults to 'en'
  branding?: BrandingInput;
  /**
   * Optional override for the org-wide default login methods.
   * If omitted, the database `DEFAULT ARRAY['password', 'magic_link']`
   * applies. The service layer validates + normalizes the array.
   */
  defaultLoginMethods?: LoginMethod[];
}

/** Input for updating an existing organization (partial). */
export interface UpdateOrganizationInput {
  name?: string;
  defaultLocale?: string;
  twoFactorPolicy?: TwoFactorPolicy;
  branding?: BrandingInput;
  /**
   * New org-wide default login methods. Must be a non-empty array of
   * valid {@link LoginMethod} values; the service layer enforces both.
   */
  defaultLoginMethods?: LoginMethod[];
}

/** Branding configuration input — all fields optional/nullable. */
export interface BrandingInput {
  logoUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string | null;
  companyName?: string | null;
  customCss?: string | null;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/** Options for listing organizations (paginated). */
export interface ListOrganizationsOptions {
  page: number;
  pageSize: number;
  status?: OrganizationStatus;
  search?: string; // Search by name or slug (ILIKE)
  sortBy?: 'name' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated result wrapper — generic so it can be reused for other
 * list endpoints beyond organizations.
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Database row mapping
// ---------------------------------------------------------------------------

/** Raw database row from the organizations table (snake_case columns). */
export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  is_super_admin: boolean;
  branding_logo_url: string | null;
  branding_favicon_url: string | null;
  branding_primary_color: string | null;
  branding_company_name: string | null;
  branding_custom_css: string | null;
  default_locale: string;
  two_factor_policy: string;
  default_login_methods: string[];
  created_at: Date;
  updated_at: Date;
}

/**
 * Map a database row to an Organization object.
 *
 * Converts snake_case column names from PostgreSQL to camelCase
 * TypeScript properties. The `status` string is cast to
 * `OrganizationStatus` — the DB CHECK constraint guarantees it
 * is one of the valid values.
 *
 * @param row - Raw database row from the organizations table
 * @returns Mapped Organization object with camelCase properties
 */
export function mapRowToOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status as OrganizationStatus,
    isSuperAdmin: row.is_super_admin,
    brandingLogoUrl: row.branding_logo_url,
    brandingFaviconUrl: row.branding_favicon_url,
    brandingPrimaryColor: row.branding_primary_color,
    brandingCompanyName: row.branding_company_name,
    brandingCustomCss: row.branding_custom_css,
    defaultLocale: row.default_locale,
    twoFactorPolicy: row.two_factor_policy as TwoFactorPolicy,
    // Defensive default: the DB column is NOT NULL with a sensible
    // default, but if a stale cache or test fixture omits the field
    // we still surface a usable value.
    defaultLoginMethods: (row.default_login_methods ?? [
      'password',
      'magic_link',
    ]) as LoginMethod[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Destroy operation types
// ---------------------------------------------------------------------------

/** Counts of child entities that will be cascade-deleted with an organization. */
export interface CascadeCounts {
  applications: number;
  clients: number;
  users: number;
  roles: number;
  permissions: number;
  claim_definitions: number;
}

/** Result of a successful organization destroy operation. */
export interface DestroyResult {
  organization: Organization;
  cascadeCounts: CascadeCounts;
}
