# Types & Slug Utilities: Organization Management

> **Document**: 03-types-and-slugs.md
> **Parent**: [Index](00-index.md)

## Overview

Define the TypeScript types/interfaces for organizations and implement slug
generation and validation utilities. These are the foundation that all other
modules depend on.

## Architecture

### Module Structure

```
src/organizations/
├── types.ts    — Organization types, input types, pagination types
├── slugs.ts    — Slug generation and validation functions
└── index.ts    — Barrel export (created later when all modules exist)
```

## Implementation Details

### New Types (src/organizations/types.ts)

```typescript
/** Organization status values — matches the DB CHECK constraint */
export type OrganizationStatus = 'active' | 'suspended' | 'archived';

/**
 * Full organization record as stored in the database.
 * Maps to the `organizations` table columns.
 */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  isSuperAdmin: boolean;

  // Branding
  brandingLogoUrl: string | null;
  brandingFaviconUrl: string | null;
  brandingPrimaryColor: string | null;
  brandingCompanyName: string | null;
  brandingCustomCss: string | null;

  // Locale
  defaultLocale: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new organization.
 * Slug is auto-generated from name if not provided.
 */
export interface CreateOrganizationInput {
  name: string;
  slug?: string;
  defaultLocale?: string;  // Defaults to 'en'
  branding?: BrandingInput;
}

/** Input for updating an existing organization (partial). */
export interface UpdateOrganizationInput {
  name?: string;
  defaultLocale?: string;
  branding?: BrandingInput;
}

/** Branding configuration input — all fields optional/nullable. */
export interface BrandingInput {
  logoUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string | null;
  companyName?: string | null;
  customCss?: string | null;
}

/** Options for listing organizations (paginated). */
export interface ListOrganizationsOptions {
  page: number;
  pageSize: number;
  status?: OrganizationStatus;
  search?: string;          // Search by name or slug (ILIKE)
  sortBy?: 'name' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}

/** Paginated result wrapper — generic for reuse. */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
```

### Database Row Mapping

Helper function to map a database row (snake_case) to an Organization object (camelCase):

```typescript
/** Raw database row from the organizations table */
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
  created_at: Date;
  updated_at: Date;
}

/**
 * Map a database row to an Organization object.
 * Converts snake_case column names to camelCase properties.
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

### Slug Generation & Validation (src/organizations/slugs.ts)

```typescript
/**
 * Reserved slugs that cannot be used as organization slugs.
 * These conflict with system routes or well-known paths.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin', 'api', 'health', 'static', '.well-known',
  'login', 'logout', 'callback', 'register', 'signup',
  'auth', 'oauth', 'oidc', 'token', 'jwks',
  'portal', 'dashboard', 'settings', 'account',
  'favicon.ico', 'robots.txt', 'sitemap.xml',
]);

/** Slug format: 3-100 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphens */
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$/;

/**
 * Generate a URL-safe slug from an organization name.
 *
 * Rules:
 * - Convert to lowercase
 * - Replace non-alphanumeric chars with hyphens
 * - Collapse multiple consecutive hyphens
 * - Trim leading/trailing hyphens
 * - Truncate to 100 characters
 *
 * @param name - Organization name
 * @returns Generated slug
 */
export function generateSlug(name: string): string { ... }

/**
 * Validate a slug against format and reserved word rules.
 *
 * Does NOT check uniqueness — that's the repository's job.
 *
 * @param slug - Slug to validate
 * @returns Object with isValid boolean and optional error message
 */
export function validateSlug(slug: string): { isValid: boolean; error?: string } { ... }
```

## Error Handling

| Error Case                        | Handling Strategy                     |
|-----------------------------------|---------------------------------------|
| Empty name for slug generation    | Return empty string (caller validates)|
| Slug too short after processing   | `validateSlug` returns error          |
| Slug is reserved word             | `validateSlug` returns error          |
| Invalid characters in slug        | `validateSlug` returns error          |

## Testing Requirements

### Slug Utilities (~15 tests)

- `generateSlug()`: normal names, special characters, unicode, very long names, empty string
- `validateSlug()`: valid slugs, too short, too long, reserved words, invalid chars, leading/trailing hyphens
- `RESERVED_SLUGS`: verify all expected words are present

### Type Mapping (~5 tests)

- `mapRowToOrganization()`: correct mapping, null handling for branding fields, status coercion
