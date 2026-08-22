import assert from 'node:assert/strict';
import test from 'node:test';

import { getPackedAdminDataCapability } from './packed-admin-data-adapter.js';
import { PACKED_ADMIN_DATA_CAPABILITY_MISSING } from './packed-admin-data-contract.js';
import {
  packedAdminDataForbiddenOutputClasses,
  packedAdminDataRequirements,
} from './packed-admin-data-requirements.js';

const digestA = `sha256:${'a'.repeat(64)}`;
const digestB = `sha256:${'b'.repeat(64)}`;

/** Creates complete requirement-owned data for validator semantics only. */
function completeEvidence() {
  return {
    version: 1,
    provenance: {
      nodeVersion: 'v22.0.0',
      nodeExecutableSha256: 'a'.repeat(64),
      sourceRevision: 'c'.repeat(40),
      serverImageDigest: digestB,
      fixtureManifestDigest: digestA,
      packageNames: ['@portaidentity/sdk', '@portaidentity/cli'],
      packageVersions: { '@portaidentity/sdk': '1.0.0', '@portaidentity/cli': '1.0.0' },
      archiveSha256: { '@portaidentity/sdk': 'a'.repeat(64), '@portaidentity/cli': 'b'.repeat(64) },
      dependencySpecifiers: {
        '@portaidentity/sdk': 'file:portaidentity-sdk.tgz',
        '@portaidentity/cli': 'file:portaidentity-cli.tgz',
      },
      compiledEntrypoints: ['@portaidentity/sdk/dist/index.js', '@portaidentity/cli/dist/index.js'],
      resolvedContentDigestsMatchArchives: true,
      prohibitedResolutionObserved: false,
      primaryTreeUnchanged: true,
    },
    journeys: packedAdminDataRequirements.map((requirement) => ({
      requirementId: requirement.id,
      client: requirement.client,
      clientResult: {
        outcome: requirement.expectedOutcome,
        status: requirement.expectedStatus,
        bodyDigest: digestA,
        recordCount: requirement.surface === 'export-users-json' ? 2 : null,
        publicFieldDigest: digestB,
      },
      independentRawResult: {
        outcome: requirement.expectedOutcome,
        status: requirement.expectedStatus,
        bodyDigest: digestA,
        recordCount: requirement.surface === 'export-users-json' ? 2 : null,
        publicFieldDigest: digestB,
      },
      outcome: 'passed',
      stateDigestBefore: digestA,
      stateDigestAfter: digestA,
      forbiddenOutputObserved: Object.fromEntries(
        packedAdminDataForbiddenOutputClasses.map((key) => [key, false]),
      ),
      ...(requirement.client === 'cli'
        ? {
            cliIsolation: {
              temporaryHomeMode: 0o700,
              temporaryHomeRemoved: true,
              callerCredentialFingerprintUnchanged: true,
            },
          }
        : {}),
    })),
    cleanup: {
      terminalOutcome: 'success',
      callerCredentialFingerprintUnchanged: true,
      temporaryHomesRemoved: true,
      consumerRemoved: true,
      residuePaths: [],
    },
  };
}

test('should freeze the bounded non-destructive packed administrative-data matrix', () => {
  assert.deepEqual(
    packedAdminDataRequirements.map(({ client, surface, expectedOutcome, expectedStatus }) => [
      client,
      surface,
      expectedOutcome,
      expectedStatus,
    ]),
    [
      ['sdk', 'bulk-duplicate-rejection', 'rejected', 400],
      ['sdk', 'import-dry-run', 'allowed', 200],
      ['sdk', 'export-users-json', 'allowed', 200],
      ['cli', 'export-users-json', 'allowed', 200],
    ],
  );
  assert.equal(new Set(packedAdminDataRequirements.map(({ id }) => id)).size, 4);
  assert.ok(packedAdminDataRequirements.every(({ requiresNonmutation }) => requiresNonmutation));
});

test('should require exact package, independent raw, protected-output, and cleanup evidence', () => {
  assert.deepEqual(packedAdminDataForbiddenOutputClasses, [
    'access-or-refresh-token',
    'session-cookie-or-client-secret',
    'password-or-recovery-material',
    'private-signing-key-material',
    'foreign-tenant-identity',
  ]);
  assert.equal(
    packedAdminDataRequirements.some(({ client }) => client === 'sdk'),
    true,
  );
  assert.equal(
    packedAdminDataRequirements.some(({ client }) => client === 'cli'),
    true,
  );
});

test('should fail closed until the production-backed packed validator is connected', () => {
  const capability = getPackedAdminDataCapability();
  if (!capability.available) {
    assert.throws(() => capability.validate({}), new RegExp(PACKED_ADMIN_DATA_CAPABILITY_MISSING));
    throw new Error(PACKED_ADMIN_DATA_CAPABILITY_MISSING);
  }
  assert.deepEqual(capability.validate(completeEvidence()), completeEvidence());
});
