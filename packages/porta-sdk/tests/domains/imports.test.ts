import { describe, it, expect, vi } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createImportsDomain } from '../../src/domains/imports.js';

function mockTransport(response: Partial<TransportResponse> = {}): HttpTransport {
  return {
    request: vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body: {},
      ...response,
    }),
  };
}

describe('domains/imports', () => {
  // ── provision ───────────────────────────────────────────────
  describe('provision', () => {
    it('calls POST /import with manifest', async () => {
      const manifest = {
        organizations: [{ name: 'Org A', slug: 'org-a' }],
        mode: 'merge',
      };
      const body = {
        data: { succeeded: 1, failed: 0, created: { organizations: 1 }, errors: [] },
      };
      const transport = mockTransport({ body });
      const imports = createImportsDomain(transport);
      const result = await imports.provision(manifest);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/import', body: manifest,
      });
      expect(result).toEqual({ data: { succeeded: 1, failed: 0, created: { organizations: 1 }, errors: [] } });
    });
  });
});
