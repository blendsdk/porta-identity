import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  createCoverageWorkspace,
  coverageEnvironment,
  extractRawCoverage,
  gracefullyFlushPorta,
  inspectPortaContainer,
} from '../coverage/index.js';
import type { ActiveCoverageRun, PortaContainerIdentity } from '../coverage/index.js';
import type { EndpointManifest, LeaseRecord } from '../../fixtures/lifecycle.js';
import { environmentForManifest } from '../../fixtures/lifecycle-runtime.js';
import { FileLeaseStateAdapter } from '../../fixtures/lifecycle-system.js';

/** Runs one case in an isolated temporary repository and removes it afterwards. */
function withTemporaryRepository(run: (root: string) => void): void {
  const root = mkdtempSync(resolve(tmpdir(), 'porta-coverage-capture-'));
  try {
    mkdirSync(resolve(root, 'test-harness/.assurance-results'), { recursive: true });
    writeFileSync(
      resolve(root, '.gitignore'),
      'test-harness/.assurance-results/\ntest-harness/.assurance-runtime/\n',
    );
    writeFileSync(resolve(root, 'yarn.lock'), '# fixture lock\n');
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'coverage@test.invalid'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Coverage Test'], { cwd: root });
    execFileSync('git', ['add', '.gitignore', 'yarn.lock'], { cwd: root });
    execFileSync('git', ['commit', '--quiet', '-m', 'test fixture'], { cwd: root });
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Creates the smallest endpoint manifest needed by environment derivation. */
function endpointManifest(root: string): EndpointManifest {
  return {
    runId: '00000000-0000-4000-8000-000000000001',
    scenarioId: 'coverage-operational',
    composeProject: 'porta-assurance-coverage',
    worktreePath: root,
    environmentName: 'operational',
    ports: { porta: 3443, app: 5173, bff: 4000, postgres: 5432, redis: 6379, mailhog: 8025 },
    urls: {
      porta: 'https://porta-harness.ci.portaidentity.com:3443',
      app: 'https://app-harness.ci.portaidentity.com:5173',
      bff: 'https://app-harness.ci.portaidentity.com:4000',
      postgres: 'postgres://127.0.0.1:5432',
      redis: 'redis://127.0.0.1:6379',
      mailhog: 'http://127.0.0.1:8025',
    },
    certificatePath: resolve(root, 'test-harness/certs/server.crt'),
  };
}

/** Returns one immutable label-verified container identity for extraction tests. */
function portaContainer(): PortaContainerIdentity {
  return {
    containerId: 'a'.repeat(64),
    imageDigest: `sha256:${'b'.repeat(64)}`,
    nodeVersion: 'v22.23.1',
    lifecycleRunId: '00000000-0000-4000-8000-000000000001',
    composeProject: 'porta-assurance-coverage',
    revision: 'c'.repeat(40),
    dependencyLockDigest: `sha256:${'d'.repeat(64)}`,
    sourceTreeDigest: `sha256:${'e'.repeat(64)}`,
    fixtureDigest: `sha256:${'f'.repeat(64)}`,
    runtimeDependencyInventory: {
      revision: 'c'.repeat(40),
      imageDigest: `sha256:${'b'.repeat(64)}`,
      dependencies: [
        {
          name: 'koa',
          version: '3.2.1',
          rootPath: '/app/node_modules/koa',
          integrity: `sha256:${'1'.repeat(64)}`,
        },
      ],
    },
  };
}

test('should create one ignored run-owned raw and compiled workspace', () => {
  withTemporaryRepository((root) => {
    const workspace = createCoverageWorkspace(root, 'protocol', 'operational');

    assert.match(workspace.runId, /^[0-9a-f-]{36}$/u);
    assert.ok(workspace.root.startsWith(resolve(root, 'test-harness/.assurance-results/')));
    assert.equal(workspace.rawDirectory, resolve(workspace.root, 'raw'));
    assert.equal(workspace.compiledDirectory, resolve(workspace.root, 'compiled'));
    assert.equal(existsSync(workspace.rawDirectory), false);
    assert.equal(statSync(workspace.compiledDirectory).mode & 0o777, 0o700);
    const environment = coverageEnvironment(workspace);
    assert.equal(environment.HARNESS_COVERAGE_RESULT_DIR, workspace.root);
    assert.match(environment.HARNESS_COVERAGE_REVISION ?? '', /^[0-9a-f]{40}$/u);
    assert.match(environment.HARNESS_COVERAGE_LOCK_DIGEST ?? '', /^sha256:[0-9a-f]{64}$/u);
    assert.match(environment.HARNESS_COVERAGE_SOURCE_TREE_DIGEST ?? '', /^sha256:[0-9a-f]{64}$/u);
  });
});

test('should reject coverage build attribution when tracked inputs are dirty', () => {
  withTemporaryRepository((root) => {
    const workspace = createCoverageWorkspace(root, 'protocol', 'operational');
    writeFileSync(resolve(root, 'yarn.lock'), '# changed lock\n');
    assert.throws(() => coverageEnvironment(workspace), /requires a clean source tree/u);
  });
});

test('should allow only a canonical assurance-result directory as the coverage bind source', () => {
  withTemporaryRepository((root) => {
    const workspace = createCoverageWorkspace(root, 'security', 'production-security');
    const original = process.env.HARNESS_COVERAGE_RESULT_DIR;
    try {
      process.env.HARNESS_COVERAGE_RESULT_DIR = workspace.root;
      const environment = environmentForManifest(endpointManifest(root));
      assert.equal(environment.HARNESS_COVERAGE_RESULT_DIR, workspace.root);
      assert.equal(environment.HARNESS_NODE_V8_COVERAGE, '/app/.v8-coverage');

      process.env.HARNESS_COVERAGE_RESULT_DIR = resolve(root, 'outside');
      mkdirSync(process.env.HARNESS_COVERAGE_RESULT_DIR);
      assert.throws(
        () => environmentForManifest(endpointManifest(root)),
        /inside the assurance results root/u,
      );
    } finally {
      if (original === undefined) delete process.env.HARNESS_COVERAGE_RESULT_DIR;
      else process.env.HARNESS_COVERAGE_RESULT_DIR = original;
    }
  });
});

test('should configure NODE_V8_COVERAGE only on the Porta service', () => {
  const compose = readFileSync(resolve(import.meta.dirname, '../../docker-compose.yml'), 'utf8');
  const dockerfile = readFileSync(resolve(import.meta.dirname, '../../Dockerfile'), 'utf8');
  assert.equal(compose.match(/^\s+NODE_V8_COVERAGE:/gmu)?.length, 1);
  assert.match(
    compose,
    /\n {2}porta:\n[\s\S]*?NODE_V8_COVERAGE:[\s\S]*?coverage-raw:\/app\/\.v8-coverage[\s\S]*?\n {2}postgres:/u,
  );
  assert.match(compose, /\nvolumes:\n {2}coverage-raw:\n {4}labels:/u);
  assert.match(
    dockerfile,
    /mkdir -p \/app\/\.v8-coverage[\s\S]*?chown porta:porta \/app\/\.v8-coverage[\s\S]*?chmod 0700 \/app\/\.v8-coverage[\s\S]*?USER porta/u,
  );
  assert.match(dockerfile, /LABEL io\.porta\.assurance\.coverage-revision=/u);
  assert.match(dockerfile, /io\.porta\.assurance\.coverage-lock-digest=/u);
  assert.match(dockerfile, /io\.porta\.assurance\.coverage-source-tree-digest=/u);
  assert.match(compose, /HARNESS_COVERAGE_REVISION: '\$\{HARNESS_COVERAGE_REVISION:-disabled\}'/u);
  assert.match(
    compose,
    /HARNESS_COVERAGE_SOURCE_TREE_DIGEST: '\$\{HARNESS_COVERAGE_SOURCE_TREE_DIGEST:-disabled\}'/u,
  );
});

test('should reject a selected Porta container absent from the unchanged durable lease', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'porta-coverage-lease-'));
  const leaseRoot = mkdtempSync(resolve(tmpdir(), 'porta-coverage-leases-'));
  try {
    mkdirSync(resolve(root, 'test-harness/.assurance-results'), { recursive: true });
    writeFileSync(
      resolve(root, '.gitignore'),
      'test-harness/.assurance-results/\ntest-harness/.assurance-runtime/\n',
    );
    writeFileSync(resolve(root, 'yarn.lock'), '# fixture lock\n');
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'coverage@test.invalid'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Coverage Test'], { cwd: root });
    execFileSync('git', ['add', '.gitignore', 'yarn.lock'], { cwd: root });
    execFileSync('git', ['commit', '--quiet', '-m', 'test fixture'], { cwd: root });
    const workspace = createCoverageWorkspace(root, 'protocol', 'operational');
    const provenance = coverageEnvironment(workspace);
    const manifest = endpointManifest(root);
    const leasedContainer = 'a'.repeat(64);
    const selectedContainer = 'b'.repeat(64);
    const lease: LeaseRecord = {
      runId: manifest.runId,
      startupIntentId: '00000000-0000-4000-8000-000000000002',
      ownerProcess: { pid: process.pid, startedAtFingerprint: 'fixture-owner' },
      worktreePath: root,
      composeProject: manifest.composeProject,
      containerIds: [leasedContainer],
      networkIds: [],
      hostProcesses: [],
      volumeNames: [],
      ownedPaths: [],
      certificatePath: manifest.certificatePath,
      manifest,
    };
    const leases = new FileLeaseStateAdapter(leaseRoot);
    assert.equal(await leases.tryAcquire(lease), 'acquired');
    const activeRun: ActiveCoverageRun = {
      runId: lease.runId,
      composeProject: lease.composeProject,
      lease,
    };
    const runner = {
      checked: async (_command: string, args: readonly string[]) => {
        if (args[0] === 'ps') return { exitCode: 0, stdout: `${selectedContainer}\n`, stderr: '' };
        if (args[0] === 'inspect') {
          return {
            exitCode: 0,
            stdout: [
              `sha256:${'c'.repeat(64)}`,
              lease.runId,
              root,
              lease.composeProject,
              'porta',
              provenance.HARNESS_COVERAGE_REVISION,
              provenance.HARNESS_COVERAGE_LOCK_DIGEST,
              provenance.HARNESS_COVERAGE_SOURCE_TREE_DIGEST,
            ].join('|'),
            stderr: '',
          };
        }
        throw new Error('unexpected command after authorization failure');
      },
    };

    await assert.rejects(
      inspectPortaContainer(root, workspace, activeRun, undefined, runner, leases),
      /provenance does not match the active lifecycle/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(leaseRoot, { recursive: true, force: true });
  }
});

