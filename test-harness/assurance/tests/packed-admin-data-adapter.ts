import { type PackedAdminDataCapability } from './packed-admin-data-contract.js';
import { validatePackedAdminDataEvidence } from '../compat/admin-data.js';

/** Returns the production validator without exposing runtime implementation details to the spec. */
export function getPackedAdminDataCapability(): PackedAdminDataCapability {
  return {
    available: true,
    validate: validatePackedAdminDataEvidence,
  };
}
