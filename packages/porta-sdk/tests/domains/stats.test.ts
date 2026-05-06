import { describe, it, expect, vi } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createStatsDomain } from '../../src/domains/stats.js';

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

describe('domains/stats', () => {
  // ── get ─────────────────────────────────────────────────────
  describe('get', () => {
    it('calls GET /stats', async () => {
      const body = { data: { organizations: 5, users: 100, clients: 20 } };
      const transport = mockTransport({ body });
      const stats = createStatsDomain(transport);
      const result = await stats.get();
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/stats',
      });
      expect(result).toEqual({ data: { organizations: 5, users: 100, clients: 20 } });
    });
  });
});
