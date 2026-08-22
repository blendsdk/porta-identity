import {
  ADMINISTRATIVE_DATA_CAPABILITY_MISSING,
  type AdministrativeDataCapability,
} from './administrative-data-contract.js';

/**
 * Return the administrative-data observation capability.
 *
 * Required mode deliberately remains unavailable until the implementation task connects public
 * product routes to independent database, audit, delivery, cache, and log observers.
 */
export function getAdministrativeDataCapability(): AdministrativeDataCapability {
  return Object.freeze({
    available: false,
    reason: ADMINISTRATIVE_DATA_CAPABILITY_MISSING,
  });
}
