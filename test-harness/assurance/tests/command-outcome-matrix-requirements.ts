import type {
  CommandOutcomeClass,
  CommandOutcomeMatrixContract,
  CommandOutcomeRequirement,
  CommandOutcomeScenario,
  CommandOutcomeStage,
  GovernedAssuranceAlias,
} from './command-outcome-matrix-contract.js';

/** Exact root aliases included in the reliability contract. */
export const governedAssuranceAliases: readonly GovernedAssuranceAlias[] = Object.freeze([
  'assurance:test',
  'assurance:red',
  'assurance:baseline',
  'assurance:validate',
  'assurance:harness',
  'assurance:coverage',
  'assurance:fault',
  'assurance:mutation',
  'assurance:control-check',
  'assurance:compat',
  'assurance:report',
  'assurance:stability',
  'assurance:all',
]);

/** Exact terminal scenarios included in the reliability contract. */
export const commandOutcomeScenarios: readonly CommandOutcomeScenario[] = Object.freeze([
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
]);

/** Stable exit metadata for each executable terminal scenario. */
const scenarioOutcomes: Readonly<
  Record<
    CommandOutcomeScenario,
    {
      readonly exitCode: 0 | 20 | 21 | 30 | 40 | 50 | 60 | 70 | 130 | 143;
      readonly classification: CommandOutcomeClass;
      readonly stage: CommandOutcomeStage;
    }
  >
> = Object.freeze({
  success: { exitCode: 0, classification: 'success', stage: 'complete' },
  'product-failure': { exitCode: 20, classification: 'product-failure', stage: 'product' },
  'assertion-failure': { exitCode: 21, classification: 'test-failure', stage: 'oracle' },
  'setup-failure': { exitCode: 30, classification: 'setup-failure', stage: 'prerequisite' },
  'coverage-incomplete': {
    exitCode: 40,
    classification: 'coverage-incomplete',
    stage: 'coverage',
  },
  'local-variant-invalid': {
    exitCode: 50,
    classification: 'assurance-invalid',
    stage: 'local-variant',
  },
  'invalid-evidence': { exitCode: 50, classification: 'assurance-invalid', stage: 'evidence' },
  timeout: { exitCode: 70, classification: 'timeout', stage: 'runtime' },
  'cleanup-failure': { exitCode: 60, classification: 'cleanup-failure', stage: 'cleanup' },
  sigint: { exitCode: 130, classification: 'interrupted-sigint', stage: 'signal' },
  sigterm: { exitCode: 143, classification: 'interrupted-sigterm', stage: 'signal' },
});

/** Scenarios with an executable forcing mechanism for each alias. */
const executableScenarios: Readonly<
  Record<GovernedAssuranceAlias, ReadonlySet<CommandOutcomeScenario>>
