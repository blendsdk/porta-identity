import type { EnumerationResistanceCapability } from './enumeration-resistance-contract.js';
import { LiveEnumerationResistanceDriver } from './enumeration-resistance-live-driver.js';

/**
 * Test-owned swappable boundary for the immutable enumeration specifications.
 *
 * A live adapter is backed by public Koa requests and independent dependency/state observers. An
 * unavailable adapter exposes no driver and therefore cannot fabricate evidence.
 */
export function getEnumerationResistanceCapability(): EnumerationResistanceCapability {
  return Object.freeze({
    available: true,
    createDriver: async () => new LiveEnumerationResistanceDriver(),
  });
}
