import { describe, it, expect, vi } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createUserClaimsDomain } from '../../src/domains/user-claims.js';

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

describe('domains/user-claims', () => {
  let transport: ReturnType<typeof mockTransport>;
  const orgId = 'org-1';
  const userId = 'user-1';

  // ── list ────────────────────────────────────────────────────
  describe('list', () => {
    it('calls GET /organizations/:orgId/users/:userId/claims', async () => {
      transport = mockTransport({ body: { data: [{ claimId: 'c1', value: 'admin' }] } });
      const userClaims = createUserClaimsDomain(transport);
      const result = await userClaims.list(orgId, userId);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/organizations/org-1/users/user-1/claims',
      });
      expect(result).toEqual([{ claimId: 'c1', value: 'admin' }]);
    });
  });

  // ── set ─────────────────────────────────────────────────────
  describe('set', () => {
    it('calls PUT /organizations/:orgId/users/:userId/claims/:claimId with value', async () => {
      transport = mockTransport();
      const userClaims = createUserClaimsDomain(transport);
      await userClaims.set(orgId, userId, 'c1', 'new-value');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'PUT', path: '/organizations/org-1/users/user-1/claims/c1',
        body: { value: 'new-value' },
      });
    });
  });

  // ── remove ──────────────────────────────────────────────────
  describe('remove', () => {
    it('calls DELETE /organizations/:orgId/users/:userId/claims/:claimId', async () => {
      transport = mockTransport();
      const userClaims = createUserClaimsDomain(transport);
      await userClaims.remove(orgId, userId, 'c1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'DELETE', path: '/organizations/org-1/users/user-1/claims/c1',
      });
    });
  });
});
