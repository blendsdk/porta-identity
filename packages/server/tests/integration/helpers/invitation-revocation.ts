/** Real database fixtures shared by invitation revocation specifications. */
import { randomBytes, randomUUID } from 'node:crypto';
import { getPool } from '../../../src/lib/database.js';
import { acceptInvitation } from '../../../src/users/invitation-service.js';
import { revokeInvitation } from '../../../src/users/invitation-revocation-service.js';
import { createTestApplication, createTestOrganization } from './factories.js';

/** Service identity supplied by the authenticated caller, not the recipient. */
export const REVOCATION_ACTOR = {
  /** Distinguish an authenticated service from a human administrator. */
  kind: 'service' as const,
  /** Stable public client identifier recorded in audit events. */
  clientId: 'invitation-revocation-client',
  /** Trusted client name recorded in audit events. */
  clientName: 'Invitation revocation client',
};

/** Create independent organization and application boundaries for one test. */
export async function createInvitationBoundary() {
  const organization = await createTestOrganization();
  const application = await createTestApplication();
  return { organizationId: organization.id, applicationId: application.id };
}

/** Persist the exact invitation state needed by a behavior test. */
export async function createRevocationInvitation(
  organizationId: string,
  applicationId: string | null,
  overrides: { email?: string; expiresAt?: Date; usedAt?: Date; userId?: string } = {},
) {
  const email = overrides.email ?? `invitation-${randomUUID()}@example.test`;
  const tokenHash = randomBytes(32).toString('hex');
  const result = await getPool().query<{ id: string }>(
    `INSERT INTO invitation_tokens
       (organization_id, application_id, email, token_hash, expires_at, used_at, user_id,
        given_name, family_name, locale)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'Invited', 'Person', 'en') RETURNING id`,
    [organizationId, applicationId, email, tokenHash,
      overrides.expiresAt ?? new Date(Date.now() + 86_400_000),
      overrides.usedAt ?? null, overrides.userId ?? null],
  );
  return { id: result.rows[0]!.id, email, tokenHash, organizationId, applicationId };
}

/** Revoke a target using the fixture's trusted caller boundary. */
export function revokeFixture(
  boundary: { organizationId: string; applicationId: string },
  invitationId: string,
) {
  return revokeInvitation({ ...boundary, invitationId, actor: REVOCATION_ACTOR });
}

/** Exercise real acceptance rather than simulating a consumed invitation. */
export function acceptFixture(invitation: { tokenHash: string; organizationId: string }) {
  return acceptInvitation({ ...invitation, password: 'Correct-Horse-Battery-Staple-9!' });
}

/** Snapshot every persisted field so silent no-ops cannot rewrite history. */
export async function invitationSnapshot(invitationId: string) {
  const result = await getPool().query<{ snapshot: Record<string, unknown> }>(
    'SELECT to_jsonb(invitation_tokens) AS snapshot FROM invitation_tokens WHERE id = $1',
    [invitationId],
  );
  return result.rows[0]?.snapshot;
}

/** Read only successful revocation events in the selected organization. */
export async function revocationAudits(organizationId: string) {
  return getPool().query<{
    /** Durable actor classification. */
    actor_type: string;
    /** Human actor, absent for service clients. */
    actor_id: string | null;
    /** Service client identifier. */
    actor_client_id: string | null;
    /** Service client display name. */
    actor_client_name: string | null;
    /** Recipient account, absent for an unaccepted invitation. */
    user_id: string | null;
    /** Event classification. */
    event_category: string;
    /** Fixed public description. */
    description: string;
    /** Minimal non-secret target identifiers. */
    metadata: Record<string, unknown>;
    /** Trusted request address. */
    ip_address: string | null;
    /** Trusted request user agent. */
    user_agent: string | null;
  }>(
    `SELECT actor_type, actor_id, actor_client_id, actor_client_name, user_id, event_category,
            description, metadata, ip_address, user_agent
       FROM audit_log WHERE organization_id = $1 AND event_type = 'user.invite.revoked'`,
    [organizationId],
  );
}

/** Count recipient accounts without including unrelated fixture users. */
export async function recipientCount(invitation: { organizationId: string; email: string }) {
  const result = await getPool().query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM users WHERE organization_id = $1 AND email = $2',
    [invitation.organizationId, invitation.email],
  );
  return result.rows[0]!.count;
}
