import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const dispatcher = 'test-harness/assurance/scripts/run-command.ts';
const assuranceAliases = [
  'all',
  'baseline',
  'compat',
  'coverage',
  'fault',
  'harness',
  'mutation',
  'red',
  'report',
  'stability',
  'test',
  'validate',
];

/** Reads a repository JSON file required by the root assurance contract. */
function readRepositoryJson(repositoryPath) {
  return JSON.parse(readFileSync(resolve(repositoryRoot, repositoryPath), 'utf8'));
}

test('should root-own assurance dependencies without creating another harness workspace', () => {
  const manifest = readRepositoryJson('package.json');

  for (const dependency of ['@typescript/native', '@types/node', 'eslint', 'tsx', 'zod']) {
    assert.equal(typeof manifest.devDependencies?.[dependency], 'string', dependency);
  }
  assert.deepEqual(manifest.workspaces, ['packages/*']);
  assert.equal(existsSync(resolve(repositoryRoot, 'test-harness/package.json')), false);
  assert.equal(existsSync(resolve(repositoryRoot, 'test-harness/yarn.lock')), false);
});

test('should compose root static checks across assurance tooling and active packages', () => {
  const scripts = readRepositoryJson('package.json').scripts ?? {};

  assert.equal(
    scripts.typecheck,
    'node_modules/@typescript/native/bin/tsc --project test-harness/tsconfig.assurance.json --noEmit && turbo run typecheck',
  );
  assert.equal(
    scripts.lint,
    "eslint --config test-harness/eslint.config.js 'test-harness/assurance/**/*.ts' && turbo run lint",
  );
  assert.equal(
    scripts['lint:fix'],
    "eslint --config test-harness/eslint.config.js 'test-harness/assurance/**/*.ts' --fix && turbo run lint:fix",
  );
});

test('should expose the approved aliases while leaving verify unchanged', () => {
  const scripts = readRepositoryJson('package.json').scripts ?? {};

  for (const action of assuranceAliases) {
    assert.equal(scripts[`assurance:${action}`], `tsx ${dispatcher} ${action}`);
  }
  assert.equal(scripts.verify, 'yarn test:structure && turbo run verify');
  assert.doesNotMatch(scripts.verify, /assurance:(?:harness|coverage|fault|compat|stability|all)/);
});
