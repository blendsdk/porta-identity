/**
 * Signing key management for the OIDC provider.
 *
 * Handles loading ES256 key pairs from the database, converting between
 * PEM and JWK formats, and generating new key pairs for bootstrapping
 * and rotation.
 *
 * Key format:
 *   - Database stores PEM-encoded keys (public_key, private_key columns)
 *   - node-oidc-provider requires JWK format (jwks.keys configuration)
 *   - Node.js crypto module handles PEM ↔ JWK conversion
 *
 * Key lifecycle:
 *   active   → Used for signing new tokens, published in JWKS
 *   retired  → Not used for signing, still published in JWKS for verification
 *   revoked  → Not loaded, not published
 */

import { createPrivateKey, generateKeyPairSync, createHash } from 'node:crypto';
import { config } from '../config/index.js';
import { getPool } from './database.js';
import { logger } from './logger.js';
import { encryptPrivateKey, decryptPrivateKey } from './signing-key-crypto.js';

// ---------------------------------------------------------------------------
// Cached JWKS for JWT verification (admin auth middleware, etc.)
// ---------------------------------------------------------------------------

/** In-memory cache for the active JWK set — avoids a DB round-trip per request */
let cachedJwks: { keys: JwkKeyPair[] } | null = null;
let jwksCacheTimestamp = 0;

/** Cache TTL for the active JWK set — 60 seconds matches system-config cache */
const JWKS_CACHE_TTL_MS = 60_000;

/**
 * Get the active JWK set (public + private keys) for JWT verification.
 *
 * Loads signing keys from the database on first call, then serves from
 * an in-memory cache for 60 seconds. Used by the admin auth middleware
 * to verify Bearer tokens without a DB query on every request.
 *
 * @returns JWK key set containing all active and retired keys
 */
export async function getActiveJwks(): Promise<{ keys: JwkKeyPair[] }> {
  const now = Date.now();
  if (cachedJwks && now - jwksCacheTimestamp < JWKS_CACHE_TTL_MS) {
    return cachedJwks;
  }

  const records = await loadSigningKeysFromDb();
  cachedJwks = signingKeysToJwks(records);
  jwksCacheTimestamp = now;
  return cachedJwks;
}

/**
 * Clear the cached JWK set — useful for testing and after key rotation.
 */
export function clearJwksCache(): void {
  cachedJwks = null;
  jwksCacheTimestamp = 0;
}

/** Represents a signing key record loaded from the database */
export interface SigningKeyRecord {
  /** UUID primary key */
  id: string;
  /** Key ID — published in JWKS for token verification */
  kid: string;
  /** Signing algorithm (e.g., 'ES256') */
  algorithm: string;
  /** PEM-encoded public key */
  publicKey: string;
  /** PEM-encoded private key */
  privateKey: string;
  /** Key lifecycle status */
  status: 'active' | 'retired' | 'revoked';
  /** When the key was activated */
  activatedAt: Date;
  /** When the key was retired (null if still active) */
  retiredAt: Date | null;
  /** Grace period expiry — retired keys past this date are not loaded */
  expiresAt: Date | null;
}

/** JWK representation suitable for node-oidc-provider's jwks.keys configuration */
export interface JwkKeyPair {
  /** Key type — always 'EC' for ES256 */
  kty: string;
  /** Elliptic curve — always 'P-256' for ES256 */
  crv: string;
  /** Key ID — matches the kid in the signing_keys table */
  kid: string;
  /** Key usage — always 'sig' (signing) */
  use: string;
  /** Algorithm — always 'ES256' */
  alg: string;
  /** Public key X coordinate (base64url-encoded) */
  x: string;
  /** Public key Y coordinate (base64url-encoded) */
  y: string;
  /** Private key D value (base64url-encoded) — only present in private JWK */
  d?: string;
  [key: string]: unknown;
}

/**
 * Generate a new ES256 (ECDSA P-256) key pair.
 *
 * Creates a cryptographically secure key pair suitable for JWT signing.
 * Returns PEM-encoded keys for database storage and a deterministic kid
 * derived from the public key hash.
 *
 * @returns Object containing PEM keys, kid, and algorithm identifier
 */
export function generateES256KeyPair(): {
  kid: string;
  algorithm: string;
  publicKeyPem: string;
  privateKeyPem: string;
} {
  // Generate ECDSA P-256 key pair using Node.js crypto
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  });

  // Export as PEM format for database storage
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

  // Generate deterministic kid from public key hash (first 16 hex chars of SHA-256).
  // This ensures uniqueness while keeping the kid short enough for JWKS headers.
  const kid = createHash('sha256').update(publicKeyPem).digest('hex').substring(0, 16);

  return {
    kid,
    algorithm: 'ES256',
    publicKeyPem,
    privateKeyPem,
  };
}

/**
 * Convert a PEM-encoded private key to JWK format for node-oidc-provider.
 *
 * Uses Node.js crypto module to parse PEM and export as JWK. The resulting
 * JWK includes the private key (d parameter) which is needed by the provider
 * for token signing.
 *
 * @param privatePem - PEM-encoded private key (PKCS#8 format)
 * @param kid - Key ID to include in the JWK
 * @returns JWK object with both public and private key parameters
 */
