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
import { buildProviderConfiguration } from './configuration.js';
import { createAdapterFactory } from './adapter-factory.js';
import { findAccount } from './account-finder.js';
import { oidcCors } from '../middleware/oidc-cors.js';

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
    // can resolve the correct tenant (the URL slug is stripped before
    // the provider sees it, so returnTo doesn't contain the org slug).
    interactionUrl: (ctx, interaction) => {
      // ctx here is the provider's internal Koa context, NOT the outer app's.
      // The org is passed via req._portaOrganization (set in server.ts).
      type PortaReq = { _portaOrganization?: { id: string } };
      type InternalCtx = { req?: PortaReq; request?: { req?: PortaReq } };
      const req = (ctx as unknown as InternalCtx).req ?? (ctx as unknown as InternalCtx).request?.req;
      const org = req?._portaOrganization;
      if (org?.id && interaction?.uid) {
        getRedis()
          .set(`interaction:org:${interaction.uid}`, org.id, 'EX', 3600)
          .catch((err: unknown) => logger.warn({ err }, 'Failed to store interaction org'));
      }
      return `/interaction/${interaction.uid}`;
    },
  });

  // Create provider with base issuer URL.
  // The actual per-org issuer is resolved dynamically via URL rewriting
  // in the Koa router (server.ts strips the /:orgSlug prefix).
  const provider = new Provider(config.issuerBaseUrl, configuration);

  // Enable proxy mode — required for path-based multi-tenancy so the
  // provider trusts forwarded headers and handles URL rewriting correctly.
  provider.proxy = true;

  // Override the issuer per-request to include the organization path segment.
  //
  // node-oidc-provider sets the discovery document's `issuer` field (and the
  // `iss` claim in ID tokens) from `ctx.oidc.issuer`, which defaults to the
  // constructor's first argument — just the base URL without any org slug.
  //
  // RFC 8414 §2 requires:
  //   "The issuer value returned MUST be identical to the Issuer URL that
  //    was used as the prefix to retrieve the metadata."
  //
  // Since Porta uses path-based multi-tenancy (/{orgSlug}/...), the issuer
  // must be `{baseUrl}/{orgSlug}`. The org slug is available from the
  // `originalUrl` property set by the OIDC router in server.ts before it
  // strips the prefix for provider routing.
  //
  // This middleware runs inside the provider's internal Koa context where
  // `ctx.oidc` is available. Each request gets its own OIDCContext instance,
  // so the override is request-scoped and safe for concurrent requests.
  provider.use(async (ctx, next) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalUrl = (ctx.req as any).originalUrl as string | undefined;
    if (originalUrl) {
      // Extract the first path segment as the org slug: /test1-dev/... → test1-dev
      const match = originalUrl.match(/^\/([^/?]+)/);
      if (match?.[1]) {
        Object.defineProperty(ctx.oidc, 'issuer', {
          value: `${config.issuerBaseUrl}/${match[1]}`,
          configurable: true,
        });
      }
    }
    await next();
  });

  return provider;
}
