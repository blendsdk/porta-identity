import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  createPackedProtocolRunContext,
  runPackedProtocolAdjunct,
  type PackedProtocolJourneyDriver,
} from '../compat/protocol.js';
import {
  extractPackedCliAuthorizationUrl,
  parsePackedProtocolCredentials,
  startPackedManualCallbackCapture,
} from '../compat/protocol-cli-login.js';
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

test('should select the supported manual-mode environment without the broken negated flag', () => {
  const driver = readFileSync(
    resolve(process.cwd(), 'test-harness/assurance/compat/protocol-cli-login.ts'),
    'utf8',
  );
  assert.match(driver, /PORTA_CONTAINER:\s*'1'/u);
  assert.doesNotMatch(driver, /['"]--no-browser['"]/u);
});

test('should bind independent ID-token verification to the CLI authorization nonce', () => {
  const driver = readFileSync(
    resolve(process.cwd(), 'test-harness/assurance/compat/protocol-cli-login.ts'),
    'utf8',
  );
  assert.match(driver, /nonce:\s*authorization\.get\('nonce'\)\s*\?\?\s*undefined/u);
});

test('should capture one exact manual callback through an owner-bound loopback listener', async () => {
  const capture = await startPackedManualCallbackCapture(0);
  try {
    const callback = `${capture.origin}/callback?code=code-value&state=state-value&iss=https%3A%2F%2Fissuer.example`;
    const response = await fetch(callback);
    assert.equal(response.status, 200);
    assert.equal(await capture.waitForCallback(), callback);
  } finally {
    await capture.close();
  }
});

test('should reject non-callback requests without consuming the callback observer', async () => {
  const capture = await startPackedManualCallbackCapture(0);
  try {
    assert.equal((await fetch(`${capture.origin}/not-callback`)).status, 404);
    assert.equal(
      (
        await fetch(
          `${capture.origin}/callback?code=one&code=two&state=state-value&unexpected=value`,
        )
      ).status,
      404,
    );
    const callback = `${capture.origin}/callback?code=code-value&state=state-value`;
    assert.equal((await fetch(callback)).status, 200);
    assert.equal((await fetch(callback)).status, 409);
    assert.equal(await capture.waitForCallback(), callback);
  } finally {
    await capture.close();
    await capture.close();
  }
});

test('should accept the published CLI credential shape without inventing an email claim', () => {
  const credentials = {
    server: 'https://porta.example',
    orgSlug: 'porta-admin',
    clientId: 'client-id',
    accessToken: 'opaque-access',
    refreshToken: 'opaque-refresh',
    idToken: 'signed.id.token',
    expiresAt: '2026-08-19T00:00:00.000Z',
    userInfo: { sub: 'subject-id', email: '' },
  };
  assert.equal(parsePackedProtocolCredentials(credentials).userInfo.email, '');
  assert.throws(
    () => parsePackedProtocolCredentials({ ...credentials, userInfo: { sub: '', email: '' } }),
    /sub/u,
  );
});
