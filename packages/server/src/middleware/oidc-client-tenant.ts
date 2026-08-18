/**
 * OIDC client-to-tenant binding middleware.
 *
 * Porta exposes one issuer per organization. A client identifier is valid only under the issuer
 * owned by that client's organization. This middleware rejects cross-organization and unknown
 * client identifiers before the shared OIDC provider can create an interaction or consume a
 * credential under the wrong issuer.
 */

import type { Middleware } from 'koa';
import { getClientByClientId } from '../clients/service.js';
import { observeProtocolSecurityRejection } from '../oidc/protocol-security-observer.js';

const MAX_CLIENT_ID_LENGTH = 255;
const MAX_BASIC_HEADER_LENGTH = 4096;

/** Returns one bounded client identifier or leaves malformed input for the provider to reject. */
function boundedClientId(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_CLIENT_ID_LENGTH) {
    return undefined;
  }
  return value;
}

/** Extracts the client identifier from HTTP Basic credentials without retaining the secret. */
function basicClientId(authorization: string | undefined): string | undefined {
  if (
    authorization === undefined ||
    !authorization.startsWith('Basic ') ||
    authorization.length > MAX_BASIC_HEADER_LENGTH
  ) {
    return undefined;
  }

  try {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    return separator < 0 ? undefined : boundedClientId(decoded.slice(0, separator));
  } catch {
    return undefined;
  }
}

/** Reads a client identifier from an already parsed request body. */
function bodyClientId(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;
  return boundedClientId(Reflect.get(body, 'client_id'));
}

/** Reads the organization identifier established by the tenant resolver. */
function resolvedOrganizationId(organization: unknown): string | undefined {
  if (typeof organization !== 'object' || organization === null || Array.isArray(organization)) {
    return undefined;
  }
  const id = Reflect.get(organization, 'id');
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/**
 * Enforces that every presented OIDC client identifier belongs to the resolved organization.
 *
 * Query, form-body, and HTTP Basic identifiers are all checked because different OIDC endpoints
 * carry client authentication in different locations. Unknown and foreign identifiers receive
 * the same minimal response so this boundary cannot be used for cross-tenant client discovery.
 * Requests without a client identifier continue to provider endpoints such as discovery and JWKS.
 *
 * @returns Koa middleware mounted after tenant resolution and body parsing
 */
export function oidcClientTenantBinding(): Middleware {
  return async (ctx, next) => {
    const organizationId = resolvedOrganizationId(ctx.state.organization);
    if (organizationId === undefined) ctx.throw(500, 'Tenant context unavailable');
    const candidates = new Set<string>();
    const queryClientId = boundedClientId(ctx.query.client_id);
    const parsedBodyClientId = bodyClientId(ctx.request.body);
    const authenticatedClientId = basicClientId(ctx.headers.authorization);

    if (queryClientId !== undefined) candidates.add(queryClientId);
    if (parsedBodyClientId !== undefined) candidates.add(parsedBodyClientId);
    if (authenticatedClientId !== undefined) candidates.add(authenticatedClientId);

    for (const clientId of candidates) {
      const client = await getClientByClientId(clientId);
      if (client === null || client.organizationId !== organizationId) {
        observeProtocolSecurityRejection({
          request: ctx.req,
          eventClass: 'client-tenant-binding-rejected',
          clientId,
        });
        ctx.throw(404, 'Client not found');
      }
    }

    await next();
  };
}
