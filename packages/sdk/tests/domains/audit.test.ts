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

  // Server response shape matches AuditEntry:
  // { id, eventType, eventCategory, actorId, organizationId, userId,
  //   description, metadata, ipAddress, createdAt }

  // ── list ────────────────────────────────────────────────────
  describe('list', () => {
    it('calls GET /audit', async () => {
      transport = mockTransport({ body: { data: [], total: 0 } });
      const audit = createAuditDomain(transport);
      await audit.list();
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/audit', params: undefined,
      });
    });

    it('passes filter params', async () => {
      transport = mockTransport({ body: { data: [], total: 0 } });
      const audit = createAuditDomain(transport);
      await audit.list({ limit: 100, event: 'user.login', org: 'org-1' });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/audit',
        params: { limit: 100, event: 'user.login', org: 'org-1' },
      });
    });

    it('returns entries with correct fields', async () => {
      const entry = {
        id: 'a1',
        eventType: 'user.login',
        eventCategory: 'auth',
        actorId: 'user-1',
        organizationId: 'org-1',
        userId: 'user-1',
        description: 'User logged in',
        metadata: { method: 'password' },
        ipAddress: '192.168.1.1',
        createdAt: '2026-01-01T00:00:00Z',
      };
      const body = { data: [entry], total: 1 };
      transport = mockTransport({ body });
      const audit = createAuditDomain(transport);
      const result = await audit.list();
      expect(result.data[0].eventType).toBe('user.login');
      expect(result.data[0].eventCategory).toBe('auth');
      expect(result.data[0].metadata).toEqual({ method: 'password' });
      expect(result.data[0].userId).toBe('user-1');
    });
  });
});
