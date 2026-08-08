/**
 * Two-factor authentication cryptography utilities.
 *
 * Provides AES-256-GCM encryption and decryption for TOTP secrets.
 * TOTP secrets must be stored encrypted at rest because they are
 * long-lived shared secrets — compromise would allow an attacker
 * to generate valid TOTP codes indefinitely.
 *
 * The encryption key comes from the TWO_FACTOR_ENCRYPTION_KEY env var
 * (32 bytes, hex-encoded = 64 characters). A random 12-byte IV is
 * generated per encryption operation. The GCM auth tag provides
 * authenticated encryption (tamper detection).
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { TwoFactorCryptoError } from './errors.js';

/** AES-256-GCM cipher parameters */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const TAG_LENGTH = 16; // 128-bit authentication tag

/**
 * Encrypt a TOTP secret with AES-256-GCM.
 *
 * Generates a random IV for each encryption operation to ensure
 * the same plaintext never produces the same ciphertext.
 *
 * @param plaintext - The TOTP secret to encrypt (base32-encoded string)
 * @param encryptionKey - 32-byte hex-encoded encryption key (64 hex chars)
 * @returns Object containing encrypted data, IV, and auth tag (all hex-encoded)
 * @throws TwoFactorCryptoError if the encryption key is invalid
 */
export function encryptTotpSecret(
  plaintext: string,
  encryptionKey: string,
): { encrypted: string; iv: string; tag: string } {
  // Validate the encryption key is a valid 32-byte hex string
  const keyBuffer = parseEncryptionKey(encryptionKey);

  // Generate a random 12-byte IV — unique per encryption operation
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, keyBuffer, iv, {
    authTagLength: TAG_LENGTH,
  });

  // Encrypt the plaintext
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
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
 * Decrypt a TOTP secret from its AES-256-GCM encrypted form.
 *
 * @param encrypted - Hex-encoded encrypted data
 * @param iv - Hex-encoded initialization vector
 * @param tag - Hex-encoded GCM authentication tag
 * @param encryptionKey - 32-byte hex-encoded encryption key (64 hex chars)
 * @returns The decrypted TOTP secret (base32-encoded string)
 * @throws TwoFactorCryptoError if decryption fails (wrong key, tampered data, etc.)
 */
export function decryptTotpSecret(
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
    throw new TwoFactorCryptoError(`Decryption failed: ${message}`);
  }
}

/**
 * Parse and validate a hex-encoded encryption key.
 *
 * @param hexKey - 64 hex characters representing 32 bytes
 * @returns Buffer containing the 32-byte key
 * @throws TwoFactorCryptoError if the key is not a valid 32-byte hex string
 */
function parseEncryptionKey(hexKey: string): Buffer {
  if (!hexKey || hexKey.length !== 64 || !/^[0-9a-f]+$/i.test(hexKey)) {
    throw new TwoFactorCryptoError(
      'Invalid encryption key: must be 64 hex characters (32 bytes)',
    );
  }
  return Buffer.from(hexKey, 'hex');
}