export function pemToJwk(privatePem: string, kid: string): JwkKeyPair {
  // Parse PEM into a Node.js KeyObject
  const keyObject = createPrivateKey(privatePem);

  // Export as JWK — includes both public (x, y) and private (d) parameters
  const jwk = keyObject.export({ format: 'jwk' });

  return {
    ...jwk,
    kid,
    use: 'sig',
    alg: 'ES256',
  } as JwkKeyPair;
}

/**
 * Convert signing key records from the database into JWK format
 * suitable for node-oidc-provider's jwks.keys configuration.
 *
 * All active and retired keys are included — the provider uses the first key
 * for signing and all keys for verification (supporting rotation).
 *
 * @param records - Array of signing key records from the database
 * @returns JWK key set with keys array
 */
export function signingKeysToJwks(records: SigningKeyRecord[]): { keys: JwkKeyPair[] } {
  const keys: JwkKeyPair[] = [];

  for (const record of records) {
    try {
      keys.push(pemToJwk(record.privateKey, record.kid));
    } catch (error) {
      // Skip invalid PEM keys rather than crashing — log error and continue
      // with remaining keys so the provider can still start
      logger.error({ kid: record.kid, error }, 'Failed to convert signing key PEM to JWK, skipping');
    }
  }

  return { keys };
}

/**
 * Load signing keys from the database.
 *
 * Queries the signing_keys table for active and retired keys that
 * haven't expired. Returns them sorted by activated_at DESC (newest first)
 * so the provider uses the newest active key for signing.
 *
 * @returns Array of signing key records, newest first
 */
export async function loadSigningKeysFromDb(): Promise<SigningKeyRecord[]> {
  const pool = getPool();

  const result = await pool.query<{
    id: string;
    kid: string;
    algorithm: string;
    public_key: string;
    private_key: string;
    private_key_iv: string | null;
    private_key_tag: string | null;
    encrypted: boolean;
    status: 'active' | 'retired' | 'revoked';
    activated_at: Date;
    retired_at: Date | null;
    expires_at: Date | null;
  }>(
    `SELECT id, kid, algorithm, public_key, private_key,
            private_key_iv, private_key_tag, encrypted,
            status, activated_at, retired_at, expires_at
     FROM signing_keys
     WHERE status IN ('active', 'retired')
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY activated_at DESC`,
  );

  // Map snake_case DB columns to camelCase TypeScript interface.
  // Decrypt private keys that are stored encrypted; pass through plaintext legacy keys.
  return result.rows.map((row) => {
    let privateKey: string;
    if (row.encrypted && row.private_key_iv && row.private_key_tag) {
      // Encrypted key — decrypt with AES-256-GCM
      privateKey = decryptPrivateKey(
        row.private_key,
        row.private_key_iv,
        row.private_key_tag,
        config.signingKeyEncryptionKey,
      );
    } else {
      // Legacy plaintext key — use as-is
      privateKey = row.private_key;
    }

    return {
      id: row.id,
      kid: row.kid,
      algorithm: row.algorithm,
      publicKey: row.public_key,
      privateKey,
      status: row.status,
      activatedAt: row.activated_at,
      retiredAt: row.retired_at,
      expiresAt: row.expires_at,
    };
  });
}

/**
 * Ensure at least one active signing key exists in the database.
 *
 * Called at application startup. If no active keys are found:
 * 1. Generate a new ES256 key pair
 * 2. Insert it into the signing_keys table with status='active'
 * 3. Log a warning that a key was auto-generated
 *
 * This guarantees the OIDC provider can always start, even on a fresh database
 * that has no signing keys yet (e.g., first run after migrations).
 *
 * @returns The JWK key set containing all active and retired keys
 */
export async function ensureSigningKeys(): Promise<{ keys: JwkKeyPair[] }> {
  let records = await loadSigningKeysFromDb();

  // Check if there are any active keys
  const hasActiveKey = records.some((r) => r.status === 'active');

  if (!hasActiveKey) {
    logger.warn('No active signing keys found — auto-generating a new ES256 key pair');

    const keyPair = generateES256KeyPair();
    const pool = getPool();

    // Encrypt the private key before storage (AES-256-GCM)
    const { encrypted, iv, tag } = encryptPrivateKey(
      keyPair.privateKeyPem,
      config.signingKeyEncryptionKey,
    );

    // Insert the new key with encrypted private key
    await pool.query(
      `INSERT INTO signing_keys (kid, algorithm, public_key, private_key, private_key_iv, private_key_tag, encrypted, status, activated_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, 'active', NOW())`,
      [keyPair.kid, keyPair.algorithm, keyPair.publicKeyPem, encrypted, iv, tag],
    );

    logger.info({ kid: keyPair.kid }, 'Auto-generated signing key inserted into database');

    // Reload keys from DB to get the full record including generated UUID
    records = await loadSigningKeysFromDb();
  }

  return signingKeysToJwks(records);
}
