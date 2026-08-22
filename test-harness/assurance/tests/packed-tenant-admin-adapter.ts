import {
  validatePackedTenantAdminEvidence as validateEvidence,
  type PackedTenantAdminEvidence,
} from '../compat/tenant-admin.js';

/**
 * Stable specification seam for packed tenant/admin evidence validation.
 *
 * The adapter delegates to the compatibility capability without changing immutable specification
 * imports when runner internals evolve.
 */
export function validatePackedTenantAdminEvidence(evidence: unknown): PackedTenantAdminEvidence {
  return validateEvidence(evidence);
}
