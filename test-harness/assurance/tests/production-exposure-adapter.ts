import type { ProductionExposureContract } from './production-exposure-contract.js';
import { LiveProductionExposureContract } from '../production-exposure/live-adapter.js';

/** Creates the retained-harness production-exposure observer. */
export async function createProductionExposureContract(): Promise<ProductionExposureContract> {
  if (process.env.PORTA_ASSURANCE_PRODUCTION_EXPOSURE_ADAPTER !== 'live') {
    throw new Error('PRODUCTION_EXPOSURE_LIVE_MODE_REQUIRED');
  }
  return new LiveProductionExposureContract();
}
