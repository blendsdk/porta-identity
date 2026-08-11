import type {
  EndpointManifest,
  LeaseRecord,
  LifecycleClassification,
  LifecycleExitCode,
  LifecycleOutcome,
  LifecycleRecoveryLookup,
  LifecycleRecoveryResult,
  LifecycleResetOutcome,
  OwnedRun,
  PrerequisiteName,
  ResetDependencies,
  ResetReport,
} from './lifecycle-planned.js';

/** Stable endpoint order used for complete manifest comparisons. */
const endpointNames = ['porta', 'app', 'bff', 'postgres', 'redis', 'mailhog'] as const;

function ensureStartupActive(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw new StartupTimeoutInterruption();
}

/** Internal timeout carrying only the discriminator consumed by lifecycle classification. */
class StartupTimeoutInterruption extends Error {
  /** Stable interruption kind. */
  public readonly kind = 'timeout';

  /** Creates a non-secret startup timeout. */
  public constructor() {
    super('lifecycle startup deadline expired');
    this.name = 'StartupTimeoutInterruption';
  }
}

/** Internal reset step names retained only while translating failures to stable outcomes. */
type ResetStepName =
  | 'quiesce'
  | 'stop-porta'
  | 'persist-poison'
  | 'flush-poison'
  | 'db-recreate'
  | 'migration'
  | 'bootstrap'
  | 'seed'
  | 'redis'
  | 'mailhog'
  | 'restart-clients'
  | 'restart-porta'
  | 'digest-count-checks'
  | 'public-health'
  | 'verify-traffic-blocked'
  | 'clear-poison'
  | 'flush-ready'
  | 'resume-traffic';

/** Steps at or after the first durable mutation, including all reuse-finalization boundaries. */
const postMutationSteps = new Set<ResetStepName>([
  'db-recreate',
  'migration',
  'bootstrap',
  'seed',
  'redis',
  'mailhog',
  'restart-clients',
  'restart-porta',
  'digest-count-checks',
  'public-health',
  'verify-traffic-blocked',
  'clear-poison',
  'flush-ready',
  'resume-traffic',
]);

/** Mutable private report shape used while the ordered reset gathers non-secret facts. */
interface MutableResetReport {
  runId: string;
  migrationRevision: string;
  migrationDigest?: string;
  fixtureDigest?: string;
  fixtureCounts: Readonly<Record<string, number>>;
  redisKeysRemoved: number;
  mailMessagesRemoved: number;
  identifiers: string[];
}

/** Creates a report using independent expectations rather than observed production values. */
function mutableResetReport(record: LeaseRecord, reset: ResetDependencies): MutableResetReport {
  return {
    runId: record.runId,
    migrationRevision: reset.expectations.migrationRevision,
    fixtureCounts: Object.freeze({}),
    redisKeysRemoved: 0,
    mailMessagesRemoved: 0,
    identifiers: [],
  };
}

/** Converts accumulated reset facts into immutable public evidence. */
function freezeResetReport(report: MutableResetReport): ResetReport {
  return Object.freeze({
    ...report,
    fixtureCounts: Object.freeze({ ...report.fixtureCounts }),
    identifiers: Object.freeze([...report.identifiers]),
  });
}

/** Returns the exact verification prerequisite violated by an observation, when any. */
function verificationMismatch(
  observation: Awaited<ReturnType<ResetDependencies['database']['observe']>>,
  reset: ResetDependencies,
): PrerequisiteName | undefined {
  if (
    observation.migrationRevision !== reset.expectations.migrationRevision ||
    observation.migrationDigest !== reset.expectations.migrationDigest
  ) {
    return 'migration';
  }
  if (
    observation.fixtureDigest !== reset.expectations.fixtureDigest ||
    !sameCounts(observation.fixtureCounts, reset.expectations.fixtureCounts)
  ) {
    return 'fixture-verification';
  }
  return undefined;
}

/** Compares exact synthetic entity counts without accepting missing or extra entities. */
function sameCounts(
  observed: Readonly<Record<string, number>>,
  expected: Readonly<Record<string, number>>,
): boolean {
  const observedNames = Object.keys(observed).sort();
  const expectedNames = Object.keys(expected).sort();
  return (
    sameStrings(observedNames, expectedNames) &&
    expectedNames.every((name) => observed[name] === expected[name])
  );
}

