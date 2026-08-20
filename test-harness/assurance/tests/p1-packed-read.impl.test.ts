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
import {
  containsPrivateSigningKeyMaterial,
  outputContainsProtectedCanary,
  publicSigningKeyRecordsAreStrict,
  sanitizePackedP1Identity,
} from '../compat/p1-read-live.js';
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
    observedTotal: 1,
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
    async verifyFixtureIdentities(requirement, observed) {
      events.push(`fixture:${requirement.id}`);
      return {
        satisfied: true,
        resolvedIdentities: observed.orderedItemIdentities,
        expectedTotal: observed.observedTotal,
      };
    },
    async scanForbiddenOutput(_requirement, output) {
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

test('should reject changed page order, metadata, or protected cardinality', () => {
  const complete = completePackedP1ReadEvidence();
  const first = complete.journeys[0];
  assert.ok(first);
  const mismatch = validatePackedP1ReadEvidence({
    ...complete,
    journeys: [
      {
        ...first,
        outcome: 'product-failure',
        independentRawResult: {
          ...first.independentRawResult,
          orderedItemIdentities: ['changed-page-identity'],
        },
      },
      ...complete.journeys.slice(1),
    ],
  });
  assert.equal(mismatch.journeys[0]?.outcome, 'product-failure');
  assert.throws(
    () =>
      validatePackedP1ReadEvidence({
        ...complete,
        journeys: [
          {
            ...first,
            stateFingerprintsAfter: {
              ...first.stateFingerprintsAfter,
              'target-cardinality': `sha256:${'0'.repeat(64)}`,
            },
          },
          ...complete.journeys.slice(1),
        ],
      }),
    /protected state changed/u,
  );
});

test('should record an SDK cursor incompatibility as a product failure', async () => {
  const events: string[] = [];
  const base = recordingDriver(events);
  const driver: PackedP1ReadJourneyDriver = {
    ...base,
    async executeClient(requirement) {
      if (requirement.id !== 'packed-sdk-tenant-users-pagination') {
        return base.executeClient(requirement);
      }
      return {
        result: {
          result: 'unexpected-error',
          status: null,
          orderedItemIdentities: [],
          observedTotal: null,
          pageOrFilterMetadataDigest: stableDigest,
          publicFieldDigest: stableDigest,
        },
        boundedOutput: 'bounded-sdk-error',
      };
    },
  };
  const journeys = await collectPackedP1ReadJourneys(driver);
  assert.equal(journeys[0]?.outcome, 'product-failure');
  assert.equal(journeys[0]?.independentRawResult.result, 'allowed');
});

test('should reject unknown, nested, JWK-private, and encrypted signing-key fields', () => {
  const publicKey = {
    id: 'key-id',
    kid: 'kid',
    algorithm: 'ES256',
    status: 'active',
    createdAt: '2026-08-20T00:00:00.000Z',
    retiredAt: null,
  };
  assert.equal(publicSigningKeyRecordsAreStrict([publicKey]), true);
  for (const leaked of [
    { ...publicKey, encryptedPrivateKey: 'ciphertext' },
    { ...publicKey, jwk: { kty: 'EC', d: 'private-coordinate' } },
    { ...publicKey, nested: { private_key: 'secret' } },
  ]) {
    assert.equal(publicSigningKeyRecordsAreStrict([leaked]), false);
    assert.equal(containsPrivateSigningKeyMaterial(JSON.stringify(leaked)), true);
  }
  assert.equal(containsPrivateSigningKeyMaterial('-----BEGIN PRIVATE KEY-----'), true);
});

test('should scan exact protected token, cookie, and credential canaries', () => {
  assert.equal(outputContainsProtectedCanary('safe public output', ['opaque-token']), false);
  assert.equal(outputContainsProtectedCanary('value=opaque-token', ['opaque-token']), true);
  assert.equal(outputContainsProtectedCanary('cookie=session-canary', ['session-canary']), true);
  assert.equal(
    outputContainsProtectedCanary('credential=client-secret-canary', ['client-secret-canary']),
    true,
  );
});

test('should retain only run-scoped digests for session identities', () => {
  const rawSessionId = 'active-session-credential';
  const firstRun = sanitizePackedP1Identity(
    'tenant-session-page',
    rawSessionId,
    '00000000-0000-4000-8000-000000000001',
  );
  const secondRun = sanitizePackedP1Identity(
    'tenant-session-page',
    rawSessionId,
    '00000000-0000-4000-8000-000000000002',
  );
  assert.match(firstRun, /^sha256:[a-f0-9]{64}$/u);
  assert.notEqual(firstRun, secondRun);
  assert.equal(firstRun.includes(rawSessionId), false);

  const complete = completePackedP1ReadEvidence();
  const sessionIndex = complete.journeys.findIndex(
    (journey) => journey.requirementId === 'packed-sdk-filtered-session-pagination',
  );
  assert.ok(sessionIndex >= 0);
  const session = complete.journeys[sessionIndex];
  assert.ok(session);
  assert.throws(
    () =>
      validatePackedP1ReadEvidence({
        ...complete,
        journeys: complete.journeys.map((journey, index) =>
          index === sessionIndex
            ? {
                ...session,
                clientResult: result(rawSessionId),
                independentRawResult: result(rawSessionId),
                fixtureResolvedIdentities: [rawSessionId],
              }
            : journey,
        ),
      }),
    /session identity.*redaction/iu,
  );
});

test('should admit detected protected output only as a product failure', () => {
  const complete = completePackedP1ReadEvidence();
  const first = complete.journeys[0];
  assert.ok(first);
  const evidence = {
    ...complete,
    journeys: [
      {
        ...first,
        outcome: 'product-failure' as const,
        forbiddenOutputObserved: {
          ...first.forbiddenOutputObserved,
          'session-cookie-or-credential': true,
        },
      },
      ...complete.journeys.slice(1),
    ],
  };
  assert.equal(validatePackedP1ReadEvidence(evidence).journeys[0]?.outcome, 'product-failure');
  assert.throws(
    () =>
      validatePackedP1ReadEvidence({
        ...evidence,
        journeys: [{ ...evidence.journeys[0]!, outcome: 'passed' }, ...evidence.journeys.slice(1)],
      }),
    /forbidden output/i,
  );
});

test('should reject foreign totals even when returned identities remain tenant-owned', () => {
  const complete = completePackedP1ReadEvidence();
  const first = complete.journeys[0];
  assert.ok(first);
  assert.throws(
    () =>
      validatePackedP1ReadEvidence({
        ...complete,
        journeys: [
          {
            ...first,
            clientResult: { ...first.clientResult, observedTotal: 6 },
            independentRawResult: { ...first.independentRawResult, observedTotal: 6 },
          },
          ...complete.journeys.slice(1),
        ],
      }),
    /outcome.*independent observations/i,
  );
});

test('should reject a missing total when the fixture oracle defines cardinality', () => {
  const complete = completePackedP1ReadEvidence();
  const first = complete.journeys[0];
  assert.ok(first);
  assert.throws(
    () =>
      validatePackedP1ReadEvidence({
        ...complete,
        journeys: [
          {
            ...first,
            clientResult: { ...first.clientResult, observedTotal: null },
            independentRawResult: { ...first.independentRawResult, observedTotal: null },
          },
          ...complete.journeys.slice(1),
        ],
      }),
    /outcome.*independent observations/i,
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
    resolvedSdkFiles: ['dist/index.js'],
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
  assert.deepEqual(provenance.compiledEntrypoints, [
    '@portaidentity/sdk/dist/index.js',
    '@portaidentity/cli/dist/index.js',
  ]);
  assert.equal(
    provenance.compiledEntrypoints.some((path) => path.startsWith('/')),
    false,
  );
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
