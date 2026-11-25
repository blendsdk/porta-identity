/**
 * OIDC provider factory.
 *
 * Creates and configures the node-oidc-provider instance with all
 * configuration, adapters, keys, and account finder wired together.
 * This is the main entry point for provider creation, called once at startup.
 *
 * The provider uses a base issuer URL and supports path-based
 * multi-tenancy where each organization gets a unique issuer:
 *   {issuerBaseUrl}/{orgSlug}
 */

import Provider from 'oidc-provider';
import { config } from '../config/index.js';
import type { OidcTtlConfig } from '../lib/system-config.js';
import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import type { JwkKeyPair } from '../lib/signing-keys.js';
import {
  buildProviderConfiguration,
  DEVICE_AUTHORIZATION_INTERVAL_SECONDS,
} from './configuration.js';
import { createAdapterFactory } from './adapter-factory.js';
import { findAccount } from './account-finder.js';
import { resolveRequestOrganization } from './org-resolution.js';
import { oidcCors } from '../middleware/oidc-cors.js';
import { registerProtocolSecurityObservers } from './protocol-security-observer.js';

/** Return true only for a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Add the fixed polling interval to a device authorization response.
 *
 * The provider owns every other response field; this listener mutates only `interval`, matching the
 * RFC 8628 response. It is exported so the behavior can be tested without constructing a provider.
 *
 * @param _ctx - Provider request context (unused; kept for the event signature)
 * @param body - Response body produced by the provider
 */
export function applyDeviceAuthorizationInterval(_ctx: unknown, body: unknown): void {
  if (!isRecord(body)) return;
  body['interval'] = DEVICE_AUTHORIZATION_INTERVAL_SECONDS;
}

/** Read the organization assigned to the client already loaded by the provider. */
function clientOrganizationId(ctx: unknown): string | undefined {
  if (!isRecord(ctx)) return undefined;
  const oidc = ctx['oidc'];
  if (!isRecord(oidc)) return undefined;
  const client = oidc['client'];
  if (!isRecord(client)) return undefined;
  const organizationId = client['organizationId'];
  return typeof organizationId === 'string' && organizationId.length > 0
    ? organizationId
    : undefined;
}

/** Read the raw Node request carried by the provider's internal Koa context. */
function providerRequest(ctx: unknown): unknown {
  if (!isRecord(ctx)) return undefined;
  const direct = ctx['req'];
  if (direct !== undefined) return direct;
  const request = ctx['request'];
  if (isRecord(request)) return request['req'];
  return undefined;
}

/**
 * Resolve the organization that owns a provider interaction.
 *
 * The loaded client is the primary authority; the request organization is the fallback for routes
 * with no loaded client. The client metadata carries `organizationId` as a plain UUID string.
 *
 * @param ctx - Provider internal Koa context
 * @returns The organization identifier, or undefined when neither source is valid
 */
export function resolveInteractionOrganization(ctx: unknown): string | undefined {
  return clientOrganizationId(ctx) ?? resolveRequestOrganization(providerRequest(ctx))?.id;
}

/**
 * Create and configure the node-oidc-provider instance.
 *
 * Wires together the adapter factory, signing keys, TTL config,
 * account finder, CORS handler, and interaction URL builder into a
 * single Provider instance ready to handle OIDC requests.
 *
 * Client lookup is handled by the adapter pattern: oidc-provider calls
 * adapter.find('Client', id), which the adapter factory routes to
 * findForOidc() in the clients service. This returns client metadata
 * including SHA-256 hashed secrets for confidential clients.
 *
 * @param params.jwks - JWK key set loaded from the signing_keys table
 * @param params.ttl - TTL configuration loaded from the system_config table
 * @returns Configured Provider instance
 */
export async function createOidcProvider(params: {
  jwks: { keys: JwkKeyPair[] };
  ttl: OidcTtlConfig;
}): Promise<Provider> {
  const { jwks, ttl } = params;

  // Build the complete provider configuration from all dependencies
  const configuration = buildProviderConfiguration({
    ttl,
    jwks,
    cookieKeys: config.cookieKeys,
    findAccount,
    adapterFactory: createAdapterFactory(),
    clientBasedCORS: oidcCors,
    // Interaction URL builder.
    // Also stores the auth-flow org ID in Redis so interaction handlers
    // can recover the validated client tenant after the URL slug is stripped.
    interactionUrl: (ctx, interaction) => {
      // The loaded client is the strongest organization signal: a client is valid only under its
      // own organization's issuer. The request organization remains the fallback for routes with no
      // loaded client.
      const orgId = resolveInteractionOrganization(ctx);

      if (orgId !== undefined && interaction?.uid) {
        getRedis()
          .set(`interaction:org:${interaction.uid}`, orgId, 'EX', 3600)
          .catch((err: unknown) => logger.warn({ err }, 'Failed to store interaction org'));
      }
      return `/interaction/${interaction.uid}`;
    },
  });

  // Create provider with base issuer URL.
  // The actual per-org issuer is resolved dynamically via URL rewriting
  // in the Koa router (server.ts strips the /:orgSlug prefix).
  const provider = new Provider(config.issuerBaseUrl, configuration);
  provider.on('device_authorization.success', applyDeviceAuthorizationInterval);
  registerProtocolSecurityObservers(provider);
  provider.on('server_error', (context) => {
    // oidc-provider owns its internal error response. When a Redis command fails during that
    // request, expose only the correct availability status and retain its generic response body.
    if (getRedis().status !== 'ready') {
      context.status = 503;
    }
  });

  // Enable proxy mode — required for path-based multi-tenancy so the
  // provider trusts forwarded headers and handles URL rewriting correctly.
  provider.proxy = true;

  return provider;
}
