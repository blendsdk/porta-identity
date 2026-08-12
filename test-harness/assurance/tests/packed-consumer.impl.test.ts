import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  cleanupPackedConsumer,
  loadPackedSurfaces,
  preparePackedConsumer,
  verifyPackedCliSdkResolution,
} from '../compat/index.js';

test('installs exact local archives as ordinary directories and removes its owned root', async () => {
  const consumer = await preparePackedConsumer(process.cwd(), {
    serverImageDigest: `sha256:${'b'.repeat(64)}`,
    fixtureIdentity: 'fixture:packed-consumer-implementation',
  });
  const runRoot = resolve(consumer.consumerPath, '..');
  try {
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
    assert.equal(resolution.resolvedContentSha256, resolution.packedContentSha256);
  } finally {
    cleanupPackedConsumer(consumer);
  }
  assert.equal(existsSync(runRoot), false);
});
