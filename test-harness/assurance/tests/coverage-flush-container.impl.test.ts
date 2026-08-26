import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { gracefullyFlushPorta, type PortaContainerIdentity } from '../coverage/index.js';
import { RuntimeCommandRunner } from '../../fixtures/lifecycle-runtime.js';

/** Copies the current process environment without retaining undefined values. */
function currentEnvironment(): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

test('should reject a nonzero disposable-container termination at the live Docker boundary', async () => {
  const runner = new RuntimeCommandRunner();
  const name = `porta-coverage-flush-${randomUUID()}`;
  const started = await runner.checked(
    'docker',
    [
      'run',
      '-d',
      '--name',
      name,
      'node:22-alpine',
      'node',
      '-e',
      "process.on('SIGTERM',()=>process.exit(17));setInterval(()=>{},1000)",
    ],
    { cwd: process.cwd(), environment: currentEnvironment(), timeoutMilliseconds: 60_000 },
  );
  const containerId = started.stdout.trim();
  assert.match(containerId, /^[0-9a-f]{64}$/u);
  const identity: PortaContainerIdentity = {
    containerId,
    imageDigest: `sha256:${'0'.repeat(64)}`,
    nodeVersion: process.version,
    lifecycleRunId: '00000000-0000-4000-8000-000000000001',
    composeProject: 'disposable-flush-test',
    revision: '0'.repeat(40),
    dependencyLockDigest: `sha256:${'0'.repeat(64)}`,
    sourceTreeDigest: `sha256:${'0'.repeat(64)}`,
    fixtureDigest: `sha256:${'0'.repeat(64)}`,
    runtimeDependencyInventory: {
      revision: '0'.repeat(40),
      imageDigest: `sha256:${'0'.repeat(64)}`,
      dependencies: [],
    },
  };

  try {
    await assert.rejects(gracefullyFlushPorta(process.cwd(), identity), /did not exit cleanly/u);
  } finally {
    await runner.run('docker', ['rm', '-f', '--', containerId], {
      cwd: process.cwd(),
      environment: currentEnvironment(),
      timeoutMilliseconds: 30_000,
    });
  }
});
