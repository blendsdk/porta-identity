import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClientSecretRow } from '../../../src/clients/types.js';

// Mock the database module
const mockQuery = vi.fn();
vi.mock('../../../src/lib/database.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

import {
  insertSecret,
  listSecretsByClient,
  findSecretById,
  getActiveSecretHashes,
  revokeSecret,
  updateLastUsedAt,
  cleanupExpiredSecrets,
  countActiveSecrets,
} from '../../../src/clients/secret-repository.js';

/** Standard test secret row */
function createSecretRow(overrides: Partial<ClientSecretRow> = {}): ClientSecretRow {
  return {
    id: 'secret-uuid-1',
    client_id: 'client-uuid-1',
    secret_hash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
    label: 'production-key',
    expires_at: new Date('2027-01-01T00:00:00Z'),
    status: 'active',
    last_used_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('secret repository', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // insertSecret
  // -------------------------------------------------------------------------

  describe('insertSecret', () => {
    it('should insert and return mapped secret (without hash)', async () => {
      const row = createSecretRow();
      mockQuery.mockResolvedValue({ rows: [row] });

      const result = await insertSecret({
        clientId: 'client-uuid-1',
        secretHash: '$argon2id$hash',
        secretSha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        label: 'production-key',
        expiresAt: new Date('2027-01-01T00:00:00Z'),
      });

      expect(result.id).toBe('secret-uuid-1');
      expect(result.label).toBe('production-key');
      expect(result).not.toHaveProperty('secretHash');
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO client_secrets');
    });
  });

  // -------------------------------------------------------------------------
  // listSecretsByClient
  // -------------------------------------------------------------------------

  describe('listSecretsByClient', () => {
    it('should return all secrets for a client', async () => {
      const rows = [createSecretRow(), createSecretRow({ id: 'secret-uuid-2' })];
      mockQuery.mockResolvedValue({ rows });

      const result = await listSecretsByClient('client-uuid-1');

      expect(result).toHaveLength(2);
      expect(result[0]).not.toHaveProperty('secretHash');
    });

    it('should return empty array when no secrets', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await listSecretsByClient('client-uuid-1');

      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // findSecretById
  // -------------------------------------------------------------------------

  describe('findSecretById', () => {
    it('should return secret when found', async () => {
      mockQuery.mockResolvedValue({ rows: [createSecretRow()] });

      const result = await findSecretById('secret-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('secret-uuid-1');
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await findSecretById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getActiveSecretHashes
  // -------------------------------------------------------------------------

  describe('getActiveSecretHashes', () => {
    it('should return id/hash pairs for active secrets', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { id: 'secret-1', secret_hash: '$argon2id$hash1' },
          { id: 'secret-2', secret_hash: '$argon2id$hash2' },
        ],
      });

      const result = await getActiveSecretHashes('client-uuid-1');

      expect(result).toEqual([
        { id: 'secret-1', hash: '$argon2id$hash1' },
        { id: 'secret-2', hash: '$argon2id$hash2' },
      ]);
    });

    it('should query for active and non-expired only', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getActiveSecretHashes('client-uuid-1');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("status = 'active'");
      expect(sql).toContain('expires_at');
    });
  });

  // -------------------------------------------------------------------------
  // revokeSecret
  // -------------------------------------------------------------------------

  describe('revokeSecret', () => {
    it('should set status to revoked', async () => {
      const row = createSecretRow({ status: 'revoked' });
      mockQuery.mockResolvedValue({ rows: [row] });

      const result = await revokeSecret('secret-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('revoked');
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await revokeSecret('nonexistent');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // updateLastUsedAt
  // -------------------------------------------------------------------------

  describe('updateLastUsedAt', () => {
    it('should execute update query', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await updateLastUsedAt('secret-uuid-1');

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('last_used_at');
    });
  });

  // -------------------------------------------------------------------------
  // cleanupExpiredSecrets
  // -------------------------------------------------------------------------

  describe('cleanupExpiredSecrets', () => {
    it('should delete expired/revoked secrets and return count', async () => {
      mockQuery.mockResolvedValue({ rowCount: 3 });

      const result = await cleanupExpiredSecrets(30);

      expect(result).toBe(3);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('DELETE');
    });

    it('should use default retention of 30 days', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      await cleanupExpiredSecrets();

      expect(mockQuery.mock.calls[0][1]).toEqual([30]);
    });
  });

  // -------------------------------------------------------------------------
  // countActiveSecrets
  // -------------------------------------------------------------------------

  describe('countActiveSecrets', () => {
    it('should return count of active secrets', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '2' }] });

      const result = await countActiveSecrets('client-uuid-1');

      expect(result).toBe(2);
    });
  });
});
