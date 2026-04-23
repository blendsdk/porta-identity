/**
 * Super-admin user protection module.
 *
 * The super-admin user (created during `porta init`) is the system bootstrap
 * user and cannot be subjected to destructive operations. This module provides
 * detection and guard functions to enforce this protection.
 *
 * The super-admin user ID is stored in `system_config` under the key
 * `super_admin_user_id` during `porta init`. This is the single source
 * of truth for super-admin detection.
 *
 * Protected operations (all throw 403 Forbidden):
 *   - Delete
 *   - Suspend
 *   - Archive
 *   - Lock
 *   - Deactivate
 *   - Remove porta-super-admin role
 *
 * @module lib/super-admin-protection
 */

import { getSystemConfigString } from './system-config.js';

// ============================================================================
// Constants
// ============================================================================

/** System config key where the super-admin user ID is stored */
export const SUPER_ADMIN_USER_ID_KEY = 'super_admin_user_id';

/**
 * Operations that are forbidden on the super-admin user.
 * Used in error messages to clearly communicate what was attempted.
 */
export const PROTECTED_OPERATIONS = [
  'delete',
  'suspend',
  'archive',
  'lock',
  'deactivate',
  'remove-super-admin-role',
] as const;

export type ProtectedOperation = (typeof PROTECTED_OPERATIONS)[number];

// ============================================================================
// Detection
// ============================================================================

/**
 * Check if a user is the protected super-admin user.
 *
 * Queries `system_config` for the `super_admin_user_id` key (with 60s cache)
 * and compares it to the given user ID. Returns false if no super-admin user
 * has been configured (i.e., before `porta init` has been run).
 *
 * @param userId - The user ID to check
 * @returns true if the user is the super-admin
 */
export async function isSuperAdminUser(userId: string): Promise<boolean> {
  // getSystemConfigString returns the fallback when the key doesn't exist.
  // Empty string fallback means: if no super-admin is configured, nobody matches.
  const superAdminUserId = await getSystemConfigString(SUPER_ADMIN_USER_ID_KEY, '');
  if (!superAdminUserId) {
    return false;
  }
  return superAdminUserId === userId;
}

// ============================================================================
// Guard
// ============================================================================

/**
 * Error thrown when a protected operation is attempted on the super-admin user.
 * Carries a 403 status code for HTTP responses.
 */
export class SuperAdminProtectionError extends Error {
  /** HTTP status code (always 403) */
  readonly status = 403;
  /** The operation that was attempted */
  readonly operation: ProtectedOperation;

  constructor(operation: ProtectedOperation) {
    super(`Cannot ${operation} the super-admin user`);
    this.name = 'SuperAdminProtectionError';
    this.operation = operation;
  }
}

/**
 * Guard function — throws 403 if attempting a forbidden action on the super-admin user.
 *
 * Call this before executing any destructive operation on a user:
 * ```typescript
 * await guardSuperAdmin(userId, 'suspend');
 * // ... proceed with suspend logic
 * ```
 *
 * If the user is not the super-admin, this function is a no-op.
 * If the user IS the super-admin, it throws a `SuperAdminProtectionError`.
 *
 * @param userId - The user ID being acted upon
 * @param operation - The operation being attempted
 * @throws SuperAdminProtectionError if the user is the super-admin
 */
export async function guardSuperAdmin(
  userId: string,
  operation: ProtectedOperation,
): Promise<void> {
  const isProtected = await isSuperAdminUser(userId);
  if (isProtected) {
    throw new SuperAdminProtectionError(operation);
  }
}
