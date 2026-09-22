import { LiveP1BoundaryContract } from '../p1/live-adapter.js';
import type { P1LiveBoundaryContract } from './p1-live-contract.js';

/**
 * Creates the live P1 adapter installed by the retained harness.
 *
 * Without the explicit live mode the fail-closed error makes a missing capability an exact RED
 * instead of returning requirement-derived observations.
 */
export function createP1LiveBoundaryContract(): P1LiveBoundaryContract {
  if (process.env.PORTA_ASSURANCE_P1_ADAPTER !== 'live') {
    throw new Error('P1_LIVE_BOUNDARY_CAPABILITY_MISSING');
  }
  return new LiveP1BoundaryContract();
}
