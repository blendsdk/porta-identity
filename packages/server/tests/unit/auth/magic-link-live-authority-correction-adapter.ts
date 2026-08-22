import {
  MAGIC_LINK_LIVE_AUTHORITY_CORRECTION_CAPABILITY_MISSING,
  type MagicLinkLiveAuthorityCorrectionCapability,
} from './magic-link-live-authority-correction-contract.js';
import { ProductionMagicLinkLiveAuthorityCorrectionDriver } from './magic-link-live-authority-correction-production-driver.js';
import { connectDatabase } from '../../../src/lib/database.js';
import { connectRedis } from '../../../src/lib/redis.js';
import { initI18n } from '../../../src/auth/i18n.js';

let serviceConnection: Promise<void> | null = null;

/** Connect the service-backed specification once when required mode owns an isolated process. */
async function ensureServiceConnection(): Promise<void> {
  serviceConnection ??= Promise.all([connectDatabase(), connectRedis(), initI18n()]).then(
    () => undefined,
  );
  await serviceConnection;
}

/** Return the fail-closed seam until the service-backed correction driver is implemented. */
export function getMagicLinkLiveAuthorityCorrectionCapability(): MagicLinkLiveAuthorityCorrectionCapability {
  if (process.env.PORTA_TEST_REQUIRE_MAGIC_LINK_AUTHORITY_CORRECTIONS === '1') {
    return Object.freeze({
      available: true,
      evidenceBoundary: 'public-actions-production-logger-and-owned-services',
      createDriver: async () => {
        await ensureServiceConnection();
        return new ProductionMagicLinkLiveAuthorityCorrectionDriver();
      },
    });
  }
  return {
    available: false,
    reason: MAGIC_LINK_LIVE_AUTHORITY_CORRECTION_CAPABILITY_MISSING,
  };
}
