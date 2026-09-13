/** Mutation-free portability planning service boundary. */

import type { PortabilityImportMode, PortabilityManifest, PortabilityResult } from './types.js';

/**
 * Build a safe preview result without changing product or audit records.
 *
 * This boundary fails closed until its complete transaction-backed planner is available.
 *
 * @param manifest - Validated complete manifest
 * @param mode - Import behavior represented by the plan
 * @returns Ordered safe plan result
 */
export async function buildPortabilityPlan(
  manifest: PortabilityManifest,
  mode: PortabilityImportMode,
): Promise<PortabilityResult> {
  void manifest;
  void mode;
  throw new Error('Portability planning is not available');
}
