import { z } from 'zod';
import type { AdminUser } from '../middleware/admin-auth.js';
import { writeAuditLogInTransaction } from '../lib/audit-log.js';
import { getDatabaseTransactionClient, getPool, runDatabaseTransaction } from '../lib/database.js';
import { registerAuthorityCleanup } from '../lib/deletion-cleanup.js';
import {
  ServiceAccountConflictError,
  ServiceAccountNotFoundError,
  ServiceAccountStorageError,
  ServiceAccountValidationError,
} from './errors.js';
import {
  isServiceAccountClientEligible,
  readServiceAccountClient,
  requireServiceAccountManager,
  validateServiceAccountReferences,
} from './lifecycle-authority.js';
import { parseServiceAccountInput } from './policy.js';
import { lockServiceAccountBinding, lockServiceAccountParent } from './repository.js';
import { SERVICE_ACCOUNT_STATUS } from './types.js';
import type { ServiceAccountBinding, StoredServiceAccount } from './types.js';
import {
  provisionServiceAccount,
  replaceServiceAccountAuthority,
  revokeStoredServiceAccount,
} from './writes.js';

/** Valid internal resource identifiers must not reach PostgreSQL as unchecked cast input. */
const clientIdentifier = z.string().uuid();

/** Closed lifecycle audit events; repeated revoke deliberately produces none. */
const EVENTS = {
  CREATED: 'admin.client.service_account.created',
  UPDATED: 'admin.client.service_account.updated',
  RESTORED: 'admin.client.service_account.restored',
  REVOKED: 'admin.client.service_account.revoked',
} as const;

/** Acquire and authorize the actual parent before reading ownership or eligibility details. */
async function managementClient(clientId: string, actor: AdminUser) {
  if (!clientIdentifier.safeParse(clientId).success) throw new ServiceAccountValidationError();
  const exists = await lockServiceAccountParent(clientId);
  await requireServiceAccountManager(actor.id);
  if (!exists) throw new ServiceAccountNotFoundError();
  return readServiceAccountClient(clientId);
}

/** Project only an existing, permanently classified owner; lost ownership is always a conflict. */
async function publicBinding(binding: StoredServiceAccount): Promise<ServiceAccountBinding> {
  if (binding.accountId === null) throw new ServiceAccountConflictError();
  const account = await getPool().query<{ email: string; classified: boolean }>(
    `SELECT email::text, is_service_account AS classified FROM users WHERE id = $1`,
    [binding.accountId],
  );
  const owner = account.rows[0];
  if (!owner || !owner.classified) throw new ServiceAccountStorageError();
  return {
    id: binding.id,
    clientId: binding.clientId,
    serviceAccountId: binding.accountId,
    accountEmail: owner.email,
    status: binding.status,
    targets: binding.targets,
    createdAt: binding.createdAt,
    updatedAt: binding.updatedAt,
  };
}

/** Persist one secret-free lifecycle audit and defer authority/cache cleanup until actual commit. */
async function recordLifecycleMutation(
  eventType: (typeof EVENTS)[keyof typeof EVENTS],
  organizationId: string,
  actorId: string,
  binding: StoredServiceAccount,
): Promise<void> {
  const db = getDatabaseTransactionClient();
  if (!db || binding.accountId === null) throw new ServiceAccountStorageError();
  await writeAuditLogInTransaction(db, {
    organizationId,
    actorId,
    userId: binding.accountId,
    eventType,
    eventCategory: 'admin',
    metadata: {
      clientId: binding.clientId,
      bindingId: binding.id,
      serviceAccountId: binding.accountId,
      targets: binding.targets,
    },
  });
  await registerAuthorityCleanup({
    userIds: [binding.accountId], grantIds: [], roleIds: [], revokeOidcState: true,
  });
}

/**
 * Read the secret-free binding for a live human Super Admin from authoritative storage.
 *
 * @param clientId - Internal client UUID, not an OAuth public identifier.
 * @param actor - Authenticated human identity; only its live database identity grants authority.
 * @throws ServiceAccountNotFoundError for a missing client or binding.
 * @throws ServiceAccountConflictError for physically lost ownership.
 * @example const binding = await getServiceAccount(client.id, ctx.state.adminUser);
 */
