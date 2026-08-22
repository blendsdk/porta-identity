import {
  MAGIC_LINK_LIVE_AUTHORITY_CORRECTION_CAPABILITY_MISSING,
  type MagicLinkLiveAuthorityCorrectionCapability,
} from './magic-link-live-authority-correction-contract.js';
import { ProductionMagicLinkLiveAuthorityCorrectionDriver } from './magic-link-live-authority-correction-production-driver.js';
import { connectDatabase } from '../../../src/lib/database.js';
import { connectRedis } from '../../../src/lib/redis.js';
import { initI18n } from '../../../src/auth/i18n.js';
import { initTemplateEngine } from '../../../src/auth/template-engine.js';
import { ensureSigningKeys } from '../../../src/lib/signing-keys.js';
import { loadOidcTtlConfig } from '../../../src/lib/system-config.js';
import { createOidcProvider } from '../../../src/oidc/provider.js';
import { createApp } from '../../../src/server.js';
import type { MagicLinkPublicBoundary } from './magic-link-tenant-binding-production-driver.js';

let serviceConnection: Promise<void> | null = null;
let publicBoundary: Promise<MagicLinkPublicBoundary> | null = null;

/** Connect the service-backed specification once when required mode owns an isolated process. */
async function ensureServiceConnection(): Promise<void> {
  serviceConnection ??= Promise.all([
    connectDatabase(),
    connectRedis(),
    initI18n(),
    initTemplateEngine(),
  ]).then(() => undefined);
  await serviceConnection;
}

/** Start one unreferenced loopback application backed by the real OIDC provider model. */
async function ensurePublicBoundary(): Promise<MagicLinkPublicBoundary> {
  await ensureServiceConnection();
  publicBoundary ??= (async () => {
    const provider = await createOidcProvider({
      jwks: await ensureSigningKeys(),
      ttl: await loadOidcTtlConfig(),
    });
    const server = createApp(provider).listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    server.unref();
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Magic-link public boundary did not receive a loopback port');
    }
    return { provider, baseUrl: `http://127.0.0.1:${address.port}` };
  })();
  return publicBoundary;
}

/** Return the fail-closed seam until the service-backed correction driver is implemented. */
export function getMagicLinkLiveAuthorityCorrectionCapability(): MagicLinkLiveAuthorityCorrectionCapability {
  if (process.env.PORTA_TEST_REQUIRE_MAGIC_LINK_AUTHORITY_CORRECTIONS === '1') {
    return Object.freeze({
      available: true,
      evidenceBoundary: 'public-actions-production-logger-and-owned-services',
      createDriver: async () => {
        return new ProductionMagicLinkLiveAuthorityCorrectionDriver(await ensurePublicBoundary());
      },
    });
  }
  return {
    available: false,
    reason: MAGIC_LINK_LIVE_AUTHORITY_CORRECTION_CAPABILITY_MISSING,
  };
}
