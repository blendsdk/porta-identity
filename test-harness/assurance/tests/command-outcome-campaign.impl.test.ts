import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  recoverCommandOutcomeResidue,
  runCommandOutcomeCampaign,
} from '../command-outcomes/campaign.js';
import {
  registeredCommandStages,
  registeredExecutableScenarios,
  terminalEventForScenario,
} from '../command-outcomes/registry.js';
import { reduceCommandTerminalEvents } from '../command-outcomes/reducer.js';
import {
  commandOutcomeMatrixRequirement,
  governedAssuranceAliases,
} from './command-outcome-matrix-requirements.js';

/** Narrows parsed JSON to an ordinary record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

test('should keep the implementation registry equal to the immutable 143-row matrix', () => {
  let observedRows = 0;
  for (const requirement of commandOutcomeMatrixRequirement.requirements) {
    observedRows += 1;
    assert.equal(
      registeredExecutableScenarios[requirement.alias].has(requirement.scenario),
      requirement.disposition === 'executable',
      `${requirement.alias}:${requirement.scenario}`,
    );
  }
  assert.equal(observedRows, 143);
  assert.deepEqual(Object.keys(registeredExecutableScenarios), governedAssuranceAliases);
});

test('should ground every alias in at least one unique registered command stage', () => {
  for (const alias of governedAssuranceAliases) {
    const stages = registeredCommandStages.filter((stage) => stage.alias === alias);
    assert.ok(stages.length > 0, alias);
    assert.equal(new Set(stages.map((stage) => stage.stageId)).size, stages.length, alias);
    for (const stage of stages) {
      assert.equal(statSync(resolve(stage.sourceModule)).isFile(), true, stage.sourceModule);
    }
  }
});

test('should reduce simultaneous outcomes with cleanup and signals ahead of primary failures', () => {
  const events = [
    terminalEventForScenario('assertion-failure'),
    terminalEventForScenario('timeout'),
    terminalEventForScenario('sigterm'),
    terminalEventForScenario('cleanup-failure'),
  ].filter((event) => event !== undefined);
  assert.deepEqual(reduceCommandTerminalEvents(events), {
    exitCode: 60,
    classification: 'cleanup-failure',
    stage: 'cleanup',
  });
});

test('should reject malformed recovery ownership without changing repository state', () => {
  assert.equal(recoverCommandOutcomeResidue(process.cwd(), '../run', '../case'), false);
});

test('should keep campaign forcing controls unavailable to every normal alias', () => {
  for (const alias of governedAssuranceAliases) {
    const action = alias.slice('assurance:'.length);
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'test-harness/assurance/scripts/run-command.ts',
        action,
        '--campaign-probe',
      ],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 5_000 },
    );
    assert.equal(result.status, 30, alias);
    assert.doesNotMatch(
      `${result.stdout}${result.stderr}`,
      /terminal-protocol-only|campaign result/i,
    );
  }
});

test('should retain only reducer and isolated signal-probe evidence', async () => {
  const artifactPath = await runCommandOutcomeCampaign(process.cwd());
  const absolutePath = resolve(artifactPath);
  assert.equal(statSync(absolutePath).mode & 0o777, 0o600);
  const parsed: unknown = JSON.parse(readFileSync(absolutePath, 'utf8'));
  assert.ok(isRecord(parsed));
  assert.equal(parsed.evidenceScope, 'terminal-reducer-and-isolated-signal-probe-only');
  assert.equal(parsed.actualAliasesExecuted, false);
  assert.equal(parsed.actualRegisteredStagesExecuted, false);
  assert.equal(parsed.unresolvedGapId, 'real-command-stage-signal-observation-unqualified');
  assert.equal(parsed.recoveryVerified, true);
  assert.equal(parsed.foreignOwnerPreserved, true);
  assert.equal(parsed.ownedResourcesRemoved, true);
  assert.ok(isRecord(parsed.primaryFingerprint));
  assert.equal(parsed.primaryFingerprint.unchanged, true);
  assert.ok(Array.isArray(parsed.outcomes));
  assert.equal(parsed.outcomes.length, 143);
  assert.ok(Array.isArray(parsed.signals));
  assert.equal(parsed.signals.length, registeredCommandStages.length * 2);
  assert.equal(JSON.stringify(parsed).includes(process.cwd()), false);
});
