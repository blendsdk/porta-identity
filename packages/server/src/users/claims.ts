/**
 * OIDC Standard Claims builder.
 *
 * Builds OIDC Standard Claims from a User profile based on the granted
 * OAuth2 scopes. Follows the scope-to-claims mapping defined in
 * OpenID Connect Core 1.0, §5.4:
 *
 *   - openid  → sub (always included)
 *   - profile → name, given_name, family_name, middle_name, nickname,
 *               preferred_username, profile, picture, website, gender,
 *               birthdate, zoneinfo, locale, updated_at
 *   - email   → email, email_verified
 *   - phone   → phone_number, phone_number_verified
 *   - address → address (structured object per §5.1.1)
 *
 * Custom claims (org_id, org_slug, roles) are handled in RD-08, not here.
 * This module only handles the OIDC Standard Claims specification.
 */

import type { User } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * OIDC claims object — flexible key-value with required `sub` field.
 * Uses index signature for the wide variety of standard claim names.
 */
export interface OidcClaims {
  sub: string;
  [key: string]: unknown;
}

/**
 * Structured address per OIDC §5.1.1.
 * All fields are optional/nullable — the address object is only
 * included when at least one field has a value.
 */
export interface OidcAddress {
  street_address?: string | null;
  locality?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

// ---------------------------------------------------------------------------
// Claims builder
// ---------------------------------------------------------------------------

/**
 * Build OIDC Standard Claims from a user profile based on granted scopes.
 *
 * The `sub` claim is always included. Additional claims are added based
 * on which scopes are present in the `scopes` array. Null profile fields
 * are included as null (not omitted) — per the OIDC spec, null indicates
 * "no value" which is different from "not requested".
 *
 * The `updated_at` claim is a Unix timestamp (seconds since epoch) per
 * the OIDC specification, not an ISO 8601 string.
 *
 * @param user - User whose profile claims to build
 * @param scopes - Array of granted OAuth2 scope strings
 * @returns Claims object with `sub` and scope-dependent fields
 */
export function buildUserClaims(user: User, scopes: string[]): OidcClaims {
  // sub is always included (required by OIDC)
  const claims: OidcClaims = { sub: user.id };

  // profile scope — OIDC §5.4 profile claims
  if (scopes.includes('profile')) {
    // Derive "name" from given_name + middle_name + family_name parts
    const nameParts = [user.givenName, user.middleName, user.familyName].filter(Boolean);
    if (nameParts.length > 0) {
      claims.name = nameParts.join(' ');
    }

    claims.given_name = user.givenName;
    claims.family_name = user.familyName;
    claims.middle_name = user.middleName;
    claims.nickname = user.nickname;
    claims.preferred_username = user.preferredUsername;
    claims.profile = user.profileUrl;
    claims.picture = user.pictureUrl;
    claims.website = user.websiteUrl;
    claims.gender = user.gender;
    claims.birthdate = user.birthdate;
    claims.zoneinfo = user.zoneinfo;
    claims.locale = user.locale;
    // updated_at must be Unix timestamp (seconds) per OIDC spec
    claims.updated_at = Math.floor(user.updatedAt.getTime() / 1000);
  }

  // email scope — OIDC §5.4 email claims
  if (scopes.includes('email')) {
    claims.email = user.email;
    claims.email_verified = user.emailVerified;
  }

  // phone scope — OIDC §5.4 phone claims
  if (scopes.includes('phone')) {
    claims.phone_number = user.phoneNumber;
    claims.phone_number_verified = user.phoneNumberVerified;
  }

  // address scope — OIDC §5.1.1 structured address (only if any field present)
  if (scopes.includes('address') && hasAddress(user)) {
    claims.address = {
      street_address: user.addressStreet,
      locality: user.addressLocality,
      region: user.addressRegion,
      postal_code: user.addressPostalCode,
      country: user.addressCountry,
    } as OidcAddress;
  }

  return claims;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if a user has any address fields populated.
 *
 * Returns true if at least one address field is non-null/non-empty.
 * Used to decide whether to include the address claim object —
 * per the spec, the address claim should not be an empty object.
 *
 * @param user - User to check
 * @returns true if any address field has a value
 */
export function hasAddress(user: User): boolean {
  return !!(
    user.addressStreet ||
    user.addressLocality ||
    user.addressRegion ||
    user.addressPostalCode ||
    user.addressCountry
  );
}
