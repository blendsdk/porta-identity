import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  FixtureOrganizationId,
  OrdinaryTenantFixture,
} from '../../fixtures/fixture-assurance.js';
import { loadFixtureAssuranceSurface } from '../../fixtures/fixture-assurance.js';
import { intersection, tenantCredentialRefs, uniqueSorted } from './fixture-spec-helpers.js';

/** Returns every tenant-owned identifier whose ownership must not overlap another tenant. */
function tenantOwnedIds(tenant: OrdinaryTenantFixture): readonly string[] {
  return uniqueSorted([
    ...tenant.users.map((user) => user.id),
    ...tenant.clients.map((client) => client.id),
    ...tenant.sessions.map((session) => session.id),
    ...tenant.tokens.map((token) => token.id),
    ...tenant.resources.map((resource) => resource.id),
  ]);
}

/** Verifies references and minimum cardinalities required for one ordinary tenant slice. */
function assertOrdinaryTenant(tenant: OrdinaryTenantFixture): void {
  assert.ok(tenant.users.length >= 3);
  assert.ok(tenant.sessions.length >= 1);
  assert.ok(tenant.tokens.length >= 1);
  assert.ok(tenant.resources.length >= 1);
  assert.ok(
    tenant.clients.filter((client) => client.validity === 'valid' && client.kind === 'public')
      .length >= 1,
  );
  assert.ok(
    tenant.clients.filter((client) => client.validity === 'valid' && client.kind === 'confidential')
      .length >= 1,
  );
  assert.ok(tenant.clients.some((client) => client.validity === 'invalid'));

  const userIds = new Set(tenant.users.map((user) => user.id));
  const clientIds = new Set(tenant.clients.map((client) => client.id));
  for (const user of tenant.users) assert.equal(user.organizationId, tenant.id);
  for (const client of tenant.clients) assert.equal(client.organizationId, tenant.id);
  for (const session of tenant.sessions) {
    assert.equal(session.organizationId, tenant.id);
    assert.ok(userIds.has(session.userId));
  }
  for (const token of tenant.tokens) {
    assert.equal(token.organizationId, tenant.id);
    assert.ok(userIds.has(token.userId));
    assert.ok(clientIds.has(token.clientId));
  }
  for (const resource of tenant.resources) {
    assert.equal(resource.organizationId, tenant.id);
    assert.ok(userIds.has(resource.ownerUserId));
  }
}

// The fresh baseline contains exactly the alpha and bravo ordinary organizations plus the
// bootstrapped super-admin organization, with every entity explicitly owned or associated.
test('should expose the exact organization ontology and required tenant cardinalities', async () => {
  const { publicManifest } = await loadFixtureAssuranceSurface();

  assert.deepEqual(
    [publicManifest.alpha.id, publicManifest.bravo.id, publicManifest.superAdmin.id].sort(),
    ['alpha', 'bravo', 'super-admin'] satisfies FixtureOrganizationId[],
  );
  assertOrdinaryTenant(publicManifest.alpha);
  assertOrdinaryTenant(publicManifest.bravo);
});

// Active, locked, suspended, two-factor, recovery, and enumeration identities are explicit so a
// slice never has to infer account behavior from production implementation details.
test('should provide unambiguous ordinary-principal authentication states', async () => {
  const { publicManifest } = await loadFixtureAssuranceSurface();

  for (const tenant of [publicManifest.alpha, publicManifest.bravo]) {
    assert.deepEqual(uniqueSorted(tenant.users.map((user) => user.state)), [
      'active',
      'locked',
      'suspended',
    ]);
    assert.ok(tenant.users.some((user) => user.twoFactorEnabled));
    assert.ok(tenant.users.some((user) => user.recoveryEnabled));
    assert.ok(tenant.users.some((user) => user.enumerationSubject));
  }
});

// Each ordinary tenant has valid public and confidential clients plus explicit deliberately
// invalid clients with exact protocol fields and no accidental public secret.
test('should expose exact valid and deliberately invalid client contracts', async () => {
  const { publicManifest } = await loadFixtureAssuranceSurface();

  for (const tenant of [publicManifest.alpha, publicManifest.bravo]) {
    for (const client of tenant.clients) {
      assert.ok(client.redirectUris.length > 0);
      assert.ok(client.origins.length > 0);
      assert.ok(client.grantTypes.length > 0);
      assert.ok(client.scopes.length > 0);
      assert.ok(client.tenantScopes.length > 0);
      assert.ok(client.tenantScopes.every((scope) => client.scopes.includes(scope)));
      assert.equal(uniqueSorted(client.redirectUris).length, client.redirectUris.length);
      assert.equal(uniqueSorted(client.origins).length, client.origins.length);
      assert.equal(uniqueSorted(client.grantTypes).length, client.grantTypes.length);
      assert.equal(uniqueSorted(client.scopes).length, client.scopes.length);
      if (client.validity === 'invalid') assert.ok(client.invalidReason?.length);
      if (client.validity === 'valid' && client.kind === 'public') {
        assert.ok(client.scopes.includes('openid'));
        assert.equal(client.clientSecretCredentialRef, undefined);
      }
      if (client.validity === 'valid' && client.kind === 'confidential') {
        assert.ok(client.scopes.includes('openid'));
        assert.ok(client.clientSecretCredentialRef?.length);
      }
    }
  }
});

