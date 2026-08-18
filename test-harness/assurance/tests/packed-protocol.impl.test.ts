import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  createPackedProtocolRunContext,
  runPackedProtocolAdjunct,
  type PackedProtocolJourneyDriver,
} from '../compat/protocol.js';
import { extractPackedCliAuthorizationUrl } from '../compat/protocol-cli-login.js';
import type { PreparedPackedConsumer, PackedSurfaceResult } from '../compat/model.js';
import { PackedCompatibilityExecutionError } from '../compat/model.js';
import type { PackedCliSdkResolution } from '../compat/resolution.js';
import { completePackedProtocolEvidence } from './packed-protocol-spec-fixtures.js';

const sdkContentDigest = 'f'.repeat(64);

/** Returns the minimum prepared consumer needed to verify provenance derivation. */
function preparedConsumer(): PreparedPackedConsumer {
  return {
    runId: '00000000-0000-4000-8000-000000000001',
    consumerPath: '/tmp/owned-protocol-consumer',
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
        sha256: 'd'.repeat(64),
        contentSha256: sdkContentDigest,
        archivePath: '/tmp/sdk.tgz',
      },
      {
        name: '@portaidentity/cli',
        version: '1.6.2',
        sha256: 'e'.repeat(64),
        contentSha256: '1'.repeat(64),
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
  cliBinPath: '/tmp/owned-protocol-consumer/node_modules/@portaidentity/cli/dist/index.js',
  distOnly: true,
};

const resolution: PackedCliSdkResolution = {
  resolvedPath: '/tmp/owned-protocol-consumer/node_modules/@portaidentity/sdk',
  resolvedContentSha256: sdkContentDigest,
  packedContentSha256: sdkContentDigest,
};

test('should derive protocol provenance from the prepared local archives', () => {
  const context = createPackedProtocolRunContext(preparedConsumer(), surfaces, resolution);
  assert.deepEqual(context.archives, { sdk: 'd'.repeat(64), cli: 'e'.repeat(64) });
  assert.deepEqual(context.resolution, {
    sdkDistOnly: true,
    cliDistOnly: true,
    cliUsesPackedSdk: true,
  });
});

test('should reject protocol execution when the CLI resolves another SDK', () => {
  assert.throws(
    () =>
      createPackedProtocolRunContext(preparedConsumer(), surfaces, {
        ...resolution,
        resolvedContentSha256: '2'.repeat(64),
      }),
    /prepared SDK archive/i,
  );
});

test('should execute CLI login before SDK refresh and admit their combined observations', async () => {
  const calls: string[] = [];
  const fixture = completePackedProtocolEvidence();
  const driver: PackedProtocolJourneyDriver = {
    async loginWithCli() {
      calls.push('cli');
      return fixture.cliLogin;
    },
    async refreshWithSdk() {
      calls.push('sdk');
      return fixture.sdkRefresh;
    },
  };
  const evidence = await runPackedProtocolAdjunct(
    createPackedProtocolRunContext(preparedConsumer(), surfaces, resolution),
    driver,
  );
  assert.deepEqual(calls, ['cli', 'sdk']);
  assert.equal(evidence.cliLogin.refreshTokenPresent, true);
  assert.equal(evidence.sdkRefresh.consumedRefreshRetryError, 'invalid_grant');
});

test('should extract one exact packed CLI authorization URL and reject ambiguous output', () => {
  const url =
    'https://porta.example/porta-admin/auth?response_type=code&code_challenge_method=S256';
  assert.equal(extractPackedCliAuthorizationUrl(`Open this URL:\n  ${url}\n`)?.toString(), url);
  assert.throws(() => extractPackedCliAuthorizationUrl(`${url}\n${url}\n`), /multiple/i);
  assert.equal(extractPackedCliAuthorizationUrl('no authorization request'), undefined);
});

test('should use only the packed SDK Node entry and emit sanitized refresh facts', () => {
  const probe = readFileSync(
    resolve(process.cwd(), 'test-harness/consumers/protocol-sdk-refresh-probe.mjs'),
    'utf8',
  );
  assert.match(probe, /from '@portaidentity\/sdk\/node'/u);
  assert.match(probe, /refreshedAccessTokenChanged/u);
  assert.match(probe, /refreshedAccessTokenAcceptedByRawObserver/u);
  assert.doesNotMatch(probe, /(?:accessToken|refreshToken)\s*:/u);
});

test('should preserve only a closed non-secret packed protocol failure stage', () => {
  const failure = new PackedCompatibilityExecutionError(30, undefined, 'protocol-cli-browser');
  assert.equal(failure.exitCode, 30);
  assert.equal(failure.stage, 'protocol-cli-browser');
  assert.equal(failure.message, 'packed compatibility execution failed');
});
