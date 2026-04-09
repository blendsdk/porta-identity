/**
 * Slug generation and validation utilities for RBAC.
 *
 * Two types of slugs are used in the RBAC module:
 *
 * 1. **Role slugs** — kebab-case identifiers (e.g., "crm-editor").
 *    Same format as organization/application slugs. Auto-generated
 *    from role names or provided manually.
 *
 * 2. **Permission slugs** — colon-separated namespaced identifiers
 *    following the `module:resource:action` format (e.g., "crm:contacts:read").
 *    Each segment must be lowercase alphanumeric with hyphens.
 *    Minimum 3 segments required.
 *
 * This module provides:
 * - `generateRoleSlug(name)` — Derive a role slug from a role name
 * - `validateRoleSlug(slug)` — Check role slug format (kebab-case, 1-100 chars)
 * - `validatePermissionSlug(slug)` — Check permission slug follows module:resource:action
 * - `parsePermissionSlug(slug)` — Decompose a permission slug into its parts
 */

// ---------------------------------------------------------------------------
// Role slug format
// ---------------------------------------------------------------------------

/**
 * Role slug format regex: 1–100 characters, lowercase alphanumeric + hyphens.
 * Must start and end with an alphanumeric character (no leading/trailing hyphens).
 * Single character slugs are allowed (unlike organization slugs which require 3+).
 */
const ROLE_SLUG_REGEX = /^[a-z0-9]([a-z0-9-]{0,98}[a-z0-9])?$/;

// ---------------------------------------------------------------------------
// Permission slug format
// ---------------------------------------------------------------------------

/**
 * Each segment of a permission slug: lowercase alphanumeric + hyphens,
 * must start and end with an alphanumeric character.
 */
const PERMISSION_SEGMENT_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

// ---------------------------------------------------------------------------
// Role slug generation
// ---------------------------------------------------------------------------

/**
 * Generate a URL-safe slug from a role name.
 *
 * Uses the same slugification logic as organizations/applications:
 * 1. Convert to lowercase
 * 2. Replace non-alphanumeric characters with hyphens
 * 3. Collapse multiple consecutive hyphens into one
 * 4. Trim leading and trailing hyphens
 * 5. Truncate to 100 characters (trimming trailing hyphens after truncation)
 *
 * Returns an empty string for empty/whitespace-only input — the caller
 * (service layer) is responsible for validation.
 *
 * @param name - Role name to derive a slug from
 * @returns Generated slug string
 *
 * @example
 * generateRoleSlug('CRM Editor')       // "crm-editor"
 * generateRoleSlug('Invoice Approver') // "invoice-approver"
 * generateRoleSlug('')                 // ""
 */
export function generateRoleSlug(name: string): string {
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
// Role slug validation
// ---------------------------------------------------------------------------

/**
 * Validate a role slug format.
 *
 * Rules:
 * - 1–100 characters long
 * - Lowercase alphanumeric characters and hyphens only
 * - Cannot start or end with a hyphen
 * - Empty strings are invalid
 *
 * Does NOT check uniqueness — that's the repository/service layer's job.
 *
 * @param slug - Role slug string to validate
 * @returns true if the slug format is valid, false otherwise
 *
 * @example
 * validateRoleSlug('crm-editor')  // true
 * validateRoleSlug('admin')       // true
 * validateRoleSlug('CRM Editor')  // false (spaces, uppercase)
 * validateRoleSlug('')            // false (empty)
 */
export function validateRoleSlug(slug: string): boolean {
  // Must be 1–100 characters
  if (!slug || slug.length > 100) {
    return false;
  }

  return ROLE_SLUG_REGEX.test(slug);
}

// ---------------------------------------------------------------------------
// Permission slug validation
// ---------------------------------------------------------------------------

/**
 * Validate a permission slug follows the module:resource:action format.
 *
 * Rules:
 * - Must have at least 3 segments separated by colons
 * - Each segment must be lowercase alphanumeric with hyphens
 * - Each segment must start and end with an alphanumeric character
 * - Empty segments are not allowed
 * - Total length must not exceed 150 characters (matches DB column)
 *
 * @param slug - Permission slug to validate
 * @returns true if the slug format is valid, false otherwise
 *
 * @example
 * validatePermissionSlug('crm:contacts:read')     // true
 * validatePermissionSlug('admin:system:manage')    // true
 * validatePermissionSlug('crm:sub-module:items:write') // true (4+ segments OK)
 * validatePermissionSlug('contacts-read')          // false (no colons)
 * validatePermissionSlug('a:b')                    // false (only 2 segments)
 * validatePermissionSlug('')                       // false (empty)
 */
export function validatePermissionSlug(slug: string): boolean {
  // Must be non-empty and within DB column limit (VARCHAR(150))
  if (!slug || slug.length > 150) {
    return false;
  }

  // Split on colons — need at least 3 segments
  const segments = slug.split(':');
  if (segments.length < 3) {
    return false;
  }

  // Each segment must match the segment format
  return segments.every(
    (segment) => segment.length > 0 && PERMISSION_SEGMENT_REGEX.test(segment),
  );
}

// ---------------------------------------------------------------------------
// Permission slug parsing
// ---------------------------------------------------------------------------

/** Parsed components of a permission slug. */
export interface ParsedPermissionSlug {
  module: string;
  resource: string;
  action: string;
}

/**
 * Parse a permission slug into its module, resource, and action components.
 *
 * The first segment is the module, the last segment is the action,
 * and everything in between is joined as the resource. This supports
 * both 3-segment slugs (crm:contacts:read) and 4+ segment slugs
 * (crm:sub-module:items:write → module="crm", resource="sub-module:items", action="write").
 *
 * Returns null if the slug is invalid (fails validatePermissionSlug).
 *
 * @param slug - Permission slug to parse
 * @returns Parsed components or null if invalid
 *
 * @example
 * parsePermissionSlug('crm:contacts:read')
 * // { module: 'crm', resource: 'contacts', action: 'read' }
 *
 * parsePermissionSlug('crm:sub:items:write')
 * // { module: 'crm', resource: 'sub:items', action: 'write' }
 *
 * parsePermissionSlug('invalid')
 * // null
 */
export function parsePermissionSlug(slug: string): ParsedPermissionSlug | null {
  if (!validatePermissionSlug(slug)) {
    return null;
  }

  const segments = slug.split(':');
  // First segment = module, last = action, middle = resource
  const module = segments[0];
  const action = segments[segments.length - 1];
  const resource = segments.slice(1, -1).join(':');

  return { module, resource, action };
}
