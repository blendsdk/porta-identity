/** Atomic portability apply service boundary. */

import type {
  PortabilityActor,
  PortabilityImportMode,
  PortabilityManifest,
  PortabilityResult,
} from './types.js';

/**
 * Validate and atomically apply one portability manifest.
 *
 * This boundary fails closed until its complete transaction-backed apply engine is available.
 *
 * @param manifest - Validated complete manifest
 * @param mode - Keep-existing or update-existing behavior
 * @param actor - Authenticated audit actor
 * @returns Ordered committed result
 */
export async function applyPortabilityManifest(
  manifest: PortabilityManifest,
  mode: Exclude<PortabilityImportMode, 'dry-run'>,
  actor: PortabilityActor,
): Promise<PortabilityResult> {
  void manifest;
  void mode;
  void actor;
  throw new Error('Portability apply is not available');
}
