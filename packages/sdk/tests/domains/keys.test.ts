import { describe, it, expect, vi } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createKeysDomain } from '../../src/domains/keys.js';

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

describe('domains/keys', () => {
  let transport: ReturnType<typeof mockTransport>;

  // ── list ────────────────────────────────────────────────────
  describe('list', () => {
    it('calls GET /keys', async () => {
      transport = mockTransport({ body: { data: [{ id: 'k1', algorithm: 'ES256' }] } });
      const keys = createKeysDomain(transport);
      const result = await keys.list();
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/keys',
      });
      expect(result).toEqual([{ id: 'k1', algorithm: 'ES256' }]);
    });
  });

  // ── generate ────────────────────────────────────────────────
  describe('generate', () => {
    it('calls POST /keys/generate', async () => {
      transport = mockTransport({ body: { data: { id: 'k2', algorithm: 'ES256' } } });
      const keys = createKeysDomain(transport);
      const result = await keys.generate();
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/keys/generate',
      });
      expect(result).toEqual({ id: 'k2', algorithm: 'ES256' });
    });
  });

  // ── rotate ──────────────────────────────────────────────────
  describe('rotate', () => {
    it('calls POST /keys/rotate', async () => {
      transport = mockTransport({ body: { data: { id: 'k3', algorithm: 'ES256' } } });
      const keys = createKeysDomain(transport);
      const result = await keys.rotate();
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/keys/rotate',
      });
      expect(result).toEqual({ id: 'k3', algorithm: 'ES256' });
    });
  });
});
