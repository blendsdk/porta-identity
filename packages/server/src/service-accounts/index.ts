/**
 * Public entry for explicitly bound, invitation-only machine identities.
 *
 * Internal stored versions and ownerless markers must not be projected into management responses.
 */
export type {
  ServiceAccountRoleReference,
  ServiceAccountClaimReference,
  ServiceAccountPolicyTarget,
  ServiceAccountPolicy,
  SetServiceAccountInput,
  ServiceAccountStatus,
  ServiceAccountBinding,
  StoredServiceAccount,
} from './types.js';
export { SERVICE_ACCOUNT_STATUS } from './types.js';
export {
  ServiceAccountValidationError,
  ServiceAccountAuthorizationError,
  ServiceAccountStorageError,
  ServiceAccountManagementError,
  ServiceAccountNotFoundError,
  ServiceAccountConflictError,
} from './errors.js';
export {
  parseServiceAccountInput,
  parseServiceAccountTargets,
  assertInvitationAllowed,
  MAX_SERVICE_ACCOUNT_TARGETS,
  MAX_SERVICE_ACCOUNT_ROLES,
  MAX_SERVICE_ACCOUNT_CLAIMS,
} from './policy.js';
export { findServiceAccountByClientId } from './repository.js';
export { getServiceAccount, setServiceAccount, revokeServiceAccount } from './service.js';
export {
  lockClientServiceAccountMutation,
  reconcileClientServiceAccount,
  revokeServiceAccountForClientMutation,
} from './client-mutations.js';
export { rotateServiceAccountVersion } from './writes.js';
export { prepareServiceAccountDeletion } from './account-deletion.js';
export { eraseServiceAccountOwner } from './writes.js';
