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
const MAX_BEARER_HEADER_LENGTH = 8192;

/** Minimal provider model boundary needed to resolve an opaque access token's issuing client. */
export interface OidcOpaqueTokenProvider {
  /** Opaque access-token model exposed by oidc-provider. */
  readonly AccessToken: {
    /** Finds an unexpired access token without interpreting it as a JWT. */
    find(token: string): Promise<{ readonly clientId?: string } | undefined>;
  };
}

/** Client properties that determine whether an opaque token remains usable at this issuer. */
interface OidcTokenClient {
  readonly organizationId: string;
  readonly status: string;
}

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

/** Extracts one bounded opaque bearer token without decoding or retaining it. */
function bearerToken(authorization: string | undefined): string | undefined {
  if (authorization === undefined || authorization.length > MAX_BEARER_HEADER_LENGTH) {
    return undefined;
  }
  return /^Bearer ([^\s]+)$/i.exec(authorization)?.[1];
}

/** Reads a bounded form-carried access token without accepting arrays or coerced values. */
function formAccessToken(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;
  const token = Reflect.get(body, 'access_token');
  return typeof token === 'string' && token.length > 0 && token.length <= MAX_BEARER_HEADER_LENGTH
    ? token
    : undefined;
}

/** Identifies supported provider UserInfo routes after the organization prefix. */
function isUserinfoRequest(method: string, path: string, organizationSlug: unknown): boolean {
  if (method !== 'GET' && method !== 'POST') return false;
  if (typeof organizationSlug !== 'string' || organizationSlug.length === 0) return false;
  const relativePath = path.slice(`/${organizationSlug}`.length);
  return relativePath === '/me' || relativePath === '/userinfo';
}

/** Returns a single supported UserInfo token mechanism or delegates ambiguous input. */
function userinfoToken(
  method: string,
  authorization: string | undefined,
  body: unknown,
): string | undefined {
  const headerToken = bearerToken(authorization);
  const bodyToken = method === 'POST' ? formAccessToken(body) : undefined;
  if (headerToken !== undefined && bodyToken !== undefined) return undefined;
  return headerToken ?? bodyToken;
}

/** Sends the provider-compatible public response for a tenant-mismatched opaque token. */
function rejectUserinfoToken(ctx: {
  status: number;
  body: unknown;
  set(name: string, value: string): void;
}): void {
  ctx.status = 401;
  ctx.set('WWW-Authenticate', 'Bearer error="invalid_token"');
  ctx.body = { error: 'invalid_token' };
}

/**
 * Enforces that every presented OIDC client identifier belongs to the resolved organization.
 *
 * Query, form-body, and HTTP Basic identifiers are all checked because different OIDC endpoints
 * carry client authentication in different locations. Unknown and foreign identifiers receive
 * the same minimal response so this boundary cannot be used for cross-tenant client discovery.
 * Requests without a client identifier continue to provider endpoints such as discovery and JWKS.
 *
 * Opaque bearer tokens on UserInfo do not carry a separate request `client_id`, so the middleware
 * resolves the token's issuing client and applies the same organization comparison there. Invalid
 * or unknown bearer values remain provider-owned errors; an otherwise valid foreign token is
 * rejected before identity claims can be disclosed.
 *
 * @param provider - Provider model access used to resolve opaque UserInfo tokens
 * @returns Koa middleware mounted after tenant resolution and body parsing
 */
export function oidcClientTenantBinding(provider: OidcOpaqueTokenProvider): Middleware {
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

    if (isUserinfoRequest(ctx.method, ctx.path, ctx.params?.orgSlug)) {
      const token = userinfoToken(ctx.method, ctx.headers.authorization, ctx.request.body);
      if (token !== undefined) {
        const accessToken = await provider.AccessToken.find(token);
        if (accessToken !== undefined) {
          const clientId = boundedClientId(accessToken.clientId);
          const client: OidcTokenClient | null =
            clientId === undefined ? null : await getClientByClientId(clientId);
          if (
            client === null ||
            client.status !== 'active' ||
            client.organizationId !== organizationId
          ) {
            observeProtocolSecurityRejection({
              request: ctx.req,
              eventClass: 'userinfo-rejected',
              clientId,
            });
            rejectUserinfoToken(ctx);
            return;
          }
        }
      }
    }

    await next();
  };
}
