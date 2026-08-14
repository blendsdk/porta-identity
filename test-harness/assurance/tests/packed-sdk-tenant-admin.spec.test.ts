import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePackedTenantAdminEvidence } from './packed-tenant-admin-adapter.js';
import { completePackedTenantAdminEvidence } from './packed-tenant-admin-spec-fixtures.js';
import { packedTenantAdminRequirements } from './packed-tenant-admin-requirements.js';

test('should require the exact packed SDK tenant/admin operation matrix', () => {
  const evidence = validatePackedTenantAdminEvidence(completePackedTenantAdminEvidence());
  const sdkJourneys = evidence.journeys.filter((journey) => journey.client === 'sdk');
  assert.deepEqual(
    sdkJourneys.map((journey) => journey.id),
    packedTenantAdminRequirements
      .filter((requirement) => requirement.client === 'sdk')
      .map((requirement) => requirement.id),
  );
});

test('should reject packed SDK evidence without independent target identity or mutation proof', () => {
  const missingIdentity = structuredClone(completePackedTenantAdminEvidence()) as {
    journeys: Array<Record<string, unknown>>;
  };
  delete missingIdentity.journeys[0]?.independentTargetId;
  assert.throws(
    () => validatePackedTenantAdminEvidence(missingIdentity),
    /independent target identity/i,
  );

  const falseMutation = structuredClone(completePackedTenantAdminEvidence()) as {
    journeys: Array<Record<string, unknown>>;
  };
  const update = falseMutation.journeys.find((journey) => journey.operation === 'update');
  if (update === undefined) throw new Error('SDK update fixture is absent');
  update.targetChanged = false;
  assert.throws(() => validatePackedTenantAdminEvidence(falseMutation), /target mutation/i);
});

test('should reject tenant list evidence that observes a foreign tenant identity', () => {
  const evidence = structuredClone(completePackedTenantAdminEvidence()) as {
    journeys: Array<Record<string, unknown>>;
  };
  const list = evidence.journeys.find(
    (journey) => journey.client === 'sdk' && journey.operation === 'list',
  );
  if (list === undefined) throw new Error('SDK list fixture is absent');
  list.foreignTenantIdsObserved = ['bravo-user-active'];
  assert.throws(() => validatePackedTenantAdminEvidence(evidence), /foreign tenant/i);
});