test('should promote only host-owned validated raw files from the exact stopped container', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'porta-coverage-extraction-'));
  try {
    mkdirSync(resolve(root, 'test-harness/.assurance-results'), { recursive: true });
    const workspace = createCoverageWorkspace(root, 'protocol', 'operational');
    const runner = {
      checked: async (command: string, args: readonly string[]) => {
        assert.equal(command, 'docker');
        assert.deepEqual(args.slice(0, 2), [
          'cp',
          `${portaContainer().containerId}:/app/.v8-coverage/.`,
        ]);
        const stagingDirectory = args[2];
        assert.ok(stagingDirectory);
        writeFileSync(
          resolve(stagingDirectory, 'coverage-7-100-0.json'),
          `${JSON.stringify({ result: [] })}\n`,
          { mode: 0o600 },
        );
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    };

    const files = await extractRawCoverage(root, workspace, portaContainer(), undefined, runner);

    assert.deepEqual(
      files.map((file) => file.name),
      ['coverage-7-100-0.json'],
    );
    assert.equal(statSync(workspace.rawDirectory).mode & 0o777, 0o700);
    assert.equal(
      statSync(resolve(workspace.rawDirectory, 'coverage-7-100-0.json')).mode & 0o777,
      0o600,
    );
    assert.equal(existsSync(resolve(workspace.root, '.raw-staging')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const testCase of [
  { name: 'nonzero wait', wait: '2', state: 'exited|false|2', accepted: false },
  { name: 'OOM termination', wait: '0', state: 'exited|true|0', accepted: false },
  { name: 'forced termination', wait: '0', state: 'exited|false|137', accepted: false },
  { name: 'graceful zero exit', wait: '0', state: 'exited|false|0', accepted: true },
] as const) {
  test(`should ${testCase.accepted ? 'accept' : 'reject'} ${testCase.name} at the real flush boundary`, async () => {
    let call = 0;
    const runner = {
      checked: async () => {
        call += 1;
        if (call === 1) return { exitCode: 0, stdout: '', stderr: '' };
        if (call === 2) return { exitCode: 0, stdout: testCase.wait, stderr: '' };
        return { exitCode: 0, stdout: testCase.state, stderr: '' };
      },
    };

    const execution = gracefullyFlushPorta(process.cwd(), portaContainer(), undefined, runner);
    if (testCase.accepted) await execution;
    else await assert.rejects(execution, /did not exit cleanly|does not prove/u);
  });
}

test('should remove staged output when Docker returns an unexpected raw entry', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'porta-coverage-extraction-'));
  try {
    mkdirSync(resolve(root, 'test-harness/.assurance-results'), { recursive: true });
    const workspace = createCoverageWorkspace(root, 'security', 'operational');
    const runner = {
      checked: async (_command: string, args: readonly string[]) => {
        const stagingDirectory = args[2];
        assert.ok(stagingDirectory);
        mkdirSync(resolve(stagingDirectory, 'nested'));
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    };

    await assert.rejects(
      extractRawCoverage(root, workspace, portaContainer(), undefined, runner),
      /unexpected raw coverage entry/u,
    );
    assert.equal(existsSync(workspace.rawDirectory), false);
    assert.equal(existsSync(resolve(workspace.root, '.raw-staging')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
