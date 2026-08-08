/**
 * Custom claim validators.
 *
 * Provides validation logic for claim names and values:
 *   - Reserved claim name check (OIDC standard + Porta internal names)
 *   - Claim name format validation (lowercase alphanumeric + underscores)
 *   - Value type validation against claim definition type
 *
 * These validators are used by the service layer before any database
 * operations to provide clear error messages.
 */

import type { ClaimType } from './types.js';

// ---------------------------------------------------------------------------
// Reserved claim names
// ---------------------------------------------------------------------------

/**
 * OIDC standard and Porta reserved claim names.
 *
 * Custom claims cannot use any of these names to prevent conflicts with
 * standard OIDC claims (RFC 7519, OpenID Connect Core 1.0 §5.1) and
 * Porta's own internal claims (roles, permissions, org context).
 */
export const RESERVED_CLAIM_NAMES: ReadonlySet<string> = new Set([
  // OIDC Core / JWT standard claims (RFC 7519)
  'sub', 'iss', 'aud', 'exp', 'iat', 'nbf', 'jti', 'nonce', 'at_hash', 'c_hash',
  // OpenID Connect Standard Claims (§5.1)
  'name', 'given_name', 'family_name', 'middle_name', 'nickname',
  'preferred_username', 'profile', 'picture', 'website',
  'email', 'email_verified', 'gender', 'birthdate', 'zoneinfo', 'locale',
  'phone_number', 'phone_number_verified', 'address', 'updated_at',
  // Porta internal claims (used by RBAC and tenant context)
  'roles', 'permissions', 'org_id', 'org_slug',
]);

/**
 * Check if a claim name is reserved (cannot be used as a custom claim).
 *
 * @param name - Claim name to check
 * @returns true if the name is reserved
 */
export function isReservedClaimName(name: string): boolean {
  return RESERVED_CLAIM_NAMES.has(name);
}

// ---------------------------------------------------------------------------
// Claim name validation
// ---------------------------------------------------------------------------

/**
 * Regex for valid claim names: lowercase letters, digits, and underscores.
 * Must start with a letter, 1-100 characters.
 * Examples: "department", "cost_center", "team_id"
 */
const CLAIM_NAME_REGEX = /^[a-z][a-z0-9_]{0,99}$/;

/**
 * Validate a custom claim name.
 *
 * Rules:
 * 1. Must not be empty
 * 2. Must match format: lowercase alphanumeric + underscores, starting with a letter
 * 3. Must be 1-100 characters
 * 4. Must not be a reserved OIDC/Porta claim name
 *
 * @param name - Claim name to validate
 * @returns Object with valid=true or valid=false with reason
 */
export function validateClaimName(name: string): { valid: boolean; reason?: string } {
  // Check for empty string
  if (!name || name.length === 0) {
    return { valid: false, reason: 'Claim name must not be empty' };
  }

  // Check length constraint (max 100 chars)
  if (name.length > 100) {
    return { valid: false, reason: 'Claim name must not exceed 100 characters' };
  }

  // Check format: lowercase alphanumeric + underscores, starting with a letter
  if (!CLAIM_NAME_REGEX.test(name)) {
    return {
      valid: false,
      reason: 'Claim name must start with a lowercase letter and contain only lowercase letters, digits, and underscores',
    };
  }

  // Check against reserved names
  if (isReservedClaimName(name)) {
    return { valid: false, reason: `Claim name '${name}' is reserved` };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Claim value type validation
// ---------------------------------------------------------------------------

/**
 * Validate that a claim value matches the expected type from the definition.
 *
 * Type rules:
 * - string: typeof value === 'string'
 * - number: typeof value === 'number' && isFinite(value) (NaN and Infinity rejected)
 * - boolean: typeof value === 'boolean'
 * - json: value !== null && typeof value === 'object' (arrays and objects allowed)
 *
 * @param claimType - Expected type from the claim definition
 * @param value - The value to validate
 * @returns Object with valid=true or valid=false with reason
 */
export function validateClaimValue(
  claimType: ClaimType,
  value: unknown,
): { valid: boolean; reason?: string } {
  // Null and undefined are never valid claim values
  if (value === null || value === undefined) {
    return { valid: false, reason: `Expected ${claimType} value, got null/undefined` };
  }

  switch (claimType) {
    case 'string':
      if (typeof value !== 'string') {
        return { valid: false, reason: `Expected string, got ${typeof value}` };
      }
      return { valid: true };

    case 'number':
      if (typeof value !== 'number') {
        return { valid: false, reason: `Expected number, got ${typeof value}` };
      }
      // Reject NaN and Infinity — these are not valid JSONB values
      if (!Number.isFinite(value)) {
        return { valid: false, reason: 'Number must be finite (NaN and Infinity are not allowed)' };
      }
      return { valid: true };

    case 'boolean':
      if (typeof value !== 'boolean') {
        return { valid: false, reason: `Expected boolean, got ${typeof value}` };
      }
      return { valid: true };

    case 'json':
      // JSON type expects objects or arrays (not primitives)
      if (typeof value !== 'object') {
        return { valid: false, reason: `Expected JSON object/array, got ${typeof value}` };
      }
      return { valid: true };

    default:
      return { valid: false, reason: `Unknown claim type: ${claimType as string}` };
  }
}
