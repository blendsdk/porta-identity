import type {
  CommandOutcomeClass,
  CommandOutcomeScenario,
  CommandOutcomeStage,
  GovernedAssuranceAlias,
} from '../tests/command-outcome-matrix-contract.js';

/** One implementation-owned stage in a root command lifecycle. */
export interface CommandStageRegistration {
  /** Root alias that owns the stage. */
  readonly alias: GovernedAssuranceAlias;
  /** Stable stage identifier. */
  readonly stageId: string;
  /** Whether the stage owns a child process or disposable external resource. */
  readonly resourceOwning: boolean;
  /** Repository-relative implementation module grounding the stage. */
  readonly sourceModule: string;
}

/** One terminal event reduced under the shared precedence policy. */
export interface CommandTerminalEvent {
  /** Exit code associated with the event. */
  readonly exitCode: 20 | 21 | 30 | 40 | 50 | 60 | 70 | 130 | 143;
  /** Stable outcome class. */
  readonly classification: Exclude<CommandOutcomeClass, 'success'>;
  /** Stage at which the event occurred. */
  readonly stage: Exclude<CommandOutcomeStage, 'complete'>;
}

/** Final terminal result selected from simultaneous events. */
export interface ReducedCommandOutcome {
  /** Winning exit code, or zero when no failure event exists. */
  readonly exitCode: 0 | 20 | 21 | 30 | 40 | 50 | 60 | 70 | 130 | 143;
  /** Winning stable class. */
  readonly classification: CommandOutcomeClass;
  /** Winning stage. */
  readonly stage: CommandOutcomeStage;
}

/** Sanitized result for one immutable alias/scenario row. */
export interface CommandOutcomeCaseEvidence {
  /** Root alias under evaluation. */
  readonly alias: GovernedAssuranceAlias;
  /** Forced terminal scenario. */
  readonly scenario: CommandOutcomeScenario;
  /** Whether the pair executed or remained explicitly unsupported. */
  readonly executionStatus: 'completed' | 'unsupported';
  /** Observed exit code for a completed pair. */
  readonly exitCode?: number;
  /** Observed class for a completed pair. */
  readonly classification?: CommandOutcomeClass;
  /** Observed stage for a completed pair. */
  readonly stage?: CommandOutcomeStage;
  /** Whether the observation matched the immutable oracle. */
  readonly matched: boolean;
}

/** Sanitized result for one command stage and one signal. */
export interface CommandSignalCaseEvidence {
  /** Root alias owning the registered stage. */
  readonly alias: GovernedAssuranceAlias;
  /** Registered stage identifier. */
  readonly stageId: string;
  /** Signal delivered to the isolated process group. */
  readonly signal: 'SIGINT' | 'SIGTERM';
  /** Whether the stage ran or was explicitly non-resource-owning. */
  readonly executionStatus: 'completed' | 'not-applicable';
  /** Observed exit code for a completed signal probe. */
  readonly exitCode?: 130 | 143;
  /** Whether exact owned-resource absence was proved. */
  readonly ownedResourceRemoved: boolean;
  /** Whether the foreign-owner decoy remained byte-identical. */
  readonly foreignOwnerPreserved: boolean;
}

/** Owner-only aggregate artifact for the terminal-protocol campaign. */
export interface CommandOutcomeCampaignArtifact {
  /** Evidence schema version. */
  readonly schemaVersion: 1;
  /** Campaign owner UUID. */
  readonly runId: string;
  /** Explicit boundary preventing real alias or registered-stage behavior credit. */
  readonly evidenceScope: 'terminal-reducer-and-isolated-signal-probe-only';
  /** Actual governed aliases are never invoked by this bounded campaign. */
  readonly actualAliasesExecuted: false;
  /** Signal probes own synthetic resources and never execute registered stage modules. */
  readonly actualRegisteredStagesExecuted: false;
  /** Named gap retained until real command stages receive independent signal evidence. */
  readonly unresolvedGapId: 'real-command-stage-signal-observation-unqualified';
  /** Hash-only primary repository fingerprint before and after the campaign. */
  readonly primaryFingerprint: {
    readonly before: string;
    readonly after: string;
    readonly unchanged: boolean;
  };
  /** Exact immutable matrix results. */
  readonly outcomes: readonly CommandOutcomeCaseEvidence[];
  /** Exact registered stage/signal results. */
  readonly signals: readonly CommandSignalCaseEvidence[];
  /** Whether the deliberate cleanup-failure case was recovered exactly. */
  readonly recoveryVerified: boolean;
  /** Whether the second-owner decoy survived every case unchanged. */
  readonly foreignOwnerPreserved: boolean;
  /** Whether all campaign-owned runtime resources were removed. */
  readonly ownedResourcesRemoved: boolean;
  /** Owner-only artifact mode. */
  readonly artifactMode: 0o600;
  /** Whether publication used atomic rename. */
  readonly atomicWrite: true;
  /** Raw child output is never retained. */
  readonly rawDiagnosticsRetained: false;
}
