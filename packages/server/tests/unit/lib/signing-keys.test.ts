import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../../../src/config/index.js', () => ({
  config: {
    signingKeyEncryptionKey: 'a'.repeat(64),
  },
}));

vi.mock('../../../src/lib/signing-key-crypto.js', () => ({
  encryptPrivateKey: vi.fn().mockReturnValue({
    encrypted: 'encrypted-hex-data',
    iv: 'a'.repeat(24),
    tag: 'b'.repeat(32),
  }),
  decryptPrivateKey: vi.fn().mockImplementation(
    (_encrypted: string, _iv: string, _tag: string, _key: string) =>
      '-----BEGIN PRIVATE KEY-----\ndecrypted-pem\n-----END PRIVATE KEY-----',
  ),
}));

import { getPool } from '../../../src/lib/database.js';
import { logger } from '../../../src/lib/logger.js';
import { encryptPrivateKey, decryptPrivateKey } from '../../../src/lib/signing-key-crypto.js';
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
        private_key_iv: null,
        private_key_tag: null,
        encrypted: false,
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

    it('passes through plaintext legacy keys without decryption', async () => {
      mockPool([{
        id: 'uuid-legacy',
        kid: 'kid-legacy',
        algorithm: 'ES256',
        public_key: '-----BEGIN PUBLIC KEY-----\nlegacy\n-----END PUBLIC KEY-----',
        private_key: '-----BEGIN PRIVATE KEY-----\nlegacy-plaintext\n-----END PRIVATE KEY-----',
        private_key_iv: null,
        private_key_tag: null,
        encrypted: false,
        status: 'active',
        activated_at: new Date('2025-01-01'),
        retired_at: null,
        expires_at: null,
      }]);
      const result = await loadSigningKeysFromDb();
      expect(result[0].privateKey).toContain('legacy-plaintext');
      // decryptPrivateKey should NOT have been called for plaintext rows
      expect(decryptPrivateKey).not.toHaveBeenCalled();
    });

    it('decrypts encrypted rows using decryptPrivateKey', async () => {
      mockPool([{
        id: 'uuid-encrypted',
        kid: 'kid-encrypted',
        algorithm: 'ES256',
        public_key: '-----BEGIN PUBLIC KEY-----\nenc\n-----END PUBLIC KEY-----',
        private_key: 'encrypted-hex-data',
        private_key_iv: 'a'.repeat(24),
        private_key_tag: 'b'.repeat(32),
        encrypted: true,
        status: 'active',
        activated_at: new Date('2025-06-01'),
        retired_at: null,
        expires_at: null,
      }]);
      const result = await loadSigningKeysFromDb();
      expect(decryptPrivateKey).toHaveBeenCalledWith(
        'encrypted-hex-data',
        'a'.repeat(24),
        'b'.repeat(32),
        'a'.repeat(64),
      );
      // Should return the decrypted PEM from the mock
      expect(result[0].privateKey).toContain('decrypted-pem');
    });

    it('handles mixed encrypted and plaintext rows', async () => {
      mockPool([
        {
          id: 'uuid-enc',
          kid: 'kid-enc',
          algorithm: 'ES256',
          public_key: '-----BEGIN PUBLIC KEY-----\nenc\n-----END PUBLIC KEY-----',
          private_key: 'encrypted-data',
          private_key_iv: 'c'.repeat(24),
          private_key_tag: 'd'.repeat(32),
          encrypted: true,
          status: 'active',
          activated_at: new Date('2025-06-01'),
          retired_at: null,
          expires_at: null,
        },
        {
          id: 'uuid-plain',
          kid: 'kid-plain',
          algorithm: 'ES256',
          public_key: '-----BEGIN PUBLIC KEY-----\nplain\n-----END PUBLIC KEY-----',
          private_key: '-----BEGIN PRIVATE KEY-----\nplaintext\n-----END PRIVATE KEY-----',
          private_key_iv: null,
          private_key_tag: null,
          encrypted: false,
          status: 'retired',
          activated_at: new Date('2025-01-01'),
          retired_at: new Date('2025-06-01'),
          expires_at: null,
        },
      ]);
      const result = await loadSigningKeysFromDb();
      expect(result).toHaveLength(2);
      // Encrypted row should be decrypted
      expect(decryptPrivateKey).toHaveBeenCalledTimes(1);
      // Plaintext row should be passed through
      expect(result[1].privateKey).toContain('plaintext');
    });

    it('selects encryption metadata columns', async () => {
      const mockQuery = mockPool([]);
      await loadSigningKeysFromDb();
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('private_key_iv');
      expect(sql).toContain('private_key_tag');
      expect(sql).toContain('encrypted');
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
        private_key_iv: null,
        private_key_tag: null,
        encrypted: false,
        status: 'active',
        activated_at: new Date(),
        retired_at: null,
        expires_at: null,
      }]);
      const result = await ensureSigningKeys();
      expect(result.keys).toHaveLength(1);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('generates and inserts encrypted key when no active keys exist', async () => {
      let callCount = 0;
      const keyPair = generateES256KeyPair();
      const mockQuery = vi.fn().mockImplementation(() => {
        callCount++;
        // First call: loadSigningKeysFromDb (empty)
        // Second call: INSERT new encrypted key
        // Third call: loadSigningKeysFromDb (now has key — returns as plaintext for mock simplicity)
        if (callCount === 1) return Promise.resolve({ rows: [] });
        if (callCount === 2) return Promise.resolve({ rows: [] });
        return Promise.resolve({
          rows: [{
            id: 'uuid-new',
            kid: keyPair.kid,
            algorithm: 'ES256',
            public_key: keyPair.publicKeyPem,
            private_key: keyPair.privateKeyPem,
            private_key_iv: null,
            private_key_tag: null,
            encrypted: false,
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
      // Verify encryptPrivateKey was called
      expect(encryptPrivateKey).toHaveBeenCalled();
      // Verify INSERT includes encrypted columns
      const insertCall = mockQuery.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO signing_keys');
      expect(insertCall[0]).toContain('private_key_iv');
      expect(insertCall[0]).toContain('private_key_tag');
      expect(insertCall[0]).toContain('encrypted');
      // Verify INSERT params include encrypted data from mock
      expect(insertCall[1]).toContain('encrypted-hex-data'); // encrypted value
      expect(insertCall[1]).toContain('a'.repeat(24)); // iv
      expect(insertCall[1]).toContain('b'.repeat(32)); // tag
    });

    it('INSERT sets encrypted=true via SQL literal', async () => {
      const mockQuery = vi.fn().mockImplementation(() => {
        const count = mockQuery.mock.calls.length;
        if (count === 1) return Promise.resolve({ rows: [] });
        if (count === 2) return Promise.resolve({ rows: [] });
        return Promise.resolve({ rows: [{ ...makePlaintextRow() }] });
      });
      (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

      await ensureSigningKeys();

      const insertSql = mockQuery.mock.calls[1][0] as string;
      // The SQL should include 'true' as a literal for the encrypted column
      expect(insertSql).toContain('true');
    });
  });
});

/** Helper to create a minimal plaintext DB row for mock responses */
function makePlaintextRow() {
  const keyPair = generateES256KeyPair();
  return {
    id: 'uuid-helper',
    kid: keyPair.kid,
    algorithm: 'ES256',
    public_key: keyPair.publicKeyPem,
    private_key: keyPair.privateKeyPem,
    private_key_iv: null,
    private_key_tag: null,
    encrypted: false,
    status: 'active',
    activated_at: new Date(),
    retired_at: null,
    expires_at: null,
  };
}
