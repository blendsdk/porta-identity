import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePackedTenantAdminEvidence } from './packed-tenant-admin-adapter.js';
import { completePackedTenantAdminEvidence } from './packed-tenant-admin-spec-fixtures.js';
import { packedTenantAdminRequirements } from './packed-tenant-admin-requirements.js';

test('should require the exact packed CLI tenant/admin operation matrix', () => {
  const evidence = validatePackedTenantAdminEvidence(completePackedTenantAdminEvidence());
  const cliJourneys = evidence.journeys.filter((journey) => journey.client === 'cli');
  assert.deepEqual(
    cliJourneys.map((journey) => journey.id),
    packedTenantAdminRequirements
      .filter((requirement) => requirement.client === 'cli')
      .map((requirement) => requirement.id),
  );
});

test('should reject a packed CLI result with unsafe credentials, output, or residue', () => {
  const unsafeHome = structuredClone(completePackedTenantAdminEvidence()) as {
    journeys: Array<{ client: string; cli?: Record<string, unknown> }>;
  };
  const cli = unsafeHome.journeys.find((journey) => journey.client === 'cli')?.cli;
  if (cli === undefined) throw new Error('CLI fixture is absent');
  cli.temporaryHomeMode = 0o755;
  assert.throws(() => validatePackedTenantAdminEvidence(unsafeHome), /temporary home/i);

  const unredacted = structuredClone(completePackedTenantAdminEvidence()) as {
    journeys: Array<Record<string, unknown>>;
  };
  const journey = unredacted.journeys.find((candidate) => candidate.client === 'cli');
  if (journey === undefined) throw new Error('CLI fixture is absent');
  journey.outputRedacted = false;
  assert.throws(() => validatePackedTenantAdminEvidence(unredacted), /output redaction/i);

  const residue = structuredClone(completePackedTenantAdminEvidence()) as {
    ownedResidue: string[];
  };
  residue.ownedResidue.push('temporary-home');
  assert.throws(() => validatePackedTenantAdminEvidence(residue), /owned residue/i);
});

test('should bind allowed and forbidden CLI outcomes to exact exit classes', () => {
  const wrongExit = structuredClone(completePackedTenantAdminEvidence()) as {
    journeys: Array<{ operation: string; client: string; cli?: Record<string, unknown> }>;
  };
  const denied = wrongExit.journeys.find(
    (journey) => journey.client === 'cli' && journey.operation === 'denied-update',
  )?.cli;
  if (denied === undefined) throw new Error('denied CLI fixture is absent');
  denied.exitCode = 0;
  assert.throws(() => validatePackedTenantAdminEvidence(wrongExit), /CLI exit/i);
});
