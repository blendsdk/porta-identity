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
    // Interaction URL — placeholder for RD-03, real login UI in RD-07
    interactionUrl: (_ctx, interaction) => {
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

  return provider;
}
