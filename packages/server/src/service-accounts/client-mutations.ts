import { getPool } from '../lib/database.js';
import { registerAuthorityCleanup } from '../lib/deletion-cleanup.js';
import {
  isServiceAccountClientEligible,
  readServiceAccountClient,
  requireServiceAccountManager,
} from './lifecycle-authority.js';
import { lockServiceAccountBinding, lockServiceAccountParent } from './repository.js';
import type { StoredServiceAccount } from './types.js';
import { revokeStoredServiceAccount } from './writes.js';

/**
 * Serialize client mutations with first binding, then enforce live human authority if bound.
 * A revoked or ownerless binding still belongs to this boundary; absence must be checked only
 * after the parent lock. Ordinary unbound clients keep their existing optional-actor contract.
 *
 * @param clientId - Internal client UUID of the mutation target.
 * @param actorId - Existing authenticated user argument, never a supplied permission snapshot.
 * @returns The locked binding/account, or null for an ordinary unbound or missing client.
 * @throws ServiceAccountManagementError when a bound operation lacks live human Super Admin authority.
 * @example
 * await runDatabaseTransaction(async () => {
 *   const binding = await lockClientServiceAccountMutation(client.id, actorId);
 *   // Complete this client's mutation and durable audit before releasing the transaction.
 * });
 */
export async function lockClientServiceAccountMutation(
  clientId: string,
  actorId: string | undefined,
): Promise<StoredServiceAccount | null> {
  if (!(await lockServiceAccountParent(clientId))) return null;
  const ownership = await getPool().query<{ present: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM client_service_accounts WHERE client_id = $1) AS present',
    [clientId],
  );
  if (!ownership.rows[0]?.present) return null;
  await requireServiceAccountManager(actorId);
  return lockServiceAccountBinding(clientId, true);
}

/**
 * Revoke owned authority in the same transaction as client deactivation or physical deletion.
 * The caller has already locked and authorized the binding; its client mutation audit is durable.
 *
 * @param binding - Current locked binding, including revoked or ownerless states.
 */
export async function revokeServiceAccountForClientMutation(binding: StoredServiceAccount): Promise<void> {
  if (await revokeStoredServiceAccount(binding)) {
    if (binding.accountId) await registerAuthorityCleanup({
      userIds: [binding.accountId], grantIds: [], roleIds: [], revokeOidcState: true,
    });
  }
}

/**
 * Recheck resulting configuration under the parent lock; ordinary repair never restores authority.
 *
 * @param binding - Binding locked before this client's configuration was changed.
 */
export async function reconcileClientServiceAccount(binding: StoredServiceAccount): Promise<void> {
  if (!isServiceAccountClientEligible(await readServiceAccountClient(binding.clientId))) {
    await revokeServiceAccountForClientMutation(binding);
  }
}
