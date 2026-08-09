/**
 * Exports domain — CSV/JSON data export.
 *
 * @module domains/exports
 */

import type { HttpTransport, TransportResponse } from '../transport/types.js';
import type { ExportParams } from '../types/index.js';
import { toQueryParams } from './helpers.js';

export interface ExportsDomain {
  download(params: ExportParams): Promise<TransportResponse>;
}

export function createExportsDomain(transport: HttpTransport): ExportsDomain {
  return {
    async download(params) {
      const { entityType, ...rest } = params;
      return transport.request({
        method: 'GET',
        path: `/export/${entityType}`,
        params: toQueryParams(rest),
        responseType: 'raw',
      });
    },
  };
}
