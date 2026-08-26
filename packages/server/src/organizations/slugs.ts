/**
 * Slug generation and validation utilities.
 *
 * Organization slugs are URL-safe identifiers used in path-based
 * multi-tenancy (e.g., /{slug}/.well-known/openid-configuration).
 * They must be 3–100 characters, lowercase alphanumeric with hyphens,
 * and cannot be a reserved system word.
 *
 * This module provides:
 * - `generateSlug(name)` — Derive a slug from an organization name
 * - `validateSlug(slug)` — Check format and reserved-word rules
 * - `RESERVED_SLUGS` — The set of words that cannot be used as slugs
 */

// ---------------------------------------------------------------------------
// Reserved slugs
// ---------------------------------------------------------------------------

/**
 * Reserved slugs that cannot be used as organization slugs.
 * These conflict with system routes, well-known paths, or
 * could cause confusion with internal functionality.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // System routes
  'admin',
  'api',
  'health',
  'static',
  '.well-known',

  // Auth-related paths
  'login',
  'logout',
  'callback',
  'register',
  'signup',
  'auth',
  'oauth',
  'oidc',
  'token',
  'jwks',

  // Application paths
  'portal',
  'dashboard',
  'settings',
  'account',

  // Well-known files
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
]);

// ---------------------------------------------------------------------------
// Slug format
// ---------------------------------------------------------------------------

/**
 * Slug format regex: 3–100 characters, lowercase alphanumeric + hyphens.
 * Must start and end with an alphanumeric character (no leading/trailing hyphens).
 * The middle section allows 1–98 characters of alphanumeric + hyphens.
 */
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$/;

// ---------------------------------------------------------------------------
// Slug generation
// ---------------------------------------------------------------------------

/**
 * Generate a URL-safe slug from an organization name.
 *
 * Transformation rules:
 * 1. Convert to lowercase
 * 2. Replace non-alphanumeric characters with hyphens
 * 3. Collapse multiple consecutive hyphens into one
 * 4. Trim leading and trailing hyphens
 * 5. Truncate to 100 characters (trimming trailing hyphens after truncation)
 *
 * Returns an empty string for empty/whitespace-only input — the caller
 * (service layer) is responsible for validation.
 *
 * @param name - Organization name to derive a slug from
 * @returns Generated slug string
 */
export function generateSlug(name: string): string {
  if (!name || !name.trim()) {
    return '';
  }

  const slug = name
    .toLowerCase()
    // Replace any character that's not a-z, 0-9, or hyphen with a hyphen
    .replace(/[^a-z0-9-]/g, '-')
    // Collapse consecutive hyphens into a single hyphen
    .replace(/-+/g, '-')
    // Remove leading and trailing hyphens
    .replace(/^-+|-+$/g, '');

  // Truncate to 100 characters, then trim any trailing hyphen caused by truncation
  return slug.slice(0, 100).replace(/-+$/, '');
}

// ---------------------------------------------------------------------------
// Slug validation
// ---------------------------------------------------------------------------

/** Result of slug validation — isValid flag with optional error message */
export interface SlugValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validate a slug against format and reserved word rules.
 *
 * Checks (in order):
 * 1. Minimum length (3 characters)
 * 2. Maximum length (100 characters)
 * 3. Format (lowercase alphanumeric + hyphens, no leading/trailing hyphens)
 * 4. Not a reserved word
 *
 * Does NOT check uniqueness — that's the repository/service layer's job.
 *
 * @param slug - Slug string to validate
 * @returns Object with isValid boolean and optional error message
 */
export function validateSlug(slug: string): SlugValidationResult {
  // Check minimum length
  if (slug.length < 3) {
    return { isValid: false, error: 'Slug must be at least 3 characters' };
  }

  // Check maximum length
  if (slug.length > 100) {
    return { isValid: false, error: 'Slug must be at most 100 characters' };
  }

  // Check format: lowercase alphanumeric + hyphens, no leading/trailing hyphens
  if (!SLUG_REGEX.test(slug)) {
    return {
      isValid: false,
      error:
        'Slug must contain only lowercase letters, numbers, and hyphens, ' +
        'and cannot start or end with a hyphen',
    };
  }

  // Check reserved words
  if (RESERVED_SLUGS.has(slug)) {
    return { isValid: false, error: `Slug "${slug}" is reserved and cannot be used` };
  }

  return { isValid: true };
}
