import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { inspectFoundationProvenance } from '../scripts/foundation-artifacts.js';
import { redactEvidence } from '../scripts/redact-evidence.js';
import { renderJson, renderSummary } from '../scripts/render-summary.js';
import { validateRepositoryReference } from '../scripts/validate-assurance.js';

/** Creates a minimal committed worktree containing every provenance-owned input class. */
function createProvenanceRepository(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(resolve(tmpdir(), 'porta-assurance-provenance-'));
  mkdirSync(resolve(root, 'test-harness/assurance'), { recursive: true });
  writeFileSync(resolve(root, 'package.json'), '{}\n');
  writeFileSync(resolve(root, 'yarn.lock'), '# lock\n');
  writeFileSync(resolve(root, 'test-harness/eslint.config.js'), 'export default [];\n');
  writeFileSync(resolve(root, 'test-harness/tsconfig.assurance.json'), '{}\n');
  writeFileSync(resolve(root, 'test-harness/assurance/tool.ts'), 'export const value = 1;\n');
  writeFileSync(resolve(root, '.gitignore'), 'test-harness/.assurance-results/\n');
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'assurance@example.test'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Assurance Test'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'test fixture'], { cwd: root });
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('should bind clean committed source and reject unstaged, staged, or untracked changes', () => {
  for (const mutation of ['unstaged', 'staged', 'untracked'] as const) {
    const repository = createProvenanceRepository();
    try {
      const first = inspectFoundationProvenance(repository.root);
      assert.deepEqual(inspectFoundationProvenance(repository.root), first);
      if (mutation === 'untracked') {
        writeFileSync(resolve(repository.root, 'untracked.txt'), 'untracked\n');
      } else {
        writeFileSync(
          resolve(repository.root, 'test-harness/assurance/tool.ts'),
          'export const value = 2;\n',
        );
        if (mutation === 'staged') {
          execFileSync('git', ['add', 'test-harness/assurance/tool.ts'], { cwd: repository.root });
        }
      }
      assert.throws(() => inspectFoundationProvenance(repository.root), /clean source tree/i);
    } finally {
      repository.cleanup();
    }
  }
});

test('should ignore owned result residue while retaining stable source-tree provenance', () => {
  const repository = createProvenanceRepository();
  try {
    const before = inspectFoundationProvenance(repository.root);
    mkdirSync(resolve(repository.root, 'test-harness/.assurance-results/run'), { recursive: true });
    writeFileSync(
      resolve(repository.root, 'test-harness/.assurance-results/run/result.json'),
      '{}',
    );
    assert.deepEqual(inspectFoundationProvenance(repository.root), before);
  } finally {
    repository.cleanup();
  }
});

test('should reject non-canonical and nonexistent repository references', () => {
  const sandbox = mkdtempSync(resolve(tmpdir(), 'porta-assurance-canonical-'));
  try {
    mkdirSync(resolve(sandbox, 'test-harness/assurance/tests'), { recursive: true });
    writeFileSync(resolve(sandbox, 'test-harness/assurance/tests/example.ts'), 'example');
    const options = { repositoryRoot: sandbox, allowedRoot: 'test-harness/assurance' };

    for (const reference of [
      'test-harness//assurance/tests/example.ts',
      'test-harness/assurance/./tests/example.ts',
      'test-harness/assurance/tests/missing.ts',
    ]) {
      assert.throws(() => validateRepositoryReference(reference, options));
    }
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('should redact embedded credentials, tokens, and secret query parameters', () => {
  const evidence = {
    log: [
      'Authorization: Bearer sample-access-token',
      'postgres://porta:database-secret@localhost/porta',
      'https://example.test/callback?code=authorization-code&safe=value',
      'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature',
    ],
  };
  const output = JSON.stringify(redactEvidence(evidence));

  for (const secret of [
    'sample-access-token',
    'database-secret',
    'authorization-code',
    'eyJhbGciOiJFUzI1NiJ9',
  ]) {
    assert.doesNotMatch(output, new RegExp(secret));
  }
  assert.match(output, /safe=value/);
});

test('should never invoke accessors while sanitizing evidence', () => {
  const evidence = Object.create(null);
  Object.defineProperty(evidence, 'unsafe', {
    enumerable: true,
    get(): never {
      throw new Error('accessor must not execute');
    },
  });

  assert.deepEqual(redactEvidence(evidence), { unsafe: '[REDACTED:ACCESSOR]' });
});

test('should render nested records deterministically and escape Markdown HTML', () => {
  const first = { z: '<script>', nested: { b: 2, a: 1 } };
  const reordered = { nested: { a: 1, b: 2 }, z: '<script>' };

  assert.equal(renderJson(first), renderJson(reordered));
  assert.equal(renderSummary(first), renderSummary(reordered));
  assert.doesNotMatch(renderSummary(first), /<script>/);
  assert.match(renderSummary(first), /&lt;script&gt;/);
});
