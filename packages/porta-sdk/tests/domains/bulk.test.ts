import { describe, it, expect, vi } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createBulkDomain } from '../../src/domains/bulk.js';

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

describe('domains/bulk', () => {
  // ── execute ─────────────────────────────────────────────────
  describe('execute', () => {
    it('calls POST /bulk with input', async () => {
      const input = { entityType: 'organizations', action: 'suspend', ids: ['o1', 'o2'] };
      const body = { data: { succeeded: 2, failed: 0, errors: [] } };
      const transport = mockTransport({ body });
      const bulk = createBulkDomain(transport);
      const result = await bulk.execute(input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/bulk', body: input,
      });
      expect(result).toEqual({ data: { succeeded: 2, failed: 0, errors: [] } });
    });
  });
});
