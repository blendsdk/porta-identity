import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  createPackedTenantAdminRunContext,
  packedTenantAdminJourneyRequirements,
  runPackedTenantAdminAdjunct,
  type PackedTenantAdminClientObservation,
  type PackedTenantAdminJourneyDriver,
} from '../compat/tenant-admin.js';
import type { PreparedPackedConsumer, PackedSurfaceResult } from '../compat/model.js';
import type { PackedCliSdkResolution } from '../compat/resolution.js';

const sdkContentDigest = `sha256:${'f'.repeat(64)}`;

/** Creates the minimum typed prepared consumer needed for provenance binding tests. */
function preparedConsumer(): PreparedPackedConsumer {
  return {
    runId: '00000000-0000-4000-8000-000000000001',
    consumerPath: '/tmp/owned-consumer',
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
        sha256: `sha256:${'d'.repeat(64)}`,
        contentSha256: sdkContentDigest,
        archivePath: '/tmp/sdk.tgz',
      },
      {
        name: '@portaidentity/cli',
        version: '1.6.2',
        sha256: `sha256:${'e'.repeat(64)}`,
        contentSha256: `sha256:${'1'.repeat(64)}`,
        archivePath: '/tmp/cli.tgz',
      },
    ],
    triplet: {
      nodeVersion: process.version,
      sourceRevision: 'a'.repeat(40),
      serverImageDigest: `sha256:${'b'.repeat(64)}`,
      fixtureIdentity: `sha256:${'c'.repeat(64)}`,
    },
  };
}

const surfaces: PackedSurfaceResult = {
  loadedSdkExports: ['.', './agent', './browser', './node'],
  resolvedSdkFiles: ['dist/index.js', 'dist/agent.js', 'dist/browser.js', 'dist/node.js'],
  cliBinPath: '/tmp/owned-consumer/node_modules/@portaidentity/cli/dist/index.js',
  distOnly: true,
};

const resolution: PackedCliSdkResolution = {
  resolvedPath: '/tmp/owned-consumer/node_modules/@portaidentity/sdk',
  resolvedContentSha256: sdkContentDigest,
  packedContentSha256: sdkContentDigest,
};

test('should derive provenance from the prepared archives and observed resolution', () => {
  const context = createPackedTenantAdminRunContext(preparedConsumer(), surfaces, resolution);
  assert.equal(context.archives.sdk, `sha256:${'d'.repeat(64)}`);
  assert.equal(context.archives.cli, `sha256:${'e'.repeat(64)}`);
  assert.deepEqual(context.resolution, {
    sdkDistOnly: true,
    cliDistOnly: true,
    cliUsesPackedSdk: true,
  });
});

test('should reject a CLI SDK resolution that differs from the prepared local archive', () => {
  assert.throws(
    () =>
      createPackedTenantAdminRunContext(preparedConsumer(), surfaces, {
        ...resolution,
        resolvedContentSha256: `sha256:${'2'.repeat(64)}`,
      }),
    /prepared SDK archive/i,
  );
});

test('should pass the Porta origin to the SDK transport without duplicating its admin prefix', () => {
  const probe = readFileSync(
    resolve(process.cwd(), 'test-harness/consumers/tenant-admin-sdk-probe.mjs'),
    'utf8',
  );
  assert.match(probe, /baseUrl:\s*input\.server/u);
  assert.doesNotMatch(probe, /input\.server[^\n]*api\/admin/u);
});

test('should pass the runtime token through the public SDK authentication options object', () => {
  const probe = readFileSync(
    resolve(process.cwd(), 'test-harness/consumers/tenant-admin-sdk-probe.mjs'),
    'utf8',
  );
  assert.match(probe, /createTokenAuth\(\{\s*token:\s*input\.token\s*\}\)/u);
  assert.doesNotMatch(probe, /createTokenAuth\(input\.token\)/u);
});

