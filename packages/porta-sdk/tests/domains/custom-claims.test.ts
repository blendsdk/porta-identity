import { describe, it, expect, vi } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createCustomClaimsDomain } from '../../src/domains/custom-claims.js';

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

describe('domains/custom-claims', () => {
  let transport: ReturnType<typeof mockTransport>;
  const appId = 'app-1';

  // ── list ────────────────────────────────────────────────────
  describe('list', () => {
    it('calls GET /applications/:appId/claims', async () => {
      transport = mockTransport({ body: { data: [], total: 0, page: 1, pageSize: 20 } });
      const claims = createCustomClaimsDomain(transport);
      await claims.list(appId);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/applications/app-1/claims', params: undefined,
      });
    });

    it('passes pagination params', async () => {
      transport = mockTransport({ body: { data: [], total: 0, page: 2, pageSize: 10 } });
      const claims = createCustomClaimsDomain(transport);
      await claims.list(appId, { page: 2, pageSize: 10 });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/applications/app-1/claims',
        params: { page: 2, pageSize: 10 },
      });
    });
  });

  // ── get ─────────────────────────────────────────────────────
  describe('get', () => {
    it('calls GET /applications/:appId/claims/:claimId', async () => {
      transport = mockTransport({ body: { data: { id: 'c1', name: 'department', type: 'string' } } });
      const claims = createCustomClaimsDomain(transport);
      const result = await claims.get(appId, 'c1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/applications/app-1/claims/c1',
      });
      expect(result).toEqual({ id: 'c1', name: 'department', type: 'string' });
    });
  });

  // ── create ──────────────────────────────────────────────────
  describe('create', () => {
    it('calls POST /applications/:appId/claims with input', async () => {
      const input = { name: 'department', type: 'string' };
      transport = mockTransport({ body: { data: { id: 'c2', ...input } } });
      const claims = createCustomClaimsDomain(transport);
      const result = await claims.create(appId, input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/applications/app-1/claims', body: input,
      });
      expect(result).toEqual({ id: 'c2', ...input });
    });
  });

  // ── update ──────────────────────────────────────────────────
  describe('update', () => {
    it('calls PUT /applications/:appId/claims/:claimId', async () => {
      transport = mockTransport({ body: { data: { id: 'c1', name: 'dept-updated' } } });
      const claims = createCustomClaimsDomain(transport);
      const result = await claims.update(appId, 'c1', { name: 'dept-updated' });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'PUT', path: '/applications/app-1/claims/c1', body: { name: 'dept-updated' },
      });
      expect(result).toEqual({ id: 'c1', name: 'dept-updated' });
    });
  });

  // ── archive ─────────────────────────────────────────────────
  describe('archive', () => {
    it('calls POST /applications/:appId/claims/:claimId/archive', async () => {
      transport = mockTransport();
      const claims = createCustomClaimsDomain(transport);
      await claims.archive(appId, 'c1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/applications/app-1/claims/c1/archive',
      });
    });
  });
});
