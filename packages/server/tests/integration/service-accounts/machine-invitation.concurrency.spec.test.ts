import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setEmailTransport } from '../../../src/auth/index.js';
import { getPool } from '../../../src/lib/database.js';
import { revokeServiceAccount } from '../../../src/service-accounts/index.js';
import {
  holdLifecycleWork, waitForLifecycleParentBlock,
} from './lifecycle-concurrency-fixtures.js';
import { readMachineInvitation } from './machine-http-fixtures.js';
import type { MachineHttpResponse } from './machine-http-fixtures.js';
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

/** Bound a failed interleaving without using elapsed time as evidence of successful ordering. */
async function withinFailureDeadline<T>(work: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 10_000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

describe.sequential('machine invitation commit and revocation ordering', () => {
  let session: MachineInvitationSession | undefined;

  /** Require the native machine identity whose successful control was already observed. */
  function currentSession(): MachineInvitationSession {
    if (!session) throw new Error('Machine invitation session is not ready');
    return session;
  }

  beforeEach(async () => {
    session = await createInvitationSession();
    const email = `ordering-control-${randomUUID()}@test.example`;
    await expectMachineInvitationCreated(session, await postMachineInvitation(session, email), email);
  });

  afterEach(async () => {
    const owned = session;
    session = undefined;
    setEmailTransport(null);
    await owned?.fixture.close();
  });

  it('should deny without delivery when revocation commits before the observed invitation client lock', async () => {
    const owned = currentSession();
    const email = `revocation-first-${randomUUID()}@test.example`;
    const sent = owned.fixture.mail.attempts;
    const held = holdLifecycleWork(() => revokeServiceAccount(
      owned.fixture.lifecycle.client.id, owned.fixture.lifecycle.actor,
    ));
    let request: Promise<MachineHttpResponse> | undefined;
    try {
      const { pid } = await held.ready;
      request = postMachineInvitation(owned, email);
      await waitForLifecycleParentBlock(pid);
      held.release();
      await held.result;
      expectSafeMachineFailure(owned, await request, 403);
      await expectMachineInvitationAbsent(owned, email);
      expect(owned.fixture.mail.attempts).toBe(sent);
    } finally {
      held.release();
      await Promise.allSettled(request ? [held.result, request] : [held.result]);
    }
  });

  it('should commit both audits before SMTP and allow revocation to complete while SMTP stays held', async () => {
    const owned = currentSession();
    const email = `invitation-first-${randomUUID()}@test.example`;
    const previous = new Set((await readInvitationAudits()).map((row) => row.id));
    let enterEmail = () => {};
    let releaseEmail = () => {};
    const entered = new Promise<void>((resolve) => { enterEmail = resolve; });
    const released = new Promise<void>((resolve) => { releaseEmail = resolve; });
    /** Teardown also settles the exact external delivery Promise if HTTP fails early. */
    const delivery = released.then(() => ({
      messageId: randomUUID(), accepted: [email], rejected: [],
    }));
    let attempts = 0;
    let recipientMatches = false;
    setEmailTransport({
      send(options) {
        attempts += 1;
        recipientMatches = options.to === email;
        enterEmail();
        return delivery;
      },
    });
    let responseSettled = false;
    const request = postMachineInvitation(owned, email).finally(() => { responseSettled = true; });
    let revocation: Promise<void> | undefined;
    try {
      await withinFailureDeadline(Promise.race([
        entered,
        request.then(() => { throw new Error('Invitation responded before reaching the email boundary'); }),
      ]), 'Invitation did not reach the external email boundary');
      expect(recipientMatches).toBe(true);
      const invitation = await readMachineInvitation(owned.fixture.lifecycle.organization.id, email);
      expect(invitation !== null).toBe(true);
      // An independent connection cannot see uncommitted rows from the still-running HTTP request.
      const observer = await getPool().connect();
      try {
        const visible = await observer.query<{ id: string; eventType: string }>(`
          SELECT id, event_type AS "eventType" FROM audit_log WHERE event_type = ANY($1::text[])
        `, [['user.invited', 'admin.mutation.committed']]);
        expect(visible.rows.filter((row) => !previous.has(row.id)).map((row) => row.eventType).sort()).toEqual([
          'admin.mutation.committed', 'user.invited',
        ]);
      } finally {
        observer.release();
      }
      expectMachineInvitationAudits(owned, (await readInvitationAudits()).filter((row) => !previous.has(row.id)));
      revocation = revokeServiceAccount(owned.fixture.lifecycle.client.id, owned.fixture.lifecycle.actor);
      await withinFailureDeadline(revocation, 'Revocation was blocked by the held email transport');
      const state = await getPool().query<{ status: string; authorizationVersion: string }>(`
        SELECT status, authorization_version AS "authorizationVersion"
        FROM client_service_accounts WHERE client_id = $1
      `, [owned.fixture.lifecycle.client.id]);
      expect(state.rows[0]?.status).toBe('revoked');
      expect(state.rows[0]?.authorizationVersion === owned.authorizationVersion).toBe(false);
      expect(responseSettled).toBe(false);
      releaseEmail();
      await expectMachineInvitationCreated(owned, await request, email, 'sent');
      expect(attempts).toBe(1);
      expectMachineInvitationAudits(owned, (await readInvitationAudits()).filter((row) => !previous.has(row.id)));
    } finally {
      releaseEmail();
      await Promise.allSettled(revocation ? [request, revocation, delivery] : [request, delivery]);
      setEmailTransport(null);
    }
  });
});
