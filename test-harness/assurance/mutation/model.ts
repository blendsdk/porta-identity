/** Stable mutation status retained after raw tool output is discarded. */
export type MutationPilotClassification =
  'killed' | 'survived' | 'invalid' | 'no-coverage' | 'timeout';

/** Count-only result for one exact allowlisted source file. */
export interface MutationPilotTargetResult {
  /** Repository-relative allowlisted source path. */
  readonly sourcePath: string;
  /** Number of generated variations per stable classification. */
  readonly classifications: Readonly<Record<MutationPilotClassification, number>>;
  /** Total generated variations for this target. */
  readonly total: number;
}

/** Sanitized output emitted by the isolated Stryker worker. */
export interface MutationPilotWorkerResult {
  /** Worker schema version. */
  readonly schemaVersion: 1;
  /** Whether the pinned runner completed its project compatibility check. */
  readonly compatibility: 'compatible' | 'incompatible';
  /** Count-only result for every registered target. */
  readonly targets: readonly MutationPilotTargetResult[];
}

/** Complete owner-only result returned by the root command. */
export interface MutationPilotArtifact {
  /** Evidence schema version. */
  readonly schemaVersion: 1;
  /** UUID that owns runtime and result resources. */
  readonly runId: string;
  /** Exact closed selector. */
  readonly selector: 'bounded-pilot';
  /** Final evaluation decision, independent of any global mutation score. */
  readonly decision: 'go' | 'no-go';
  /** Closed reason explaining the decision without raw diagnostics. */
  readonly reason:
    | 'compatible-useful-results'
    | 'no-generated-variations'
    | 'runner-incompatible'
    | 'target-without-observable-result';
  /** Clean source and tool identities captured before execution. */
  readonly provenance: {
    readonly commitIdentity: string;
    readonly treeIdentity: string;
    readonly assuranceToolDigest: string;
    readonly dependencyLockDigest: string;
    readonly runnerVersion: '9.6.1';
    readonly runnerPackageVersion: '9.6.1';
  };
  /** Count-only target results; no raw replacement or source text is retained. */
  readonly targets: readonly MutationPilotTargetResult[];
  /** Whether execution used a fresh detached worktree. */
  readonly freshDetachedWorktree: true;
  /** Whether primary source identity remained unchanged after cleanup. */
  readonly primaryTreeUnchanged: boolean;
  /** Whether every owned runtime resource was removed. */
  readonly ownedResourcesRemoved: boolean;
  /** Sanitized residue kinds, empty on complete cleanup. */
  readonly residue: readonly ('worktree' | 'runtime')[];
  /** Bounded owner-validated recovery command when cleanup is incomplete. */
  readonly recoveryCommand?: string;
  /** Owner-only artifact mode. */
  readonly artifactMode: 0o600;
  /** Whether publication used an atomic rename. */
  readonly atomicWrite: true;
  /** Explicit evidence statement that raw diagnostics were discarded. */
  readonly rawDiagnosticsRetained: false;
  /** Explicit evidence statement that modified source was discarded. */
  readonly modifiedProductSourceRetained: false;
}

/** Stable command result consumed by the root dispatcher. */
export interface MutationPilotCommandResult {
  /** UUID owning the command outcome. */
  readonly runId: string;
  /** Stable process exit code. */
  readonly exitCode: 0 | 30 | 50 | 60 | 70 | 130 | 143;
  /** Repository-relative artifact path when evaluation reached publication. */
  readonly artifactPath?: string;
  /** Final pilot decision when evaluation reached publication. */
  readonly decision?: 'go' | 'no-go';
  /** Bounded recovery command when automatic cleanup failed. */
  readonly recoveryCommand?: string;
}
