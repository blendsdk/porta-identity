import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import type { ActiveCoverageRun } from '../coverage/index.js';
import {
  boundedPublicResponse,
  exposesInternalDetail,
  headerContractObserved,
} from '../production-exposure/response-classifier.js';
import {
  OwnedDependencyController,
  type ProductionExposureCommandRunner,
} from '../production-exposure/service-controller.js';

const containerId = 'a'.repeat(64);

/** Creates one complete active-run identity for controller implementation tests. */
function activeRun(root: string): ActiveCoverageRun {
  const manifest = {
    runId: '11111111-1111-4111-8111-111111111111',
    scenarioId: 'production-exposure-test',
    composeProject: 'porta_assurance_test',
    worktreePath: root,
    environmentName: 'production-security',
    ports: { porta: 40100, app: 40101, bff: 40102, postgres: 40103, redis: 40104, mailhog: 40105 },
    urls: {
      porta: 'https://porta-harness.ci.portaidentity.com:40100',
      app: 'https://app-harness.ci.portaidentity.com:40101',
      attacker: 'https://127.0.0.1:40101',
      bff: 'https://bff-harness.ci.portaidentity.com:40102',
      postgres: 'postgres://127.0.0.1:40103',
      redis: 'redis://127.0.0.1:40104',
      mailhog: 'http://127.0.0.1:40105',
    },
    certificatePath: resolve(root, 'server.crt'),
  } as const;
  return {
    runId: manifest.runId,
    composeProject: manifest.composeProject,
    lease: {
      runId: manifest.runId,
      startupIntentId: '22222222-2222-4222-8222-222222222222',
      ownerProcess: { pid: 42, startedAtFingerprint: 'start:42' },
      worktreePath: root,
      composeProject: manifest.composeProject,
      containerIds: [containerId],
      networkIds: [],
      hostProcesses: [],
      volumeNames: [],
      ownedPaths: [],
      certificatePath: manifest.certificatePath,
      manifest,
    },
  };
}

/** Creates a deterministic Docker runner and captures every shell-free call. */
function fakeRunner(options?: {
  readonly listedId?: string;
  readonly failStart?: boolean;
  readonly root?: string;
}): { readonly runner: ProductionExposureCommandRunner; readonly calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    runner: {
      async checked(command, args) {
        calls.push([command, ...args]);
        if (command !== 'docker') throw new Error('unexpected executable');
        if (args[0] === 'ps') {
          return { exitCode: 0, stdout: `${options?.listedId ?? containerId}\n`, stderr: '' };
        }
        if (args[0] === 'inspect' && args[1] === '--format' && args[2]?.includes('run-id')) {
          return {
            exitCode: 0,
            stdout: `11111111-1111-4111-8111-111111111111|${options?.root ?? ''}|porta_assurance_test|redis\n`,
            stderr: '',
          };
        }
        if (args[0] === 'inspect') {
          return { exitCode: 0, stdout: 'true|healthy\n', stderr: '' };
        }
        if (args[0] === 'start' && options?.failStart === true) {
          throw new Error('start failed');
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    },
  };
}

test('should reject version-bearing public server headers', () => {
  const response = boundedPublicResponse(200, { server: 'nginx/1.31.0' }, '{"status":"ok"}');
  assert.equal(headerContractObserved('server-version-header-absent', response), false);
});

test('should derive CORS policy checks from concrete response headers', () => {
  const response = boundedPublicResponse(
    204,
    {
      'access-control-allow-origin': 'https://app-harness.ci.portaidentity.com',
      'access-control-allow-methods': 'GET,POST',
      'access-control-allow-headers': 'content-type',
    },
    '',
  );
  assert.equal(
    headerContractObserved(
      'access-control-allow-origin-exactly-echoes-the-configured-origin',
      response,
    ),
    true,
  );
  assert.equal(
    headerContractObserved('access-control-allow-methods-does-not-contain-trace', response),
    true,
  );
});

test('should detect dependency addresses and stack material in public responses', () => {
  assert.equal(
    exposesInternalDetail(
      boundedPublicResponse(
        503,
        { 'content-type': 'application/json' },
        '{"reason":"connect ECONNREFUSED 172.18.0.3:5432 at /app/dist/db.js"}',
      ),
    ),
    true,
  );
});

test('should restore the exact owned dependency when the probe fails', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'porta-production-exposure-'));
  try {
    const fake = fakeRunner({ root });
    const controller = new OwnedDependencyController(root, activeRun(root), fake.runner);
    await assert.rejects(
      controller.whileUnavailable('redis', async () => {
        throw new Error('probe failed');
      }),
      /probe failed/u,
    );
    assert.ok(fake.calls.some((call) => call[1] === 'stop' && call.at(-1) === containerId));
    assert.ok(fake.calls.some((call) => call[1] === 'start' && call.at(-1) === containerId));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('should reject a dependency container not listed in the durable lease', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'porta-production-exposure-'));
  try {
    const fake = fakeRunner({ listedId: 'b'.repeat(64), root });
    const controller = new OwnedDependencyController(root, activeRun(root), fake.runner);
    await assert.rejects(
      controller.whileUnavailable('redis', async () => 'unreachable'),
      /owned dependency container identity is unavailable/u,
    );
    assert.equal(
      fake.calls.some((call) => call[1] === 'stop'),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('should apply restoration failure precedence over a successful probe', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'porta-production-exposure-'));
  try {
    const fake = fakeRunner({ failStart: true, root });
    const controller = new OwnedDependencyController(root, activeRun(root), fake.runner);
    await assert.rejects(
      controller.whileUnavailable('redis', async () => 'probe'),
      /start failed/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('should restore an owned dependency after the caller signal is aborted', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'porta-production-exposure-'));
  try {
    const fake = fakeRunner({ root });
    const controller = new OwnedDependencyController(root, activeRun(root), fake.runner);
    const interruption = new AbortController();
    await controller.whileUnavailable(
      'redis',
      async () => {
        interruption.abort();
        return 'observed';
      },
      interruption.signal,
    );
    const start = fake.calls.find((call) => call[1] === 'start');
    assert.ok(start);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