> = Object.freeze({
  'assurance:test': new Set<CommandOutcomeScenario>([
    'success',
    'assertion-failure',
    'setup-failure',
    'invalid-evidence',
    'timeout',
    'cleanup-failure',
    'sigint',
    'sigterm',
  ]),
  'assurance:red': new Set<CommandOutcomeScenario>([
    'success',
    'assertion-failure',
    'setup-failure',
    'invalid-evidence',
    'timeout',
    'cleanup-failure',
    'sigint',
    'sigterm',
  ]),
  'assurance:baseline': new Set<CommandOutcomeScenario>([
    'success',
    'assertion-failure',
    'setup-failure',
    'local-variant-invalid',
    'invalid-evidence',
    'timeout',
    'cleanup-failure',
    'sigint',
    'sigterm',
  ]),
  'assurance:validate': new Set<CommandOutcomeScenario>([
    'success',
    'assertion-failure',
    'setup-failure',
    'invalid-evidence',
    'timeout',
    'sigint',
    'sigterm',
  ]),
  'assurance:harness': new Set<CommandOutcomeScenario>([
    'success',
    'product-failure',
    'assertion-failure',
    'setup-failure',
    'invalid-evidence',
    'timeout',
    'cleanup-failure',
    'sigint',
    'sigterm',
  ]),
  'assurance:coverage': new Set<CommandOutcomeScenario>([
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
  ]),
  'assurance:fault': new Set<CommandOutcomeScenario>([
    'success',
    'assertion-failure',
    'setup-failure',
    'local-variant-invalid',
    'invalid-evidence',
    'timeout',
    'cleanup-failure',
    'sigint',
    'sigterm',
  ]),
  'assurance:mutation': new Set<CommandOutcomeScenario>([
    'success',
    'setup-failure',
    'local-variant-invalid',
    'invalid-evidence',
    'timeout',
    'cleanup-failure',
    'sigint',
    'sigterm',
  ]),
  'assurance:control-check': new Set<CommandOutcomeScenario>([
    'success',
    'assertion-failure',
    'setup-failure',
    'local-variant-invalid',
    'invalid-evidence',
    'timeout',
    'cleanup-failure',
    'sigint',
    'sigterm',
  ]),
  'assurance:compat': new Set<CommandOutcomeScenario>([
    'success',
    'product-failure',
    'assertion-failure',
    'setup-failure',
    'invalid-evidence',
    'timeout',
    'cleanup-failure',
    'sigint',
    'sigterm',
  ]),
  'assurance:report': new Set<CommandOutcomeScenario>([
    'success',
    'assertion-failure',
    'setup-failure',
    'invalid-evidence',
    'timeout',
    'sigint',
    'sigterm',
  ]),
  'assurance:stability': new Set<CommandOutcomeScenario>([
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
  ]),
  'assurance:all': new Set(commandOutcomeScenarios),
});

/** Human-readable reason retained for every intentionally unsupported pair. */
function unsupportedReason(
  alias: GovernedAssuranceAlias,
  scenario: CommandOutcomeScenario,
): string {
  return `${alias} has no truthful ${scenario} forcing boundary; the campaign must record it as unsupported`;
}

/** Builds one requirements-only row without consulting command implementation. */
function requirementFor(
  alias: GovernedAssuranceAlias,
  scenario: CommandOutcomeScenario,
): CommandOutcomeRequirement {
  if (!executableScenarios[alias].has(scenario)) {
    return {
      alias,
      scenario,
      disposition: 'unsupported',
      artifactStatus: 'not-applicable',
      cleanupStatus: 'not-applicable',
      unsupportedReason: unsupportedReason(alias, scenario),
    };
  }
  const outcome = scenarioOutcomes[scenario];
  return {
    alias,
    scenario,
    disposition: 'executable',
    ...outcome,
    artifactStatus: scenario === 'success' ? 'complete' : 'incomplete',
    cleanupStatus: scenario === 'cleanup-failure' ? 'recoverable' : 'complete',
  };
}

/** Exact immutable command-outcome cross-product. */
export const commandOutcomeRequirements: readonly CommandOutcomeRequirement[] = Object.freeze(
  governedAssuranceAliases.flatMap((alias) =>
    commandOutcomeScenarios.map((scenario) => Object.freeze(requirementFor(alias, scenario))),
  ),
);

/** Requirement-owned command-outcome contract. */
export const commandOutcomeMatrixRequirement: CommandOutcomeMatrixContract = Object.freeze({
  schemaVersion: 1,
  aliases: governedAssuranceAliases,
  scenarios: commandOutcomeScenarios,
  requirements: commandOutcomeRequirements,
  precedence: Object.freeze([60, 130, 143, 70, 50, 40, 30, 20, 21] as const),
});

/** Evidence fields that no command-outcome artifact may retain. */
export const commandOutcomeForbiddenEvidenceFields = Object.freeze([
  'stdout',
  'stderr',
  'stack',
  'absolutePath',
  'password',
  'token',
  'cookie',
  'clientSecret',
  'privateKey',
] as const);
