import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateAndStore } from '../../../src/clients/secret-service.js';
import { getPool } from '../../../src/lib/database.js';
import { revokeServiceAccount, setServiceAccount } from '../../../src/service-accounts/index.js';
import { createTestPermission } from '../helpers/factories.js';
import { machineRequest } from './machine-http-fixtures.js';
import {
  createInvitationSession,
  expectMachineInvitationAbsent,
  expectMachineInvitationCreated,
  expectSafeMachineFailure,
  issueInvitationToken,
  postMachineInvitation,
  readInvitationAudits,
} from './machine-invitation-fixtures.js';
import type { MachineInvitationSession } from './machine-invitation-fixtures.js';

describe.sequential('machine invitation live authority and definitions', () => {
  let session: MachineInvitationSession | undefined;

  /** Every negative case begins with the real authority that passed its successful control. */
  function currentSession(): MachineInvitationSession {
    if (!session) throw new Error('Machine invitation session is not ready');
    return session;
  }

  /** Keep the same application-qualified identities while their external definitions change. */
  function assignmentInput(owned: MachineInvitationSession) {
    const { lifecycle } = owned.fixture;
    return {
      roles: [{ applicationId: lifecycle.application.id, roleId: lifecycle.role.id }],
      claims: [{
        applicationId: lifecycle.application.id, claimDefinitionId: lifecycle.claim.id, value: 'live-value',
      }],
    };
  }

  /** Use the full HTTP operation for live-reference admission and rejection alike. */
  async function assignedRequest(owned: MachineInvitationSession, email: string) {
    return machineRequest(owned.fixture, {
      method: 'POST',
      path: `/api/admin/organizations/${owned.fixture.lifecycle.organization.id}/users/invite`,
      token: owned.token, body: { email, ...assignmentInput(owned) },
    });
  }

  /** Persist the exact live role and claim identities, without inventing a permissions snapshot. */
  async function expectAssignedInvitation(owned: MachineInvitationSession, email: string): Promise<void> {
    const invitation = await expectMachineInvitationCreated(owned, await assignedRequest(owned, email), email);
    const assignments = assignmentInput(owned);
    expect(invitation.details.roles).toEqual(assignments.roles);
    expect(invitation.details.claims).toEqual(assignments.claims);
  }

  beforeEach(async () => {
    session = await createInvitationSession();
    const email = `live-control-${randomUUID()}@test.example`;
    await expectMachineInvitationCreated(session, await postMachineInvitation(session, email), email);
  });

  afterEach(async () => {
    const owned = session;
    session = undefined;
    await owned?.fixture.close();
  });

  it.each(['inactive account', 'missing reserved membership', 'inactive client'] as const)(
    'should stop a formerly usable token when live authority changes to %s', async (state) => {
      const owned = currentSession();
      const email = `live-denied-${randomUUID()}@test.example`;
      if (state === 'inactive account') {
        await getPool().query('UPDATE users SET status = $1 WHERE id = $2', [
          'inactive', owned.binding.serviceAccountId,
        ]);
      } else if (state === 'missing reserved membership') {
        await getPool().query('DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2', [
          owned.binding.serviceAccountId, owned.fixture.lifecycle.serviceRole.id,
        ]);
      } else {
        await getPool().query('UPDATE clients SET status = $1 WHERE id = $2', [
          'inactive', owned.fixture.lifecycle.client.id,
        ]);
      }
      const sent = owned.fixture.mail.attempts;
      const response = await postMachineInvitation(owned, email);
      expect([401, 403].includes(response.status)).toBe(true);
      expectSafeMachineFailure(owned, response, response.status);
      await expectMachineInvitationAbsent(owned, email);
      expect(owned.fixture.mail.attempts).toBe(sent);
    },
  );

  it('should require the live invitation permission separately from the native OAuth scope', async () => {
    const owned = currentSession();
    const { lifecycle } = owned.fixture;
    const email = `permission-lost-${randomUUID()}@test.example`;
    const previous = new Set((await readInvitationAudits()).map((row) => row.id));
    const sent = owned.fixture.mail.attempts;
    await getPool().query('DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2', [
      lifecycle.serviceRole.id, lifecycle.invitePermission.id,
    ]);
    expect(Boolean(await owned.fixture.provider.ClientCredentials.find(owned.token))).toBe(true);
    expectSafeMachineFailure(owned, await postMachineInvitation(owned, email), 403);
    await expectMachineInvitationAbsent(owned, email);
    expect(owned.fixture.mail.attempts).toBe(sent);
    expect((await readInvitationAudits()).filter((row) => !previous.has(row.id)).length).toBe(0);
  });

  it.each(['add', 'remove'] as const)(
    'should retain invitation authority when ordinary role permissions change by %s', async (change) => {
      const owned = currentSession();
      const { lifecycle } = owned.fixture;
      const permission = await createTestPermission(lifecycle.application.id);
      if (change === 'remove') {
        await getPool().query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)', [
          lifecycle.role.id, permission.id,
        ]);
        owned.token = await issueInvitationToken(owned.fixture);
      }
      await expectAssignedInvitation(owned, `definition-before-${randomUUID()}@test.example`);
      if (change === 'add') {
        await getPool().query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)', [
          lifecycle.role.id, permission.id,
        ]);
      } else {
        await getPool().query('DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2', [
          lifecycle.role.id, permission.id,
        ]);
      }
      const current = await getPool().query<{ permissionId: string }>(
        'SELECT permission_id AS "permissionId" FROM role_permissions WHERE role_id = $1 AND permission_id = $2',
        [lifecycle.role.id, permission.id],
      );
      expect(current.rows.map((row) => row.permissionId)).toEqual(change === 'add' ? [permission.id] : []);
      await expectAssignedInvitation(owned, `definition-after-${randomUUID()}@test.example`);
    },
  );

  it.each([
    ['role', 'deleted'], ['role', 'moved'], ['claim', 'deleted'], ['claim', 'moved'],
  ] as const)('should deny the whole invitation when an allowed %s definition is %s', async (kind, change) => {
    const owned = currentSession();
    const { lifecycle } = owned.fixture;
    await expectAssignedInvitation(owned, `reference-control-${randomUUID()}@test.example`);
    const previous = new Set((await readInvitationAudits()).map((row) => row.id));
    const sent = owned.fixture.mail.attempts;
    if (kind === 'role') {
      if (change === 'deleted') {
        await getPool().query('DELETE FROM roles WHERE id = $1', [lifecycle.role.id]);
      } else {
        expect(lifecycle.role.slug === lifecycle.otherRole.slug).toBe(false);
        await getPool().query('UPDATE roles SET application_id = $1 WHERE id = $2', [
          lifecycle.otherApplication.id, lifecycle.role.id,
        ]);
      }
    } else if (change === 'deleted') {
      await getPool().query('DELETE FROM custom_claim_definitions WHERE id = $1', [lifecycle.claim.id]);
    } else {
      expect(lifecycle.claim.claimName === lifecycle.otherClaim.claimName).toBe(false);
      await getPool().query('UPDATE custom_claim_definitions SET application_id = $1 WHERE id = $2', [
        lifecycle.otherApplication.id, lifecycle.claim.id,
      ]);
    }
    const email = `stale-reference-${randomUUID()}@test.example`;
    const response = await assignedRequest(owned, email);
    expect([400, 403].includes(response.status)).toBe(true);
    expectSafeMachineFailure(owned, response, response.status);
    await expectMachineInvitationAbsent(owned, email);
    expect(owned.fixture.mail.attempts).toBe(sent);
    expect((await readInvitationAudits()).filter((row) => !previous.has(row.id)).length).toBe(0);
  });

  it('should reject the old version after production policy replacement and admit a freshly issued token', async () => {
    const owned = currentSession();
    await setServiceAccount(owned.fixture.lifecycle.client.id, {
      targets: [owned.fixture.lifecycle.target, owned.fixture.lifecycle.otherTarget],
    }, owned.fixture.lifecycle.actor);
    const email = `replaced-version-${randomUUID()}@test.example`;
    expectSafeMachineFailure(owned, await postMachineInvitation(owned, email), 403);
    await expectMachineInvitationAbsent(owned, email);
    owned.token = await issueInvitationToken(owned.fixture);
    const fresh = `replacement-fresh-${randomUUID()}@test.example`;
    await expectMachineInvitationCreated(owned, await postMachineInvitation(owned, fresh), fresh);
  });

  it('should not restore an old token when the same account is explicitly restored', async () => {
    const owned = currentSession();
    const { fixture } = owned;
    await revokeServiceAccount(fixture.lifecycle.client.id, fixture.lifecycle.actor);
    const revoked = `revoked-version-${randomUUID()}@test.example`;
    expectSafeMachineFailure(owned, await postMachineInvitation(owned, revoked), 403);
    await expectMachineInvitationAbsent(owned, revoked);
    const restored = await setServiceAccount(fixture.lifecycle.client.id, {
      targets: [fixture.lifecycle.target, fixture.lifecycle.otherTarget],
    }, fixture.lifecycle.actor);
    expect(restored.serviceAccountId).toBe(owned.binding.serviceAccountId);
    const restoredOld = `restored-old-${randomUUID()}@test.example`;
    expectSafeMachineFailure(owned, await postMachineInvitation(owned, restoredOld), 403);
    await expectMachineInvitationAbsent(owned, restoredOld);
    const credential = await generateAndStore(fixture.lifecycle.client.id, {}, fixture.lifecycle.actor.id);
    fixture.credential = { id: credential.id, plaintext: credential.plaintext };
    owned.token = await issueInvitationToken(fixture, credential.plaintext);
    const fresh = `restored-fresh-${randomUUID()}@test.example`;
    await expectMachineInvitationCreated(owned, await postMachineInvitation(owned, fresh), fresh);
  });
});
