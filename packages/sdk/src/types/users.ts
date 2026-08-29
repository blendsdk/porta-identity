/**
 * User entity types for the Porta SDK.
 *
 * @module types/users
 */

import type { TwoFactorMethod } from './two-factor.js';

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * User status values — mirrors the server `UserStatus` (src/users/types.ts).
 *
 * Lifecycle: active → inactive (deactivate) / suspended / locked, and back
 * to active via reactivate / unsuspend / unlock. There is no `invited` or
 * `deactivated` status on the server.
 */
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'locked';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/**
 * A Porta user — full parity with the server `User` (src/users/types.ts,
 * `mapRowToUser`, 36 fields). All server timestamp `Date`s are serialized
 * to ISO-8601 strings over the wire. Profile fields follow the OIDC
 * Standard Claims (§5.1). The password hash is never exposed — only the
 * derived `hasPassword` boolean.
 */
export interface User {
  id: string;
  organizationId: string;

  // Authentication
  email: string;
  emailVerified: boolean;
  hasPassword: boolean;
  passwordChangedAt: string | null;

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

  // Two-factor authentication state
  twoFactorEnabled: boolean;
  twoFactorMethod: TwoFactorMethod | null;

  // Status & lifecycle
  status: UserStatus;
  lockedAt: string | null;
  lockedReason: string | null;
  lastLoginAt: string | null;
  loginCount: number;

  // Failed login tracking (account lockout)
  failedLoginCount: number;
  lastFailedLoginAt: string | null;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * Address fields accepted when creating or updating a user.
 */
export interface AddressInput {
  /** Street address, or null to clear it during an update. */
  street?: string | null;
  /** City or locality, or null to clear it during an update. */
  locality?: string | null;
  /** State, province, or region, or null to clear it during an update. */
  region?: string | null;
  /** Postal code, or null to clear it during an update. */
  postalCode?: string | null;
  /** Two-letter country code, or null to clear it during an update. */
  country?: string | null;
}

/**
 * Input for creating a user in an organization.
 */
export interface CreateUserInput {
  /** Organization that will own the user. */
  organizationId: string;
  /** User's email address. */
  email: string;
  /** Optional initial password. */
  password?: string;
  /** OIDC given name. */
  givenName?: string;
  /** OIDC family name. */
  familyName?: string;
  /** OIDC middle name. */
  middleName?: string;
  /** OIDC nickname. */
  nickname?: string;
  /** OIDC preferred username. */
  preferredUsername?: string;
  /** OIDC profile URL. */
  profileUrl?: string;
  /** OIDC picture URL. */
  pictureUrl?: string;
  /** OIDC website URL. */
  websiteUrl?: string;
  /** OIDC gender value. */
  gender?: string;
  /** OIDC birthdate in YYYY-MM-DD form. */
  birthdate?: string;
  /** OIDC time-zone identifier. */
  zoneinfo?: string;
  /** OIDC locale. */
  locale?: string;
  /** OIDC phone number. */
  phoneNumber?: string;
  /** Structured OIDC address fields. */
  address?: AddressInput;
}

/**
 * Input for updating a user's mutable profile fields.
 *
 * `undefined` leaves a field unchanged. `null` clears a nullable field.
 */
export interface UpdateUserInput {
  /** OIDC given name. */
  givenName?: string | null;
  /** OIDC family name. */
  familyName?: string | null;
  /** OIDC middle name. */
  middleName?: string | null;
  /** OIDC nickname. */
  nickname?: string | null;
  /** OIDC preferred username. */
  preferredUsername?: string | null;
  /** OIDC profile URL. */
  profileUrl?: string | null;
  /** OIDC picture URL. */
  pictureUrl?: string | null;
  /** OIDC website URL. */
  websiteUrl?: string | null;
  /** OIDC gender value. */
  gender?: string | null;
  /** OIDC birthdate in YYYY-MM-DD form. */
  birthdate?: string | null;
  /** OIDC time-zone identifier. */
  zoneinfo?: string | null;
  /** OIDC locale. */
  locale?: string | null;
  /** OIDC phone number. */
  phoneNumber?: string | null;
  /** Whether the user's phone number has been verified. */
  phoneNumberVerified?: boolean;
  /** Structured address fields to update or clear individually. */
  address?: AddressInput;
}

/**
 * Input for inviting a user — mirrors the server `inviteUserSchema`
 * (src/routes/users.ts). The server accepts `givenName` and `familyName`
 * (OIDC standard claims), plus an optional personal message,
 * role/claim pre-assignments, and locale.
 */
export interface InviteUserInput {
  organizationId: string;
  email: string;
  givenName?: string;
  familyName?: string;
  personalMessage?: string;
  roles?: Array<{ applicationId: string; roleId: string }>;
  claims?: Array<{ applicationId: string; claimDefinitionId: string; value: unknown }>;
  locale?: string;
}

/** Result returned after an invitation request is accepted. */
export interface InviteUserResult {
  /** ID of the invited user. */
  userId: string;
  /** Email address that received the invitation. */
  email: string;
  /** Whether the invitation created a new user. */
  created: boolean;
  /** Whether the invitation email was sent. */
  invitationSent: boolean;
  /** ISO 8601 expiration time for the invitation. */
  expiresAt: string;
}


export interface SetPasswordInput {
  password: string;
}

// ---------------------------------------------------------------------------
// List params
// ---------------------------------------------------------------------------

export interface UserListParams {
  /** One-based page number for offset pagination. */
  page?: number;
  /** Requested number of users. */
  pageSize?: number;
  /** Opaque cursor for cursor pagination. */
  cursor?: string;
  /** Email or profile search text. */
  search?: string;
  /** User status filter. */
  status?: UserStatus;
  /** API column used for sorting. */
  sortBy?: 'email' | 'given_name' | 'family_name' | 'created_at' | 'last_login_at';
  /** Sort direction. */
  sortOrder?: 'asc' | 'desc';
}
