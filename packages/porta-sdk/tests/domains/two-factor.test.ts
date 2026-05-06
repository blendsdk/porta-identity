import { describe, it, expect, vi } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createTwoFactorDomain } from '../../src/domains/two-factor.js';

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

describe('domains/two-factor', () => {
  let transport: ReturnType<typeof mockTransport>;
  const orgId = 'org-1';
  const userId = 'user-1';

  // ── getStatus ───────────────────────────────────────────────
  describe('getStatus', () => {
    it('calls GET /organizations/:orgId/users/:userId/two-factor', async () => {
      transport = mockTransport({
        body: { data: { enabled: true, method: 'totp', confirmedAt: '2026-01-01' } },
      });
      const twoFactor = createTwoFactorDomain(transport);
      const result = await twoFactor.getStatus(orgId, userId);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/organizations/org-1/users/user-1/two-factor',
      });
      expect(result).toEqual({ enabled: true, method: 'totp', confirmedAt: '2026-01-01' });
    });
  });

  // ── disable ─────────────────────────────────────────────────
  describe('disable', () => {
    it('calls POST /organizations/:orgId/users/:userId/two-factor/disable', async () => {
      transport = mockTransport();
      const twoFactor = createTwoFactorDomain(transport);
      await twoFactor.disable(orgId, userId);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/organizations/org-1/users/user-1/two-factor/disable',
      });
    });
  });

  // ── reset ───────────────────────────────────────────────────
  describe('reset', () => {
    it('calls POST /organizations/:orgId/users/:userId/two-factor/reset', async () => {
      transport = mockTransport();
      const twoFactor = createTwoFactorDomain(transport);
      await twoFactor.reset(orgId, userId);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/organizations/org-1/users/user-1/two-factor/reset',
      });
    });
  });
});
