/**
 * Test-only repair for service-account migration specs.
 *
 * Those specs deliberately reverse 037 while the later, independent 038 migration remains applied.
 * Reapplying 037 gives its ledger row a newer identity than 038, which the production migration
 * runner correctly rejects as out-of-order. Repair only the two ledger rows in filename order after
 * the spec has restored both schemas; no schema or data is changed.
 */

import { getPool } from '../../../src/lib/database.js';

/** Restore the two migration-ledger rows in filename order after a targeted reversal. */
export async function restoreMigrationOrder(): Promise<void> {
  await getPool().query(
    `DELETE FROM pgmigrations
      WHERE name IN ('037_service_account_invitations', '038_resource_servers');
     INSERT INTO pgmigrations (name, run_on)
     VALUES ('037_service_account_invitations', NOW()), ('038_resource_servers', NOW());`,
  );
}
