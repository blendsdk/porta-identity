/**
 * Signing key service integration tests.
 *
 * Verifies ES256 key generation, database storage, PEM→JWK conversion,
 * and the auto-bootstrap mechanism against a real PostgreSQL instance.
 *
 * Tests cover: generate key pair, load active keys from DB, key rotation
 * (multiple active/retired keys), and PEM↔JWK format correctness.
 *
 * Each test starts with a clean slate via truncateAllTables() + seedBaseData().
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { TEST_SIGNING_KEY_ENCRYPTION_KEY } from '../../helpers/constants.js';
import { getPool } from '../../../src/lib/database.js';
import { encryptPrivateKey } from '../../../src/lib/signing-key-crypto.js';
import {
  generateES256KeyPair,
  pemToJwk,
  loadSigningKeysFromDb,
  ensureSigningKeys,
} from '../../../src/lib/signing-keys.js';

/** Stores one encrypted key fixture through the same column contract used by the product. */
async function storeSigningKey(
  keyPair: ReturnType<typeof generateES256KeyPair>,
  status: 'active' | 'retired' | 'revoked',
): Promise<void> {
  const encrypted = encryptPrivateKey(keyPair.privateKeyPem, TEST_SIGNING_KEY_ENCRYPTION_KEY);
  await getPool().query(
    `INSERT INTO signing_keys
       (kid, algorithm, public_key, private_key, private_key_iv, private_key_tag,
        encrypted, status, activated_at, retired_at)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, NOW(), $8)`,
    [
      keyPair.kid,
      keyPair.algorithm,
      keyPair.publicKeyPem,
      encrypted.encrypted,
      encrypted.iv,
      encrypted.tag,
      status,
      status === 'retired' ? new Date() : null,
    ],
  );
}

describe('Signing Key Service (Integration)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
  });

  // ── Generate ES256 Key Pair ────────────────────────────────────

  it('should generate a valid ES256 key pair and store in DB', async () => {
    const keyPair = generateES256KeyPair();

    // Verify generated key structure
    expect(keyPair.kid).toBeDefined();
    expect(keyPair.kid.length).toBe(16); // SHA-256 hash first 16 hex chars
    expect(keyPair.algorithm).toBe('ES256');
    expect(keyPair.publicKeyPem).toContain('BEGIN PUBLIC KEY');
    expect(keyPair.privateKeyPem).toContain('BEGIN PRIVATE KEY');

    // Insert into database
    const pool = getPool();
    await storeSigningKey(keyPair, 'active');

    // Verify it can be loaded from DB
    const loaded = await loadSigningKeysFromDb();
    expect(loaded.length).toBe(1);
    expect(loaded[0].kid).toBe(keyPair.kid);
    expect(loaded[0].algorithm).toBe('ES256');
    expect(loaded[0].status).toBe('active');
    expect(loaded[0].publicKey).toContain('BEGIN PUBLIC KEY');
    expect(loaded[0].privateKey).toContain('BEGIN PRIVATE KEY');
    const stored = await pool.query<{
      private_key: string;
      private_key_iv: string | null;
      private_key_tag: string | null;
      encrypted: boolean;
    }>('SELECT private_key, private_key_iv, private_key_tag, encrypted FROM signing_keys');
    expect(stored.rows[0]).toMatchObject({ encrypted: true });
    expect(stored.rows[0]?.private_key).not.toContain('PRIVATE KEY');
    expect(stored.rows[0]?.private_key_iv).not.toBeNull();
    expect(stored.rows[0]?.private_key_tag).not.toBeNull();
  });

  // ── Load Active Keys ──────────────────────────────────────────

  it('should load active and retired keys, excluding revoked', async () => {
    // Insert an active key
    const key1 = generateES256KeyPair();
    await storeSigningKey(key1, 'active');

    // Insert a retired key (should still be loaded for verification)
    const key2 = generateES256KeyPair();
    await storeSigningKey(key2, 'retired');

    // Insert a revoked key (should NOT be loaded)
    const key3 = generateES256KeyPair();
    await storeSigningKey(key3, 'revoked');

    const loaded = await loadSigningKeysFromDb();
    // Should include active + retired, exclude revoked
    expect(loaded.length).toBe(2);
    const kids = loaded.map((k) => k.kid);
    expect(kids).toContain(key1.kid);
    expect(kids).toContain(key2.kid);
    expect(kids).not.toContain(key3.kid);
  });

  // ── Key Rotation (ensureSigningKeys) ───────────────────────────

  it('should auto-generate a key when none exist', async () => {
    // No signing keys in the DB after truncation
    const jwks = await ensureSigningKeys();

    // Should have generated exactly one key
    expect(jwks.keys.length).toBe(1);
    const key = jwks.keys[0];

    // Verify JWK structure for ES256
    expect(key.kty).toBe('EC');
    expect(key.crv).toBe('P-256');
    expect(key.alg).toBe('ES256');
    expect(key.use).toBe('sig');
    expect(key.kid).toBeDefined();
    // Must have private key (d parameter) for signing
    expect(key.d).toBeDefined();
    // Must have public key coordinates for verification
    expect(key.x).toBeDefined();
    expect(key.y).toBeDefined();
    const stored = await getPool().query<{
      private_key: string;
      private_key_iv: string | null;
      private_key_tag: string | null;
      encrypted: boolean;
    }>('SELECT private_key, private_key_iv, private_key_tag, encrypted FROM signing_keys');
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({ encrypted: true });
    expect(stored.rows[0]?.private_key).not.toContain('PRIVATE KEY');
    expect(stored.rows[0]?.private_key_iv).not.toBeNull();
    expect(stored.rows[0]?.private_key_tag).not.toBeNull();
  });

  // ── PEM → JWK Format ──────────────────────────────────────────

  it('should correctly convert PEM to JWK format', async () => {
    const keyPair = generateES256KeyPair();
    const jwk = pemToJwk(keyPair.privateKeyPem, keyPair.kid);

    // Standard JWK fields for EC key
    expect(jwk.kty).toBe('EC');
    expect(jwk.crv).toBe('P-256');
    expect(jwk.kid).toBe(keyPair.kid);
    expect(jwk.use).toBe('sig');
    expect(jwk.alg).toBe('ES256');

    // Must include all EC key parameters
    expect(typeof jwk.x).toBe('string');
    expect(typeof jwk.y).toBe('string');
    expect(typeof jwk.d).toBe('string');
    // x and y are base64url-encoded, typically 43 chars for P-256
    expect(jwk.x.length).toBeGreaterThan(30);
    expect(jwk.y.length).toBeGreaterThan(30);
  });
});
