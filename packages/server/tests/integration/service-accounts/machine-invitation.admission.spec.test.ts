import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import { setServiceAccount } from '../../../src/service-accounts/index.js';
import type { ServiceAccountPolicyTarget } from '../../../src/service-accounts/index.js';
import { createTestClaimDefinition, createTestRole } from '../helpers/factories.js';
import {
  createMachineHttpFixture,
  issueMachineToken,
  machineRequest,
  readMachineInvitation,
  readMachineUserCount,
} from './machine-http-fixtures.js';
import type { MachineInvitation } from './machine-http-fixtures.js';
import { expectMachineInvitationCreated, readInvitationAudits } from './machine-invitation-fixtures.js';

/** Real application and native-token fixture owned by one test. */
type MachineFixture = Awaited<ReturnType<typeof createMachineHttpFixture>>;

describe.sequential('machine invitation admission', () => {
  let fixture: MachineFixture | undefined;
  let token = '';

  /** Refuse requests when fixture setup did not complete. */
  function currentFixture(): MachineFixture {
    if (!fixture) throw new Error('Machine invitation fixture is not ready');
    return fixture;
  }

  /** Replace policy through the real service before obtaining its native token. */
  async function authorize(targets: ServiceAccountPolicyTarget[]): Promise<string> {
    const f = currentFixture();
    await setServiceAccount(f.lifecycle.client.id, { targets }, f.lifecycle.actor);
    const issued = await issueMachineToken(f);
    expect(issued.status).toBe(200);
    const accessToken = issued.body.access_token;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new Error('Native issuance did not return an access token');
    }
    return accessToken;
  }

  /** Submit only to the actual invitation operation through the full application. */
  async function invite(organizationId: string, email: string, input: Record<string, unknown> = {}) {
    return machineRequest(currentFixture(), {
      method: 'POST', path: `/api/admin/organizations/${organizationId}/users/invite`,
      token, body: { email, ...input },
    });
  }

  /** Check the public creation result and independently observe durable invitation state. */
  async function expectCreated(
    organizationId: string, email: string, input: Record<string, unknown> = {},
  ): Promise<MachineInvitation> {
    const response = await invite(organizationId, email, input);
    return expectMachineInvitationCreated({ fixture: currentFixture() }, response, email, 'sent', organizationId);
  }

  /** An unauthorized assignment must never become a partial invitation or a user. */
  async function expectDenied(
    organizationId: string, email: string, input: Record<string, unknown>,
    statuses: readonly number[] = [403],
  ): Promise<void> {
    const f = currentFixture();
    const previous = new Set((await readInvitationAudits()).map((row) => row.id));
    const sent = f.mail.attempts;
    const response = await invite(organizationId, email, input);
    expect(statuses.includes(response.status)).toBe(true);
    expect(response.text.includes(token)).toBe(false);
    expect(response.text.includes(f.credential.plaintext)).toBe(false);
    expect((await readMachineInvitation(organizationId, email)) === null).toBe(true);
    expect(await readMachineUserCount(organizationId, email)).toBe(0);
    expect(f.mail.attempts).toBe(sent);
    expect((await readInvitationAudits()).filter((row) => !previous.has(row.id)).length).toBe(0);
  }

  /** Use explicit application-qualified identities rather than role or claim names. */
  function allowedAssignments(f: MachineFixture) {
    return {
      roles: [{ applicationId: f.lifecycle.application.id, roleId: f.lifecycle.role.id }],
      claims: [{
        applicationId: f.lifecycle.application.id,
        claimDefinitionId: f.lifecycle.claim.id, value: 'ordinary-claim-value',
      }],
    };
  }

  /** Exercise dispatch defence without asking the policy service to accept forbidden references. */
  async function storeHostileTargets(targets: ServiceAccountPolicyTarget[]): Promise<void> {
    await getPool().query(
      'UPDATE client_service_accounts SET targets = $1::jsonb WHERE client_id = $2',
      [JSON.stringify(targets), currentFixture().lifecycle.client.id],
    );
  }

  beforeEach(async () => {
    fixture = await createMachineHttpFixture();
    token = await authorize([fixture.lifecycle.target]);
    await expectCreated(fixture.lifecycle.organization.id, `control-${randomUUID()}@test.example`);
  });

  afterEach(async () => {
    const ownedFixture = fixture;
    fixture = undefined;
    token = '';
    await ownedFixture?.close();
  });

  it('should create an ordinary invitation when both assignment allowlists are empty', async () => {
    const f = currentFixture();
    token = await authorize([{
      organizationId: f.lifecycle.organization.id, allowedRoles: [], allowedClaimDefinitions: [],
    }]);
    await expectCreated(f.lifecycle.organization.id, `ordinary-${randomUUID()}@test.example`);
  });

  it('should preserve allowed application-qualified roles and claims together', async () => {
    const f = currentFixture();
    const assignments = allowedAssignments(f);
    const invitation = await expectCreated(
      f.lifecycle.organization.id, `assigned-${randomUUID()}@test.example`, assignments,
    );
    expect(invitation.details.roles).toEqual(assignments.roles);
    expect(invitation.details.claims).toEqual(assignments.claims);
  });

  it('should deny an organization outside the explicit target list', async () => {
    const f = currentFixture();
    await expectDenied(f.lifecycle.otherOrganization.id, `outside-${randomUUID()}@test.example`, {});
  });

  it.each([
    ['role', 'first'], ['role', 'last'], ['claim', 'first'], ['claim', 'last'],
  ] as const)('should deny the whole invitation with one unlisted %s placed %s', async (kind, position) => {
    const f = currentFixture();
    const assignments = allowedAssignments(f);
    if (kind === 'role') {
      const extra = { applicationId: f.lifecycle.otherApplication.id, roleId: f.lifecycle.otherRole.id };
      assignments.roles = position === 'first'
        ? [extra, ...assignments.roles] : [...assignments.roles, extra];
    } else {
      const extra = {
        applicationId: f.lifecycle.otherApplication.id,
        claimDefinitionId: f.lifecycle.otherClaim.id, value: 'unlisted-value',
      };
      assignments.claims = position === 'first'
        ? [extra, ...assignments.claims] : [...assignments.claims, extra];
    }
    await expectDenied(f.lifecycle.organization.id, `mixed-${randomUUID()}@test.example`, assignments);
  });

  it.each(['role', 'claim'] as const)(
    'should deny an allowed %s identity qualified by the wrong application', async (kind) => {
      const f = currentFixture();
      const assignments = allowedAssignments(f);
      if (kind === 'role') assignments.roles[0] = {
        applicationId: f.lifecycle.otherApplication.id, roleId: f.lifecycle.role.id,
      };
      else assignments.claims[0] = {
        applicationId: f.lifecycle.otherApplication.id,
        claimDefinitionId: f.lifecycle.claim.id, value: 'ordinary-claim-value',
      };
      await expectDenied(f.lifecycle.organization.id, `wrong-app-${randomUUID()}@test.example`, assignments);
    },
  );

  it.each(['role', 'claim'] as const)(
    'should deny a %s assignment with empty allowlists while ordinary invitations remain usable',
    async (kind) => {
      const f = currentFixture();
      token = await authorize([{
        organizationId: f.lifecycle.organization.id, allowedRoles: [], allowedClaimDefinitions: [],
      }]);
      await expectCreated(f.lifecycle.organization.id, `empty-control-${randomUUID()}@test.example`);
      const assignments = allowedAssignments(f);
      const input = kind === 'role' ? { roles: assignments.roles } : { claims: assignments.claims };
      await expectDenied(f.lifecycle.organization.id, `empty-${randomUUID()}@test.example`, input);
    },
  );

  it.each(['role', 'claim'] as const)(
    'should not borrow an allowed %s assignment from another permitted target', async (kind) => {
      const f = currentFixture();
      token = await authorize([f.lifecycle.target, f.lifecycle.otherTarget]);
      await expectCreated(f.lifecycle.otherOrganization.id, `other-control-${randomUUID()}@test.example`);
      const input = kind === 'role'
        ? { roles: [{ applicationId: f.lifecycle.otherApplication.id, roleId: f.lifecycle.otherRole.id }] }
        : { claims: [{
          applicationId: f.lifecycle.otherApplication.id,
          claimDefinitionId: f.lifecycle.otherClaim.id, value: 'other-target-value',
        }] };
      await expectDenied(f.lifecycle.organization.id, `cross-target-${randomUUID()}@test.example`, input);
    },
  );

  it('should not accept request-supplied policy or machine-control flags as authority', async () => {
    const f = currentFixture();
    await expectDenied(f.lifecycle.otherOrganization.id, `flags-${randomUUID()}@test.example`, {
      targets: [f.lifecycle.otherTarget], isServiceAccount: true,
      reportRecipientAcknowledgement: true, permissions: ['admin:user:invite'],
    }, [400, 403]);
  });

  it.each([
    'control-plane target', 'canonical role', 'canonical claim', 'ordinary role in the canonical application',
  ] as const)(
    'should deny a forbidden %s even when stored policy lists it', async (kind) => {
      const f = currentFixture();
      const target = {
        ...f.lifecycle.target,
        allowedRoles: [...f.lifecycle.target.allowedRoles],
        allowedClaimDefinitions: [...f.lifecycle.target.allowedClaimDefinitions],
      };
      let organizationId = f.lifecycle.organization.id;
      let input: Record<string, unknown> = {};
      const targets = [target];
      if (kind === 'control-plane target') {
        organizationId = f.lifecycle.adminOrganization.id;
        targets.push({ organizationId, allowedRoles: [], allowedClaimDefinitions: [] });
      } else if (kind === 'canonical role' || kind === 'ordinary role in the canonical application') {
        const roleId = kind === 'canonical role'
          ? f.lifecycle.superRole.id : (await createTestRole(f.lifecycle.adminApplication.id)).id;
        const role = { applicationId: f.lifecycle.adminApplication.id, roleId };
        target.allowedRoles.push(role);
        input = { roles: [role] };
      } else {
        const claim = await createTestClaimDefinition(f.lifecycle.adminApplication.id);
        const pair = { applicationId: f.lifecycle.adminApplication.id, claimDefinitionId: claim.id };
        target.allowedClaimDefinitions.push(pair);
        input = { claims: [{ ...pair, value: 'forbidden-admin-value' }] };
      }
      await storeHostileTargets(targets);
      await expectDenied(organizationId, `forbidden-${randomUUID()}@test.example`, input);
    },
  );
});
