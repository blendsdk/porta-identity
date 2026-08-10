import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');

/** Reads a repository JSON file used by an implementation diagnostic. */
function readRepositoryJson(repositoryPath) {
  return JSON.parse(readFileSync(resolve(repositoryRoot, repositoryPath), 'utf8'));
}

test('should route every frozen assurance alias through the shared dispatcher', () => {
  const scripts = readRepositoryJson('package.json').scripts ?? {};
  const runner = 'test-harness/assurance/scripts/run-command.ts';
  const output = execFileSync(process.execPath, ['--import', 'tsx', runner, '--describe-all'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  const contract = JSON.parse(output);

  assert.equal(contract.version, 1);
  assert.deepEqual(Object.keys(contract.commands).sort(), [
    'assurance:all',
    'assurance:baseline',
    'assurance:compat',
    'assurance:coverage',
    'assurance:fault',
    'assurance:harness',
    'assurance:red',
    'assurance:report',
    'assurance:stability',
    'assurance:test',
    'assurance:validate',
  ]);
  for (const alias of Object.keys(contract.commands)) {
    const action = alias.slice('assurance:'.length);
    assert.equal(scripts[alias], `tsx ${runner} ${action}`);
  }
});
