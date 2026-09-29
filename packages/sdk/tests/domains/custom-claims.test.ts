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
  const userId = 'user-1';
  const sampleDefinition = {
    id: 'c1',
    applicationId: appId,
    claimName: 'department',
    claimType: 'string' as const,
    description: null,
    includeInIdToken: true,
    includeInAccessToken: false,
    includeInUserinfo: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const sampleValue = {
    id: 'value-1',
    userId,
    claimId: 'c1',
    value: 'engineering',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  // ── list ────────────────────────────────────────────────────
  describe('list', () => {
    it('calls GET /applications/:appId/claims', async () => {
      transport = mockTransport({ body: { data: [], total: 0, page: 1, pageSize: 20 } });
      const claims = createCustomClaimsDomain(transport);
      await claims.list(appId);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/applications/app-1/claims',
        params: undefined,
      });
    });

    it('passes pagination params', async () => {
      transport = mockTransport({ body: { data: [], total: 0, page: 2, pageSize: 10 } });
      const claims = createCustomClaimsDomain(transport);
      await claims.list(appId, { page: 2, pageSize: 10 });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/applications/app-1/claims',
        params: { page: 2, pageSize: 10 },
      });
    });
  });

  // ── get ─────────────────────────────────────────────────────
  describe('get', () => {
    it('calls GET /applications/:appId/claims/:claimId', async () => {
      transport = mockTransport({ body: { data: sampleDefinition } });
      const claims = createCustomClaimsDomain(transport);
      const result = await claims.get(appId, 'c1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/applications/app-1/claims/c1',
      });
      expect(result).toEqual(sampleDefinition);
    });
  });

  // ── create ──────────────────────────────────────────────────
  describe('create', () => {
    it('calls POST /applications/:appId/claims with input', async () => {
      const input = { claimName: 'department', claimType: 'string' as const };
      transport = mockTransport({ body: { data: { ...sampleDefinition, ...input } } });
      const claims = createCustomClaimsDomain(transport);
      const result = await claims.create(appId, input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/applications/app-1/claims',
        body: input,
      });
      expect(result).toEqual({ ...sampleDefinition, ...input });
    });
  });

  // ── update ──────────────────────────────────────────────────
  describe('update', () => {
    it('calls PUT /applications/:appId/claims/:claimId', async () => {
      const input = { description: 'Updated description', includeInUserinfo: true };
      transport = mockTransport({ body: { data: { ...sampleDefinition, ...input } } });
      const claims = createCustomClaimsDomain(transport);
      const result = await claims.update(appId, 'c1', input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'PUT',
        path: '/applications/app-1/claims/c1',
        body: input,
      });
      expect(result).toEqual({ ...sampleDefinition, ...input });
    });
  });

  // ── delete ──────────────────────────────────────────────────
  describe('delete', () => {
    it('calls DELETE /applications/:appId/claims/:claimId', async () => {
      transport = mockTransport();
      const claims = createCustomClaimsDomain(transport);
      await claims.delete(appId, 'c1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'DELETE',
        path: '/applications/app-1/claims/c1',
      });
    });
  });

  // ── getValuesForUser ────────────────────────────────────────
  describe('getValuesForUser', () => {
    it('should call GET /applications/:appId/claims/users/:userId and resolve definition/value pairs', async () => {
      const row = { definition: sampleDefinition, value: sampleValue };
      transport = mockTransport({ body: { data: [row] } });
      const claims = createCustomClaimsDomain(transport);
      const result = await claims.getValuesForUser(appId, userId);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/applications/app-1/claims/users/user-1',
      });
      expect(result).toEqual([row]);
      expect(result[0].definition.claimName).toBe('department');
      expect(result[0].value.value).toBe('engineering');
    });
  });

  // ── getValue ────────────────────────────────────────────────
  describe('getValue', () => {
    it('should call GET /applications/:appId/claims/:claimId/users/:userId and resolve the stored row', async () => {
      transport = mockTransport({ body: { data: sampleValue } });
      const claims = createCustomClaimsDomain(transport);
      const result = await claims.getValue(appId, 'c1', userId);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/applications/app-1/claims/c1/users/user-1',
      });
      expect(result).toEqual(sampleValue);
    });
  });

  // ── setValue ────────────────────────────────────────────────
  describe('setValue', () => {
    it('should call PUT /applications/:appId/claims/:claimId/users/:userId with the value body', async () => {
      transport = mockTransport({ body: { data: sampleValue } });
      const claims = createCustomClaimsDomain(transport);
      const result = await claims.setValue(appId, 'c1', userId, 'engineering');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'PUT',
        path: '/applications/app-1/claims/c1/users/user-1',
        body: { value: 'engineering' },
      });
      expect(result).toEqual(sampleValue);
    });
  });

  // ── deleteValue ─────────────────────────────────────────────
  describe('deleteValue', () => {
    it('should call DELETE /applications/:appId/claims/:claimId/users/:userId', async () => {
      transport = mockTransport();
      const claims = createCustomClaimsDomain(transport);
      await claims.deleteValue(appId, 'c1', userId);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'DELETE',
        path: '/applications/app-1/claims/c1/users/user-1',
      });
    });
  });
});
