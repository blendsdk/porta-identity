import assert from 'node:assert/strict';
import test from 'node:test';

import { loadFixtureAssuranceSurface } from '../../fixtures/fixture-assurance.js';

const emptyResidue = {
  durableRows: 0,
  cacheEntries: 0,
  mailMessages: 0,
  sessions: 0,
} as const;

// A fully authorized administrator addressing a bravo resource through an alpha-scoped route
// isolates route-resource ownership from the administrator's separate authority domain.
test('should independently observe bravo ownership through an alpha-scoped admin route', async () => {
  const surface = await loadFixtureAssuranceSurface();
  const administrator = surface.publicManifest.superAdmin.actors.find(
    (actor) => actor.permissionSet === 'full',
  );
  const bravoResource = surface.publicManifest.bravo.resources[0];
  assert.ok(administrator);
  assert.ok(bravoResource);

  const observation = await surface.observeTenantResource(
    administrator.id,
    'alpha',
    bravoResource.id,
  );

  assert.equal(observation.administratorId, administrator.id);
  assert.equal(observation.pathOrganizationId, 'alpha');
  assert.equal(observation.resourceId, bravoResource.id);
  assert.equal(observation.observedOrganizationId, 'bravo');
  assert.equal(observation.status, 'forbidden');
  assert.deepEqual(observation.routeChecks, [
    { operation: 'read', status: 'not-found' },
    { operation: 'update', status: 'not-found' },
    { operation: 'suspend', status: 'not-found' },
    { operation: 'roles', status: 'not-found' },
    { operation: 'two-factor', status: 'not-found' },
    { operation: 'export', status: 'not-found' },
    { operation: 'history', status: 'not-found' },
  ]);
  assert.equal(observation.targetUnchanged, true);
});

// Reversed and deterministically shuffled executions produce the same public outcomes from fresh
// baselines and leave no durable, cache, mail, or session residue.
test('should produce identical residue-free outcomes in reversed and shuffled runs', async () => {
  const surface = await loadFixtureAssuranceSurface();

  const reversed = await surface.runSequence('reverse');
  const shuffled = await surface.runSequence('shuffled');

  assert.ok(reversed.outcomeDigest.length > 0);
  assert.equal(shuffled.outcomeDigest, reversed.outcomeDigest);
  assert.deepEqual(reversed.residue, emptyResidue);
  assert.deepEqual(shuffled.residue, emptyResidue);
  assert.deepEqual(reversed.finalStoreDigests, reversed.baselineStoreDigests);
  assert.deepEqual(shuffled.finalStoreDigests, shuffled.baselineStoreDigests);
  for (const digest of Object.values(reversed.baselineStoreDigests)) {
    assert.match(digest, /^sha256:[a-f0-9]{64}$/u);
  }
});
