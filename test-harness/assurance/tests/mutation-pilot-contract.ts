/** Stable selector accepted by the bounded test-sensitivity pilot. */
export type MutationPilotSelector = 'bounded-pilot';

/** One explicitly approved source file and its focused immutable test file. */
export interface MutationPilotTarget {
  /** Repository-relative TypeScript source path that may be varied. */
  readonly sourcePath: string;
  /** Repository-relative test path selected for this source file. */
  readonly testPath: string;
  /** Human-readable purpose that distinguishes pure logic from a security boundary. */
  readonly purpose: 'pure-logic' | 'authorization-boundary';
}

/** Immutable description of the local tool capability before any live run. */
export interface MutationPilotCapability {
  /** Closed root selector. */
  readonly selector: MutationPilotSelector;
  /** Exact package and version selected for the evaluation. */
  readonly runner: {
    readonly packageName: '@stryker-mutator/core';
    readonly runnerPackageName: '@stryker-mutator/vitest-runner';
    readonly version: '9.6.1';
  };
  /** Exact source and test pairs admitted by the pilot. */
  readonly targets: readonly MutationPilotTarget[];
  /** Execution isolation required before a live result can be admitted. */
  readonly isolation: 'clean-detached-worktree';
  /** Stable per-variation result vocabulary. */
  readonly classifications: readonly ['killed', 'survived', 'invalid', 'no-coverage', 'timeout'];
  /** Pilot-level decision vocabulary; no numeric quality threshold is implied. */
  readonly decisions: readonly ['go', 'no-go'];
  /** Evidence safety and cleanup invariants enforced by the live command. */
  readonly evidence: {
    readonly machineReadable: true;
    readonly artifactMode: 0o600;
    readonly atomicWrite: true;
    readonly primaryTreeMustRemainClean: true;
    readonly rawDiagnosticsRetained: false;
    readonly modifiedProductSourceRetained: false;
  };
}

/** Stable capability seam implemented before clean-revision execution. */
export interface MutationPilotContract {
  /** Returns the closed capability declaration without running the external tool. */
  describe(): MutationPilotCapability;
  /** Returns true only for one exact approved source/test pair. */
  acceptsTarget(target: MutationPilotTarget): boolean;
}
