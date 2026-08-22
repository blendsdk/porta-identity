import assert from 'node:assert/strict';
import test from 'node:test';

import { executeTenantAdminFaultLive } from './tenant-admin-fault-live-adapter.js';
import { createTenantAdminBoundariesLiveAdapter } from './tenant-admin-boundaries-live.js';
import { controlPlaneVariations } from './tenant-admin-boundary-requirements.js';
import {
  tenantAdminFaultRequirementForSubSentinel,
  tenantAdminFaultRequirements,
} from './tenant-admin-fault-requirements.js';

// Every requirements-only negative control owns one semantic target and one exact claim/sub-sentinel/signature
// tuple. No entry may choose a patch path, build command, or execution command.
test('should define seven unique runner-neutral tenant admin negative controls', () => {
  assert.equal(tenantAdminFaultRequirements.length, 7);
  assert.equal(
    new Set(tenantAdminFaultRequirements.map((requirement) => requirement.id)).size,
    tenantAdminFaultRequirements.length,
  );
  assert.equal(
    new Set(tenantAdminFaultRequirements.map((requirement) => requirement.semanticTarget)).size,
    tenantAdminFaultRequirements.length,
  );
  assert.equal(
    new Set(tenantAdminFaultRequirements.map((requirement) => requirement.tuple.subSentinel)).size,
    tenantAdminFaultRequirements.length,
  );
  assert.equal(
    new Set(tenantAdminFaultRequirements.map((requirement) => requirement.tuple.expectedSignature))
      .size,
    tenantAdminFaultRequirements.length,
  );
  for (const requirement of tenantAdminFaultRequirements) {
    assert.equal(requirement.tuple.claimId, 'CLAIM-R5-03');
    assert.equal(requirement.liveExecution, 'unavailable');
    assert.match(requirement.tuple.subSentinel, /^ST-(?:28|29|30|31|32)_[A-Z][A-Z0-9_]{2,127}$/u);
    assert.match(requirement.tuple.expectedSignature, /^[A-Z][A-Z0-9_]{2,127}$/u);
    assert.equal(
      tenantAdminFaultRequirementForSubSentinel(requirement.tuple.subSentinel),
      requirement,
    );
    assert.equal('path' in requirement, false);
    assert.equal('patch' in requirement, false);
    assert.equal('buildCommand' in requirement, false);
    assert.equal('executionCommand' in requirement, false);
  }
});

// Requirement metadata cannot be mistaken for live check evidence; execution remains a stable
// fail-closed boundary until a reviewed disposable local implementation replaces it.
test('should fail closed when live tenant admin control-check execution is unavailable', async () => {
  await assert.rejects(
    executeTenantAdminFaultLive('tenant-read-scope'),
    /TENANT_ADMIN_FAULT_LIVE_UNAVAILABLE/u,
  );
});

// The write-specific wrong-organization probe is now represented as an exact PUT and can no longer
// fall through to the earlier GET-only implementation.
test('should retain the exact PUT method at the installed live write boundary', () => {
  const writeVariation = controlPlaneVariations.find(
    (variation) => variation.invariantMarker === 'same-user-write-under-wrong-organization-path',
  );
  assert.ok(writeVariation);
  assert.equal(writeVariation.requestMethod, 'PUT');
  assert.equal(
    typeof createTenantAdminBoundariesLiveAdapter().observeControlPlaneVariation,
    'function',
  );
});
