import { createTenantAdminBoundariesSpecRig } from './tenant-admin-boundaries-spec-rig.js';

import type { TenantAdminBoundariesContract } from './tenant-admin-boundaries-contract.js';

/**
 * Creates the stable adapter consumed by immutable tenant/admin specifications.
 *
 * The current delegate is a requirements-only spec rig and is not evidence of Porta behavior. A
 * live retained-harness adapter can replace this delegate without changing specification files.
 */
export function createTenantAdminBoundariesContract(): TenantAdminBoundariesContract {
  return createTenantAdminBoundariesSpecRig();
}