// Alpha and bravo fixture ownership, redirects, origins, tenant-specific scopes, and credentials
// are disjoint. Shared OIDC protocol scopes such as `openid` are vocabulary, not tenant data.
test('should keep every alpha and bravo tenant identity disjoint', async () => {
  const { publicManifest } = await loadFixtureAssuranceSurface();
  const alpha = publicManifest.alpha;
  const bravo = publicManifest.bravo;

  assert.deepEqual(intersection(tenantOwnedIds(alpha), tenantOwnedIds(bravo)), []);
  assert.deepEqual(
    intersection(
      alpha.clients.flatMap((client) => client.redirectUris),
      bravo.clients.flatMap((client) => client.redirectUris),
    ),
    [],
  );
  assert.deepEqual(
    intersection(
      alpha.clients.flatMap((client) => client.origins),
      bravo.clients.flatMap((client) => client.origins),
    ),
    [],
  );
  assert.deepEqual(
    intersection(
      alpha.clients.flatMap((client) => client.tenantScopes),
      bravo.clients.flatMap((client) => client.tenantScopes),
    ),
    [],
  );
  assert.ok(
    alpha.clients.every((client) =>
      client.tenantScopes.every((scope) => scope.startsWith('alpha:')),
    ),
  );
  assert.ok(
    bravo.clients.every((client) =>
      client.tenantScopes.every((scope) => scope.startsWith('bravo:')),
    ),
  );
  assert.deepEqual(intersection(tenantCredentialRefs(alpha), tenantCredentialRefs(bravo)), []);
});

// Global applications and roles remain global while applications explicitly reference the
// tenant-owned clients they exercise and roles explicitly reference their application and users.
test('should expose global applications and roles with explicit valid associations', async () => {
  const { publicManifest } = await loadFixtureAssuranceSurface();
  const clientIds = new Set([
    ...publicManifest.alpha.clients.map((client) => client.id),
    ...publicManifest.bravo.clients.map((client) => client.id),
  ]);
  const userIds = new Set([
    ...publicManifest.alpha.users.map((user) => user.id),
    ...publicManifest.bravo.users.map((user) => user.id),
    ...publicManifest.superAdmin.actors.map((actor) => actor.id),
  ]);
  const applicationIds = new Set(
    publicManifest.globalApplications.map((application) => application.id),
  );
  const roleIds = new Set(publicManifest.globalRoles.map((role) => role.id));

  assert.ok(publicManifest.globalApplications.length > 0);
  assert.ok(publicManifest.globalRoles.length > 0);
  for (const application of publicManifest.globalApplications) {
    assert.ok(application.clientIds.every((clientId) => clientIds.has(clientId)));
    assert.ok(application.roleIds.every((roleId) => roleIds.has(roleId)));
    assert.ok(application.clientIds.length + application.roleIds.length > 0);
    if (application.purpose === 'oidc') assert.ok(application.clientIds.length > 0);
    if (application.purpose === 'rbac') assert.ok(application.roleIds.length > 0);
    if (application.purpose === 'mixed') {
      assert.ok(application.clientIds.length > 0);
      assert.ok(application.roleIds.length > 0);
    }
  }
  for (const role of publicManifest.globalRoles) {
    assert.ok(applicationIds.has(role.applicationId));
    assert.ok(role.assignedUserIds.length > 0);
    assert.ok(role.assignedUserIds.every((userId) => userIds.has(userId)));
    if (role.permissionProfile === 'ordinary') assert.ok(role.permissions.length > 0);
  }
  assert.equal(
    uniqueSorted(publicManifest.globalApplications.map((application) => application.id)).length,
    publicManifest.globalApplications.length,
  );
  assert.equal(
    uniqueSorted(publicManifest.globalRoles.map((role) => role.id)).length,
    publicManifest.globalRoles.length,
  );
});

// Administrative actors live only in the super-admin organization and represent exactly the
// full, limited, and unprivileged permission sets.
test('should expose one explicit actor for every administrative permission set', async () => {
  const { publicManifest } = await loadFixtureAssuranceSurface();
  const actors = publicManifest.superAdmin.actors;
  const rolesById = new Map(publicManifest.globalRoles.map((role) => [role.id, role]));

  assert.equal(actors.length, 3);
  assert.deepEqual(uniqueSorted(actors.map((actor) => actor.permissionSet)), [
    'full',
    'limited',
    'unprivileged',
  ]);
  assert.ok(actors.every((actor) => actor.organizationId === 'super-admin'));
  assert.ok(actors.every((actor) => actor.state === 'active'));
  assert.equal(uniqueSorted(actors.map((actor) => actor.id)).length, actors.length);
  for (const actor of actors) {
    assert.match(actor.roleId, /^porta-[a-z0-9-]+$/);
    const role = rolesById.get(actor.roleId);
    assert.ok(role, actor.roleId);
    assert.ok(role.assignedUserIds.includes(actor.id));
    assert.equal(role.permissionProfile, actor.permissionSet);
    assert.deepEqual(uniqueSorted(actor.permissions), uniqueSorted(role.permissions));
  }
  const full = actors.find((actor) => actor.permissionSet === 'full');
  const limited = actors.find((actor) => actor.permissionSet === 'limited');
  const unprivileged = actors.find((actor) => actor.permissionSet === 'unprivileged');
  assert.ok(full);
  assert.ok(limited);
  assert.ok(unprivileged);
  assert.ok(full.permissions.length > limited.permissions.length);
  assert.ok(limited.permissions.length > 0);
  assert.ok(limited.permissions.every((permission) => full.permissions.includes(permission)));
  assert.deepEqual(unprivileged.permissions, []);
});
