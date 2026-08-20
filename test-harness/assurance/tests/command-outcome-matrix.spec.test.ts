import assert from 'node:assert/strict';
import test from 'node:test';

import {
  commandOutcomeEvidenceBoundary,
  commandOutcomeForbiddenEvidenceFields,
  commandOutcomeMatrixRequirement,
} from './command-outcome-matrix-requirements.js';

test('limits campaign credit to reducer and isolated probe behavior', () => {
  assert.deepEqual(commandOutcomeEvidenceBoundary, {
    scope: 'terminal-reducer-and-isolated-signal-probe-only',
    actualAliasesExecuted: false,
    actualRegisteredStagesExecuted: false,
    unresolvedGapId: 'real-command-stage-signal-observation-unqualified',
  });
});

test('defines every alias and terminal scenario exactly once', () => {
  const matrix = commandOutcomeMatrixRequirement;
  assert.equal(matrix.aliases.length, 13);
  assert.equal(matrix.scenarios.length, 11);
  assert.equal(matrix.requirements.length, matrix.aliases.length * matrix.scenarios.length);

  const identities = matrix.requirements.map((entry) => `${entry.alias}:${entry.scenario}`);
  assert.equal(new Set(identities).size, identities.length);
  for (const alias of matrix.aliases) {
    for (const scenario of matrix.scenarios) {
      assert.ok(identities.includes(`${alias}:${scenario}`), `${alias}:${scenario}`);
    }
  }
});

test('assigns executable rows one stable exit class and stage', () => {
  for (const requirement of commandOutcomeMatrixRequirement.requirements) {
    if (requirement.disposition === 'unsupported') continue;
    assert.equal(typeof requirement.exitCode, 'number');
    assert.equal(typeof requirement.classification, 'string');
    assert.equal(typeof requirement.stage, 'string');
    assert.notEqual(requirement.artifactStatus, 'not-applicable');
    assert.notEqual(requirement.cleanupStatus, 'not-applicable');
    assert.equal(requirement.unsupportedReason, undefined);
  }
});

test('keeps unsupported pairs explicit and incapable of receiving evidence credit', () => {
  const unsupported = commandOutcomeMatrixRequirement.requirements.filter(
    (requirement) => requirement.disposition === 'unsupported',
  );
  assert.ok(unsupported.length > 0);
  for (const requirement of unsupported) {
    assert.equal(requirement.exitCode, undefined);
    assert.equal(requirement.classification, undefined);
    assert.equal(requirement.stage, undefined);
    assert.equal(requirement.artifactStatus, 'not-applicable');
    assert.equal(requirement.cleanupStatus, 'not-applicable');
    assert.match(requirement.unsupportedReason ?? '', /no truthful .* forcing boundary/i);
  }
});

test('distinguishes all required automated failure classes', () => {
  const executable = commandOutcomeMatrixRequirement.requirements.filter(
    (requirement) => requirement.disposition === 'executable',
  );
  const observed = new Map(
    executable.map((requirement) => [requirement.exitCode, requirement.classification]),
  );
  assert.deepEqual(
    [...observed.entries()].sort(([left], [right]) => (left ?? 0) - (right ?? 0)),
    [
      [0, 'success'],
      [20, 'product-failure'],
      [21, 'test-failure'],
      [30, 'setup-failure'],
      [40, 'coverage-incomplete'],
      [50, 'assurance-invalid'],
      [60, 'cleanup-failure'],
      [70, 'timeout'],
      [130, 'interrupted-sigint'],
      [143, 'interrupted-sigterm'],
    ],
  );
});

test('freezes terminal precedence independently of numeric ordering', () => {
  assert.deepEqual(
    commandOutcomeMatrixRequirement.precedence,
    [60, 130, 143, 70, 50, 40, 30, 20, 21],
  );
  assert.equal(commandOutcomeMatrixRequirement.precedence[0], 60);
  assert.ok(
    commandOutcomeMatrixRequirement.precedence.indexOf(50) <
      commandOutcomeMatrixRequirement.precedence.indexOf(40),
  );
});

test('requires bounded sanitized evidence and recoverable cleanup failures', () => {
  assert.deepEqual(commandOutcomeForbiddenEvidenceFields, [
    'stdout',
    'stderr',
    'stack',
    'absolutePath',
    'password',
    'token',
    'cookie',
    'clientSecret',
    'privateKey',
  ]);
  for (const requirement of commandOutcomeMatrixRequirement.requirements) {
    if (requirement.disposition !== 'executable') continue;
    if (requirement.scenario === 'cleanup-failure') {
      assert.equal(requirement.exitCode, 60);
      assert.equal(requirement.artifactStatus, 'incomplete');
      assert.equal(requirement.cleanupStatus, 'recoverable');
    } else {
      assert.equal(requirement.cleanupStatus, 'complete');
    }
  }
});
