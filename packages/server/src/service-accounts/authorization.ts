import { z } from 'zod';
import { getPool } from '../lib/database.js';
import type { InviteUserInput } from '../users/invite-service.js';
import { ServiceAccountAuthorizationError, ServiceAccountValidationError } from './errors.js';
import {
  isServiceAccountClientEligible, readServiceAccountClient, validateServiceAccountReferences,
} from './lifecycle-authority.js';
import { assertInvitationAllowed } from './policy.js';
import { lockServiceAccountByClientId } from './repository.js';
import type { StoredServiceAccount } from './types.js';

/** Independent OAuth scope and stored permission required for the only machine Admin operation. */
export const SERVICE_ACCOUNT_INVITE_SCOPE = 'admin:user:invite';
/** Native extra-claims namespace; it contains no credentials or permission snapshot. */
export const SERVICE_ACCOUNT_NAMESPACE = 'urn:porta:service-account';

/** Closed persisted identity; extra identity fields are not accepted as authority. */
export const serviceAccountIdentitySchema = z.object({
  /** Permanently owned account UUID; not a human token subject. */
  accountId: z.string().uuid(),
  /** Binding UUID that must still belong to this native client. */
  bindingId: z.string().uuid(),
  /** Issuance generation; live replacement/revocation makes an older value unusable. */
  version: z.string().uuid(),
}).strict();

/** Server-issued native identity, separate from the human AdminUser contract. */
export type ServiceAccountIdentity = z.infer<typeof serviceAccountIdentitySchema>;

/** Live client attribution captured while its parent, binding and account locks are held. */
export interface ServiceAccountAuthority {
  /** Internal client UUID used for locks and the single shared budget. */
  readonly clientId: string;
  /** Public OAuth identifier used by existing client actor columns. */
  readonly publicClientId: string;
  /** Live client display name, not a token snapshot. */
  readonly clientName: string;
  /** Control-plane organization for the existing generic audit convention. */
  readonly organizationId: string;
  /** Current locked binding; its account is non-null after validation. */
  readonly binding: StoredServiceAccount;
}

/** Validate the owned account's exact sole membership and independent live permission mapping. */
async function requireMachineAccount(accountId: string, organizationId: string): Promise<void> {
  const result = await getPool().query<{ id: string }>(
    `SELECT account.id FROM users account
     JOIN user_roles membership ON membership.user_id = account.id
     JOIN roles role ON role.id = membership.role_id
     JOIN applications application ON application.id = role.application_id
     JOIN role_permissions mapping ON mapping.role_id = role.id
     JOIN permissions permission ON permission.id = mapping.permission_id
     WHERE account.id = $1 AND account.organization_id = $2
       AND account.status = 'active' AND account.is_service_account
       AND application.slug = 'porta-admin' AND role.slug = 'porta-invite-service'
       AND permission.application_id = application.id AND permission.slug = $3
       AND (SELECT count(*) FROM user_roles WHERE user_id = account.id) = 1`,
    [accountId, organizationId, SERVICE_ACCOUNT_INVITE_SCOPE],
  );
  if (!result.rows.length) throw new ServiceAccountAuthorizationError();
}

/**
 * Revalidate live authority after acquiring the same locks used by lifecycle/credential writers.
 * The caller must use the existing transaction owner, so locks cover invitation plus final audit.
 *
 * @param publicClientId - Native provider client identity, not a request-supplied account selector.
 * @param identity - Closed native issuance identity; omitted only while initially issuing it.
 * @returns Live client attribution and locked binding for this transaction.
 * @throws ServiceAccountAuthorizationError when any live authority condition fails.
 */
export async function requireServiceAccountAuthority(
  publicClientId: string, identity?: ServiceAccountIdentity,
): Promise<ServiceAccountAuthority> {
  const found = await getPool().query<{ id: string }>('SELECT id FROM clients WHERE client_id = $1', [publicClientId]);
  const clientId = found.rows[0]?.id;
  if (!clientId) throw new ServiceAccountAuthorizationError();
  const binding = await lockServiceAccountByClientId(clientId);
  const client = await readServiceAccountClient(clientId);
  if (!isServiceAccountClientEligible(client) || !binding || binding.status !== 'active' || !binding.accountId ||
      (identity && (identity.accountId !== binding.accountId || identity.bindingId !== binding.id ||
        identity.version !== binding.authorizationVersion))) throw new ServiceAccountAuthorizationError();
  await requireMachineAccount(binding.accountId, client.organizationId);
  const details = await getPool().query<{ clientName: string; scope: string }>(
    'SELECT client_name AS "clientName", scope FROM clients WHERE id = $1', [clientId],
  );
  const row = details.rows[0];
  if (!row || !row.scope.split(/\s+/).includes(SERVICE_ACCOUNT_INVITE_SCOPE)) throw new ServiceAccountAuthorizationError();
  return { clientId, publicClientId, clientName: row.clientName, organizationId: client.organizationId, binding };
}

/** Check the complete requested assignment set and its live ordinary references before any write. */
export async function authorizeServiceAccountInvitation(
  authority: ServiceAccountAuthority, organizationId: string, input: InviteUserInput,
): Promise<void> {
  assertInvitationAllowed(authority.binding.targets, organizationId, input);
  const target = authority.binding.targets.find((candidate) => candidate.organizationId === organizationId.toLowerCase());
  if (!target) throw new ServiceAccountAuthorizationError();
  try {
    await validateServiceAccountReferences([{
      organizationId: target.organizationId,
      allowedRoles: input.roles ?? [], allowedClaimDefinitions: input.claims ?? [],
    }]);
  } catch (error) {
    if (error instanceof ServiceAccountValidationError) throw new ServiceAccountAuthorizationError();
    throw error;
  }
}

/** Closed safe metadata shared by the business and final transaction audits. */
export function serviceAccountAuditMetadata(authority: ServiceAccountAuthority) {
  return {
    /** Real service identity, never placed in the human actor columns. */
    serviceAccountId: authority.binding.accountId,
    /** Exact ownership binding validated for this operation. */
    bindingId: authority.binding.id,
    /** Authority generation used by this operation, not a later post-commit version. */
    authorizationVersion: authority.binding.authorizationVersion,
  };
}
