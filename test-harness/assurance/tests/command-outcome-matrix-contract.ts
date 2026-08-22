/** Stable root aliases governed by the command-outcome matrix. */
export type GovernedAssuranceAlias =
  | 'assurance:test'
  | 'assurance:red'
  | 'assurance:baseline'
  | 'assurance:validate'
  | 'assurance:harness'
  | 'assurance:coverage'
  | 'assurance:fault'
  | 'assurance:mutation'
  | 'assurance:control-check'
  | 'assurance:compat'
  | 'assurance:report'
  | 'assurance:stability'
  | 'assurance:all';

/** Requirement-level scenarios that can terminate an assurance command. */
export type CommandOutcomeScenario =
  | 'success'
  | 'product-failure'
  | 'assertion-failure'
  | 'setup-failure'
  | 'coverage-incomplete'
  | 'local-variant-invalid'
  | 'invalid-evidence'
  | 'timeout'
  | 'cleanup-failure'
  | 'sigint'
  | 'sigterm';

/** Stable process classes exposed by root assurance commands. */
export type CommandOutcomeClass =
  | 'success'
  | 'product-failure'
  | 'test-failure'
  | 'setup-failure'
  | 'coverage-incomplete'
  | 'assurance-invalid'
  | 'cleanup-failure'
  | 'timeout'
  | 'interrupted-sigint'
  | 'interrupted-sigterm';

/** Stable stage identifying where the terminal outcome arose. */
export type CommandOutcomeStage =
  | 'complete'
  | 'product'
  | 'oracle'
  | 'prerequisite'
  | 'coverage'
  | 'local-variant'
  | 'evidence'
  | 'runtime'
  | 'cleanup'
  | 'signal';

/** One immutable alias/scenario expectation. */
export interface CommandOutcomeRequirement {
  /** Root alias under evaluation. */
  readonly alias: GovernedAssuranceAlias;
  /** Terminal scenario being forced by the later campaign. */
  readonly scenario: CommandOutcomeScenario;
  /** Whether this alias owns a truthful executable form of the scenario. */
  readonly disposition: 'executable' | 'unsupported';
  /** Stable exit code when the scenario is executable. */
  readonly exitCode?: 0 | 20 | 21 | 30 | 40 | 50 | 60 | 70 | 130 | 143;
  /** Stable outcome class when the scenario is executable. */
  readonly classification?: CommandOutcomeClass;
  /** Stage reported when the scenario is executable. */
  readonly stage?: CommandOutcomeStage;
  /** Required artifact condition after execution. */
  readonly artifactStatus: 'complete' | 'incomplete' | 'not-applicable';
  /** Required cleanup condition after execution. */
  readonly cleanupStatus: 'complete' | 'recoverable' | 'not-applicable';
  /** Durable reason for an unsupported pair. */
  readonly unsupportedReason?: string;
}

/** Complete requirements-only matrix consumed by immutable specifications. */
export interface CommandOutcomeMatrixContract {
  /** Matrix schema version. */
  readonly schemaVersion: 1;
  /** Every governed root alias. */
  readonly aliases: readonly GovernedAssuranceAlias[];
  /** Every terminal scenario. */
  readonly scenarios: readonly CommandOutcomeScenario[];
  /** Exact alias/scenario cross-product. */
  readonly requirements: readonly CommandOutcomeRequirement[];
  /** Highest-to-lowest non-success exit precedence. */
  readonly precedence: readonly [60, 130, 143, 70, 50, 40, 30, 20, 21];
}
