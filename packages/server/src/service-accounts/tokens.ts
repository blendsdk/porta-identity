import type { KoaContextWithOIDC } from 'oidc-provider';
import { errors } from 'oidc-provider';
import { getPool, runDatabaseTransaction } from '../lib/database.js';
import {
  requireServiceAccountAuthority, SERVICE_ACCOUNT_INVITE_SCOPE, SERVICE_ACCOUNT_NAMESPACE,
} from './authorization.js';
import { getServiceAccountCredentialProof } from './credential-proof.js';
import { ServiceAccountAuthorizationError } from './errors.js';

/** Minimal native token properties needed by the hook and pre-hook TTL calculation. */
interface MachineToken {
  /** Native model discriminator; human tokens never enter the machine hook. */
  readonly kind: string;
  /** Public OAuth client identity selected by the provider. */
  readonly clientId?: string;
  /** Native approved scope string. */
  readonly scope?: string;
  /** A resource-restricted token is not an Admin credential. */
  readonly resourceServer?: { readonly accessTokenTTL?: number };
}

/** Select expiry before native serialization; the extra-claims hook runs too late to change it. */
export function serviceAccountClientCredentialsTtl(_ctx: unknown, token: MachineToken): number {
  if (!token.resourceServer && token.scope?.split(/\s+/).includes(SERVICE_ACCOUNT_INVITE_SCOPE)) return 300;
  return token.resourceServer?.accessTokenTTL || 600;
}

/**
 * Add identity only after the exact presented credential is rechecked under the parent lock.
 * Ordinary token classes and ordinary client-credentials requests retain native behavior.
 */
export async function serviceAccountExtraTokenClaims(ctx: KoaContextWithOIDC, token: MachineToken) {
  if (token.kind !== 'ClientCredentials' ||
      !token.scope?.split(/\s+/).includes(SERVICE_ACCOUNT_INVITE_SCOPE)) return undefined;
  const proof = getServiceAccountCredentialProof(ctx.req);
  if (!proof || proof.publicClientId !== token.clientId || token.resourceServer || ctx.oidc.params?.resource) {
    throw new errors.InvalidGrant('Client invitation authority is unavailable');
  }
  try {
    return await runDatabaseTransaction(async () => {
      const authority = await requireServiceAccountAuthority(proof.publicClientId);
      if (authority.clientId !== proof.clientId || authority.organizationId !== proof.organizationId) {
        throw new ServiceAccountAuthorizationError();
      }
      // This transaction may have waited on the parent. PostgreSQL transaction-start time is
      // therefore too old; compare the exact proven row against current database wall time.
      const secret = await getPool().query<{ id: string }>(
        `SELECT id FROM client_secrets WHERE id = $1 AND client_id = $2 AND status = 'active'
          AND (expires_at IS NULL OR expires_at > clock_timestamp())`, [proof.secretId, authority.clientId],
      );
      if (!secret.rows.length) throw new ServiceAccountAuthorizationError();
      return { [SERVICE_ACCOUNT_NAMESPACE]: {
        accountId: authority.binding.accountId, bindingId: authority.binding.id,
        version: authority.binding.authorizationVersion,
      } };
    });
  } catch (error) {
    if (error instanceof ServiceAccountAuthorizationError) throw new errors.InvalidGrant('Client invitation authority is unavailable');
    throw new errors.TemporarilyUnavailable('Token service unavailable');
  }
}
