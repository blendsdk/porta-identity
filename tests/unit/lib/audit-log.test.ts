import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { getPool } from '../../../src/lib/database.js';
import { logger } from '../../../src/lib/logger.js';
import { writeAuditLog } from '../../../src/lib/audit-log.js';

function mockPool() {
  const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });
  return mockQuery;
}

describe('audit-log', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('writeAuditLog', () => {
    it('should execute INSERT with all fields', async () => {
      const mockQuery = mockPool();

      await writeAuditLog({
        organizationId: 'org-1',
        userId: 'user-1',
        actorId: 'actor-1',
        eventType: 'org.created',
        eventCategory: 'admin',
        description: 'Created organization',
        metadata: { slug: 'acme-corp' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO audit_log');

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('org-1');           // organization_id
      expect(params[1]).toBe('user-1');          // user_id
      expect(params[2]).toBe('actor-1');         // actor_id
      expect(params[3]).toBe('org.created');     // event_type
      expect(params[4]).toBe('admin');           // event_category
      expect(params[5]).toBe('Created organization'); // description
      expect(params[6]).toBe('{"slug":"acme-corp"}'); // metadata JSON
      expect(params[7]).toBe('192.168.1.1');     // ip_address
      expect(params[8]).toBe('Mozilla/5.0');     // user_agent
    });

    it('should set null for optional fields when not provided', async () => {
      const mockQuery = mockPool();

      await writeAuditLog({
        eventType: 'org.created',
        eventCategory: 'admin',
      });

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBeNull(); // organization_id
      expect(params[1]).toBeNull(); // user_id
      expect(params[2]).toBeNull(); // actor_id
      expect(params[5]).toBeNull(); // description
      expect(params[6]).toBe('{}'); // metadata defaults to empty object
      expect(params[7]).toBeNull(); // ip_address
      expect(params[8]).toBeNull(); // user_agent
    });

    it('should serialize metadata as JSON string', async () => {
      const mockQuery = mockPool();

      await writeAuditLog({
        eventType: 'test.event',
        eventCategory: 'test',
        metadata: { key: 'value', nested: { a: 1 } },
      });

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[6]).toBe('{"key":"value","nested":{"a":1}}');
    });

    it('should not throw on database error (fire-and-forget)', async () => {
      const mockQuery = mockPool();
      mockQuery.mockRejectedValue(new Error('Connection refused'));

      // Should NOT throw
      await expect(
        writeAuditLog({ eventType: 'test', eventCategory: 'test' }),
      ).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalled();
    });

    it('should return void', async () => {
      mockPool();

      const result = await writeAuditLog({
        eventType: 'test',
        eventCategory: 'test',
      });

      expect(result).toBeUndefined();
    });

    it('should use default empty object for metadata when not provided', async () => {
      const mockQuery = mockPool();

      await writeAuditLog({
        eventType: 'test',
        eventCategory: 'test',
      });

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[6]).toBe('{}');
    });
  });
});
