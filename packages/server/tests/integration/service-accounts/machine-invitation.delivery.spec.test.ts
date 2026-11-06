import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setEmailTransport } from '../../../src/auth/index.js';
import { getPool } from '../../../src/lib/database.js';
import { machineRequest } from './machine-http-fixtures.js';
import {
  createInvitationSession,
  expectMachineInvitationAbsent,
  expectMachineInvitationAudits,
  expectMachineInvitationCreated,
  expectSafeMachineFailure,
  postMachineInvitation,
  readInvitationAudits,
} from './machine-invitation-fixtures.js';
import type { MachineInvitationSession } from './machine-invitation-fixtures.js';

/** Delivery acknowledgement combinations are meaningful only for validated bound invitations. */
const ACKNOWLEDGEMENTS = [
  { name: 'accepted only', accepted: true, rejected: false, delivery: 'sent' },
  { name: 'rejected only', accepted: false, rejected: true, delivery: 'failed' },
  { name: 'neither accepted nor rejected', accepted: false, rejected: false, delivery: 'unknown' },
  { name: 'both accepted and rejected', accepted: true, rejected: true, delivery: 'unknown' },
] as const;

/**
 * Count success-send audits attributable to exactly one invitation.
 *
 * The email service records this audit without awaiting its insert, so a global before/after set
 * could observe another invitation's late write. The audit metadata carries the invitation ID;
 * filtering by it keeps the same invariant without cross-test contamination.
 */
async function invitationSendAuditCount(invitationId: string): Promise<number> {
  const result = await getPool().query<{ count: string }>(
    "SELECT count(*) AS count FROM audit_log WHERE event_type = $1 AND metadata->>'invitationId' = $2",
    ['email.send.invitation', invitationId],
  );
  const count = Number(result.rows[0]?.count ?? '0');
  if (!Number.isSafeInteger(count)) throw new Error('Invitation send audit count is invalid');
  return count;
}

