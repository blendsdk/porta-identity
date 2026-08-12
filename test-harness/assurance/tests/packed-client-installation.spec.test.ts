import assert from 'node:assert/strict';
import test from 'node:test';

import { createPackedClientFoundationsContract } from './packed-client-foundations-planned.js';

const expectedSdkExports = ['.', './agent', './browser', './node'] as const;

// The compatibility consumer installs exact local SDK and CLI archives as file dependencies in a
// clean ignored directory outside every workspace, and binds their identities to the current
// server source, image, fixture, and Node runtime.
test('should install provenance-bound current client archives outside every workspace', async () => {
  const contract = createPackedClientFoundationsContract();

  const consumer = await contract.prepareCurrentConsumer();

  assert.equal(consumer.outsideEveryWorkspace, true);
  assert.equal(consumer.ignored, true);
  assert.equal(consumer.cleanInstall, true);
  assert.deepEqual(consumer.archives.map((archive) => archive.name).sort(), [
    '@portaidentity/cli',
    '@portaidentity/sdk',
  ]);
  for (const archive of consumer.archives) {
    assert.match(archive.sha256, /^[a-f0-9]{64}$/);
    assert.equal(consumer.dependencies[archive.name], `file:${archive.archivePath}`);
    assert.ok(archive.version.length > 0);
  }
  assert.match(consumer.triplet.sourceRevision, /^[a-f0-9]{40}$/);
  assert.match(consumer.triplet.serverImageDigest, /^sha256:[a-f0-9]{64}$/);
  assert.ok(consumer.triplet.nodeVersion.length > 0);
  assert.ok(consumer.triplet.fixtureIdentity.length > 0);
});

// Only the SDK's declared package exports and the CLI's compiled package bin are valid consumer
// surfaces; source files and workspace entry points cannot stand in for publishable output.
test('should load declared SDK exports and the CLI executable only from dist output', async () => {
  const contract = createPackedClientFoundationsContract();
  const consumer = await contract.prepareCurrentConsumer();

  const result = await contract.loadDeclaredSurfaces(consumer);

  assert.deepEqual([...result.loadedSdkExports].sort(), [...expectedSdkExports].sort());
  assert.match(result.cliBinPath, /(?:^|\/)node_modules\/@portaidentity\/cli\/dist\/index\.js$/);
  assert.equal(result.distOnly, true);
});

// This assurance boundary covers only the current server and the SDK/CLI archives built from the
// same current source revision; it makes no claim about older released client versions.
test('should bind one current server SDK and CLI triplet without version-range claims', async () => {
  const contract = createPackedClientFoundationsContract();

  const consumer = await contract.prepareCurrentConsumer();
  const sdk = consumer.archives.find((archive) => archive.name === '@portaidentity/sdk');
  const cli = consumer.archives.find((archive) => archive.name === '@portaidentity/cli');

  assert.ok(sdk);
  assert.ok(cli);
  assert.equal(sdk.version, cli.version);
  assert.equal(consumer.triplet.sourceRevision.length, 40);
});
