/** Public contracts for the validated user administration service. */

import type {
  CreateUserInput,
  InviteUserInput,
  UpdateUserInput,
  UserStatus,
} from '@portaidentity/sdk';
import type {
  AdminInvitationPreview,
  AdminUserDetail,
  AdminUserFailureKind,
  AdminUserHistory,
  AdminUserListItem,
  AdminUserPage,
} from './user-state.js';

/** Local create input without a second organization source. */
export type AdminCreateUserInput = Omit<CreateUserInput, 'organizationId'> & {
  /** Local-only confirmation that is never sent to Porta. */
  readonly passwordConfirmation?: string;
};

/** Local invitation input without authorization assignments or a second organization source. */
export type AdminInviteUserInput = Omit<InviteUserInput, 'organizationId' | 'roles' | 'claims'>;

/** Local password input with a confirmation that is never sent to Porta. */
export interface AdminSetPasswordInput {
  /** New password. */
  readonly password: string;
  /** Local confirmation of the new password. */
  readonly passwordConfirmation: string;
}

/** User list request controlled by the workspace. */
export interface AdminUserListRequest {
  /** One-based page number. */
  readonly page: number;
  /** Optional bounded search text. */
  readonly search?: string;
  /** Optional exact status filter. */
  readonly status?: UserStatus;
}

/** Validated detail plus an opaque update precondition. */
export interface AdminUserDetailResult {
  /** Safe detail projection. */
  readonly detail: AdminUserDetail;
  /** Opaque ETag retained for a later update. */
  readonly etag: string | null;
}

/** Allowlisted result of accepting a user invitation. */
export interface AdminInvitedUser {
  /** Stable UUID of the invited user. */
  readonly userId: string;
  /** Invited email address. */
  readonly email: string;
  /** Whether a new user was created. */
  readonly created: boolean;
  /** Whether an invitation message was sent. */
  readonly invitationSent: boolean;
  /** Invitation expiration timestamp. */
  readonly expiresAt: string;
}

/** Sanitized result of a read operation. */
export type AdminUserReadResult<T> =
  | { readonly kind: 'success'; readonly value: T }
  | { readonly kind: 'session-invalid' }
  | { readonly kind: 'failure'; readonly failure: AdminUserFailureKind };

/** Sanitized result of a mutation operation. */
export type AdminUserMutationResult<T = void> =
  | (T extends void
      ? { readonly kind: 'success' }
      : { readonly kind: 'success'; readonly value: T })
  | { readonly kind: 'session-invalid' }
  | { readonly kind: 'outcome-unknown' }
  | {
      readonly kind: 'failure';
      readonly failure: Exclude<AdminUserFailureKind, 'invalid-response'>;
    };

/** User operations consumed by the administration controller. */
export interface AdminUserOperations {
  /** Loads one validated user page. */
  readonly list: (
    organizationId: string,
    request: AdminUserListRequest,
  ) => Promise<AdminUserReadResult<AdminUserPage>>;
  /** Loads one validated user detail. */
  readonly get: (
    organizationId: string,
    userId: string,
  ) => Promise<AdminUserReadResult<AdminUserDetailResult>>;
  /** Loads the first validated history page. */
  readonly getHistory: (
    organizationId: string,
    userId: string,
  ) => Promise<AdminUserReadResult<AdminUserHistory>>;
  /** Loads a safe plain-text invitation preview. */
  readonly previewInvitation: (
    organizationId: string,
    input: AdminInviteUserInput,
  ) => Promise<AdminUserReadResult<AdminInvitationPreview>>;
  /** Creates a user and returns its validated list projection. */
  readonly create: (
    organizationId: string,
    input: AdminCreateUserInput,
  ) => Promise<AdminUserMutationResult<AdminUserListItem>>;
  /** Invites a user and returns the allowlisted acceptance result. */
  readonly invite: (
    organizationId: string,
    input: AdminInviteUserInput,
  ) => Promise<AdminUserMutationResult<AdminInvitedUser>>;
  /** Updates a user and returns its validated list projection. */
  readonly update: (
    organizationId: string,
    userId: string,
    input: UpdateUserInput,
    etag?: string,
  ) => Promise<AdminUserMutationResult<AdminUserListItem>>;
  /** Sets a password after local confirmation. */
  readonly setPassword: (
    organizationId: string,
    userId: string,
    input: AdminSetPasswordInput,
  ) => Promise<AdminUserMutationResult>;
  /** Clears the user's password. */
  readonly clearPassword: (
    organizationId: string,
    userId: string,
  ) => Promise<AdminUserMutationResult>;
  /** Marks the user's email as verified. */
  readonly verifyEmail: (
    organizationId: string,
    userId: string,
  ) => Promise<AdminUserMutationResult>;
  /** Suspends the user with an optional reason. */
  readonly suspend: (
    organizationId: string,
    userId: string,
    reason?: string,
  ) => Promise<AdminUserMutationResult>;
  /** Restores a suspended user. */
  readonly unsuspend: (organizationId: string, userId: string) => Promise<AdminUserMutationResult>;
  /** Locks the user with a required reason. */
  readonly lock: (
    organizationId: string,
    userId: string,
    reason: string,
  ) => Promise<AdminUserMutationResult>;
  /** Unlocks the user. */
  readonly unlock: (organizationId: string, userId: string) => Promise<AdminUserMutationResult>;
  /** Deactivates the user. */
  readonly deactivate: (organizationId: string, userId: string) => Promise<AdminUserMutationResult>;
  /** Reactivates the user. */
  readonly reactivate: (organizationId: string, userId: string) => Promise<AdminUserMutationResult>;
  /** Permanently purges the user. */
  readonly purge: (organizationId: string, userId: string) => Promise<AdminUserMutationResult>;
}
