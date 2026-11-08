import { getDatabaseTransactionClient, getPool } from '../lib/database.js';
import { ServiceAccountStorageError, ServiceAccountValidationError } from './errors.js';
import { parseServiceAccountTargets } from './policy.js';
import { SERVICE_ACCOUNT_STATUS } from './types.js';
import type { ServiceAccountPolicyTarget, StoredServiceAccount } from './types.js';

/** PostgreSQL's native columns, keeping policy JSON untrusted until the mapper validates it. */
interface ServiceAccountRow {
  /** Binding UUID from the primary key. */
  id: string;
  /** Permanent owning client UUID. */
  clientId: string;
  /** Nullable only for a non-restorable lost-owner marker. */
  accountId: string | null;
  /** Current unpredictable authority generation. */
  authorizationVersion: string;
  /** Validated against the supported states before exposing internal authority. */
  status: string;
  /** Native JSONB decoded by the driver; never presumed valid policy. */
  targets: unknown;
  /** Native PostgreSQL creation timestamp. */
  createdAt: Date;
  /** Native PostgreSQL modification timestamp. */
  updatedAt: Date;
}

/** Explicit projection avoids accidentally returning new sensitive columns added in the future. */
const BINDING_SELECT = `SELECT id, client_id AS "clientId", account_id AS "accountId",
  authorization_version AS "authorizationVersion", status, targets,
  created_at AS "createdAt", updated_at AS "updatedAt"
  FROM client_service_accounts`;

/** Validate stored policy without interpreting corruption as a missing or unrestricted binding. */
function storedTargets(row: ServiceAccountRow): ServiceAccountPolicyTarget[] {
  if (row.accountId === null) {
    if (row.status !== SERVICE_ACCOUNT_STATUS.REVOKED ||
        !Array.isArray(row.targets) || row.targets.length !== 0) {
      throw new ServiceAccountStorageError();
    }
    return [];
  }

  try {
    return parseServiceAccountTargets(row.targets);
  } catch (error) {
    if (error instanceof ServiceAccountValidationError) {
      // The cause is a fixed domain error, not the original JSON or a raw validator error.
      throw new ServiceAccountStorageError({ cause: error });
    }
    throw error;
  }
}

/** Construct only a valid internal state; never construct a successful public lost-owner binding. */
function mapBinding(row: ServiceAccountRow): StoredServiceAccount {
  if ((row.status !== SERVICE_ACCOUNT_STATUS.ACTIVE &&
       row.status !== SERVICE_ACCOUNT_STATUS.REVOKED) ||
      !(row.createdAt instanceof Date) || !Number.isFinite(row.createdAt.getTime()) ||
      !(row.updatedAt instanceof Date) || !Number.isFinite(row.updatedAt.getTime())) {
    throw new ServiceAccountStorageError();
  }
  return {
    id: row.id,
    clientId: row.clientId,
    accountId: row.accountId,
    authorizationVersion: row.authorizationVersion,
    status: row.status,
    targets: storedTargets(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Read authoritative binding state through the caller's existing transaction when present.
 * There is no administrative cache, missing-policy default or public response projection here.
 *
 * @param clientId - Validated internal client UUID.
 * @returns The validated stored row, including ownerless markers, or null when no row exists.
 * @throws ServiceAccountStorageError if stored state cannot safely represent authority.
 * @example
 * const binding = await findServiceAccountByClientId(client.id);
 * if (binding?.accountId === null) throw new Error('Binding cannot be restored');
 */
export async function findServiceAccountByClientId(
  clientId: string,
): Promise<StoredServiceAccount | null> {
  const result = await getPool().query<ServiceAccountRow>(
    `${BINDING_SELECT} WHERE client_id = $1`, [clientId],
  );
  return result.rows[0] ? mapBinding(result.rows[0]) : null;
}

/**
 * Lock the parent client, binding and surviving account in their shared lifecycle order.
 * A parent is locked even before first provisioning, so absence of a binding is not a race gap.
 * No email or other external work may execute while these locks are held.
 *
 * @param clientId - Validated internal client UUID.
 * @returns Current validated binding, or null for a missing parent or unbound client.
 * @throws Error when called without the existing transaction owner.
 * @throws ServiceAccountStorageError for corrupt or impossible stored ownership.
 * @example
 * await runDatabaseTransaction(async () => {
 *   const binding = await lockServiceAccountByClientId(client.id);
 *   // Validate and perform the durable lifecycle mutation before this callback returns.
 * });
 */
export async function lockServiceAccountByClientId(
  clientId: string,
): Promise<StoredServiceAccount | null> {
  if (!(await lockServiceAccountParent(clientId))) return null;
  return lockServiceAccountBinding(clientId, true);
}

/**
 * Lock the parent before checking binding existence or authorizing a client mutation.
 *
 * @param clientId - Validated internal client UUID.
 * @returns Whether the parent still exists after the lock wait.
 * @throws Error outside the existing transaction owner.
 */
export async function lockServiceAccountParent(clientId: string): Promise<boolean> {
  const transaction = getDatabaseTransactionClient();
  if (!transaction) throw new Error('Service-account locking requires an active database transaction');
  const parent = await transaction.query<{ id: string }>(
    'SELECT id FROM clients WHERE id = $1 FOR UPDATE', [clientId],
  );
  return parent.rows.length !== 0;
}

/**
 * Lock a binding after its parent, optionally acquiring its owned account as the next lock.
 * Physical user deletion postpones that account lock until its existing organization lock.
 *
 * @param clientId - Internal UUID whose parent is already locked by the caller.
 * @param lockAccount - Whether ordinary lifecycle ordering should acquire the account now.
 * @returns Validated binding or null for first provisioning.
 */
export async function lockServiceAccountBinding(
  clientId: string,
  lockAccount: boolean,
): Promise<StoredServiceAccount | null> {
  const transaction = getDatabaseTransactionClient();
  if (!transaction) throw new Error('Service-account locking requires an active database transaction');
  const result = await transaction.query<ServiceAccountRow>(
    `${BINDING_SELECT} WHERE client_id = $1 FOR UPDATE`, [clientId],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (lockAccount && row.accountId !== null) {
    const account = await transaction.query<{ id: string }>(
      'SELECT id FROM users WHERE id = $1 FOR UPDATE', [row.accountId],
    );
    if (account.rows.length === 0) throw new ServiceAccountStorageError();
  }
  return mapBinding(row);
}
