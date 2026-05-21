import { describe, it, expect, vi } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createBulkDomain } from '../../src/domains/bulk.js';

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

describe('domains/bulk', () => {
  // ── organizationStatus ──────────────────────────────────────
  describe('organizationStatus', () => {
    it('calls POST /bulk/organizations/status with input', async () => {
      const input = { ids: ['o1', 'o2'], action: 'suspend' as const, reason: 'Maintenance' };
      const body = {
        total: 2, succeeded: 2, failed: 0,
        results: [
          { id: 'o1', success: true, previousStatus: 'active', newStatus: 'suspended' },
          { id: 'o2', success: true, previousStatus: 'active', newStatus: 'suspended' },
        ],
      };
      const transport = mockTransport({ body });
      const bulk = createBulkDomain(transport);
      const result = await bulk.organizationStatus(input);

      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/bulk/organizations/status', body: input,
      });
      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].newStatus).toBe('suspended');
    });

    it('returns partial failure results', async () => {
      const body = {
        total: 2, succeeded: 1, failed: 1,
        results: [
          { id: 'o1', success: true, previousStatus: 'active', newStatus: 'suspended' },
          { id: 'o2', success: false, error: 'Cannot suspend from status \'archived\'' },
        ],
      };
      const transport = mockTransport({ body });
      const bulk = createBulkDomain(transport);
      const result = await bulk.organizationStatus({ ids: ['o1', 'o2'], action: 'suspend' });

      expect(result.failed).toBe(1);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toContain('Cannot suspend');
    });

    it('supports archive action', async () => {
      const input = { ids: ['o1'], action: 'archive' as const };
      const body = {
        total: 1, succeeded: 1, failed: 0,
        results: [{ id: 'o1', success: true, previousStatus: 'active', newStatus: 'archived' }],
      };
      const transport = mockTransport({ body });
      const bulk = createBulkDomain(transport);
      const result = await bulk.organizationStatus(input);

      expect(result.results[0].newStatus).toBe('archived');
    });
  });

  // ── userStatus ──────────────────────────────────────────────
  describe('userStatus', () => {
    it('calls POST /bulk/users/status with input including organizationId', async () => {
      const input = {
        ids: ['u1', 'u2', 'u3'],
        action: 'suspend' as const,
        organizationId: 'org-id',
        reason: 'Policy violation',
      };
      const body = {
        total: 3, succeeded: 3, failed: 0,
        results: [
          { id: 'u1', success: true, previousStatus: 'active', newStatus: 'suspended' },
          { id: 'u2', success: true, previousStatus: 'active', newStatus: 'suspended' },
          { id: 'u3', success: true, previousStatus: 'active', newStatus: 'suspended' },
        ],
      };
      const transport = mockTransport({ body });
      const bulk = createBulkDomain(transport);
      const result = await bulk.userStatus(input);

      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/bulk/users/status', body: input,
      });
      expect(result.total).toBe(3);
      expect(result.succeeded).toBe(3);
    });

    it('supports lock/unlock actions', async () => {
      const input = { ids: ['u1'], action: 'lock' as const, organizationId: 'org-id' };
      const body = {
        total: 1, succeeded: 1, failed: 0,
        results: [{ id: 'u1', success: true, previousStatus: 'active', newStatus: 'locked' }],
      };
      const transport = mockTransport({ body });
      const bulk = createBulkDomain(transport);
      const result = await bulk.userStatus(input);

      expect(result.results[0].newStatus).toBe('locked');
    });
  });
});
