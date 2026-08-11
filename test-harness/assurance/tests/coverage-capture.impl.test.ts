import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { createCoverageWorkspace, coverageEnvironment } from '../coverage/index.js';
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

test('should create one ignored run-owned raw and compiled workspace', () => {
  withTemporaryRepository((root) => {
    const workspace = createCoverageWorkspace(root, 'protocol', 'operational');

    assert.match(workspace.runId, /^[0-9a-f-]{36}$/u);
    assert.ok(workspace.root.startsWith(resolve(root, 'test-harness/.assurance-results/')));
    assert.equal(workspace.rawDirectory, resolve(workspace.root, 'raw'));
    assert.equal(workspace.compiledDirectory, resolve(workspace.root, 'compiled'));
    assert.equal(statSync(workspace.rawDirectory).mode & 0o777, 0o777);
    assert.equal(statSync(workspace.compiledDirectory).mode & 0o777, 0o700);
    assert.equal(coverageEnvironment(workspace).HARNESS_COVERAGE_RAW_DIR, workspace.rawDirectory);
  });
});

test('should allow only a canonical assurance-result directory as the coverage bind source', () => {
  withTemporaryRepository((root) => {
    const workspace = createCoverageWorkspace(root, 'security', 'production-security');
    const original = process.env.HARNESS_COVERAGE_RAW_DIR;
    try {
      process.env.HARNESS_COVERAGE_RAW_DIR = workspace.rawDirectory;
      const environment = environmentForManifest(endpointManifest(root));
      assert.equal(environment.HARNESS_COVERAGE_RAW_DIR, workspace.rawDirectory);
      assert.equal(environment.HARNESS_NODE_V8_COVERAGE, '/app/.v8-coverage');

      process.env.HARNESS_COVERAGE_RAW_DIR = resolve(root, 'outside');
      mkdirSync(process.env.HARNESS_COVERAGE_RAW_DIR);
      assert.throws(
        () => environmentForManifest(endpointManifest(root)),
        /inside the assurance results root/u,
      );
    } finally {
      if (original === undefined) delete process.env.HARNESS_COVERAGE_RAW_DIR;
      else process.env.HARNESS_COVERAGE_RAW_DIR = original;
    }
  });
});

test('should configure NODE_V8_COVERAGE only on the Porta service', () => {
  const compose = readFileSync(resolve(import.meta.dirname, '../../docker-compose.yml'), 'utf8');
  assert.equal(compose.match(/^\s+NODE_V8_COVERAGE:/gmu)?.length, 1);
  assert.match(
    compose,
    /\n {2}porta:\n[\s\S]*?NODE_V8_COVERAGE:[\s\S]*?HARNESS_COVERAGE_RAW_DIR[\s\S]*?\n {2}postgres:/u,
  );
});
