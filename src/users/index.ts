/**
 * Users module — public API barrel export.
 *
 * Re-exports the types, service functions, claims builder, error classes,
 * and password utilities that other modules need. Internal implementation
 * details (repository, cache) are NOT exported — they are consumed only
 * by the service layer.
 */

// Types (type-only exports)
export type {
  User,
  UserRow,
  UserStatus,
  CreateUserInput,
  UpdateUserInput,
  AddressInput,
  UserListOptions,
  PaginatedResult,
} from './types.js';

// Service functions
export {
  createUser,
  getUserById,
  getUserByEmail,
  updateUser,
  listUsersByOrganization,
  deactivateUser,
  reactivateUser,
  suspendUser,
  unsuspendUser,
  lockUser,
  unlockUser,
  setUserPassword,
  verifyUserPassword,
  clearUserPassword,
  markEmailVerified,
  markEmailUnverified,
  recordLogin,
  recordFailedLogin,
  checkAutoUnlock,
  findUserForOidc,
} from './service.js';

// Claims builder
export { buildUserClaims, hasAddress } from './claims.js';
export type { OidcClaims, OidcAddress } from './claims.js';

// Error types
export { UserNotFoundError, UserValidationError } from './errors.js';

// Password utilities (for external consumers like CLI)
export {
  validatePassword,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from './password.js';
export type { PasswordValidationResult } from './password.js';

// GDPR export/purge (Article 17 + Article 20)
export { exportUserData, purgeUserData } from './gdpr.js';
export type { UserDataExport, PurgeResult } from './gdpr.js';
