import {
  ADMINISTRATIVE_DATA_CAPABILITY_MISSING,
  type AdministrativeDataCapability,
} from './administrative-data-contract.js';
import { ProductionAdministrativeDataDriver } from './administrative-data-production-driver.js';

/**
 * Return the administrative-data observation capability.
 *
 * Required mode deliberately remains unavailable until the implementation task connects public
 * product routes to independent database, audit, delivery, cache, and log observers.
 */
export function getAdministrativeDataCapability(): AdministrativeDataCapability {
  if (process.env.PORTA_ADMINISTRATIVE_DATA_SPEC_REQUIRED === '1') {
    return Object.freeze({
      available: true,
      evidenceBoundary: 'public-actions-and-owned-observers',
      createDriver: async () => new ProductionAdministrativeDataDriver(),
    });
  }
  return Object.freeze({
    available: false,
    reason: ADMINISTRATIVE_DATA_CAPABILITY_MISSING,
  });
}
