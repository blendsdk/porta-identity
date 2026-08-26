import assert from 'node:assert/strict';
import test from 'node:test';

import { staleAuthoritySentinel } from './tenant-admin-boundary-requirements.js';
import { controlPlaneAuthorityProfile } from './tenant-admin-profile-requirements.js';

// Stale authority has a stable sentinel identity and dedicated orchestration boundary. This suite
// intentionally performs no cache warming, authority mutation, client reuse, or process restart.
test('should reserve stale authority orchestration for its dedicated sentinel', () => {
  assert.equal(staleAuthoritySentinel.id, 'ST-31');
  assert.equal(staleAuthoritySentinel.includedHere, false);
  assert.equal(
    staleAuthoritySentinel.implementationBoundary,
    'dedicated-stale-authority-orchestration',
  );
  assert.deepEqual(
    [...staleAuthoritySentinel.supportedTransitions].sort(),
    controlPlaneAuthorityProfile.staleTransitions
      .filter((transition) => transition.status === 'supported')
      .map((transition) => transition.id)
      .sort(),
  );
  assert.deepEqual(
    [...staleAuthoritySentinel.unavailableTransitions].sort(),
    controlPlaneAuthorityProfile.staleTransitions
      .filter((transition) => transition.status === 'not-applicable')
      .map((transition) => transition.id)
      .sort(),
  );
});
