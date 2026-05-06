import { describe, it, expect, vi } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createConfigDomain } from '../../src/domains/config.js';

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

describe('domains/config', () => {
  let transport: ReturnType<typeof mockTransport>;

  // ── list ────────────────────────────────────────────────────
  describe('list', () => {
    it('calls GET /config', async () => {
      transport = mockTransport({ body: { data: [{ key: 'ttl.access_token', value: '3600' }] } });
      const config = createConfigDomain(transport);
      const result = await config.list();
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/config',
      });
      expect(result).toEqual([{ key: 'ttl.access_token', value: '3600' }]);
    });
  });

  // ── get ─────────────────────────────────────────────────────
  describe('get', () => {
    it('calls GET /config/:key', async () => {
      transport = mockTransport({ body: { data: { key: 'ttl.access_token', value: '3600' } } });
      const config = createConfigDomain(transport);
      const result = await config.get('ttl.access_token');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/config/ttl.access_token',
      });
      expect(result).toEqual({ key: 'ttl.access_token', value: '3600' });
    });
  });

  // ── set ─────────────────────────────────────────────────────
  describe('set', () => {
    it('calls PUT /config/:key with value', async () => {
      transport = mockTransport({ body: { data: { key: 'ttl.access_token', value: '7200' } } });
      const config = createConfigDomain(transport);
      const result = await config.set('ttl.access_token', '7200');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'PUT', path: '/config/ttl.access_token', body: { value: '7200' },
      });
      expect(result).toEqual({ key: 'ttl.access_token', value: '7200' });
    });
  });
});
