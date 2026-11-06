import { getDatabaseTransactionClient } from '../lib/database.js';
import { ServiceAccountStorageError } from './errors.js';
import { requireServiceAccountManager } from './lifecycle-authority.js';
import { lockServiceAccountBinding, lockServiceAccountParent } from './repository.js';
import type { StoredServiceAccount } from './types.js';

/**
 * Prepare permanent account deletion without reversing the existing organization→user locks.
 * Discovery is not authority: after waiting for the parent, re-read the locked binding and verify
 * ownership. Client deletion may already have removed it; the surviving permanent account still
 * requires a live human Super Admin. Existing human accounts cannot acquire this classification.
 *
 * @param organizationId - Requested owning organization, checked before revealing classification.
 * @param userId - Internal account UUID about to enter the existing deletion capture.
 * @param actorId - Authenticated human actor, or undefined for non-human/system callers.
 * @returns Locked ownership to erase after organization/user capture, or null if no binding survives.
 * @throws ServiceAccountManagementError for unauthorized deletion of a permanent account.
 * @throws ServiceAccountStorageError if ownership changed unexpectedly.
 */
export async function prepareServiceAccountDeletion(
  organizationId: string,
  userId: string,
  actorId: string | undefined,
): Promise<StoredServiceAccount | null> {
  const db = getDatabaseTransactionClient();
  if (!db) throw new Error('Service-account deletion requires an active database transaction');
  const discovery = await db.query<{ clientId: string | null }>(
    `SELECT binding.client_id AS "clientId" FROM users account
     LEFT JOIN client_service_accounts binding ON binding.account_id = account.id
     WHERE account.id = $1 AND account.organization_id = $2 AND account.is_service_account`,
    [userId, organizationId],
  );
  const account = discovery.rows[0];
  if (!account) return null;
  const parentExists = account.clientId !== null && await lockServiceAccountParent(account.clientId);
  await requireServiceAccountManager(actorId);
  if (!parentExists || account.clientId === null) return null;
  // Do not lock the owned user here: deletion capture first takes its organization lock.
  const binding = await lockServiceAccountBinding(account.clientId, false);
  if (binding && binding.accountId !== userId) throw new ServiceAccountStorageError();
  return binding;
}
