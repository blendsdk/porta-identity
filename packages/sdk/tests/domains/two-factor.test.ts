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

// Rewritten to server truth (PF-014): the previous test asserted the wrong
// status path (missing /status) and an outdated TwoFactorStatus shape.
describe('domains/two-factor', () => {
  let transport: ReturnType<typeof mockTransport>;
  const orgId = 'org-1';
  const userId = 'user-1';

  // ── getStatus ───────────────────────────────────────────────
  describe('getStatus', () => {
    it('calls GET .../two-factor/status and returns server TwoFactorStatus', async () => {
      // Source: src/routes/two-factor-admin.ts — GET .../two-factor/status, { data }-wrapped.
      const status = { enabled: true, method: 'totp', totpConfigured: true, recoveryCodesRemaining: 8 };
      transport = mockTransport({ body: { data: status } });
      const twoFactor = createTwoFactorDomain(transport);
      const result = await twoFactor.getStatus(orgId, userId);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/organizations/org-1/users/user-1/two-factor/status',
      });
      expect(result).toEqual(status);
    });
  });

  // ── disable ─────────────────────────────────────────────────
  describe('disable', () => {
    it('calls POST .../two-factor/disable', async () => {
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
    it('calls POST .../two-factor/reset', async () => {
      transport = mockTransport();
      const twoFactor = createTwoFactorDomain(transport);
      await twoFactor.reset(orgId, userId);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/organizations/org-1/users/user-1/two-factor/reset',
      });
    });
  });

  // ── regenerateRecoveryCodes ─────────────────────────────────
  describe('regenerateRecoveryCodes', () => {
    it('calls POST .../two-factor/recovery-codes/regenerate and unwraps result', async () => {
      const payload = { recoveryCodes: ['a', 'b'], count: 2, warning: 'one-time' };
      transport = mockTransport({ body: { data: payload } });
      const twoFactor = createTwoFactorDomain(transport);
      const result = await twoFactor.regenerateRecoveryCodes(orgId, userId);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/organizations/org-1/users/user-1/two-factor/recovery-codes/regenerate',
      });
      expect(result).toEqual(payload);
    });
  });

  // ── getPolicy ───────────────────────────────────────────────
  describe('getPolicy', () => {
    it('calls GET .../two-factor/policy and unwraps result', async () => {
      const policy = { twoFactorPolicy: 'optional', validPolicies: ['optional', 'required_email', 'required_totp', 'required_any'] };
      transport = mockTransport({ body: { data: policy } });
      const twoFactor = createTwoFactorDomain(transport);
      const result = await twoFactor.getPolicy(orgId);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/organizations/org-1/two-factor/policy',
      });
      expect(result).toEqual(policy);
    });
  });

  // ── setPolicy ───────────────────────────────────────────────
  describe('setPolicy', () => {
    it('calls PUT .../two-factor/policy with { twoFactorPolicy } body', async () => {
      const policy = { twoFactorPolicy: 'required_totp', validPolicies: ['optional', 'required_email', 'required_totp', 'required_any'] };
      transport = mockTransport({ body: { data: policy } });
      const twoFactor = createTwoFactorDomain(transport);
      const result = await twoFactor.setPolicy(orgId, 'required_totp');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'PUT', path: '/organizations/org-1/two-factor/policy',
        body: { twoFactorPolicy: 'required_totp' },
      });
      expect(result).toEqual(policy);
    });
  });

  // ── getSummary ──────────────────────────────────────────────
  describe('getSummary', () => {
    it('calls GET .../two-factor/summary and unwraps result', async () => {
      const summary = {
        totalUsers: 10, enabledCount: 4, disabledCount: 6,
        totpCount: 3, emailCount: 1, complianceRate: 0.4,
      };
      transport = mockTransport({ body: { data: summary } });
      const twoFactor = createTwoFactorDomain(transport);
      const result = await twoFactor.getSummary(orgId);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/organizations/org-1/two-factor/summary',
      });
      expect(result).toEqual(summary);
    });
  });
});
