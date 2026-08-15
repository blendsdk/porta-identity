import process from 'node:process';

import {
  executeTenantAdminFaultLive,
  TenantAdminControlCheckDetected,
} from '../tests/tenant-admin-fault-live-adapter.js';
import type { TenantAdminFaultRequirementId } from '../tests/tenant-admin-fault-requirements.js';
import { tenantAdminControlCheck } from './registry.js';

/** Runs one closed live defensive check and emits only its registered sanitized signature. */
async function main(): Promise<void> {
  const id = process.argv[2] ?? '';
  const definition = tenantAdminControlCheck(id);
  try {
    await executeTenantAdminFaultLive(id as TenantAdminFaultRequirementId);
  } catch (error) {
    if (
      error instanceof TenantAdminControlCheckDetected &&
      error.signature === definition.expectedSignature
    ) {
      process.stderr.write(`${error.signature}\n`);
      process.exitCode = 1;
      return;
    }
    process.stderr.write('CONTROL_SENSITIVITY_CHECK_INVALID\n');
    process.exitCode = 30;
  }
}

await main();
