/**
 * Application and ApplicationModule types and interfaces.
 *
 * Defines the data structures for the application model, including
 * the full database record, input types for create/update, and
 * pagination helpers. Also provides mapping functions to convert
 * snake_case database rows to camelCase TypeScript objects.
 *
 * Applications are platform-wide (not scoped to organizations).
 * They represent SaaS products (e.g., "BusinessSuite") that
 * organizations subscribe to. Each application can have modules
 * (e.g., "CRM", "Invoicing") used for permission namespacing.
 *
 * These types are the foundation that all other application modules
 * depend on (repository, cache, service, routes).
 */

// Re-export PaginatedResult so consumers don't need to import from organizations
export type { PaginatedResult } from '../organizations/types.js';

// ---------------------------------------------------------------------------
// Application status
// ---------------------------------------------------------------------------

/** Application status values — matches the DB CHECK constraint */
export type ApplicationStatus = 'active' | 'inactive' | 'archived';

/** Module status values — matches the DB CHECK constraint */
export type ModuleStatus = 'active' | 'inactive';

// ---------------------------------------------------------------------------
// Full application record
// ---------------------------------------------------------------------------

/**
 * Full application record as stored in the database.
 * Maps to the `applications` table columns (see migration 003).
 */
export interface Application {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ApplicationStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Full application module record
// ---------------------------------------------------------------------------

/**
 * Full application module record as stored in the database.
 * Maps to the `application_modules` table columns (see migration 003).
 * Module slugs are unique within their parent application (composite key).
 */
export interface ApplicationModule {
  id: string;
  applicationId: string;
  name: string;
  slug: string;
  description: string | null;
  status: ModuleStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/**
 * Input for creating a new application.
 * Slug is auto-generated from name if not provided.
 */
export interface CreateApplicationInput {
  name: string;
  slug?: string;
  description?: string;
}

/** Input for updating an existing application (partial). */
export interface UpdateApplicationInput {
  name?: string;
  description?: string | null; // null to clear
}

/** Input for creating a module within an application. */
export interface CreateModuleInput {
  name: string;
  slug?: string;
  description?: string;
}

/** Input for updating an existing module (partial). */
export interface UpdateModuleInput {
  name?: string;
  description?: string | null; // null to clear
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/** Options for listing applications (paginated). */
export interface ListApplicationsOptions {
  page: number;
  pageSize: number;
  status?: ApplicationStatus;
  search?: string; // Search by name or slug (ILIKE)
  sortBy?: 'name' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// Database row mapping
// ---------------------------------------------------------------------------

/** Raw database row from the applications table (snake_case columns). */
export interface ApplicationRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

/** Raw database row from the application_modules table (snake_case columns). */
export interface ApplicationModuleRow {
  id: string;
  application_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Map a database row to an Application object.
 *
 * Converts snake_case column names from PostgreSQL to camelCase
 * TypeScript properties. The `status` string is cast to
 * `ApplicationStatus` — the DB CHECK constraint guarantees it
 * is one of the valid values.
 *
 * @param row - Raw database row from the applications table
 * @returns Mapped Application object with camelCase properties
 */
export function mapRowToApplication(row: ApplicationRow): Application {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status as ApplicationStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Map a database row to an ApplicationModule object.
 *
 * Converts snake_case column names from PostgreSQL to camelCase
 * TypeScript properties. The `status` string is cast to
 * `ModuleStatus` — the DB CHECK constraint guarantees it
 * is one of the valid values.
 *
 * @param row - Raw database row from the application_modules table
 * @returns Mapped ApplicationModule object with camelCase properties
 */
export function mapRowToModule(row: ApplicationModuleRow): ApplicationModule {
  return {
    id: row.id,
    applicationId: row.application_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status as ModuleStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
