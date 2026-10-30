/**
 * Cancel one pending invitation within an authenticated tenant application.
 *
 * Revocation and acceptance serialize on the invitation row. A successful
 * revocation and its audit record commit together; no-op requests deliberately
 * do not classify why the supplied invitation was ineligible.
 */

import { auditFields, writeAuditLogInTransaction } from '../lib/audit-log.js';
import type { AuditActor, AuditRequestContext } from '../lib/audit-log.js';
import {
  getDatabaseTransactionClient,
  getPool,
  runDatabaseTransaction,
} from '../lib/database.js';

/** Trusted caller authority and target for one cancellation request. */
export interface RevokeInvitationOptions {
  /** Organization authenticated by the tenant middleware. */
  readonly organizationId: string;
  /** Application authenticated from the caller's live client binding. */
  readonly applicationId: string;
  /** Exact invitation handle returned when the invitation was created. */
  readonly invitationId: string;
  /** Authenticated actor recorded only when a real revocation occurs. */
  readonly actor: AuditActor;
  /** Trusted request metadata for the durable audit event. */
  readonly auditContext?: AuditRequestContext;
}

/**
 * Invalidate a live unaccepted invitation and audit the transition atomically.
 *
 * Unknown, foreign, unowned and historical invitations are indistinguishable
 * no-ops. An already accepted account is never changed. Storage or audit
 * failures propagate, rolling back the token update rather than reporting a
 * success without a durable audit trail.
 *
 * @param options - Validated invitation ID and authenticated tenant authority.
 * @throws Error when persistence or durable audit fails.
 * @example
 * await revokeInvitation({ organizationId, applicationId, invitationId, actor });
 */
export async function revokeInvitation(options: RevokeInvitationOptions): Promise<void> {
  await runDatabaseTransaction(async () => {
    // UPDATE takes the same row lock used by acceptance. PostgreSQL rechecks
    // these predicates after waiting, so only one committed transition wins.
    const result = await getPool().query<{ id: string }>(
      `UPDATE invitation_tokens
          SET used_at = NOW()
        WHERE id = $1
          AND organization_id = $2
          AND application_id = $3
          AND user_id IS NULL
          AND used_at IS NULL
          AND expires_at > NOW()
        RETURNING id`,
      [options.invitationId, options.organizationId, options.applicationId],
    );
    if (result.rows.length === 0) return;

    const transaction = getDatabaseTransactionClient();
    if (!transaction) {
      throw new Error('Invitation revocation requires an active database transaction');
    }
    await writeAuditLogInTransaction(transaction, {
      organizationId: options.organizationId,
      ...auditFields(options.actor, options.auditContext),
      eventType: 'user.invite.revoked',
      eventCategory: 'admin',
      description: 'User invitation revoked',
      metadata: {
        invitationId: result.rows[0].id,
        applicationId: options.applicationId,
      },
    });
  });
}