/** Maps a reset interruption to the stable lifecycle taxonomy without retaining its message. */
function resetFailureOutcome(error: unknown, step: ResetStepName): LifecycleOutcome {
  const kind = interruptionKind(error);
  if ((step === 'persist-poison' || step === 'flush-poison') && kind === 'failure') {
    return outcome(60);
  }
  if (kind === 'SIGINT') return outcome(130);
  if (kind === 'SIGTERM') return outcome(143);
  if (kind === 'cancellation' || kind === 'timeout') return outcome(70);
  if (kind === 'unknown') return outcome(60);
  return outcome(30);
}

/** Maps startup deadline and signal failures without retaining adapter diagnostics. */
function interruptionOutcome(error: unknown): LifecycleOutcome {
  const kind = interruptionKind(error);
  if (kind === 'SIGINT') return outcome(130);
  if (kind === 'SIGTERM') return outcome(143);
  if (kind === 'cancellation' || kind === 'timeout') return outcome(70);
  if (kind === 'unknown') return outcome(60);
  return outcome(30);
}

/** Reads only the allowlisted interruption discriminator from an unknown adapter error. */
function interruptionKind(
  error: unknown,
): 'failure' | 'SIGINT' | 'SIGTERM' | 'cancellation' | 'timeout' | 'unknown' {
  if (!(error instanceof Error) || !('kind' in error)) return 'failure';
  const kind = error.kind;
  if (
    kind === 'SIGINT' ||
    kind === 'SIGTERM' ||
    kind === 'cancellation' ||
    kind === 'timeout' ||
    kind === 'unknown'
  ) {
    return kind;
  }
  return 'failure';
}

/** Names the prerequisite whose boundary failed, when the contract defines one. */
function prerequisiteForResetStep(step: ResetStepName): PrerequisiteName | undefined {
  if (step === 'migration') return 'migration';
  if (step === 'seed') return 'seed';
  if (step === 'redis') return 'redis-reset';
  if (step === 'mailhog') return 'mailhog-reset';
  if (step === 'public-health') return 'health';
  return undefined;
}

/** Removes reset-only evidence fields when recovery returns the common lifecycle result. */
function lifecyclePart(resetOutcome: LifecycleResetOutcome): LifecycleOutcome {
  return {
    exitCode: resetOutcome.exitCode,
    classification: resetOutcome.classification,
    primaryExitCode: resetOutcome.primaryExitCode,
    prerequisite: resetOutcome.prerequisite,
    recoveryIdentifiers: resetOutcome.recoveryIdentifiers,
  };
}

/** Returns a post-takeover failure together with the capability needed for exact cleanup. */
function recoveryFailure(record: LeaseRecord, ownedRun: OwnedRun): LifecycleRecoveryResult {
  return { ...cleanupFailure(record), recoveryIdentifiers: safeIds(record), ownedRun };
}

/** Returns the narrow durable lookup derived only from an already-issued ownership record. */
function lookupFor(record: LeaseRecord): LifecycleRecoveryLookup {
  return { runId: record.runId, worktreePath: record.worktreePath };
}

/** Distinguishes a validated lease value from durable-state sentinel strings. */
function isLeaseRecord(
  value: LeaseRecord | 'missing' | 'malformed' | 'incomplete',
): value is LeaseRecord {
  return typeof value !== 'string';
}

/**
 * Compares every ownership dimension before a destructive capability is invoked.
 *
 * The endpoint manifest is included because its ports and paths define the resources that the
 * Compose adapter is allowed to inspect and remove.
 */
function sameLeaseRecord(left: LeaseRecord, right: LeaseRecord): boolean {
  return (
    left.runId === right.runId &&
    left.startupIntentId === right.startupIntentId &&
    left.ownerProcess.pid === right.ownerProcess.pid &&
    left.ownerProcess.startedAtFingerprint === right.ownerProcess.startedAtFingerprint &&
    left.worktreePath === right.worktreePath &&
    left.composeProject === right.composeProject &&
    sameStrings(left.containerIds, right.containerIds) &&
    sameStrings(left.networkIds, right.networkIds) &&
    sameHostProcesses(left.hostProcesses, right.hostProcesses) &&
    sameStrings(left.volumeNames, right.volumeNames) &&
    sameStrings(left.ownedPaths, right.ownedPaths) &&
    left.certificatePath === right.certificatePath &&
    sameManifest(left.manifest, right.manifest)
  );
}

/** Compares PID-reuse-resistant host-process identity sets in stable role order. */
function sameHostProcesses(
  left: LeaseRecord['hostProcesses'],
  right: LeaseRecord['hostProcesses'],
): boolean {
  const render = (identity: LeaseRecord['hostProcesses'][number]): string =>
    `${identity.role}:${identity.pid}:${identity.startedAtFingerprint}`;
  return sameStrings(left.map(render).sort(), right.map(render).sort());
}

