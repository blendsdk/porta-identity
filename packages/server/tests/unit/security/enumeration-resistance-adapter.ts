import type { EnumerationResistanceCapability } from './enumeration-resistance-contract.js';
import { ENUMERATION_RESISTANCE_CAPABILITY_MISSING } from './enumeration-resistance-contract.js';
import { ProductionEnumerationResistanceDriver } from './enumeration-resistance-production-driver.js';

/**
 * Test-owned swappable boundary for the immutable enumeration specifications.
 *
 * The adapter stays unavailable until public handlers, production services, durable repositories,
 * and the real mail-transport boundary are wired to independent observers. A test-owned behavior
 * simulation cannot satisfy this admission point.
 */
export function getEnumerationResistanceCapability(): EnumerationResistanceCapability {
  if (process.env.PORTA_ENUMERATION_SPEC_REQUIRED === '1') {
    return Object.freeze({
      available: true,
      evidenceBoundary: 'production-services',
      createDriver: async () => new ProductionEnumerationResistanceDriver(),
    });
  }
  return Object.freeze({
    available: false,
    reason: ENUMERATION_RESISTANCE_CAPABILITY_MISSING,
  });
}