test('should execute every packed tenant/admin requirement exactly once in frozen order', async () => {
  const executed: string[] = [];
  const independentlyObserved: string[] = [];
  const resetAfter: string[] = [];
  let activeRequirement = '';
  const driver: PackedTenantAdminJourneyDriver = {
    async execute(requirement): Promise<PackedTenantAdminClientObservation> {
      activeRequirement = requirement.id;
      executed.push(requirement.id);
      return {
        id: requirement.id,
        client: requirement.client,
        operation: requirement.operation,
        actor: requirement.actor,
        observedResult: requirement.expectedResult,
        clientTargetId: 'alpha-user-active',
        foreignTenantIdsObserved: [],
        outputRedacted: true,
        ...(requirement.client === 'cli'
          ? {
              cli: {
                exitCode: requirement.expectedResult === 'allowed' ? 0 : 1,
                temporaryHomeMode: 0o700,
                temporaryHomeRemoved: true,
                callerCredentialUnchanged: true,
              },
            }
          : {}),
      };
    },
    async observeTarget(requirement) {
      independentlyObserved.push(requirement.id);
      return {
        targetId: 'alpha-user-active',
        digest:
          requirement.expectedTargetMutation && activeRequirement === requirement.id
            ? 'after-change'
            : 'stable',
      };
    },
    async reset() {
      resetAfter.push(activeRequirement);
      activeRequirement = '';
    },
  };
  const evidence = await runPackedTenantAdminAdjunct(
    {
      sourceRevision: 'a'.repeat(40),
      serverImageDigest: `sha256:${'b'.repeat(64)}`,
      fixtureIdentity: `sha256:${'c'.repeat(64)}`,
      archives: { sdk: `sha256:${'d'.repeat(64)}`, cli: `sha256:${'e'.repeat(64)}` },
      resolution: { sdkDistOnly: true, cliDistOnly: true, cliUsesPackedSdk: true },
      primaryTreeUnchanged: true,
      ownedResidue: [],
    },
    driver,
  );

  assert.deepEqual(
    executed,
    packedTenantAdminJourneyRequirements.map((requirement) => requirement.id),
  );
  assert.deepEqual(
    independentlyObserved,
    packedTenantAdminJourneyRequirements.flatMap((requirement) => [requirement.id, requirement.id]),
  );
  assert.deepEqual(resetAfter, [
    'packed-sdk-tenant-update',
    'packed-sdk-tenant-denied-update',
    'packed-cli-tenant-update',
    'packed-cli-tenant-denied-update',
  ]);
  assert.equal(evidence.journeys.length, 8);
});

test('should reset after an update executor fails before independent observation', async () => {
  let resetCount = 0;
  const driver: PackedTenantAdminJourneyDriver = {
    async execute(requirement) {
      if (requirement.operation === 'update') throw new Error('controlled client failure');
      return {
        id: requirement.id,
        client: requirement.client,
        operation: requirement.operation,
        actor: requirement.actor,
        observedResult: requirement.expectedResult,
        clientTargetId: 'alpha-user-active',
        foreignTenantIdsObserved: [],
        outputRedacted: true,
        ...(requirement.client === 'cli'
          ? {
              cli: {
                exitCode: requirement.expectedResult === 'allowed' ? 0 : 1,
                temporaryHomeMode: 0o700,
                temporaryHomeRemoved: true,
                callerCredentialUnchanged: true,
              },
            }
          : {}),
      };
    },
    async observeTarget() {
      return { targetId: 'alpha-user-active', digest: 'stable' };
    },
    async reset() {
      resetCount += 1;
    },
  };
  await assert.rejects(
    () =>
      runPackedTenantAdminAdjunct(
        {
          sourceRevision: 'a'.repeat(40),
          serverImageDigest: `sha256:${'b'.repeat(64)}`,
          fixtureIdentity: `sha256:${'c'.repeat(64)}`,
          archives: { sdk: `sha256:${'d'.repeat(64)}`, cli: `sha256:${'e'.repeat(64)}` },
          resolution: { sdkDistOnly: true, cliDistOnly: true, cliUsesPackedSdk: true },
          primaryTreeUnchanged: true,
          ownedResidue: [],
        },
        driver,
      ),
    /controlled client failure/i,
  );
  assert.equal(resetCount, 1);
});
