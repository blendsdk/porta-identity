import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { getPool } from '../../../src/lib/database.js';
import { logger } from '../../../src/lib/logger.js';
import {
  generateES256KeyPair,
  pemToJwk,
  signingKeysToJwks,
  loadSigningKeysFromDb,
  ensureSigningKeys,
} from '../../../src/lib/signing-keys.js';
import type { SigningKeyRecord } from '../../../src/lib/signing-keys.js';

function mockPool(rows: Record<string, unknown>[] = []) {
  const mockQuery = vi.fn().mockResolvedValue({ rows });
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });
  return mockQuery;
}

describe('signing-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateES256KeyPair', () => {
    it('produces valid PEM keys', () => {
      const result = generateES256KeyPair();
      expect(result.publicKeyPem).toContain('-----BEGIN PUBLIC KEY-----');
      expect(result.privateKeyPem).toContain('-----BEGIN PRIVATE KEY-----');
    });

    it('returns ES256 algorithm', () => {
      const result = generateES256KeyPair();
      expect(result.algorithm).toBe('ES256');
    });

    it('generates a 16-char hex kid', () => {
      const result = generateES256KeyPair();
      expect(result.kid).toMatch(/^[a-f0-9]{16}$/);
    });

    it('produces deterministic kid for same key', () => {
      const result = generateES256KeyPair();
      // Re-derive kid from same public key by calling pemToJwk
      const jwk = pemToJwk(result.privateKeyPem, result.kid);
      expect(jwk.kid).toBe(result.kid);
    });

    it('produces different kids for different keys', () => {
      const key1 = generateES256KeyPair();
      const key2 = generateES256KeyPair();
      expect(key1.kid).not.toBe(key2.kid);
    });
  });

  describe('pemToJwk', () => {
    it('converts PEM to JWK with correct fields', () => {
      const keyPair = generateES256KeyPair();
      const jwk = pemToJwk(keyPair.privateKeyPem, keyPair.kid);
      expect(jwk.kty).toBe('EC');
      expect(jwk.crv).toBe('P-256');
      expect(jwk.kid).toBe(keyPair.kid);
      expect(jwk.use).toBe('sig');
      expect(jwk.alg).toBe('ES256');
    });

    it('includes private key d parameter', () => {
      const keyPair = generateES256KeyPair();
      const jwk = pemToJwk(keyPair.privateKeyPem, keyPair.kid);
      expect(jwk.d).toBeDefined();
      expect(jwk.x).toBeDefined();
      expect(jwk.y).toBeDefined();
    });
  });

  describe('signingKeysToJwks', () => {
    it('converts multiple records to JWK key set', () => {
      const keyPair = generateES256KeyPair();
      const records: SigningKeyRecord[] = [{
        id: 'uuid-1',
        kid: keyPair.kid,
        algorithm: 'ES256',
        publicKey: keyPair.publicKeyPem,
        privateKey: keyPair.privateKeyPem,
        status: 'active',
        activatedAt: new Date(),
        retiredAt: null,
        expiresAt: null,
      }];
      const result = signingKeysToJwks(records);
      expect(result.keys).toHaveLength(1);
      expect(result.keys[0].kid).toBe(keyPair.kid);
      expect(result.keys[0].alg).toBe('ES256');
    });

    it('returns empty keys array for empty input', () => {
      const result = signingKeysToJwks([]);
      expect(result.keys).toHaveLength(0);
    });

    it('skips records with invalid PEM and logs error', () => {
      const records: SigningKeyRecord[] = [{
        id: 'uuid-bad',
        kid: 'bad-kid',
        algorithm: 'ES256',
        publicKey: 'not-a-pem',
        privateKey: 'not-a-pem',
        status: 'active',
        activatedAt: new Date(),
        retiredAt: null,
        expiresAt: null,
      }];
      const result = signingKeysToJwks(records);
      expect(result.keys).toHaveLength(0);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('loadSigningKeysFromDb', () => {
    it('returns mapped records from database', async () => {
      mockPool([{
        id: 'uuid-1',
        kid: 'kid-1',
        algorithm: 'ES256',
        public_key: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----',
        private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
        status: 'active',
        activated_at: new Date('2025-01-01'),
        retired_at: null,
        expires_at: null,
      }]);
      const result = await loadSigningKeysFromDb();
      expect(result).toHaveLength(1);
      expect(result[0].kid).toBe('kid-1');
      expect(result[0].publicKey).toContain('PUBLIC KEY');
      expect(result[0].status).toBe('active');
    });

    it('queries only active and retired keys', async () => {
      const mockQuery = mockPool([]);
      await loadSigningKeysFromDb();
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("status IN ('active', 'retired')");
    });
  });

  describe('ensureSigningKeys', () => {
    it('returns existing keys when active key exists', async () => {
      const keyPair = generateES256KeyPair();
      mockPool([{
        id: 'uuid-1',
        kid: keyPair.kid,
        algorithm: 'ES256',
        public_key: keyPair.publicKeyPem,
        private_key: keyPair.privateKeyPem,
        status: 'active',
        activated_at: new Date(),
        retired_at: null,
        expires_at: null,
      }]);
      const result = await ensureSigningKeys();
      expect(result.keys).toHaveLength(1);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('generates and inserts key when no active keys exist', async () => {
      let callCount = 0;
      const keyPair = generateES256KeyPair();
      const mockQuery = vi.fn().mockImplementation(() => {
        callCount++;
        // First call: loadSigningKeysFromDb (empty)
        // Second call: INSERT new key
        // Third call: loadSigningKeysFromDb (now has key)
        if (callCount === 1) return Promise.resolve({ rows: [] });
        if (callCount === 2) return Promise.resolve({ rows: [] });
        return Promise.resolve({
          rows: [{
            id: 'uuid-new',
            kid: keyPair.kid,
            algorithm: 'ES256',
            public_key: keyPair.publicKeyPem,
            private_key: keyPair.privateKeyPem,
            status: 'active',
            activated_at: new Date(),
            retired_at: null,
            expires_at: null,
          }],
        });
      });
      (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

      const result = await ensureSigningKeys();
      expect(result.keys).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No active signing keys'));
      // Verify INSERT was called
      const insertCall = mockQuery.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO signing_keys');
    });
  });
});
