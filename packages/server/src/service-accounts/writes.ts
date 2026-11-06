import { randomUUID } from 'node:crypto';
import { getDatabaseTransactionClient } from '../lib/database.js';
import { ServiceAccountStorageError } from './errors.js';
import { findServiceAccountByClientId } from './repository.js';
import { SERVICE_ACCOUNT_STATUS } from './types.js';
import type { ServiceAccountPolicyTarget, StoredServiceAccount } from './types.js';

/** Refuse writes that could otherwise commit independently of the account, policy or audit. */
function transaction() {
  const client = getDatabaseTransactionClient();
  if (!client) throw new Error('Service-account writes require an active database transaction');
  return client;
}

/** Reload the validated native row after a write without creating a second authority projection. */
async function writtenBinding(clientId: string): Promise<StoredServiceAccount> {
  const binding = await findServiceAccountByClientId(clientId);
  if (!binding) throw new ServiceAccountStorageError();
  return binding;
}

/**
 * Retire every preexisting credential, including expired and legacy rows.
 * The parent client lock serializes this update with ordinary secret creation/revocation.
 * Existing cleanup retains responsibility for retired-row retention; no secret is returned.
 *
 * @param clientId - Internal client UUID whose parent row is locked by the caller.
 */
export async function retireServiceAccountSecrets(clientId: string): Promise<void> {
  await transaction().query(
    "UPDATE client_secrets SET status = 'revoked' WHERE client_id = $1 AND status <> 'revoked'",
    [clientId],
  );
}

/**
 * Insert a new, permanently noninteractive account and its sole reserved membership.
 * Email uniqueness is settled by PostgreSQL; this operation never selects or adopts an account.
 * The caller owns eligibility/reference checks, client locking, audit and the outer transaction.
 *
 * @param clientId - Locked eligible client UUID.
 * @param organizationId - Authoritative control-plane organization UUID.
 * @param email - Validated normalized immutable account address.
 * @param targets - Complete policy whose live references have already been checked.
 * @param roleId - Trusted canonical invitation-service role UUID.
 * @returns Validated stored binding, including its new authority generation.
 */
export async function provisionServiceAccount(
  clientId: string,
  organizationId: string,
  email: string,
  targets: ServiceAccountPolicyTarget[],
  roleId: string,
): Promise<StoredServiceAccount> {
  const db = transaction();
  const account = await db.query<{ id: string }>(
    `INSERT INTO users (organization_id, email, status, is_service_account)
     VALUES ($1, $2, 'active', TRUE) RETURNING id`,
    [organizationId, email],
  );
  const accountId = account.rows[0]?.id;
  if (!accountId) throw new ServiceAccountStorageError();
  await db.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [accountId, roleId]);
  await retireServiceAccountSecrets(clientId);
  await db.query(
    `INSERT INTO client_service_accounts
       (client_id, account_id, authorization_version, status, targets)
     VALUES ($1, $2, $3, 'active', $4::jsonb)`,
    [clientId, accountId, randomUUID(), JSON.stringify(targets)],
  );
  return writtenBinding(clientId);
}

/**
 * Replace authority on the same owned account, optionally restoring a revoked binding.
 * Restoration removes unexpected memberships, reinstates exactly the reserved role and retires
 * all credentials. Active replacement changes neither account state nor existing credentials.
 *
 * @param binding - Validated binding selected under client, binding and owned-account locks.
 * @param targets - Fully validated replacement policy.
 * @param roleId - Trusted canonical invitation-service role UUID.
 * @returns The same binding and owner with a fresh unpredictable authority generation.
 * @throws ServiceAccountStorageError for lost or unclassified ownership.
 */
export async function replaceServiceAccountAuthority(
  binding: StoredServiceAccount,
  targets: ServiceAccountPolicyTarget[],
  roleId: string,
): Promise<StoredServiceAccount> {
  if (binding.accountId === null) throw new ServiceAccountStorageError();
  const db = transaction();
  if (binding.status === SERVICE_ACCOUNT_STATUS.REVOKED) {
    const restored = await db.query<{ id: string }>(
      `UPDATE users SET status = 'active', password_hash = NULL
       WHERE id = $1 AND is_service_account = TRUE RETURNING id`,
      [binding.accountId],
    );
    if (restored.rowCount !== 1) throw new ServiceAccountStorageError();
    await db.query('DELETE FROM user_roles WHERE user_id = $1', [binding.accountId]);
    await db.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
      [binding.accountId, roleId]);
    await retireServiceAccountSecrets(binding.clientId);
  }
  const result = await db.query(
    `UPDATE client_service_accounts SET targets = $1::jsonb,
       authorization_version = $2, status = 'active'
     WHERE id = $3 AND client_id = $4 AND account_id = $5`,
    [JSON.stringify(targets), randomUUID(), binding.id, binding.clientId, binding.accountId],
  );
  if (result.rowCount !== 1) throw new ServiceAccountStorageError();
  return writtenBinding(binding.clientId);
}

/**
 * Revoke a locked binding and its permanent account together.
 * An already-revoked row, including a lost-owner marker, is deliberately unchanged.
 *
 * @param binding - Current validated, transaction-locked binding.
 * @returns Whether a durable transition occurred and therefore requires a mutation audit.
 */
export async function revokeStoredServiceAccount(binding: StoredServiceAccount): Promise<boolean> {
  if (binding.status === SERVICE_ACCOUNT_STATUS.REVOKED) return false;
  if (binding.accountId === null) throw new ServiceAccountStorageError();
  const db = transaction();
  const account = await db.query(
    `UPDATE users SET status = 'inactive'
     WHERE id = $1 AND is_service_account = TRUE RETURNING id`, [binding.accountId],
  );
  if (account.rowCount !== 1) throw new ServiceAccountStorageError();
  const changed = await db.query(
    `UPDATE client_service_accounts SET status = 'revoked', authorization_version = $1
     WHERE id = $2 AND client_id = $3 AND account_id = $4`,
    [randomUUID(), binding.id, binding.clientId, binding.accountId],
  );
  if (changed.rowCount !== 1) throw new ServiceAccountStorageError();
  return true;
}

/**
 * Replace physically erased ownership with the same non-restorable, non-PII marker.
 * The caller locks client, binding, organization and account before invoking user deletion.
 *
 * @param binding - Current binding whose owned account is about to be physically deleted.
 */
export async function eraseServiceAccountOwner(binding: StoredServiceAccount): Promise<void> {
  const result = await transaction().query(
    `UPDATE client_service_accounts SET account_id = NULL, status = 'revoked',
       targets = '[]'::jsonb, authorization_version = $1
     WHERE id = $2 AND client_id = $3 AND account_id = $4`,
    [randomUUID(), binding.id, binding.clientId, binding.accountId],
  );
  if (result.rowCount !== 1) throw new ServiceAccountStorageError();
}

/**
 * Invalidate tokens from every prior generation after explicit live-secret revocation.
 * Overlapping secret creation must never call this operation.
 *
 * @param binding - Binding selected under the same parent lock as credential mutation.
 */
export async function rotateServiceAccountVersion(binding: StoredServiceAccount): Promise<void> {
  const result = await transaction().query(
    'UPDATE client_service_accounts SET authorization_version = $1 WHERE id = $2 AND client_id = $3',
    [randomUUID(), binding.id, binding.clientId],
  );
  if (result.rowCount !== 1) throw new ServiceAccountStorageError();
}
