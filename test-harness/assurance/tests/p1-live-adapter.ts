import type { P1LiveBoundaryContract } from './p1-live-contract.js';

/**
 * Creates the live P1 adapter installed by the retained harness.
 *
 * The temporary fail-closed implementation makes missing behavior an exact RED instead of
 * returning requirement-derived observations.
 */
export function createP1LiveBoundaryContract(): P1LiveBoundaryContract {
  throw new Error('P1_LIVE_BOUNDARY_CAPABILITY_MISSING');
}
