/**
 * Exports domain — CSV/JSON data export.
 *
 * @module domains/exports
 */

import type { HttpTransport, TransportResponse } from '../transport/types.js';
import type {
  ExportManifestRequest,
  ExportManifestResponse,
  ExportParams,
  PortabilityManifest,
} from '../types/index.js';
import { toQueryParams, unwrapData } from './helpers.js';

/** Path-free attachment names accepted from the server response. */
const SAFE_ATTACHMENT_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

/** Return the server attachment name only when it is a safe final path component. */
function attachmentFilename(contentDisposition: string | undefined): string | undefined {
  if (!contentDisposition) return undefined;
  const match = /filename\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(contentDisposition);
  const filename = match?.[1] ?? match?.[2];
  return filename && SAFE_ATTACHMENT_FILENAME.test(filename) ? filename : undefined;
}

/** Create a path-free fallback name from the current UTC instant. */
function fallbackManifestFilename(): string {
  return `porta-manifest-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
}

/** Administrative report downloads and selective manifest exports. */
export interface ExportsDomain {
  /** Download one existing CSV or JSON administrative report. */
  download(params: ExportParams): Promise<TransportResponse>;
  /** Export one parsed portability manifest without writing a local file. */
  manifest(request: ExportManifestRequest): Promise<ExportManifestResponse>;
}

/** Create the export operations backed by one shared HTTP transport. */
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
    async manifest(request) {
      const response = await transport.request({
        method: 'POST',
        path: '/export/manifest',
        body: request,
      });
      return {
        manifest: unwrapData<PortabilityManifest>(response.body),
        filename:
          attachmentFilename(response.headers['content-disposition']) ?? fallbackManifestFilename(),
      };
    },
  };
}