describe.sequential('machine invitation post-commit delivery reporting', () => {
  let session: MachineInvitationSession | undefined;

  /** Missing setup must never fall back to a fabricated token or email recipient. */
  function currentSession(): MachineInvitationSession {
    if (!session) throw new Error('Machine invitation session is not ready');
    return session;
  }

  beforeEach(async () => {
    session = await createInvitationSession();
    const email = `delivery-control-${randomUUID()}@test.example`;
    await expectMachineInvitationCreated(session, await postMachineInvitation(session, email), email);
  });

  afterEach(async () => {
    const owned = session;
    session = undefined;
    setEmailTransport(null);
    await owned?.fixture.close();
  });

  it.each(ACKNOWLEDGEMENTS)(
    'should finalize $delivery after the outer commit when acknowledgement is $name', async (outcome) => {
      const owned = currentSession();
      const email = `acknowledgement-${randomUUID()}@test.example`;
      const mutationIds = new Set((await readInvitationAudits()).map((row) => row.id));
      let attempts = 0;
      let recipientMatches = false;
      setEmailTransport({
        async send(options) {
          attempts += 1;
          recipientMatches = options.to === email;
          return {
            messageId: randomUUID(),
            accepted: outcome.accepted ? [email] : [], rejected: outcome.rejected ? [email] : [],
          };
        },
      });
      try {
        const response = await postMachineInvitation(owned, email);
        const invitation = await expectMachineInvitationCreated(owned, response, email, outcome.delivery);
        expect(attempts).toBe(1);
        expect(recipientMatches).toBe(true);
        expectMachineInvitationAudits(owned, (await readInvitationAudits()).filter((row) => !mutationIds.has(row.id)));
        expect(await invitationSendAuditCount(invitation.id)).toBe(outcome.delivery === 'sent' ? 1 : 0);
      } finally {
        setEmailTransport(null);
      }
    },
  );

  it('should retain the invitation and report failed when the transport Promise rejects', async () => {
    const owned = currentSession();
    const email = `transport-rejected-${randomUUID()}@test.example`;
    const marker = `delivery-private-${randomUUID()}`;
    const mutationIds = new Set((await readInvitationAudits()).map((row) => row.id));
    let attempts = 0;
    setEmailTransport({
      async send() {
        attempts += 1;
        throw new Error(`smtp unavailable: ${marker}`);
      },
    });
    try {
      const response = await postMachineInvitation(owned, email);
      const invitation = await expectMachineInvitationCreated(owned, response, email, 'failed');
      expect(attempts).toBe(1);
      expectMachineInvitationAudits(owned, (await readInvitationAudits()).filter((row) => !mutationIds.has(row.id)));
      expect(response.text.includes(marker)).toBe(false);
      expect(await invitationSendAuditCount(invitation.id)).toBe(0);
      const audits = await getPool().query<{ metadata: unknown }>('SELECT metadata FROM audit_log');
      for (const row of audits.rows) expect((JSON.stringify(row.metadata) ?? '').includes(marker)).toBe(false);
    } finally {
      setEmailTransport(null);
    }
  });

  it.each(['unrelated accepted recipient', 'rejected transport Promise'] as const)(
    'should preserve ordinary human delivery reporting with %s', async (outcome) => {
      const owned = currentSession();
      const email = `human-delivery-${randomUUID()}@test.example`;
      const humanToken = owned.fixture.humanToken(owned.fixture.lifecycle.actor);
      let attempts = 0;
      let recipientMatches = false;
      setEmailTransport({
        async send(options) {
          attempts += 1;
          recipientMatches = options.to === email;
          if (outcome === 'rejected transport Promise') throw new Error('smtp unavailable');
          return { messageId: randomUUID(), accepted: ['unrelated@test.example'], rejected: [] };
        },
      });
      try {
        const response = await machineRequest(owned.fixture, {
          method: 'POST',
          path: `/api/admin/organizations/${owned.fixture.lifecycle.organization.id}/users/invite`,
          token: humanToken, body: { email },
        });
        await expectMachineInvitationCreated(
          owned, response, email, outcome === 'rejected transport Promise' ? 'failed' : 'sent',
        );
        expect(attempts).toBe(1);
        expect(recipientMatches).toBe(true);
      } finally {
        setEmailTransport(null);
      }
    },
  );

  it.each(['body', 'header'] as const)(
    'should not let a human %s flag enable the internal machine acknowledgement mode', async (location) => {
      const owned = currentSession();
      const humanToken = owned.fixture.humanToken(owned.fixture.lifecycle.actor);
      const control = `human-flag-control-${randomUUID()}@test.example`;
      const path = `/api/admin/organizations/${owned.fixture.lifecycle.organization.id}/users/invite`;
      await expectMachineInvitationCreated(owned, await machineRequest(owned.fixture, {
        method: 'POST', path, token: humanToken, body: { email: control },
      }), control);
      const email = `human-flag-${randomUUID()}@test.example`;
      let attempts = 0;
      setEmailTransport({
        async send() {
          attempts += 1;
          return { messageId: randomUUID(), accepted: ['unrelated@test.example'], rejected: [] };
        },
      });
      try {
        const response = await machineRequest(owned.fixture, {
          method: 'POST', path, token: humanToken,
          body: { email, ...(location === 'body' ? { reportRecipientAcknowledgement: true } : {}) },
          headers: location === 'header' ? { 'Report-Recipient-Acknowledgement': 'true' } : {},
        });
        // Unknown body fields may be rejected or stripped, but cannot enable internal reporting.
        if (location === 'body' && response.status === 400) {
          expectSafeMachineFailure(owned, response, 400);
          await expectMachineInvitationAbsent(owned, email);
          expect(attempts).toBe(0);
        } else {
          await expectMachineInvitationCreated(owned, response, email, 'sent');
          expect(attempts).toBe(1);
        }
      } finally {
        setEmailTransport(null);
      }
    },
  );
});
