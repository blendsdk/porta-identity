import type { EnumerationResistanceCapability } from './enumeration-resistance-contract.js';
import { ENUMERATION_RESISTANCE_CAPABILITY_MISSING } from './enumeration-resistance-contract.js';

/**
 * Test-owned swappable boundary for the immutable enumeration specifications.
 *
 * The adapter stays unavailable until public handlers, production services, durable repositories,
 * and the real mail-transport boundary are wired to independent observers. A test-owned behavior
 * simulation cannot satisfy this admission point.
 */
export function getEnumerationResistanceCapability(): EnumerationResistanceCapability {
  return Object.freeze({
    available: false,
    reason: ENUMERATION_RESISTANCE_CAPABILITY_MISSING,
  });
}