/** Compares lease authority while permitting only discovered resource fields to advance. */
function sameLeaseAuthority(left: LeaseRecord, right: LeaseRecord): boolean {
  return (
    left.runId === right.runId &&
    left.ownerProcess.pid === right.ownerProcess.pid &&
    left.ownerProcess.startedAtFingerprint === right.ownerProcess.startedAtFingerprint &&
    left.worktreePath === right.worktreePath &&
    left.composeProject === right.composeProject &&
    sameStrings(left.ownedPaths, right.ownedPaths) &&
    left.certificatePath === right.certificatePath &&
    sameManifest(left.manifest, right.manifest)
  );
}

/** Allows discovery to populate an empty resource dimension but never replace recorded identity. */
function resourceDiscoveryCanAdvance(expected: LeaseRecord, discovered: LeaseRecord): boolean {
  return (
    sameLeaseAuthority(expected, discovered) &&
    (expected.containerIds.length === 0 ||
      sameStrings(expected.containerIds, discovered.containerIds)) &&
    (expected.networkIds.length === 0 || sameStrings(expected.networkIds, discovered.networkIds)) &&
    (expected.hostProcesses.length === 0 ||
      sameHostProcesses(expected.hostProcesses, discovered.hostProcesses)) &&
    (expected.volumeNames.length === 0 || sameStrings(expected.volumeNames, discovered.volumeNames))
  );
}

/** Compares ordered identity lists without accepting missing or additional resources. */
function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Compares the complete immutable endpoint identity used by every lifecycle consumer. */
function sameManifest(left: EndpointManifest, right: EndpointManifest): boolean {
  return (
    left.runId === right.runId &&
    left.scenarioId === right.scenarioId &&
    left.composeProject === right.composeProject &&
    left.worktreePath === right.worktreePath &&
    left.environmentName === right.environmentName &&
    left.certificatePath === right.certificatePath &&
    endpointNames.every((name) => left.ports[name] === right.ports[name]) &&
    endpointNames.every((name) => left.urls[name] === right.urls[name])
  );
}

/** Gives incomplete cleanup precedence while retaining the successful primary operation. */
function cleanupFailure(record: LeaseRecord): LifecycleOutcome {
  return { ...outcome(60, 0), recoveryIdentifiers: safeIds(record) };
}

/** Creates one stable lifecycle result without retaining an exception or sensitive value. */
export function outcome(
  exitCode: LifecycleExitCode,
  primaryExitCode: LifecycleExitCode = exitCode,
): LifecycleOutcome {
  return {
    exitCode,
    classification: classificationForExit(exitCode),
    primaryExitCode,
    recoveryIdentifiers: [],
  };
}

/** Maps stable exits to public result classifications. */
function classificationForExit(exitCode: LifecycleExitCode): LifecycleClassification {
  if (exitCode === 0) return 'success';
  if (exitCode === 20) return 'product-failure';
  if (exitCode === 21) return 'test-failure';
  if (exitCode === 30) return 'setup-failure';
  if (exitCode === 60) return 'cleanup-failure';
  if (exitCode === 70) return 'timeout';
  return 'interrupted';
}

/** Returns exact synthetic identifiers that are safe to show in a recovery report. */
export function safeIds(record: LeaseRecord): readonly string[] {
  return Object.freeze([
    `run:${record.runId}`,
    `compose:${record.composeProject}`,
    ...record.containerIds.map((id) => `container:${id}`),
    ...record.volumeNames.map((name) => `volume:${name}`),
  ]);
}

/** Creates a non-secret empty report for a reset that could not begin. */
function emptyResetReport(runId: string): LifecycleResetOutcome['report'] {
  return {
    runId,
    migrationRevision: '',
    fixtureCounts: {},
    redisKeysRemoved: 0,
    mailMessagesRemoved: 0,
    identifiers: [],
  };
}

export {
  cleanupFailure,
  emptyResetReport,
  ensureStartupActive,
  freezeResetReport,
  interruptionOutcome,
  isLeaseRecord,
  lifecyclePart,
  lookupFor,
  mutableResetReport,
  postMutationSteps,
  prerequisiteForResetStep,
  recoveryFailure,
  resetFailureOutcome,
  resourceDiscoveryCanAdvance,
  sameLeaseAuthority,
  sameLeaseRecord,
  verificationMismatch,
};
export type { ResetStepName };
