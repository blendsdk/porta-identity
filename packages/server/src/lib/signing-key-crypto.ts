/**
 * Signing key encryption utilities.
 *
 * Provides AES-256-GCM encryption and decryption for ES256 signing key
 * private keys stored in the database. Private keys must be encrypted at
 * rest because they are the root of trust for all JWT tokens — compromise
 * would allow an attacker to forge tokens for any tenant.
 *
 * The encryption key comes from the SIGNING_KEY_ENCRYPTION_KEY env var
 * (32 bytes, hex-encoded = 64 characters). A random 12-byte IV is
 * generated per encryption operation. The GCM auth tag provides
 * authenticated encryption (tamper detection).
 *
 * This module follows the same pattern as src/two-factor/crypto.ts but
 * uses a separate error class for domain separation.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** AES-256-GCM cipher parameters */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const TAG_LENGTH = 16; // 128-bit authentication tag

/**
 * Error thrown when signing key encryption or decryption fails.
 *
 * Separate from TwoFactorCryptoError to maintain domain boundaries —
 * signing key crypto errors should not be conflated with 2FA errors.
 */
export class SigningKeyCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SigningKeyCryptoError';
  }
}

/**
 * Encrypt a PEM-encoded private key with AES-256-GCM.
 *
 * Generates a random IV for each encryption operation to ensure
 * the same plaintext never produces the same ciphertext.
 *
 * @param pemPrivateKey - PEM-encoded private key to encrypt
 * @param encryptionKey - 32-byte hex-encoded encryption key (64 hex chars)
 * @returns Object containing encrypted data, IV, and auth tag (all hex-encoded)
 * @throws SigningKeyCryptoError if the encryption key is invalid
 */
export function encryptPrivateKey(
  pemPrivateKey: string,
  encryptionKey: string,
): { encrypted: string; iv: string; tag: string } {
  // Validate the encryption key is a valid 32-byte hex string
  const keyBuffer = parseEncryptionKey(encryptionKey);

  // Generate a random 12-byte IV — unique per encryption operation
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, keyBuffer, iv, {
    authTagLength: TAG_LENGTH,
  });

  // Encrypt the PEM-encoded private key
  const encrypted = Buffer.concat([
    cipher.update(pemPrivateKey, 'utf8'),
    cipher.final(),
  ]);

  // Get the GCM authentication tag (provides tamper detection)
  const tag = cipher.getAuthTag();

  return {
    encrypted: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

/**
 * Decrypt a PEM-encoded private key from its AES-256-GCM encrypted form.
 *
 * @param encrypted - Hex-encoded encrypted data
 * @param iv - Hex-encoded initialization vector
 * @param tag - Hex-encoded GCM authentication tag
 * @param encryptionKey - 32-byte hex-encoded encryption key (64 hex chars)
 * @returns The decrypted PEM-encoded private key
 * @throws SigningKeyCryptoError if decryption fails (wrong key, tampered data, etc.)
 */
export function decryptPrivateKey(
  encrypted: string,
  iv: string,
  tag: string,
  encryptionKey: string,
): string {
  const keyBuffer = parseEncryptionKey(encryptionKey);

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      keyBuffer,
      Buffer.from(iv, 'hex'),
      { authTagLength: TAG_LENGTH },
    );

    // Set the auth tag before decryption — GCM verifies integrity
    decipher.setAuthTag(Buffer.from(tag, 'hex'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'hex')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (error) {
    // Re-throw as a domain error — the underlying error may be
    // "Unsupported state or unable to authenticate data" (wrong key/tag)
    const message = error instanceof Error ? error.message : 'Unknown decryption error';
    throw new SigningKeyCryptoError(`Decryption failed: ${message}`);
  }
}

/**
 * Parse and validate a hex-encoded encryption key.
 *
 * @param hexKey - 64 hex characters representing 32 bytes
 * @returns Buffer containing the 32-byte key
 * @throws SigningKeyCryptoError if the key is not a valid 32-byte hex string
 */
function parseEncryptionKey(hexKey: string): Buffer {
  if (!hexKey || hexKey.length !== 64 || !/^[0-9a-f]+$/i.test(hexKey)) {
    throw new SigningKeyCryptoError(
      'Invalid encryption key: must be 64 hex characters (32 bytes)',
    );
  }
  return Buffer.from(hexKey, 'hex');
}
