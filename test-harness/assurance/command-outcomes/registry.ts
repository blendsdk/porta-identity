import type {
  CommandOutcomeScenario,
  GovernedAssuranceAlias,
} from '../tests/command-outcome-matrix-contract.js';
import type { CommandStageRegistration, CommandTerminalEvent } from './model.js';

/** Creates a typed read-only scenario set for one implementation-owned alias. */
function scenarios(
  ...values: readonly CommandOutcomeScenario[]
): ReadonlySet<CommandOutcomeScenario> {
  return new Set(values);
}

/** Independently registered executable terminal scenarios for each root alias. */
export const registeredExecutableScenarios: Readonly<
  Record<GovernedAssuranceAlias, ReadonlySet<CommandOutcomeScenario>>
> = Object.freeze({
  'assurance:test': scenarios(
    'success',
    'assertion-failure',
    'setup-failure',
    'invalid-evidence',
    'timeout',
    'cleanup-failure',
    'sigint',
    'sigterm',
  ),
  'assurance:red': scenarios(
    'success',
    'assertion-failure',
    'setup-failure',
    'invalid-evidence',
    'timeout',
    'cleanup-failure',
    'sigint',
    'sigterm',
  ),
  'assurance:baseline': scenarios(
    'success',
    'assertion-failure',
    'setup-failure',
    'local-variant-invalid',
    'invalid-evidence',
    'timeout',
    'cleanup-failure',
    'sigint',
    'sigterm',
  ),
  'assurance:validate': scenarios(
    'success',
    'assertion-failure',
    'setup-failure',
    'invalid-evidence',
    'timeout',
    'sigint',
    'sigterm',
  ),
  'assurance:harness': scenarios(
    'success',
    'product-failure',
    'assertion-failure',
    'setup-failure',
    'invalid-evidence',
    'timeout',
    'cleanup-failure',
    'sigint',
    'sigterm',
  ),
  'assurance:coverage': scenarios(
    'success',
    'product-failure',
    'assertion-failure',
    'setup-failure',
    'coverage-incomplete',
    'invalid-evidence',
    'timeout',
    'cleanup-failure',
    'sigint',
    'sigterm',
  ),
  'assurance:fault': scenarios(
    'success',
    'assertion-failure',
    'setup-failure',
    'local-variant-invalid',
    'invalid-evidence',
    'timeout',
    'cleanup-failure',
    'sigint',
    'sigterm',
  ),
  'assurance:mutation': scenarios(
    'success',
    'setup-failure',
    'local-variant-invalid',
    'invalid-evidence',
    'timeout',
    'cleanup-failure',
    'sigint',
    'sigterm',
  ),
  'assurance:control-check': scenarios(
    'success',
    'assertion-failure',
    'setup-failure',
    'local-variant-invalid',
    'invalid-evidence',
    'timeout',
    'cleanup-failure',
    'sigint',
    'sigterm',
  ),
  'assurance:compat': scenarios(
    'success',
    'product-failure',
    'assertion-failure',
    'setup-failure',
    'invalid-evidence',
    'timeout',
    'cleanup-failure',
    'sigint',
    'sigterm',
  ),
  'assurance:report': scenarios(
    'success',
    'assertion-failure',
    'setup-failure',
    'invalid-evidence',
    'timeout',
    'sigint',
    'sigterm',
  ),
  'assurance:stability': scenarios(
    'success',
    'product-failure',
    'assertion-failure',
    'setup-failure',
    'coverage-incomplete',
    'local-variant-invalid',
    'invalid-evidence',
    'timeout',
    'cleanup-failure',
    'sigint',
    'sigterm',
  ),
  'assurance:all': scenarios(
    'success',
    'product-failure',
    'assertion-failure',
    'setup-failure',
    'coverage-incomplete',
    'local-variant-invalid',
    'invalid-evidence',
    'timeout',
    'cleanup-failure',
    'sigint',
    'sigterm',
  ),
});

