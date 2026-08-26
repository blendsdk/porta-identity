import { describe, it, expect, vi } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createExportsDomain } from '../../src/domains/exports.js';

function mockTransport(response: Partial<TransportResponse> = {}): HttpTransport {
  return {
    request: vi.fn().mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'text/csv' },
      body: 'id,name\n1,Org',
      ...response,
    }),
  };
}

describe('domains/exports', () => {
  // ── download ────────────────────────────────────────────────
  describe('download', () => {
    it('calls GET /export/:entityType with format param', async () => {
      const transport = mockTransport();
      const exports = createExportsDomain(transport);
      const result = await exports.download({ entityType: 'organizations', format: 'csv' });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/export/organizations', params: { format: 'csv' }, responseType: 'raw',
      });
      expect(result).toBeDefined();
    });

    it('supports json format', async () => {
      const transport = mockTransport({ headers: { 'content-type': 'application/json' }, body: '[]' });
      const exports = createExportsDomain(transport);
      await exports.download({ entityType: 'users', format: 'json' });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/export/users', params: { format: 'json' }, responseType: 'raw',
      });
    });
  });
});