export async function getServiceAccount(clientId: string, actor: AdminUser): Promise<ServiceAccountBinding> {
  return runDatabaseTransaction(async () => {
    await managementClient(clientId, actor);
    const binding = await lockServiceAccountBinding(clientId, true);
    if (!binding) throw new ServiceAccountNotFoundError();
    return publicBinding(binding);
  });
}

/**
 * Provision a new owned account, replace policy, or explicitly restore the same revoked owner.
 * Validation completes before writes; credentials, account, binding and audit commit together.
 * No email or secret generation occurs. Restoration retires all current client credentials.
 *
 * @param clientId - Internal client UUID.
 * @param input - Complete untrusted policy replacement and optional immutable account address.
 * @param actor - Authenticated human administrator, revalidated after the parent lock wait.
 * @returns Exact secret-free management projection with native timestamps.
 * @throws ServiceAccountConflictError for email collision or irrecoverable ownership loss.
 * @example await setServiceAccount(client.id, { accountEmail, targets }, actor);
 */
export async function setServiceAccount(
  clientId: string,
  input: unknown,
  actor: AdminUser,
): Promise<ServiceAccountBinding> {
  const parsed = parseServiceAccountInput(input);
  try {
    return await runDatabaseTransaction(async () => {
      const client = await managementClient(clientId, actor);
      if (!isServiceAccountClientEligible(client)) throw new ServiceAccountValidationError();
      const previous = await lockServiceAccountBinding(clientId, true);
      if (previous) {
        const owner = await publicBinding(previous);
        if (parsed.accountEmail !== undefined && parsed.accountEmail !== owner.accountEmail) {
          throw new ServiceAccountValidationError();
        }
      } else if (!parsed.accountEmail) {
        throw new ServiceAccountValidationError();
      }
      await validateServiceAccountReferences(parsed.targets);
      const role = await getPool().query<{ id: string }>(
        `SELECT id FROM roles WHERE application_id = $1 AND slug = 'porta-invite-service'
         FOR SHARE`, [client.applicationId],
      );
      const roleId = role.rows[0]?.id;
      if (!roleId) throw new ServiceAccountStorageError();
      const binding = previous
        ? await replaceServiceAccountAuthority(previous, parsed.targets, roleId)
        : await provisionServiceAccount(clientId, client.organizationId,
          parsed.accountEmail ?? '', parsed.targets, roleId);
      const event = !previous ? EVENTS.CREATED
        : previous.status === SERVICE_ACCOUNT_STATUS.REVOKED ? EVENTS.RESTORED : EVENTS.UPDATED;
      await recordLifecycleMutation(event, client.organizationId, actor.id, binding);
      return publicBinding(binding);
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && Reflect.get(error, 'code') === '23505') {
      // Driver uniqueness errors can include account addresses; never retain that raw cause.
      throw new ServiceAccountConflictError();
    }
    throw error;
  }
}

/**
 * Revoke a binding and its account without erasing ownership history or rotating credentials.
 * Repeated revocation, unbound eligible clients and retained lost-owner markers are no-ops.
 *
 * @param clientId - Internal UUID of the surviving client.
 * @param actor - Authenticated human Super Admin, revalidated from live storage.
 * @example await revokeServiceAccount(client.id, actor);
 */
export async function revokeServiceAccount(clientId: string, actor: AdminUser): Promise<void> {
  await runDatabaseTransaction(async () => {
    const client = await managementClient(clientId, actor);
    const binding = await lockServiceAccountBinding(clientId, true);
    if (!binding) {
      if (!isServiceAccountClientEligible(client)) throw new ServiceAccountValidationError();
      return;
    }
    if (await revokeStoredServiceAccount(binding)) {
      await recordLifecycleMutation(EVENTS.REVOKED, client.organizationId, actor.id, binding);
    }
  });
}
