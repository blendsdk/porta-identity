/**
 * User entity types for the Porta SDK.
 *
 * @module types/users
 */

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type UserStatus = 'active' | 'invited' | 'suspended' | 'locked' | 'deactivated';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  organizationId: string;
  email: string;
  name: string | null;
  status: UserStatus;
  emailVerified: boolean;
  hasPassword: boolean;
  failedLoginCount: number;
  lastLoginAt: string | null;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface CreateUserInput {
  organizationId: string;
  email: string;
  name?: string;
  password?: string;
}

export interface UpdateUserInput {
  email?: string;
  name?: string | null;
}

export interface InviteUserInput {
  organizationId: string;
  email: string;
  name?: string;
  roles?: string[];
  message?: string;
  expiresInHours?: number;
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
