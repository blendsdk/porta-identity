/**
 * Imports domain — declarative provisioning / data import.
 *
 * @module domains/imports
 */

import type { HttpTransport } from '../transport/types.js';
import type { ImportManifest, ImportResult } from '../types/index.js';

export interface ImportsDomain {
  provision(manifest: ImportManifest): Promise<ImportResult>;
}

export function createImportsDomain(transport: HttpTransport): ImportsDomain {
  return {
    async provision(manifest) {
      const res = await transport.request({ method: 'POST', path: '/import', body: manifest });
      return res.body as ImportResult;
    },
  };
}
