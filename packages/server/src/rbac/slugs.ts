/**
 * Slug generation and validation utilities for RBAC.
 *
 * Two types of slugs are used in the RBAC module:
 *
 * Role and permission slugs are exact external claim values. Explicit values keep their case and
 * printable characters after surrounding whitespace is removed. Generated role slugs retain the
 * familiar kebab-case default.
 *
 * This module provides:
 * - `generateRoleSlug(name)` — Derive a role slug from a role name
 * - `normalizeRbacSlug(slug)` — Remove surrounding whitespace before storage and comparison
 * - `validateRoleSlug(slug)` — Check the role claim value safety bounds
 * - `validatePermissionSlug(slug)` — Check the permission claim value safety bounds
 * - `parsePermissionSlug(slug)` — Decompose a permission slug into its parts
 */

// ---------------------------------------------------------------------------
// Role slug format
// ---------------------------------------------------------------------------

/** Removes surrounding whitespace while preserving the exact internal claim value. */
export function normalizeRbacSlug(slug: string): string {
  return slug.trim();
}

/** Returns whether text contains an ASCII or C1 control character. */
function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}

/** Validates one normalized, bounded, control-free external claim value. */
function validateRbacSlug(slug: string, maximumLength: number): boolean {
  const normalized = normalizeRbacSlug(slug);
  return (
    normalized.length > 0 &&
    normalized.length <= maximumLength &&
    !containsControlCharacter(normalized)
  );
}

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
 * The trimmed value must contain 1–100 printable characters. Case and internal characters are
 * preserved because this value is emitted directly to external applications.
 *
 * Does NOT check uniqueness — that's the repository/service layer's job.
 *
 * @param slug - Role slug string to validate
 * @returns true if the slug format is valid, false otherwise
 *
 * @example
 * validateRoleSlug('crm-editor')  // true
 * validateRoleSlug('admin')       // true
 * validateRoleSlug('CRM Editor')  // true
 * validateRoleSlug('')            // false (empty)
 */
export function validateRoleSlug(slug: string): boolean {
  return validateRbacSlug(slug, 100);
}

// ---------------------------------------------------------------------------
// Permission slug validation
// ---------------------------------------------------------------------------

/**
 * Validate a permission claim value. `module:resource:action` remains a useful convention, but is
 * not mandatory for external applications that already use another identifier scheme.
 *
 * @param slug - Permission slug to validate
 * @returns true if the slug format is valid, false otherwise
 *
 * @example
 * validatePermissionSlug('crm:contacts:read')     // true
 * validatePermissionSlug('admin:system:manage')    // true
 * validatePermissionSlug('crm:sub-module:items:write') // true (4+ segments OK)
 * validatePermissionSlug('CAN_ADD_ORDER')          // true
 * validatePermissionSlug('access-that-resource')   // true
 * validatePermissionSlug('')                       // false (empty)
 */
export function validatePermissionSlug(slug: string): boolean {
  return validateRbacSlug(slug, 150);
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
 * Returns null when the claim value does not use the conventional three-or-more-part colon form.
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
  const segments = normalizeRbacSlug(slug).split(':');
  if (!validatePermissionSlug(slug) || segments.length < 3 || segments.some((part) => !part)) {
    return null;
  }
  // First segment = module, last = action, middle = resource
  const module = segments[0];
  const action = segments[segments.length - 1];
  const resource = segments.slice(1, -1).join(':');

  return { module, resource, action };
}
