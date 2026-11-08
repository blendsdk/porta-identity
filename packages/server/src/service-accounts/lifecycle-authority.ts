import { z } from 'zod';
import { getPool } from '../lib/database.js';
import {
  ServiceAccountManagementError,
  ServiceAccountNotFoundError,
  ServiceAccountValidationError,
} from './errors.js';
import type { ServiceAccountPolicyTarget } from './types.js';

/** Canonical identity application; a matching role in another application grants nothing. */
const ADMIN_APPLICATION = 'porta-admin';

/** Existing human Super Admin role identities, including the supported legacy identity. */
const SUPER_ADMIN_ROLES = ['porta-super-admin', 'porta-admin'];

/** Validate internal identifiers before a database cast can produce an unsafe raw input error. */
const identifier = z.string().uuid();

/** Authoritative client facts needed by lifecycle orchestration, without secret material. */
export interface ServiceAccountClient {
  /** Internal client UUID. */
  id: string;
  /** Actual owning organization UUID. */
  organizationId: string;
  /** Whether that organization is the control plane. */
  isSuperAdmin: boolean;
  /** Owning application identity. */
  applicationId: string;
  /** Actual owning application slug. */
  applicationSlug: string;
  /** Confidential/public classification. */
  clientType: string;
  /** Current client lifecycle state. */
  status: string;
  /** Allowed OAuth grants from storage. */
  grantTypes: string[];
  /** Actual token-endpoint authentication method. */
  tokenEndpointAuthMethod: string;
}

/**
 * Revalidate live human authority at the post-parent-lock statement snapshot.
 * No actor lock is held through commit: that would invert existing organization→user writers.
 * Unsupported inherited isolation fails closed instead of trusting an older transaction snapshot.
 *
 * @param actorId - Authenticated actor identity, never a role/permission snapshot.
 * @returns Actual control-plane organization UUID for transaction-bound audit ownership.
 * @throws ServiceAccountManagementError for every missing or ineligible actor.
 */
export async function requireServiceAccountManager(actorId: string | undefined): Promise<string> {
  if (!identifier.safeParse(actorId).success) throw new ServiceAccountManagementError();
  const result = await getPool().query<{ organizationId: string }>(
    `SELECT account.organization_id AS "organizationId"
     FROM users account JOIN organizations organization ON organization.id = account.organization_id
     JOIN user_roles membership ON membership.user_id = account.id
     JOIN roles role ON role.id = membership.role_id
     JOIN applications application ON application.id = role.application_id
     WHERE account.id = $1 AND account.status = 'active' AND NOT account.is_service_account
       AND organization.is_super_admin = TRUE AND application.slug = $2
       AND role.slug = ANY($3::varchar[])
       AND current_setting('transaction_isolation') = 'read committed' LIMIT 1`,
    [actorId, ADMIN_APPLICATION, SUPER_ADMIN_ROLES],
  );
  const organizationId = result.rows[0]?.organizationId;
  if (!organizationId) throw new ServiceAccountManagementError();
  return organizationId;
}

/**
 * Read fresh client facts after acquiring the parent row lock, never from a provider/cache copy.
 *
 * @param clientId - Validated internal UUID of the locked parent.
 * @returns Secret-free facts for this client's current eligibility.
 * @throws ServiceAccountNotFoundError when physical deletion won the parent lock.
 */
export async function readServiceAccountClient(clientId: string): Promise<ServiceAccountClient> {
  const result = await getPool().query<ServiceAccountClient>(
    `SELECT client.id, client.organization_id AS "organizationId",
       organization.is_super_admin AS "isSuperAdmin", client.application_id AS "applicationId",
       application.slug AS "applicationSlug", client.client_type AS "clientType", client.status,
       client.grant_types AS "grantTypes", client.token_endpoint_auth_method AS "tokenEndpointAuthMethod"
     FROM clients client JOIN organizations organization ON organization.id = client.organization_id
     JOIN applications application ON application.id = client.application_id WHERE client.id = $1`,
    [clientId],
  );
  const client = result.rows[0];
  if (!client) throw new ServiceAccountNotFoundError();
  return client;
}

/** Test the exact approved client eligibility without promoting or repairing an ordinary client. */
export function isServiceAccountClientEligible(client: ServiceAccountClient): boolean {
  return client.status === 'active' && client.clientType === 'confidential' &&
    client.isSuperAdmin && client.applicationSlug === ADMIN_APPLICATION &&
    client.grantTypes.includes('client_credentials') &&
    ['client_secret_basic', 'client_secret_post'].includes(client.tokenEndpointAuthMethod);
}

/**
 * Lock and validate every live target/definition before the first durable lifecycle change.
 * Stable ordering prevents two overlapping policies from requesting definition locks in reverse.
 * Repeated cross-organization pairs are validated once but still counted by the policy parser.
 *
 * @param targets - Complete normalized policy, already shape/bound validated.
 * @throws ServiceAccountValidationError for missing, mismatched or control-plane references.
 */
export async function validateServiceAccountReferences(
  targets: ServiceAccountPolicyTarget[],
): Promise<void> {
  const organizations = await getPool().query<{ id: string }>(
    `SELECT id FROM organizations WHERE id = ANY($1::uuid[]) AND NOT is_super_admin
     ORDER BY id FOR SHARE`, [targets.map((target) => target.organizationId)],
  );
  if (organizations.rows.length !== targets.length) throw new ServiceAccountValidationError();
  const roles = targets.flatMap((target) => target.allowedRoles);
  if (roles.length > 0) {
    const found = await getPool().query<{ id: string; applicationId: string }>(
      `SELECT role.id, role.application_id AS "applicationId" FROM roles role
       JOIN applications application ON application.id = role.application_id
       WHERE role.id = ANY($1::uuid[]) AND application.slug <> $2
       ORDER BY application.id, role.id FOR SHARE OF role, application`,
      [roles.map((role) => role.roleId), ADMIN_APPLICATION],
    );
    if (roles.some((role) => !found.rows.some((row) =>
      row.id === role.roleId && row.applicationId === role.applicationId))) {
      throw new ServiceAccountValidationError();
    }
  }
  const claims = targets.flatMap((target) => target.allowedClaimDefinitions);
  if (claims.length > 0) {
    const found = await getPool().query<{ id: string; applicationId: string }>(
      `SELECT definition.id, definition.application_id AS "applicationId" FROM custom_claim_definitions definition
       JOIN applications application ON application.id = definition.application_id
       WHERE definition.id = ANY($1::uuid[]) AND application.slug <> $2
       ORDER BY application.id, definition.id FOR SHARE OF definition, application`,
      [claims.map((claim) => claim.claimDefinitionId), ADMIN_APPLICATION],
    );
    if (claims.some((claim) => !found.rows.some((row) =>
      row.id === claim.claimDefinitionId && row.applicationId === claim.applicationId))) {
      throw new ServiceAccountValidationError();
    }
  }
}
