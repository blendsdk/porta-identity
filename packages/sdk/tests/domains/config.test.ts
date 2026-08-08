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
    it('calls GET /config and returns entries with all fields', async () => {
      const entry = {
        key: 'ttl.access_token',
        value: '3600',
        valueType: 'number',
        description: 'Access token TTL in seconds',
        isSensitive: false,
        updatedAt: '2026-01-01T00:00:00Z',
      };
      transport = mockTransport({ body: { data: [entry] } });
      const config = createConfigDomain(transport);
      const result = await config.list();
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/config',
      });
      expect(result).toEqual([entry]);
      expect(result[0].valueType).toBe('number');
      expect(result[0].isSensitive).toBe(false);
    });

    it('returns masked value for sensitive entries', async () => {
      const entry = {
        key: 'smtp.password',
        value: '***',
        valueType: 'string',
        description: 'SMTP password',
        isSensitive: true,
        updatedAt: '2026-01-01T00:00:00Z',
      };
      transport = mockTransport({ body: { data: [entry] } });
      const config = createConfigDomain(transport);
      const result = await config.list();
      expect(result[0].value).toBe('***');
      expect(result[0].isSensitive).toBe(true);
    });
  });

  // ── get ─────────────────────────────────────────────────────
  describe('get', () => {
    it('calls GET /config/:key and returns full entry', async () => {
      const entry = {
        key: 'ttl.access_token',
        value: '3600',
        valueType: 'number',
        description: 'Access token TTL in seconds',
        isSensitive: false,
        updatedAt: '2026-01-01T00:00:00Z',
      };
      transport = mockTransport({ body: { data: entry } });
      const config = createConfigDomain(transport);
      const result = await config.get('ttl.access_token');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/config/ttl.access_token',
      });
      expect(result).toEqual(entry);
    });
  });

  // ── set ─────────────────────────────────────────────────────
  describe('set', () => {
    it('calls PUT /config/:key with value', async () => {
      const entry = {
        key: 'ttl.access_token',
        value: '7200',
        valueType: 'number',
        description: 'Access token TTL in seconds',
        isSensitive: false,
        updatedAt: '2026-01-15T00:00:00Z',
      };
      transport = mockTransport({ body: { data: entry } });
      const config = createConfigDomain(transport);
      const result = await config.set('ttl.access_token', '7200');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'PUT', path: '/config/ttl.access_token', body: { value: '7200' },
      });
      expect(result).toEqual(entry);
    });
  });
});
