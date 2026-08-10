import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { redactEvidence } from '../scripts/redact-evidence.js';
import { renderJson, renderSummary } from '../scripts/render-summary.js';
import { validateRepositoryReference } from '../scripts/validate-assurance.js';

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
