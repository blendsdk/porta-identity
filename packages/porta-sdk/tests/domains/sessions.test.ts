import { describe, it, expect, vi } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createSessionsDomain } from '../../src/domains/sessions.js';

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

describe('domains/sessions', () => {
  let transport: ReturnType<typeof mockTransport>;

  // ── list ────────────────────────────────────────────────────
  describe('list', () => {
    it('calls GET /sessions', async () => {
      transport = mockTransport({ body: { data: [], total: 0, page: 1, pageSize: 20 } });
      const sessions = createSessionsDomain(transport);
      await sessions.list();
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/sessions', params: undefined,
      });
    });

    it('passes filter params', async () => {
      transport = mockTransport({ body: { data: [], total: 0, page: 1, pageSize: 20 } });
      const sessions = createSessionsDomain(transport);
      await sessions.list({ page: 2, userId: 'u1' });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/sessions',
        params: { page: 2, userId: 'u1' },
      });
    });
  });

  // ── revoke ──────────────────────────────────────────────────
  describe('revoke', () => {
    it('calls DELETE /sessions/:sessionId', async () => {
      transport = mockTransport();
      const sessions = createSessionsDomain(transport);
      await sessions.revoke('sess-1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'DELETE', path: '/sessions/sess-1',
      });
    });
  });

  // ── revokeForUser ───────────────────────────────────────────
  describe('revokeForUser', () => {
    it('calls DELETE /users/:userId/sessions and returns revoked count', async () => {
      transport = mockTransport({ body: { revoked: 5 } });
      const sessions = createSessionsDomain(transport);
      const result = await sessions.revokeForUser('u1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'DELETE', path: '/users/u1/sessions',
      });
      expect(result).toEqual({ revoked: 5 });
    });

    it('returns zero when no sessions to revoke', async () => {
      transport = mockTransport({ body: { revoked: 0 } });
      const sessions = createSessionsDomain(transport);
      const result = await sessions.revokeForUser('u-no-sessions');
      expect(result.revoked).toBe(0);
    });
  });
});
