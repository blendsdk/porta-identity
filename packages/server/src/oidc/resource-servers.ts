/**
 * Per-application resource-server resolution for RFC 8707 resource indicators.
 *
 * A client may request only a resource server owned by the same application. Resolution is exact:
 * the requested absolute URI and the client's application identity must match one row. The returned
 * scope set combines the protocol-owned OIDC scopes with the resource server's explicit registry.
 * The issued token carries only requested/granted scopes; a resource-bound token has an audience and
 * is for that resource server. Userinfo requires a separate no-resource authorization.
 */

import { errors } from 'oidc-provider';

import { getPool } from '../lib/database.js';

/** Protocol scopes that do not need to be repeated in every resource-server registry. */
export const STANDARD_OIDC_SCOPES = Object.freeze([
  'openid',
  'profile',
  'email',
  'address',
  'phone',
  'offline_access',
] as const);

/** Fast membership check for protocol-owned scopes. */
const STANDARD_SCOPE_SET = new Set<string>(STANDARD_OIDC_SCOPES);

/** Exact inputs needed to resolve one requested resource. */
export interface ResourceServerResolutionInput {
  /** Internal application UUID that owns the requesting OIDC client. */
  readonly applicationId: string;
  /** Absolute RFC 8707 resource indicator requested by the client. */
  readonly identifier: string;
  /** Space-delimited scopes requested with the resource, when the provider supplies them. */
  readonly requestedScope?: string;
  /** Access-token TTL supplied by the existing provider configuration. */
  readonly accessTokenTTL: number;
}

/** Provider-compatible resource server details. */
export interface ResourceServerInfo {
  /** Space-delimited scopes the provider may issue for this resource. */
  readonly scope: string;
  /** Audience returned in the access token. */
  readonly audience: string;
  /** Access tokens remain opaque for this deployment. */
  readonly accessTokenFormat: 'opaque';
  /** Existing access-token lifetime. */
  readonly accessTokenTTL: number;
}

/** Testable provider callback boundary. */
export type ResourceServerResolver = (
  input: ResourceServerResolutionInput,
) => Promise<ResourceServerInfo>;

/** UUID accepted for the internal application identity. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns true only for an absolute URI without a fragment component. */
function isAbsoluteResource(value: string): boolean {
  if (value.length === 0 || value.length > 2_048 || value.includes('#')) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol.length > 1;
  } catch {
    return false;
  }
}

/**
 * Resolve one exact application-owned resource server and enforce its scope registry.
 *
 * @param input - Application, absolute resource identifier, requested scope and TTL.
 * @returns Provider-compatible scope, audience, opaque format and TTL.
 * @throws errors.InvalidTarget for an invalid or unknown resource.
 * @throws errors.InvalidScope for a custom scope outside the registry.
 * @example await resolveResourceServerInfo({ applicationId, identifier, requestedScope, accessTokenTTL });
 */
export async function resolveResourceServerInfo(
  input: ResourceServerResolutionInput,
): Promise<ResourceServerInfo> {
  if (!UUID.test(input.applicationId) || !isAbsoluteResource(input.identifier)) {
    throw new errors.InvalidTarget('resource server is not registered');
  }

  const result = await getPool().query<{ audience: string; scopes: string[] }>(
    `SELECT resource.audience,
            COALESCE(
              array_agg(scope.scope ORDER BY scope.scope)
                FILTER (WHERE scope.scope IS NOT NULL),
              '{}'
            ) AS scopes
       FROM resource_servers resource
       LEFT JOIN resource_server_scopes scope ON scope.resource_server_id = resource.id
      WHERE resource.application_id = $1 AND resource.identifier = $2
      GROUP BY resource.id, resource.audience`,
    [input.applicationId, input.identifier],
  );
  const row = result.rows[0];
  if (!row) throw new errors.InvalidTarget('resource server is not registered');

  const registered = new Set(row.scopes);
  const requested = (input.requestedScope ?? '').split(/\s+/).filter(Boolean);
  const unsupported = requested.some(
    (scope) => !registered.has(scope) && !STANDARD_SCOPE_SET.has(scope),
  );
  if (unsupported) throw new errors.InvalidScope('requested scope is not available', '');

  const scope = [...new Set([...STANDARD_OIDC_SCOPES, ...row.scopes])].join(' ');
  return {
    scope,
    audience: row.audience,
    accessTokenFormat: 'opaque',
    accessTokenTTL: input.accessTokenTTL,
  };
}
