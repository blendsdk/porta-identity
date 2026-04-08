import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClientSecret } from '../../../src/clients/types.js';

// Mock all dependencies the secret service uses
vi.mock('../../../src/clients/secret-repository.js', () => ({
  insertSecret: vi.fn(),
  listSecretsByClient: vi.fn(),
  findSecretById: vi.fn(),
  getActiveSecretHashes: vi.fn(),
  revokeSecret: vi.fn(),
  updateLastUsedAt: vi.fn(),
  cleanupExpiredSecrets: vi.fn(),
}));

vi.mock('../../../src/clients/crypto.js', () => ({
  generateSecret: vi.fn().mockReturnValue('generated-plaintext-secret-abc'),
  hashSecret: vi.fn().mockResolvedValue('$argon2id$hashed-secret'),
  verifySecretHash: vi.fn(),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import {
  insertSecret,
  listSecretsByClient,
  findSecretById,
  getActiveSecretHashes,
  revokeSecret as repoRevokeSecret,
  updateLastUsedAt,
  cleanupExpiredSecrets,
} from '../../../src/clients/secret-repository.js';
import {
  generateSecret as genSecret,
  hashSecret,
  verifySecretHash,
} from '../../../src/clients/crypto.js';
import { writeAuditLog } from '../../../src/lib/audit-log.js';
import { logger } from '../../../src/lib/logger.js';
import {
  generateAndStore,
  verify,
  revoke,
  listByClient,
  cleanupExpired,
} from '../../../src/clients/secret-service.js';
import { ClientNotFoundError } from '../../../src/clients/errors.js';

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

/** Standard test secret (from DB, no hash) */
function createTestSecret(overrides: Partial<ClientSecret> = {}): ClientSecret {
  return {
    id: 'secret-uuid-1',
    clientId: 'client-db-uuid-1',
    label: 'production key',
    expiresAt: null,
    status: 'active',
    lastUsedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('secret service', () => {
  beforeEach(() => vi.clearAllMocks());

  // =========================================================================
  // generateAndStore
  // =========================================================================

  describe('generateAndStore', () => {
    it('should generate, hash, and store a secret', async () => {
      const secret = createTestSecret();
      (insertSecret as ReturnType<typeof vi.fn>).mockResolvedValue(secret);

      const result = await generateAndStore('client-db-uuid-1', { label: 'production key' }, 'actor-1');

      // Should generate plaintext and hash it
      expect(genSecret).toHaveBeenCalled();
      expect(hashSecret).toHaveBeenCalledWith('generated-plaintext-secret-abc');

      // Should insert with the hash
      expect(insertSecret).toHaveBeenCalledWith({
        clientId: 'client-db-uuid-1',
        secretHash: '$argon2id$hashed-secret',
        label: 'production key',
        expiresAt: null,
      });

      // Should return plaintext
      expect(result.plaintext).toBe('generated-plaintext-secret-abc');
      expect(result.id).toBe('secret-uuid-1');
      expect(result.label).toBe('production key');
    });

    it('should write audit log on generation', async () => {
      const secret = createTestSecret();
      (insertSecret as ReturnType<typeof vi.fn>).mockResolvedValue(secret);

      await generateAndStore('client-db-uuid-1', {}, 'actor-1');

      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'client.secret.generated',
          eventCategory: 'admin',
          actorId: 'actor-1',
        }),
      );
    });

    it('should handle optional label and expiration', async () => {
      const expiresAt = new Date('2027-01-01T00:00:00Z');
      const secret = createTestSecret({ label: 'temp', expiresAt });
      (insertSecret as ReturnType<typeof vi.fn>).mockResolvedValue(secret);

      const result = await generateAndStore('client-db-uuid-1', {
        label: 'temp',
        expiresAt,
      });

      expect(insertSecret).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'temp', expiresAt }),
      );
      expect(result.expiresAt).toEqual(expiresAt);
    });

    it('should default label to null and expiresAt to null', async () => {
      const secret = createTestSecret({ label: null, expiresAt: null });
      (insertSecret as ReturnType<typeof vi.fn>).mockResolvedValue(secret);

      await generateAndStore('client-db-uuid-1');

      expect(insertSecret).toHaveBeenCalledWith(
        expect.objectContaining({ label: null, expiresAt: null }),
      );
    });
  });

  // =========================================================================
  // verify
  // =========================================================================

  describe('verify', () => {
    it('should return true when secret matches', async () => {
      (getActiveSecretHashes as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'secret-1', hash: '$argon2id$hash1' },
      ]);
      (verifySecretHash as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const result = await verify('client-db-uuid-1', 'some-plaintext');

      expect(result).toBe(true);
      expect(verifySecretHash).toHaveBeenCalledWith('$argon2id$hash1', 'some-plaintext');
      expect(updateLastUsedAt).toHaveBeenCalledWith('secret-1');
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'client.secret.verified' }),
      );
    });

    it('should return false when no secrets match', async () => {
      (getActiveSecretHashes as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'secret-1', hash: '$argon2id$hash1' },
        { id: 'secret-2', hash: '$argon2id$hash2' },
      ]);
      (verifySecretHash as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const result = await verify('client-db-uuid-1', 'wrong-secret');

      expect(result).toBe(false);
      // Should have tried both secrets
      expect(verifySecretHash).toHaveBeenCalledTimes(2);
      // Should log failed attempt
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'client.secret.failed',
          eventCategory: 'security',
        }),
      );
    });

    it('should return false when no active secrets exist', async () => {
      (getActiveSecretHashes as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await verify('client-db-uuid-1', 'some-plaintext');

      expect(result).toBe(false);
      expect(verifySecretHash).not.toHaveBeenCalled();
    });

    it('should match second secret when first fails', async () => {
      (getActiveSecretHashes as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'secret-1', hash: '$argon2id$hash1' },
        { id: 'secret-2', hash: '$argon2id$hash2' },
      ]);
      // First secret doesn't match, second does
      (verifySecretHash as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const result = await verify('client-db-uuid-1', 'correct-for-second');

      expect(result).toBe(true);
      expect(updateLastUsedAt).toHaveBeenCalledWith('secret-2');
    });

    it('should return false on error (fail closed)', async () => {
      (getActiveSecretHashes as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('DB connection lost'),
      );

      const result = await verify('client-db-uuid-1', 'some-plaintext');

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // revoke
  // =========================================================================

  describe('revoke', () => {
    it('should revoke an active secret', async () => {
      const secret = createTestSecret({ status: 'active' });
      (findSecretById as ReturnType<typeof vi.fn>).mockResolvedValue(secret);

      await revoke('secret-uuid-1', 'actor-1');

      expect(repoRevokeSecret).toHaveBeenCalledWith('secret-uuid-1');
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'client.secret.revoked',
          eventCategory: 'admin',
          actorId: 'actor-1',
        }),
      );
    });

    it('should throw ClientNotFoundError when secret not found', async () => {
      (findSecretById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(revoke('nonexistent')).rejects.toThrow(ClientNotFoundError);
    });

    it('should throw ClientValidationError when already revoked', async () => {
      const secret = createTestSecret({ status: 'revoked' });
      (findSecretById as ReturnType<typeof vi.fn>).mockResolvedValue(secret);

      await expect(revoke('secret-uuid-1')).rejects.toThrow('Secret is already revoked');
    });
  });

  // =========================================================================
  // listByClient
  // =========================================================================

  describe('listByClient', () => {
    it('should delegate to repository', async () => {
      const secrets = [createTestSecret(), createTestSecret({ id: 'secret-uuid-2' })];
      (listSecretsByClient as ReturnType<typeof vi.fn>).mockResolvedValue(secrets);

      const result = await listByClient('client-db-uuid-1');

      expect(result).toHaveLength(2);
      expect(listSecretsByClient).toHaveBeenCalledWith('client-db-uuid-1');
    });
  });

  // =========================================================================
  // cleanupExpired
  // =========================================================================

  describe('cleanupExpired', () => {
    it('should delegate to repository with default retention', async () => {
      (cleanupExpiredSecrets as ReturnType<typeof vi.fn>).mockResolvedValue(5);

      const result = await cleanupExpired();

      expect(result).toBe(5);
      expect(cleanupExpiredSecrets).toHaveBeenCalledWith(undefined);
    });

    it('should pass custom retention days', async () => {
      (cleanupExpiredSecrets as ReturnType<typeof vi.fn>).mockResolvedValue(3);

      const result = await cleanupExpired(7);

      expect(result).toBe(3);
      expect(cleanupExpiredSecrets).toHaveBeenCalledWith(7);
    });
  });
});
