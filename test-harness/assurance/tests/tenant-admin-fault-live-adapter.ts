import type { TenantAdminFaultRequirementId } from './tenant-admin-fault-requirements.js';

/**
 * Fails closed until reviewed live fault execution is installed behind this test-only boundary.
 *
 * Requirements-only specifications must never be mistaken for a killed fault or Porta evidence.
 */
export async function executeTenantAdminFaultLive(
  _faultId: TenantAdminFaultRequirementId,
): Promise<never> {
  throw new Error('TENANT_ADMIN_FAULT_LIVE_UNAVAILABLE');
}
