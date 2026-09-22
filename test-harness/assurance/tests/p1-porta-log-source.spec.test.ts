import assert from 'node:assert/strict';
import test from 'node:test';

import {
  capturePortaLog,
  resolveOwnedPortaContainer,
  type LogCommandRunner,
} from '../p1/porta-log-source.js';

const CONTAINER_ID = 'a'.repeat(64);

/** Records fixed command arguments and returns a canned standard output. */
function fakeRunner(stdout: string, calls: string[][]): LogCommandRunner {
  return {
    checked: (command, args) => {
      calls.push([command, ...args]);
      return Promise.resolve({ stdout });
    },
  };
}

const base = {
  repositoryRoot: '/repo',
  activeRun: { composeProject: 'porta-assurance-run' },
  environment: { PATH: '/usr/bin' },
};

test('resolves the single owned Porta container by its owned labels', async () => {
  const calls: string[][] = [];
  const containerId = await resolveOwnedPortaContainer({
    ...base,
    runner: fakeRunner(`${CONTAINER_ID}\n`, calls),
  });
  assert.equal(containerId, CONTAINER_ID);
  assert.deepEqual(calls[0], [
    'docker',
    'ps',
    '-aq',
    '--no-trunc',
    '--filter',
    'label=com.docker.compose.project=porta-assurance-run',
    '--filter',
    'label=com.docker.compose.service=porta',
  ]);
});

test('rejects a run that owns zero or many Porta containers', async () => {
  await assert.rejects(
    resolveOwnedPortaContainer({ ...base, runner: fakeRunner('', []) }),
    /exactly one owned Porta container/u,
  );
  await assert.rejects(
    resolveOwnedPortaContainer({
      ...base,
      runner: fakeRunner(`${CONTAINER_ID}\n${CONTAINER_ID}\n`, []),
    }),
    /exactly one owned Porta container/u,
  );
});

test('rejects a malformed container identity', async () => {
  await assert.rejects(
    resolveOwnedPortaContainer({ ...base, runner: fakeRunner('not-a-container-id\n', []) }),
    /identity is malformed/u,
  );
});

test('reads one bounded window with fixed docker arguments', async () => {
  const calls: string[][] = [];
  const since = new Date('2026-09-21T00:00:00.000Z');
  const until = new Date('2026-09-21T00:01:00.000Z');
  const capture = await capturePortaLog({
    ...base,
    runner: fakeRunner(`${CONTAINER_ID}\n`, calls),
    since,
    until,
  });
  assert.equal(capture.containerId, CONTAINER_ID);
  assert.deepEqual(calls[1], [
    'docker',
    'logs',
    '--timestamps',
    '--since',
    since.toISOString(),
    '--until',
    until.toISOString(),
    '--',
    CONTAINER_ID,
  ]);
});
