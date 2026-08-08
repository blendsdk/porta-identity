/**
 * Cryptographic utilities for client management.
 *
 * Provides secure generation of client IDs and secrets, plus Argon2id
 * hashing and verification for secret storage.
 *
 * - Client IDs: 32 random bytes, base64url (~43 chars) — public identifier
 * - Secrets: 48 random bytes, base64url (~64 chars) — shown once, then hashed
 * - Hashing: Argon2id with library defaults (follows OWASP recommendations)
 *
 * All async operations (hash, verify) are non-blocking — Argon2id runs
 * in a separate thread via the native binding.
 */

import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';

/**
 * Generate a cryptographically random OIDC client_id.
 *
 * Format: 32 random bytes, base64url-encoded (~43 characters).
 * This is the public identifier used in authorization requests.
 *
 * @returns Base64url-encoded client ID string
 */
export function generateClientId(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Generate a cryptographically random client secret.
 *
 * Format: 48 random bytes, base64url-encoded (~64 characters).
 * This plaintext is shown to the user exactly ONCE and never stored.
 *
 * @returns Base64url-encoded secret string
 */
export function generateSecret(): string {
  return randomBytes(48).toString('base64url');
}

/**
 * Hash a secret using Argon2id.
 *
 * Argon2id combines Argon2d (GPU-resistant) and Argon2i (side-channel
 * resistant). The argon2 library's default parameters follow OWASP
 * recommendations for password hashing.
 *
 * The returned hash string includes the algorithm, salt, and parameters
 * in PHC format — everything needed for verification.
 *
 * @param plaintext - The secret to hash
 * @returns Argon2id hash string (PHC format)
 */
export async function hashSecret(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, {
    type: argon2.argon2id,
  });
}

/**
 * Verify a plaintext secret against a stored Argon2id hash.
 *
 * Returns true if the plaintext matches, false otherwise.
 * This operation is async and non-blocking (runs in native thread).
 *
 * @param hash - Stored Argon2id hash (PHC format)
 * @param plaintext - Secret to verify
 * @returns true if the secret matches the hash
 */
export async function verifySecretHash(hash: string, plaintext: string): Promise<boolean> {
  return argon2.verify(hash, plaintext);
}

/**
 * Compute SHA-256 hash of a client secret.
 *
 * Used for oidc-provider integration where the secret hash is stored
 * in the database and compared against the hashed presented secret.
 * SHA-256 is appropriate for machine-generated, high-entropy secrets
 * (48 bytes / 384 bits of randomness — preimage attacks infeasible).
 *
 * @param plaintext - The secret to hash
 * @returns Hex-encoded SHA-256 hash (64 characters)
 */
export function sha256Secret(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}
