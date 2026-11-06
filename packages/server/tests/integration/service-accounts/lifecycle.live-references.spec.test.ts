import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getPool } from '../../../src/lib/database.js';
import {
  findServiceAccountByClientId,
  setServiceAccount,
} from '../../../src/service-accounts/index.js';
import { generateAndStore } from '../../../src/clients/secret-service.js';
import {
  createTestClaimDefinition,
  createTestOrganization,
} from '../helpers/factories.js';
import {
  createLifecycleFixture,
  lifecycleSecurityFingerprint,
} from './lifecycle-fixtures.js';
import type { LifecycleFixture } from './lifecycle-fixtures.js';

/** Invalid final references follow a valid target and valid assignments in the same replacement. */
const INVALID_FINAL_REFERENCES = [
  {
    name: 'a missing organization',
    target: (f: LifecycleFixture) => ({ ...f.otherTarget, organizationId: randomUUID() }),
  },
  {
    name: 'a missing role application',
    target: (f: LifecycleFixture) => ({
      ...f.otherTarget,
      allowedRoles: [...f.otherTarget.allowedRoles, { applicationId: randomUUID(), roleId: f.role.id }],
    }),
  },
  {
    name: 'a missing role',
    target: (f: LifecycleFixture) => ({
      ...f.otherTarget,
      allowedRoles: [...f.otherTarget.allowedRoles, { applicationId: f.application.id, roleId: randomUUID() }],
    }),
  },
  {
    name: 'a role belonging to another application',
    target: (f: LifecycleFixture) => ({
      ...f.otherTarget,
      allowedRoles: [...f.otherTarget.allowedRoles, { applicationId: f.application.id, roleId: f.otherRole.id }],
    }),
  },
  {
    name: 'a missing claim application',
    target: (f: LifecycleFixture) => ({
      ...f.otherTarget,
      allowedClaimDefinitions: [
        ...f.otherTarget.allowedClaimDefinitions,
        { applicationId: randomUUID(), claimDefinitionId: f.claim.id },
      ],
    }),
  },
  {
    name: 'a missing claim definition',
    target: (f: LifecycleFixture) => ({
      ...f.otherTarget,
      allowedClaimDefinitions: [
        ...f.otherTarget.allowedClaimDefinitions,
        { applicationId: f.application.id, claimDefinitionId: randomUUID() },
      ],
    }),
  },
  {
    name: 'a claim belonging to another application',
    target: (f: LifecycleFixture) => ({
      ...f.otherTarget,
      allowedClaimDefinitions: [
        ...f.otherTarget.allowedClaimDefinitions,
        { applicationId: f.application.id, claimDefinitionId: f.otherClaim.id },
      ],
    }),
  },
  {
    name: 'the control-plane organization',
    target: (f: LifecycleFixture) => ({ ...f.otherTarget, organizationId: f.adminOrganization.id }),
  },
  {
    name: 'an explicitly allowed canonical Admin role',
    target: (f: LifecycleFixture) => ({
      ...f.otherTarget,
      allowedRoles: [
        ...f.otherTarget.allowedRoles,
        { applicationId: f.adminApplication.id, roleId: f.serviceRole.id },
      ],
    }),
  },
] as const;

// Every reference must be checked against live storage before any part of a policy is replaced.
describe('service-account lifecycle live references', () => {
  let fixture: LifecycleFixture;

  beforeEach(async () => {
    fixture = await createLifecycleFixture();
  });

  it.each(INVALID_FINAL_REFERENCES)(
    'should preserve all security rows when the replacement ends with $name',
    async ({ target }) => {
      await setServiceAccount(fixture.client.id, {
        accountEmail: fixture.accountEmail, targets: [fixture.target],
      }, fixture.actor);
      await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
      const stored = await findServiceAccountByClientId(fixture.client.id);
      const before = await lifecycleSecurityFingerprint();
      await expect(setServiceAccount(fixture.client.id, {
        targets: [fixture.target, target(fixture)],
      }, fixture.actor)).rejects.toThrow();
      expect(await lifecycleSecurityFingerprint()).toBe(before);
      expect(await findServiceAccountByClientId(fixture.client.id)).toEqual(stored);
    },
  );

  it('should reject a canonical Admin claim without writes when it is explicitly allowlisted last', async () => {
    const adminClaim = await createTestClaimDefinition(fixture.adminApplication.id);
    await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
    const before = await lifecycleSecurityFingerprint();
    await expect(setServiceAccount(fixture.client.id, {
      targets: [fixture.target, {
        ...fixture.otherTarget,
        allowedClaimDefinitions: [
          ...fixture.otherTarget.allowedClaimDefinitions,
          { applicationId: fixture.adminApplication.id, claimDefinitionId: adminClaim.id },
        ],
      }],
    }, fixture.actor)).rejects.toThrow();
    expect(await lifecycleSecurityFingerprint()).toBe(before);
  });

  it.each(['organization', 'role', 'claim'])(
    'should reject initial provisioning without writes when it explicitly allows the control-plane %s',
    async (reference) => {
      const adminClaim = await createTestClaimDefinition(fixture.adminApplication.id);
      const forbiddenTarget = {
        organizationId: reference === 'organization' ? fixture.adminOrganization.id : fixture.organization.id,
        allowedRoles: reference === 'role'
          ? [{ applicationId: fixture.adminApplication.id, roleId: fixture.superRole.id }]
          : [],
        allowedClaimDefinitions: reference === 'claim'
          ? [{ applicationId: fixture.adminApplication.id, claimDefinitionId: adminClaim.id }]
          : [],
      };
      const before = await lifecycleSecurityFingerprint();
      await expect(setServiceAccount(fixture.client.id, {
        accountEmail: fixture.accountEmail, targets: [forbiddenTarget],
      }, fixture.actor)).rejects.toThrow();
      expect(await lifecycleSecurityFingerprint()).toBe(before);
    },
  );

  it.each(['role', 'claim'])(
    'should reject the old application pair without writes when a live %s moves applications',
    async (definition) => {
      await setServiceAccount(fixture.client.id, {
        accountEmail: fixture.accountEmail, targets: [fixture.target],
      }, fixture.actor);
      if (definition === 'role') {
        await getPool().query('UPDATE roles SET application_id = $1 WHERE id = $2', [
          fixture.otherApplication.id, fixture.role.id,
        ]);
      } else {
        await getPool().query('UPDATE custom_claim_definitions SET application_id = $1 WHERE id = $2', [
          fixture.otherApplication.id, fixture.claim.id,
        ]);
      }
      const before = await lifecycleSecurityFingerprint();
      await expect(setServiceAccount(fixture.client.id, {
        targets: [fixture.otherTarget, fixture.target],
      }, fixture.actor)).rejects.toThrow();
      expect(await lifecycleSecurityFingerprint()).toBe(before);
    },
  );

  it('should accept empty assignment allowlists when the target organization exists', async () => {
    const targets = [{
      organizationId: fixture.organization.id, allowedRoles: [], allowedClaimDefinitions: [],
    }];
    const binding = await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets,
    }, fixture.actor);
    expect(binding.targets).toEqual(targets);
  });

  it('should accept exactly one hundred live targets and pairs without invented application memberships', async () => {
    const organizations = await Promise.all(
      Array.from({ length: 99 }, () => createTestOrganization()),
    );
    const targets = [fixture.target, ...organizations.map((organization) => ({
      ...fixture.target, organizationId: organization.id,
    }))];
    const binding = await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets,
    }, fixture.actor);
    expect(binding.targets).toEqual(targets);
    expect((await findServiceAccountByClientId(fixture.client.id))?.targets).toEqual(targets);
  });
});
