import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import test from 'node:test';

import {
  assuranceCommandActions,
  commandContracts,
  exitPrecedence,
  exitTaxonomy,
  rootAliasForAction,
} from '../commands.js';
import { runManagedChild } from '../scripts/managed-child.js';

/** Repository-relative shared dispatcher used by root assurance aliases. */
const runner = 'test-harness/assurance/scripts/run-command.ts';

test('should map every allowlisted action to one complete root contract', () => {
  for (const action of assuranceCommandActions) {
    const alias = rootAliasForAction(action);
    const contract = commandContracts[alias];

    assert.ok(contract, `${alias} must have a command contract`);
    assert.notEqual(contract.timeout, '');
    assert.notEqual(contract.artifactSubdirectory, '');
    assert.ok(contract.prerequisites.length > 0);
  }
});

test('should retain distinct stable exits in documented precedence order', () => {
  assert.equal(new Set(Object.keys(exitTaxonomy)).size, Object.keys(exitTaxonomy).length);
  assert.deepEqual(exitPrecedence, [60, 130, 143, 70, 50, 40, 30, 20, 21]);
  assert.equal(exitTaxonomy[60], 'cleanup-failure');
  assert.equal(exitTaxonomy[30], 'setup-failure');
  assert.equal(exitTaxonomy[20], 'product-failure');
  assert.equal(exitTaxonomy[21], 'test-failure');
});

test('should reject unregistered selectors without evaluating them', () => {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', runner, 'test', '--select', '../packages/server/src/index.ts'],
    { cwd: process.cwd(), encoding: 'utf8' },
  );

  assert.equal(result.status, 30);
  assert.match(result.stderr, /ASSURANCE_SELECTOR_UNREGISTERED/);
  assert.doesNotMatch(result.stderr, /packages\/server\/src\/index\.ts.*(?:import|execut)/i);
});

test('should expose registered contracts without starting command handlers', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', runner, '--describe-all'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  const description = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(description.commands).sort(), Object.keys(commandContracts).sort());
  assert.equal(result.stderr, '');
});

test('should keep internal Node collection disjoint from Playwright journeys', () => {
  const dispatcher = readFileSync(runner, 'utf8');
  const playwright = readFileSync('test-harness/playwright.config.ts', 'utf8');
  const internalTests = [
    'assurance.spec.test.ts',
    'assurance-foundation.impl.test.ts',
    'commands.impl.test.ts',
    'evidence.impl.test.ts',
    'governance.impl.test.ts',
  ];

  for (const filename of internalTests) {
    assert.equal(
      dispatcher.split(filename).length - 1,
      1,
      `${filename} must be collected by exactly one registered suite`,
    );
  }
  assert.match(playwright, /testDir:\s*['"]\.\/tests['"]/u);
  assert.doesNotMatch(playwright, /assurance\/tests|\.impl\.test\.ts/u);
});

test('should kill a timeout-resistant child group after the bounded grace period', async () => {
  const outcome = await runManagedChild(
    process.execPath,
    ['-e', "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"],
    {
      cwd: process.cwd(),
      stdio: 'ignore',
      timeoutMilliseconds: 50,
      terminationGraceMilliseconds: 50,
      cleanup: () => undefined,
    },
  );

  assert.equal(outcome.timedOut, true);
  assert.equal(outcome.signal, 'SIGKILL');
  assert.equal(outcome.cleanupFailed, false);
});

test('should retain cleanup failure as the highest-precedence managed-child outcome', async () => {
  const outcome = await runManagedChild(process.execPath, ['-e', ''], {
    cwd: process.cwd(),
    stdio: 'ignore',
    timeoutMilliseconds: 1_000,
    terminationGraceMilliseconds: 50,
    cleanup: () => {
      throw new Error('owned cleanup failed');
    },
  });

  assert.equal(outcome.code, 0);
  assert.equal(outcome.cleanupFailed, true);
});
