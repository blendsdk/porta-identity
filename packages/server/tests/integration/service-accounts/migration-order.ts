/**
 * Test-only repair for service-account migration specs.
 *
 * Those specs deliberately reverse 037 while later, independent migrations remain applied.
 * Reapplying 037 gives its ledger row a newer identity than those later rows, which the production
 * migration runner correctly rejects as out-of-order. Repair the dependent ledger rows in filename
 * order after the spec has restored the schemas; no schema or data is changed.
 */

import { getPool } from '../../../src/lib/database.js';

/** Restore the dependent migration-ledger rows in filename order after a targeted reversal. */
export async function restoreMigrationOrder(): Promise<void> {
  await getPool().query(
    `DELETE FROM pgmigrations
      WHERE name IN (
        '037_service_account_invitations',
        '038_resource_servers',
        '039_device_authorization_user_code'
      );
     INSERT INTO pgmigrations (name, run_on)
     VALUES
       ('037_service_account_invitations', NOW()),
       ('038_resource_servers', NOW()),
       ('039_device_authorization_user_code', NOW());`,
  );
}
