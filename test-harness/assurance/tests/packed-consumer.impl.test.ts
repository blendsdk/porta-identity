import assert from 'node:assert/strict';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  cleanupPackedConsumer,
  loadPackedSurfaces,
  preparePackedConsumer,
  verifyPackedCliSdkResolution,
} from '../compat/index.js';

test('installs exact local archives as ordinary directories and removes its owned root', async () => {
  const stalePrimaryOutput = resolve(process.cwd(), 'packages/sdk/dist/.porta-stale-output.js');
  mkdirSync(resolve(stalePrimaryOutput, '..'), { recursive: true });
  writeFileSync(stalePrimaryOutput, 'throw new Error("stale primary output");\n');
  let consumer: Awaited<ReturnType<typeof preparePackedConsumer>> | undefined;
  let runRoot: string | undefined;
  try {
    consumer = await preparePackedConsumer(process.cwd(), {
      serverImageDigest: `sha256:${'b'.repeat(64)}`,
      fixtureIdentity: 'fixture:packed-consumer-implementation',
    });
    runRoot = resolve(consumer.consumerPath, '..');
    const manifest = JSON.parse(
      readFileSync(resolve(consumer.consumerPath, 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    assert.deepEqual(manifest.dependencies, consumer.dependencies);
    for (const packageName of ['sdk', 'cli']) {
      const installedRoot = resolve(
        consumer.consumerPath,
        'node_modules/@portaidentity',
        packageName,
      );
      assert.equal(lstatSync(installedRoot).isSymbolicLink(), false);
      assert.equal(realpathSync(installedRoot), installedRoot);
    }
    const surfaces = await loadPackedSurfaces(consumer);
    const resolution = await verifyPackedCliSdkResolution(consumer);
    assert.equal(surfaces.distOnly, true);
    assert.equal(surfaces.resolvedSdkFiles.length, surfaces.loadedSdkExports.length);
    assert.ok(surfaces.resolvedSdkFiles.every((path) => path.startsWith('dist/')));
    assert.equal(
      existsSync(
        resolve(
          consumer.consumerPath,
          'node_modules/@portaidentity/sdk/dist/.porta-stale-output.js',
        ),
      ),
      false,
    );
    assert.equal(resolution.resolvedContentSha256, resolution.packedContentSha256);
  } finally {
    if (consumer !== undefined)
      assert.equal(cleanupPackedConsumer(process.cwd(), consumer).removed, true);
    rmSync(stalePrimaryOutput, { force: true });
  }
  assert.ok(runRoot);
  assert.equal(existsSync(runRoot), false);
});

test('returns only a bounded exact recovery when consumer cleanup authority is malformed', () => {
  const runId = '00000000-0000-4000-8000-000000000099';
  const cleanup = cleanupPackedConsumer(process.cwd(), {
    runId,
    consumerPath: resolve(process.cwd(), 'test-harness/.assurance-runtime/compat/other/consumer'),
    outsideEveryWorkspace: true,
    ignored: true,
    cleanInstall: true,
    dependencies: { '@portaidentity/sdk': 'file:sdk', '@portaidentity/cli': 'file:cli' },
    archives: [],
    triplet: {
      nodeVersion: process.version,
      serverImageDigest: `sha256:${'0'.repeat(64)}`,
      sourceRevision: '0'.repeat(40),
      fixtureIdentity: 'fixture:test',
    },
  });

  assert.deepEqual(cleanup, {
    removed: false,
    recoveryCommand: `yarn assurance:compat --recover ${runId}`,
  });
});