/** Implementation-owned lifecycle stages grounded in the modules that own their cleanup. */
export const registeredCommandStages: readonly CommandStageRegistration[] = Object.freeze([
  {
    alias: 'assurance:test',
    stageId: 'child',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/scripts/managed-child.ts',
  },
  {
    alias: 'assurance:red',
    stageId: 'child',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/scripts/managed-child.ts',
  },
  {
    alias: 'assurance:baseline',
    stageId: 'child',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/scripts/managed-child.ts',
  },
  {
    alias: 'assurance:validate',
    stageId: 'dispatch',
    resourceOwning: false,
    sourceModule: 'test-harness/assurance/scripts/run-command.ts',
  },
  {
    alias: 'assurance:harness',
    stageId: 'start',
    resourceOwning: true,
    sourceModule: 'test-harness/fixtures/lifecycle-runtime.ts',
  },
  {
    alias: 'assurance:harness',
    stageId: 'project',
    resourceOwning: true,
    sourceModule: 'test-harness/scripts/lifecycle.ts',
  },
  {
    alias: 'assurance:harness',
    stageId: 'cleanup',
    resourceOwning: true,
    sourceModule: 'test-harness/fixtures/lifecycle-runtime.ts',
  },
  {
    alias: 'assurance:coverage',
    stageId: 'stack',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/coverage/capture.ts',
  },
  {
    alias: 'assurance:coverage',
    stageId: 'project',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/scripts/run-command.ts',
  },
  {
    alias: 'assurance:coverage',
    stageId: 'flush',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/coverage/capture.ts',
  },
  {
    alias: 'assurance:coverage',
    stageId: 'conversion',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/coverage/conversion.ts',
  },
  {
    alias: 'assurance:coverage',
    stageId: 'cleanup',
    resourceOwning: true,
    sourceModule: 'test-harness/fixtures/lifecycle-runtime.ts',
  },
  {
    alias: 'assurance:fault',
    stageId: 'worktree',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/fault/runner.ts',
  },
  {
    alias: 'assurance:fault',
    stageId: 'build',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/fault/runner.ts',
  },
  {
    alias: 'assurance:fault',
    stageId: 'execution',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/fault/runner.ts',
  },
  {
    alias: 'assurance:fault',
    stageId: 'cleanup',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/fault/runner.ts',
  },
  {
    alias: 'assurance:mutation',
    stageId: 'worktree',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/mutation/runner.ts',
  },
  {
    alias: 'assurance:mutation',
    stageId: 'runner',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/mutation/runner.ts',
  },
  {
    alias: 'assurance:mutation',
    stageId: 'cleanup',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/mutation/runner.ts',
  },
  {
    alias: 'assurance:control-check',
    stageId: 'worktree',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/control-sensitivity/local-runtime.ts',
  },
  {
    alias: 'assurance:control-check',
    stageId: 'build',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/control-sensitivity/executor.ts',
  },
  {
    alias: 'assurance:control-check',
    stageId: 'lifecycle',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/control-sensitivity/local-runtime.ts',
  },
  {
    alias: 'assurance:control-check',
    stageId: 'check',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/control-sensitivity/executor.ts',
  },
  {
    alias: 'assurance:control-check',
    stageId: 'cleanup',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/control-sensitivity/local-runtime.ts',
  },
  {
    alias: 'assurance:compat',
    stageId: 'package',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/compat/consumer.ts',
  },
  {
    alias: 'assurance:compat',
    stageId: 'consumer',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/compat/consumer.ts',
  },
  {
    alias: 'assurance:compat',
    stageId: 'journey',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/compat/command.ts',
  },
  {
    alias: 'assurance:compat',
    stageId: 'cleanup',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/compat/consumer.ts',
  },
  {
    alias: 'assurance:report',
    stageId: 'dispatch',
    resourceOwning: false,
    sourceModule: 'test-harness/assurance/scripts/run-command.ts',
  },
  {
    alias: 'assurance:stability',
    stageId: 'child',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/scripts/managed-child.ts',
  },
  {
    alias: 'assurance:stability',
    stageId: 'cleanup',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/scripts/managed-child.ts',
  },
  {
    alias: 'assurance:all',
    stageId: 'child',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/scripts/managed-child.ts',
  },
  {
    alias: 'assurance:all',
    stageId: 'cleanup',
    resourceOwning: true,
    sourceModule: 'test-harness/assurance/scripts/managed-child.ts',
  },
]);

/** Creates the terminal event used to force one executable scenario. */
export function terminalEventForScenario(
  scenario: CommandOutcomeScenario,
): CommandTerminalEvent | undefined {
  switch (scenario) {
    case 'success':
      return undefined;
    case 'product-failure':
      return { exitCode: 20, classification: 'product-failure', stage: 'product' };
    case 'assertion-failure':
      return { exitCode: 21, classification: 'test-failure', stage: 'oracle' };
    case 'setup-failure':
      return { exitCode: 30, classification: 'setup-failure', stage: 'prerequisite' };
    case 'coverage-incomplete':
      return { exitCode: 40, classification: 'coverage-incomplete', stage: 'coverage' };
    case 'local-variant-invalid':
      return { exitCode: 50, classification: 'assurance-invalid', stage: 'local-variant' };
    case 'invalid-evidence':
      return { exitCode: 50, classification: 'assurance-invalid', stage: 'evidence' };
    case 'timeout':
      return { exitCode: 70, classification: 'timeout', stage: 'runtime' };
    case 'cleanup-failure':
      return { exitCode: 60, classification: 'cleanup-failure', stage: 'cleanup' };
    case 'sigint':
      return { exitCode: 130, classification: 'interrupted-sigint', stage: 'signal' };
    case 'sigterm':
      return { exitCode: 143, classification: 'interrupted-sigterm', stage: 'signal' };
  }
}
