import assert from 'node:assert/strict';
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
} from '../coverage/index.js';
import type { PortaContainerIdentity } from '../coverage/index.js';
import type { EndpointManifest } from '../../fixtures/lifecycle.js';
import { environmentForManifest } from '../../fixtures/lifecycle-runtime.js';

/** Runs one case in an isolated temporary repository and removes it afterwards. */
function withTemporaryRepository(run: (root: string) => void): void {
  const root = mkdtempSync(resolve(tmpdir(), 'porta-coverage-capture-'));
  try {
    mkdirSync(resolve(root, 'test-harness/.assurance-results'), { recursive: true });
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
    assert.equal(coverageEnvironment(workspace).HARNESS_COVERAGE_RESULT_DIR, workspace.root);
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
