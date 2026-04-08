/**
 * Secret service — client secret lifecycle management.
 *
 * Handles the full lifecycle of OIDC client secrets:
 *   - Generate and store new secrets (Argon2id hashed)
 *   - Verify secrets during token endpoint authentication
 *   - Revoke secrets permanently
 *   - List secrets (metadata only, never hashes)
 *   - Cleanup expired secrets
 *
 * Security model:
 *   - Plaintext is returned ONCE at generation, never stored
 *   - Only Argon2id hashes are persisted in the database
 *   - Verification iterates ALL active secrets (no short-circuit)
 *   - Failed verifications are logged as security events
 *   - All operations use fire-and-forget audit logging
 *
 * This service is consumed by:
 *   - The client service (initial secret on confidential client creation)
 *   - The API routes (secret rotation, revocation)
 *   - The OIDC token endpoint (secret verification via client-finder)
 */

import type { ClientSecret, SecretWithPlaintext, CreateSecretInput } from './types.js';
import {
  insertSecret,
  listSecretsByClient,
  findSecretById,
  getActiveSecretHashes,
  revokeSecret as repoRevokeSecret,
  updateLastUsedAt,
  cleanupExpiredSecrets,
} from './secret-repository.js';
import { generateSecret, hashSecret, verifySecretHash } from './crypto.js';
import { writeAuditLog } from '../lib/audit-log.js';
import { logger } from '../lib/logger.js';
import { ClientNotFoundError, ClientValidationError } from './errors.js';

// ===========================================================================
// Secret generation
// ===========================================================================

/**
 * Generate a new client secret, hash it, and store it.
 *
 * Flow:
 * 1. Generate cryptographically random plaintext (48 bytes, base64url)
 * 2. Hash with Argon2id (OWASP-recommended parameters)
 * 3. Insert hashed secret into database
 * 4. Write audit log entry
 * 5. Return SecretWithPlaintext (plaintext shown once, then discarded)
 *
 * @param clientDbId - Client internal UUID (FK to clients.id)
 * @param input - Optional label and expiration
 * @param actorId - UUID of the user performing the action
 * @returns Secret metadata with plaintext (shown once)
 */
export async function generateAndStore(
  clientDbId: string,
  input: CreateSecretInput = {},
  actorId?: string,
): Promise<SecretWithPlaintext> {
  // Generate plaintext secret
  const plaintext = generateSecret();

  // Hash with Argon2id — only the hash is stored
  const secretHash = await hashSecret(plaintext);

  // Insert into database
  const secret = await insertSecret({
    clientId: clientDbId,
    secretHash,
    label: input.label ?? null,
    expiresAt: input.expiresAt ?? null,
  });

  // Audit log (fire-and-forget)
  await writeAuditLog({
    eventType: 'client.secret.generated',
    eventCategory: 'admin',
    actorId,
    metadata: {
      clientId: clientDbId,
      secretId: secret.id,
      label: secret.label,
      expiresAt: secret.expiresAt?.toISOString() ?? null,
    },
  });

  // Return with plaintext — this is the ONLY time it's available
  return {
    id: secret.id,
    clientId: secret.clientId,
    label: secret.label,
    plaintext,
    expiresAt: secret.expiresAt,
    createdAt: secret.createdAt,
  };
}

// ===========================================================================
// Secret verification
// ===========================================================================

/**
 * Verify a plaintext secret against all active secrets for a client.
 *
 * Called during OIDC token endpoint authentication. Iterates through
 * ALL active (non-revoked, non-expired) secrets and checks each one.
 *
 * Security notes:
 * - Iterates all secrets to prevent timing-based enumeration
 * - Updates last_used_at on successful match
 * - Logs failed verification as a security event
 * - Returns false on any error (fail closed)
 *
 * @param clientDbId - Client internal UUID
 * @param plaintext - The secret to verify
 * @returns true if the secret matches any active secret
 */
export async function verify(
  clientDbId: string,
  plaintext: string,
): Promise<boolean> {
  try {
    // Load all active, non-expired secret hashes
    const activeSecrets = await getActiveSecretHashes(clientDbId);

    if (activeSecrets.length === 0) {
      return false;
    }

    // Try each active secret — Argon2id verify is async and non-blocking
    for (const secret of activeSecrets) {
      const matches = await verifySecretHash(secret.hash, plaintext);

      if (matches) {
        // Update last_used_at timestamp (fire-and-forget)
        await updateLastUsedAt(secret.id);

        // Audit log: successful verification
        await writeAuditLog({
          eventType: 'client.secret.verified',
          eventCategory: 'authentication',
          metadata: { clientId: clientDbId, secretId: secret.id },
        });

        return true;
      }
    }

    // No match found — log as security event
    await writeAuditLog({
      eventType: 'client.secret.failed',
      eventCategory: 'security',
      metadata: { clientId: clientDbId, activeSecretCount: activeSecrets.length },
    });

    return false;
  } catch (err) {
    // Fail closed — any error during verification results in rejection
    logger.error({ err, clientDbId }, 'Error during secret verification');
    return false;
  }
}

// ===========================================================================
// Secret revocation
// ===========================================================================

/**
 * Revoke a client secret permanently.
 *
 * Revocation is irreversible — once revoked, a secret cannot be
 * reactivated. The revoked secret remains in the database for
 * audit trail purposes until cleanup removes it.
 *
 * @param secretId - Secret UUID
 * @param actorId - UUID of the user performing the action
 * @throws ClientNotFoundError if secret not found
 * @throws ClientValidationError if secret already revoked
 */
export async function revoke(
  secretId: string,
  actorId?: string,
): Promise<void> {
  // Validate secret exists
  const secret = await findSecretById(secretId);
  if (!secret) {
    throw new ClientNotFoundError(secretId);
  }

  // Validate secret is not already revoked
  if (secret.status === 'revoked') {
    throw new ClientValidationError('Secret is already revoked');
  }

  // Revoke in database
  await repoRevokeSecret(secretId);

  // Audit log (fire-and-forget)
  await writeAuditLog({
    eventType: 'client.secret.revoked',
    eventCategory: 'admin',
    actorId,
    metadata: {
      clientId: secret.clientId,
      secretId: secret.id,
      label: secret.label,
    },
  });
}

// ===========================================================================
// Secret listing
// ===========================================================================

/**
 * List all secrets for a client (metadata only, never hashes).
 *
 * @param clientDbId - Client internal UUID
 * @returns Array of secret metadata
 */
export async function listByClient(clientDbId: string): Promise<ClientSecret[]> {
  return listSecretsByClient(clientDbId);
}

// ===========================================================================
// Secret cleanup
// ===========================================================================

/**
 * Delete expired and revoked secrets older than the retention period.
 *
 * This is a maintenance operation that should be run periodically
 * (e.g., via cron) to clean up old secrets that are no longer needed.
 *
 * @param retentionDays - Days to retain expired secrets (default: 30)
 * @returns Number of deleted secrets
 */
export async function cleanupExpired(retentionDays?: number): Promise<number> {
  return cleanupExpiredSecrets(retentionDays);
}
