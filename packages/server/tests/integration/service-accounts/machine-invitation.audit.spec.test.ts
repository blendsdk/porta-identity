import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isRecord, machineRequest } from './machine-http-fixtures.js';
import {
  createInvitationSession,
  expectMachineInvitationAbsent,
  expectMachineInvitationAudits,
  expectMachineInvitationCreated,
  expectSafeMachineFailure,
  postMachineInvitation,
  readInvitationAudits,
  withRejectedFinalInvitationAudit,
} from './machine-invitation-fixtures.js';
import type { MachineInvitationSession } from './machine-invitation-fixtures.js';

describe.sequential('machine invitation outer transaction audit', () => {
  let session: MachineInvitationSession | undefined;

  /** Never substitute claimed machine identity when fixture setup is incomplete. */
  function currentSession(): MachineInvitationSession {
    if (!session) throw new Error('Machine invitation session is not ready');
    return session;
  }

  beforeEach(async () => {
    session = await createInvitationSession();
    const email = `audit-control-${randomUUID()}@test.example`;
    await expectMachineInvitationCreated(session, await postMachineInvitation(session, email), email);
  });

  afterEach(async () => {
    const owned = session;
    session = undefined;
    await owned?.fixture.close();
  });

  it('should attribute both committed mutation events to the real client and original binding', async () => {
    const owned = currentSession();
    const previous = new Set((await readInvitationAudits()).map((row) => row.id));
    const email = `machine-audit-${randomUUID()}@test.example`;
    const response = await machineRequest(owned.fixture, {
      method: 'POST',
      path: `/api/admin/organizations/${owned.fixture.lifecycle.organization.id}/users/invite`,
      token: owned.token, body: { email },
      headers: {
        'X-Service-Account-Id': randomUUID(), 'X-Binding-Id': randomUUID(),
        'X-Authorization-Version': randomUUID(),
      },
    });
    await expectMachineInvitationCreated(owned, response, email);
    expectMachineInvitationAudits(owned, (await readInvitationAudits()).filter((row) => !previous.has(row.id)));
  });

  it('should preserve human attribution and the existing generic route template', async () => {
    const owned = currentSession();
    const previous = new Set((await readInvitationAudits()).map((row) => row.id));
    const humanToken = owned.fixture.humanToken(owned.fixture.lifecycle.actor);
    const humanEmail = `human-audit-${randomUUID()}@test.example`;
    const response = await machineRequest(owned.fixture, {
      method: 'POST',
      path: `/api/admin/organizations/${owned.fixture.lifecycle.organization.id}/users/invite`,
      token: humanToken, body: { email: humanEmail },
    });
    await expectMachineInvitationCreated(owned, response, humanEmail);
    const humanRows = (await readInvitationAudits()).filter((row) => !previous.has(row.id));
    expect(humanRows.map((row) => row.eventType).sort()).toEqual([
      'admin.mutation.committed', 'user.invited',
    ]);
    for (const row of humanRows) {
      expect(row.actorType).toBe('user');
      expect(row.actorId).toBe(owned.fixture.lifecycle.actor.id);
      expect(row.actorClientId).toBeNull();
      expect(row.actorClientName).toBeNull();
      expect((JSON.stringify(row.metadata) ?? '').includes(humanToken)).toBe(false);
    }
    const humanGeneric = humanRows.find((row) => row.eventType === 'admin.mutation.committed');
    if (!humanGeneric || !isRecord(humanGeneric.metadata)) throw new Error('Human mutation audit is missing');
    expect(humanGeneric.metadata.method).toBe('POST');
    const routeTemplate = humanGeneric.metadata.routeTemplate;
    expect(typeof routeTemplate === 'string' && routeTemplate.length > 0).toBe(true);
    const afterHuman = new Set((await readInvitationAudits()).map((row) => row.id));
    const email = `route-template-${randomUUID()}@test.example`;
    await expectMachineInvitationCreated(owned, await postMachineInvitation(owned, email), email);
    const machineRows = (await readInvitationAudits()).filter((row) => !afterHuman.has(row.id));
    expectMachineInvitationAudits(owned, machineRows);
    const machineGeneric = machineRows.find((row) => row.eventType === 'admin.mutation.committed');
    if (!machineGeneric || !isRecord(machineGeneric.metadata)) throw new Error('Machine mutation audit is missing');
    expect(machineGeneric.metadata.routeTemplate).toBe(routeTemplate);
  });

  it('should roll back invitation and both audits without email when the final generic audit fails', async () => {
    const owned = currentSession();
    const previous = new Set((await readInvitationAudits()).map((row) => row.id));
    const sent = owned.fixture.mail.attempts;
    const email = `final-audit-failure-${randomUUID()}@test.example`;
    await withRejectedFinalInvitationAudit(async () => {
      expectSafeMachineFailure(owned, await postMachineInvitation(owned, email), 503);
    });
    await expectMachineInvitationAbsent(owned, email);
    expect((await readInvitationAudits()).filter((row) => !previous.has(row.id)).length).toBe(0);
    expect(owned.fixture.mail.attempts).toBe(sent);
  });
});
