import assert from 'node:assert/strict';
import test from 'node:test';

import { loadFixtureAssuranceSurface } from '../../fixtures/fixture-assurance.js';

const emptyResidue = {
  durableRows: 0,
  cacheEntries: 0,
  mailMessages: 0,
  sessions: 0,
} as const;

// An alpha actor addressing a bravo resource is unambiguously cross-tenant, while the same bravo
// resource remains independently observable through the public authorization boundary.
test('should independently observe bravo ownership when an alpha actor addresses bravo data', async () => {
  const surface = await loadFixtureAssuranceSurface();
  const alphaActor = surface.publicManifest.alpha.users.find((user) => user.state === 'active');
  const bravoResource = surface.publicManifest.bravo.resources[0];
  assert.ok(alphaActor);
  assert.ok(bravoResource);

  const observation = await surface.observeTenantResource(alphaActor.id, bravoResource.id);

  assert.equal(observation.actorId, alphaActor.id);
  assert.equal(observation.resourceId, bravoResource.id);
  assert.equal(observation.observedOrganizationId, 'bravo');
  assert.equal(observation.status, 'forbidden');
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
});
