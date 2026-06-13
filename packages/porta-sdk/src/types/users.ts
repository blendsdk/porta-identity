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
 * `deactivated` status on the server — those were SDK drift (AR-4).
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
 * Input for creating a user — mirrors the server `createUserSchema`
 * (src/routes/users.ts). Only `email` is required by the server; the SDK
 * also threads `organizationId` to build the org-scoped route.
 */
export interface CreateUserInput {
  organizationId: string;
  email: string;
  givenName?: string;
  familyName?: string;
  password?: string;
}

/**
 * Input for updating a user profile — mirrors the server `updateUserSchema`.
 * `null` clears a field; `undefined` leaves it unchanged.
 */
export interface UpdateUserInput {
  email?: string;
  givenName?: string | null;
  familyName?: string | null;
}

/**
 * Input for inviting a user — mirrors the server `inviteUserSchema`
 * (src/routes/users.ts). The server accepts `displayName` (not `name`),
 * plus an optional personal message, role/claim pre-assignments, and locale.
 */
export interface InviteUserInput {
  organizationId: string;
  email: string;
  displayName?: string;
  personalMessage?: string;
  roles?: Array<{ applicationId: string; roleId: string }>;
  claims?: Array<{ applicationId: string; claimDefinitionId: string; value: unknown }>;
  locale?: string;
}


export interface SetPasswordInput {
  password: string;
}

// ---------------------------------------------------------------------------
// List params
// ---------------------------------------------------------------------------

export interface UserListParams {
  page?: number;
  pageSize?: number;
  cursor?: string;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  status?: UserStatus;
  organizationId?: string;
  [key: string]: string | number | boolean | undefined | null;
}
