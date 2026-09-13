/** Selective portability export service boundary. */

import type { ExportManifestRequest, PortabilityActor, PortabilityManifest } from './types.js';

/** Manifest and safe attachment name produced by one export snapshot. */
export interface PortabilityExport {
  /** Complete validated portability manifest. */
  readonly manifest: PortabilityManifest;
  /** Safe basename returned in Content-Disposition. */
  readonly filename: string;
}

/**
 * Export the selected portable graph.
 *
 * This boundary fails closed until its complete transaction-backed engine is available.
 *
 * @param request - Validated export selection
 * @param actor - Authenticated audit actor
 * @returns Exported manifest and attachment name
 */
export async function exportPortabilityManifest(
  request: ExportManifestRequest,
  actor: PortabilityActor,
): Promise<PortabilityExport> {
  void request;
  void actor;
  throw new Error('Portability export is not available');
}
