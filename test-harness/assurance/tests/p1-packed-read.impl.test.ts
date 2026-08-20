import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectPackedP1ReadJourneys,
  createPackedP1ReadProvenance,
  packedP1ReadJourneyRequirements,
  validatePackedP1ReadEvidence,
  type PackedP1ReadJourneyDriver,
  type PackedP1ReadResult,
} from '../compat/p1-read.js';
import { isPackedCompatibilitySelector } from '../compat/command.js';
import type { PreparedPackedConsumer, PackedSurfaceResult } from '../compat/model.js';
import type { PackedCliSdkResolution } from '../compat/resolution.js';
import { completePackedP1ReadEvidence } from './p1-packed-read-spec-fixtures.js';

const stableDigest = `sha256:${'a'.repeat(64)}`;

/** Returns a deterministic independently comparable read result. */
function result(identity: string): PackedP1ReadResult {
  return {
    result: 'allowed',
    status: 200,
    orderedItemIdentities: [identity],
    pageOrFilterMetadataDigest: stableDigest,
    publicFieldDigest: stableDigest,
  };
}

/** Creates a transparent driver that records the exact orchestration order. */
function recordingDriver(events: string[]): PackedP1ReadJourneyDriver {
  let activeId = '';
  return {
    async observeState() {
      events.push(`state:${activeId || 'before'}`);
      return {
        'target-row-digests': stableDigest,
        'target-cardinality': stableDigest,
        'session-lifecycle-digests': stableDigest,
        'signing-key-lifecycle-digests': stableDigest,
        'configuration-version-digests': stableDigest,
      };
    },
    async executeClient(requirement) {
      activeId = requirement.id;
      events.push(`client:${requirement.id}`);
      return {
        result: result(requirement.id),
        boundedOutput: requirement.id,
        ...(requirement.client === 'cli'
          ? {
              cliIsolation: {
                temporaryHomeMode: 0o700,
                temporaryHomeRemoved: true,
                callerCredentialFingerprintUnchanged: true,
              },
            }
          : {}),
      };
    },
    async executeIndependentRaw(requirement) {
      events.push(`raw:${requirement.id}`);
      return result(requirement.id);
    },
    async verifyFixtureIdentities(requirement, identities) {
      events.push(`fixture:${requirement.id}`);
      return { satisfied: true, resolvedIdentities: identities };
    },
    async scanForbiddenOutput(output) {
      events.push(`scan:${output}`);
      return {
        'opaque-access-or-refresh-token': false,
        'session-cookie-or-credential': false,
        'protected-configuration-value': false,
        'private-signing-key-material': false,
        'foreign-tenant-identity-or-count': false,
      };
    },
  };
}

test('should execute the exact frozen matrix with independent observations after each client read', async () => {
  const events: string[] = [];
  const journeys = await collectPackedP1ReadJourneys(recordingDriver(events));
  assert.deepEqual(
    journeys.map((journey) => journey.requirementId),
    packedP1ReadJourneyRequirements.map((requirement) => requirement.id),
  );
  for (const requirement of packedP1ReadJourneyRequirements) {
    const clientIndex = events.indexOf(`client:${requirement.id}`);
    assert.ok(clientIndex >= 0, requirement.id);
    assert.ok(events.indexOf(`raw:${requirement.id}`) > clientIndex, requirement.id);
    assert.ok(events.indexOf(`fixture:${requirement.id}`) > clientIndex, requirement.id);
    assert.ok(events.indexOf(`scan:${requirement.id}`) > clientIndex, requirement.id);
  }
});

test('should stop without admitting later journeys when the independent raw observer fails', async () => {
  const events: string[] = [];
  const base = recordingDriver(events);
  const driver: PackedP1ReadJourneyDriver = {
    ...base,
    async executeIndependentRaw(requirement) {
      if (requirement.id === 'packed-cli-audit-filtering') throw new Error('controlled observer');
      return base.executeIndependentRaw(requirement);
    },
  };
  await assert.rejects(() => collectPackedP1ReadJourneys(driver), /controlled observer/);
  assert.equal(events.includes('client:packed-sdk-signing-key-list'), false);
});

test('should reject every non-success terminal outcome and retained residue', () => {
  const complete = completePackedP1ReadEvidence();
  for (const terminalOutcome of ['failure', 'timeout', 'sigint', 'sigterm'] as const) {
    assert.throws(
      () =>
        validatePackedP1ReadEvidence({
          ...complete,
          cleanup: { ...complete.cleanup, terminalOutcome },
        }),
      /cleanup/i,
      terminalOutcome,
    );
  }
  assert.throws(
    () =>
      validatePackedP1ReadEvidence({
        ...complete,
        cleanup: { ...complete.cleanup, consumerRemoved: false },
      }),
    /cleanup/i,
  );
});

test('should bind provenance to the exact local archives and packed SDK resolution', () => {
  const sdkContent = 'f'.repeat(64);
  const consumer: PreparedPackedConsumer = {
    runId: '00000000-0000-4000-8000-000000000001',
    consumerPath: '/tmp/owned-p1-consumer',
    outsideEveryWorkspace: true,
    ignored: true,
    cleanInstall: true,
    dependencies: {
      '@portaidentity/sdk': 'file:/tmp/sdk.tgz',
      '@portaidentity/cli': 'file:/tmp/cli.tgz',
    },
    archives: [
      {
        name: '@portaidentity/sdk',
        version: '1.6.2',
        sha256: 'a'.repeat(64),
        contentSha256: sdkContent,
        archivePath: '/tmp/sdk.tgz',
      },
      {
        name: '@portaidentity/cli',
        version: '1.6.2',
        sha256: 'b'.repeat(64),
        contentSha256: 'c'.repeat(64),
        archivePath: '/tmp/cli.tgz',
      },
    ],
    triplet: {
      nodeVersion: process.version,
      sourceRevision: 'd'.repeat(40),
      serverImageDigest: `sha256:${'e'.repeat(64)}`,
      fixtureIdentity: stableDigest,
    },
  };
  const surfaces: PackedSurfaceResult = {
    loadedSdkExports: ['.'],
    resolvedSdkFiles: ['/tmp/owned-p1-consumer/node_modules/@portaidentity/sdk/dist/index.js'],
    cliBinPath: '/tmp/owned-p1-consumer/node_modules/@portaidentity/cli/dist/index.js',
    distOnly: true,
  };
  const resolution: PackedCliSdkResolution = {
    resolvedPath: '/tmp/owned-p1-consumer/node_modules/@portaidentity/sdk',
    resolvedContentSha256: sdkContent,
    packedContentSha256: sdkContent,
  };
  const provenance = createPackedP1ReadProvenance(consumer, surfaces, resolution);
  assert.deepEqual(provenance.packageNames, ['@portaidentity/sdk', '@portaidentity/cli']);
  assert.equal(provenance.archiveSha256['@portaidentity/sdk'], 'a'.repeat(64));
  assert.throws(
    () =>
      createPackedP1ReadProvenance(consumer, surfaces, {
        ...resolution,
        resolvedContentSha256: '0'.repeat(64),
      }),
    /prepared SDK archive/i,
  );
});

test('should expose the P1 adjunct through the closed compatibility selector', () => {
  assert.equal(isPackedCompatibilitySelector('p1-admin'), true);
  assert.equal(isPackedCompatibilitySelector('p1-admin-extra'), false);
});
