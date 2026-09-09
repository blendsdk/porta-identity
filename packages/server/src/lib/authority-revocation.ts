import type { PoolClient } from 'pg';
import { getDatabaseTransactionClient } from './database.js';

/** Identifiers needed to finish targeted authority cleanup after commit. */
export interface RevokedAuthority {
  /** Stored OIDC grant IDs removed with the affected users' authority. */
  readonly grantIds: readonly string[];
}

/**
 * Revoke database-backed sessions and OIDC state for affected users.
 *
 * The caller must already own the request transaction and must identify the
 * affected users before calling this function. Redis cleanup is deliberately
 * excluded so the PostgreSQL transaction remains short.
 *
 * @param userIds - Users whose effective authority was reduced
 * @returns Grant identifiers needed by detached post-commit cleanup
 * @throws When called outside an active database transaction
 */
export async function revokeAffectedAuthorityInTransaction(
  userIds: readonly string[],
): Promise<RevokedAuthority> {
  const transaction = requireTransaction();
  const orderedUserIds = [...new Set(userIds)].sort();
  if (orderedUserIds.length === 0) return { grantIds: [] };

  const grants = await transaction.query<{ id: string }>(
    `SELECT id FROM oidc_payloads
     WHERE type = 'Grant' AND payload->>'accountId' = ANY($1::text[])
     ORDER BY id`,
    [orderedUserIds],
  );
  const grantIds = grants.rows.map((row) => row.id);

  await transaction.query(
    `UPDATE admin_sessions SET revoked_at = NOW()
     WHERE user_id = ANY($1::uuid[]) AND revoked_at IS NULL`,
    [orderedUserIds],
  );
  await transaction.query(
    `DELETE FROM oidc_payloads
     WHERE id = ANY($1::varchar[]) OR grant_id = ANY($1::varchar[])
       OR payload->>'accountId' = ANY($2::text[])`,
    [grantIds, orderedUserIds],
  );

  return { grantIds };
}

/** Return the active request transaction or reject unsafe partial use. */
function requireTransaction(): PoolClient {
  const transaction = getDatabaseTransactionClient();
  if (!transaction) {
    throw new Error('Authority revocation requires an active database transaction');
  }
  return transaction;
}
