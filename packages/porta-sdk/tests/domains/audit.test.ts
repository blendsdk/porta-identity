import { describe, it, expect, vi } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createAuditDomain } from '../../src/domains/audit.js';

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

describe('domains/audit', () => {
  let transport: ReturnType<typeof mockTransport>;

  // ── list ────────────────────────────────────────────────────
  describe('list', () => {
    it('calls GET /audit', async () => {
      transport = mockTransport({ body: { data: [], total: 0, page: 1, pageSize: 20 } });
      const audit = createAuditDomain(transport);
      await audit.list();
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/audit', params: undefined,
      });
    });

    it('passes filter params', async () => {
      transport = mockTransport({ body: { data: [], total: 0, page: 1, pageSize: 20 } });
      const audit = createAuditDomain(transport);
      await audit.list({ page: 2, action: 'user.created' });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/audit',
        params: { page: 2, action: 'user.created' },
      });
    });

    it('returns paginated response', async () => {
      const body = { data: [{ id: 'a1', action: 'login' }], total: 1, page: 1, pageSize: 20 };
      transport = mockTransport({ body });
      const audit = createAuditDomain(transport);
      const result = await audit.list();
      expect(result).toEqual(body);
    });
  });
});
