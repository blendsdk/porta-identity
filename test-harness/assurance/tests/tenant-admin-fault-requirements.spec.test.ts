import assert from 'node:assert/strict';
import test from 'node:test';

import { executeTenantAdminFaultLive } from './tenant-admin-fault-live-adapter.js';
import { createTenantAdminBoundariesLiveAdapter } from './tenant-admin-boundaries-live.js';
import { controlPlaneVariations } from './tenant-admin-boundary-requirements.js';
import {
  tenantAdminFaultRequirementForSubSentinel,
  tenantAdminFaultRequirements,
} from './tenant-admin-fault-requirements.js';

// Every requirements-only fault owns one semantic target and one exact claim/sub-sentinel/signature
// tuple. No entry may choose a patch path, build command, or execution command.
test('should define seven unique runner-neutral tenant admin fault requirements', () => {
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

// Requirement metadata cannot be mistaken for live fault evidence; live execution remains a
// stable fail-closed boundary until a reviewed disposable fault implementation replaces it.
test('should fail closed when live tenant admin fault execution is unavailable', async () => {
  await assert.rejects(
    executeTenantAdminFaultLive('tenant-read-scope-removed'),
    /TENANT_ADMIN_FAULT_LIVE_UNAVAILABLE/u,
  );
});

// The new write-specific wrong-organization probe cannot fall through to the existing GET-only
// live variation adapter before its reviewed PUT implementation is installed.
test('should fail closed before a live write variation can execute as a read', async () => {
  const writeVariation = controlPlaneVariations.find(
    (variation) => variation.invariantMarker === 'same-user-write-under-wrong-organization-path',
  );
  assert.ok(writeVariation);
  assert.equal(writeVariation.requestMethod, 'PUT');
  await assert.rejects(
    async () =>
      createTenantAdminBoundariesLiveAdapter().observeControlPlaneVariation(writeVariation),
    /TENANT_ADMIN_WRITE_VARIATION_LIVE_UNAVAILABLE/u,
  );
});
