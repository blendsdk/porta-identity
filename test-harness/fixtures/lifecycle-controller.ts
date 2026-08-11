import { dirname, resolve } from 'node:path';

import {
  ownedRunBrand,
  type EndpointManifest,
  type LeaseRecord,
  type LifecycleClassification,
  type LifecycleController,
  type LifecycleDependencies,
  type LifecycleExitCode,
  type LifecycleOutcome,
  type LifecycleRecoveryLookup,
  type LifecycleRecoveryResult,
  type LifecycleResetOutcome,
  type LifecycleStartRequest,
  type LifecycleStartResult,
  type OwnedRun,
  type PrerequisiteName,
  type ResetDependencies,
  type ResetReport,
} from './lifecycle-planned.js';
import {
  createEndpointManifest,
  validateRecoveryLookup,
  validateStartRequest,
} from './lifecycle-validation.js';

const startupPrerequisites = [
  'health',
  'migration',
  'seed',
  'fixture-verification',
] as const satisfies readonly PrerequisiteName[];

/** Stable endpoint order used for complete manifest comparisons. */
const endpointNames = ['porta', 'app', 'bff', 'postgres', 'redis', 'mailhog'] as const;

/** Implements lifecycle policy while delegating every external effect to explicit capabilities. */
export class LifecycleControllerImplementation implements LifecycleController {
  /**
   * Records the complete lease behind each capability created by this controller.
   *
   * A caller receives only the endpoint manifest. Keeping the deletion authority here prevents a
   * structurally similar object from nominating resources for cleanup.
   */
  protected readonly ownedRecords = new WeakMap<OwnedRun, LeaseRecord>();

  /** Creates a controller with one complete set of lifecycle capabilities. */
  public constructor(protected readonly dependencies: LifecycleDependencies) {}

  /** Validates input, leases a complete endpoint block, and starts one owned stack. */
  public async start(request: LifecycleStartRequest): Promise<LifecycleStartResult> {
    try {
      validateStartRequest(request);
    } catch {
      return { outcome: outcome(30) };
    }

    for (let attempt = 0; attempt <= request.collisionRetries; attempt += 1) {
      let manifest: EndpointManifest;
      try {
        manifest = createEndpointManifest(request, attempt);
      } catch {
        return { outcome: outcome(30) };
      }
      if ((await this.dependencies.endpoints.occupiedEndpoints(manifest)).length > 0) continue;

      const record = await this.createLeaseRecord(manifest);
      if ((await this.dependencies.leases.tryAcquire(record)) === 'occupied') continue;
      return this.startAcquiredRecord(record);
    }
    return { outcome: outcome(30) };
  }

  /** Resets every mutable dependency in one quiesced, durably poisoned transaction boundary. */
  public async reset(ownedRun: OwnedRun): Promise<LifecycleResetOutcome> {
    const record = this.ownedRecords.get(ownedRun);
    const reset = this.dependencies.reset;
    if (record === undefined) {
      return { ...outcome(30), report: emptyResetReport(ownedRun.manifest.runId) };
    }
    if (reset === undefined) return this.executePrerequisiteReset(record);
    const state = await reset.state.read(record);
    if (state !== 'ready') {
      return { ...outcome(60), report: emptyResetReport(record.runId) };
    }
    return this.executeReset(record, reset);
  }

  /** Stops and releases only the exact lease represented by a controller-issued capability. */
  public async stop(ownedRun: OwnedRun): Promise<LifecycleOutcome> {
    const expectedRecord = this.ownedRecords.get(ownedRun);
    if (expectedRecord === undefined) return outcome(60);

    if (await this.cleanupOwnedRecord(expectedRecord)) {
      this.ownedRecords.delete(ownedRun);
      return outcome(0);
    }
    return cleanupFailure(expectedRecord);
  }

  /** Reclaims a persisted lease only after both independent ownership probes prove absence. */
  public async recover(lookup: LifecycleRecoveryLookup): Promise<LifecycleRecoveryResult> {
    try {
      validateRecoveryLookup(lookup);
    } catch {
      return outcome(60);
    }
    const persisted = await this.dependencies.leases.read(lookup);
    if (persisted === 'malformed' || persisted === 'incomplete') {
      try {
        return {
          ...outcome(60),
          recoveryIdentifiers: await this.dependencies.leases.quarantine(lookup),
        };
      } catch {
        return outcome(60);
      }
    }
    if (persisted === 'missing') return outcome(60);

    try {
      const [ownerPresence, composeInspection] = await Promise.all([
        this.dependencies.processes.presence(persisted.ownerProcess),
        this.dependencies.compose.inspect(persisted.composeProject),
      ]);
      if (ownerPresence !== 'absent' || composeInspection.presence !== 'absent') {
        return cleanupFailure(persisted);
      }
      const reset = this.dependencies.reset;
      if (reset !== undefined) {
        const resetState = await reset.state.read(persisted);
        if (resetState === 'resetting-poisoned') {
          return this.recreatePoisonedRun(persisted, reset);
        }
        if (resetState === 'unreadable') return cleanupFailure(persisted);
      }
      await this.dependencies.compose.stop(persisted);
      await this.dependencies.leases.release(persisted);
      return outcome(0);
    } catch {
      return cleanupFailure(persisted);
    }
  }

  /** Creates the persisted identity used to fence every later lifecycle operation. */
  protected async createLeaseRecord(manifest: EndpointManifest): Promise<LeaseRecord> {
    const runtimeDirectory = resolve(
      manifest.worktreePath,
      'test-harness/.assurance-runtime',
      manifest.runId,
    );
    return Object.freeze({
      runId: manifest.runId,
      ownerProcess: Object.freeze(await this.dependencies.processes.currentIdentity()),
      worktreePath: manifest.worktreePath,
      composeProject: manifest.composeProject,
      containerIds: Object.freeze(
        ['nginx', 'porta', 'postgres', 'redis', 'mailhog'].map(
          (service) => `${manifest.composeProject}-${service}-1`,
        ),
      ),
      volumeNames: Object.freeze([`bind:${dirname(manifest.certificatePath)}`]),
      ownedPaths: Object.freeze([
        runtimeDirectory,
        resolve(runtimeDirectory, 'endpoint-manifest.json'),
        resolve('/tmp', `porta-assurance-${manifest.runId}.sock`),
      ]),
      certificatePath: manifest.certificatePath,
      manifest,
    });
  }

  /** Configures every consumer from the same manifest and runs fatal prerequisites in order. */
  protected async startAcquiredRecord(record: LeaseRecord): Promise<LifecycleStartResult> {
    try {
      const manifest = record.manifest;
      await this.dependencies.composeConfig.apply(manifest);
      await this.dependencies.nginx.apply(manifest);
      await this.dependencies.seed.apply(manifest);
      await this.dependencies.spa.apply(manifest);
      await this.dependencies.bff.apply(manifest);
      await this.dependencies.playwright.apply(manifest);
      await this.dependencies.health.apply(manifest);
      await this.dependencies.evidence.apply(manifest);
      try {
        await this.dependencies.prerequisites.run('dns', manifest);
      } catch {
        return this.abortAcquiredStart(record, 'dns');
      }
      await this.dependencies.compose.start(manifest);
      for (const prerequisite of startupPrerequisites) {
        try {
          await this.dependencies.prerequisites.run(prerequisite, manifest);
        } catch {
          return this.abortAcquiredStart(record, prerequisite);
        }
      }
      if (this.dependencies.reset !== undefined) {
        await this.dependencies.reset.state.persist(record, 'ready');
        await this.dependencies.reset.state.flush(record);
      }
      return { outcome: outcome(0), ownedRun: this.createOwnedRun(record) };
    } catch {
      return this.abortAcquiredStart(record);
    }
  }

  /** Cleans a failed start and gives cleanup failure precedence over setup failure. */
  protected async abortAcquiredStart(
    record: LeaseRecord,
    prerequisite?: PrerequisiteName,
  ): Promise<LifecycleStartResult> {
    if (await this.cleanupOwnedRecord(record)) {
      return { outcome: { ...outcome(30), prerequisite } };
    }
    return {
      outcome: { ...outcome(60, 30), prerequisite, recoveryIdentifiers: safeIds(record) },
    };
  }

  /**
   * Performs one identity-fenced cleanup attempt for a live controller-owned record.
   *
   * Compose absence is safe because a failed start may never have created containers. Presence is
   * safe only when Compose reports the exact same persisted identity.
   */
  protected async cleanupOwnedRecord(record: LeaseRecord): Promise<boolean> {
    try {
      const persisted = await this.dependencies.leases.read(lookupFor(record));
      if (!isLeaseRecord(persisted) || !sameLeaseRecord(persisted, record)) return false;
      const inspection = await this.dependencies.compose.inspect(record.composeProject);
      if (inspection.presence === 'unreadable') return false;
      if (
        inspection.presence === 'present' &&
        (inspection.identity === undefined || !sameLeaseRecord(inspection.identity, record))
      ) {
        return false;
      }
      await this.dependencies.compose.stop(record);
      await this.dependencies.leases.release(record);
      return true;
    } catch {
      return false;
    }
  }

  /** Executes the fixed reset sequence and never exposes an adapter exception in evidence. */
  protected async executeReset(
    record: LeaseRecord,
    reset: ResetDependencies,
  ): Promise<LifecycleResetOutcome> {
    const report = mutableResetReport(record, reset);
    let currentStep: ResetStepName = 'quiesce';

    try {
      await this.runResetStep(currentStep, () => reset.traffic.quiesce(record));
      currentStep = 'stop-porta';
      await this.runResetStep(currentStep, () => reset.runtime.stopPorta(record));
      currentStep = 'persist-poison';
      await this.runResetStep(currentStep, () => reset.state.persist(record, 'resetting-poisoned'));
      currentStep = 'flush-poison';
      await this.runResetStep(currentStep, () => reset.state.flush(record));
      currentStep = 'db-recreate';
      report.identifiers.push(
        ...(await this.runResetStep(currentStep, () => reset.database.recreate(record))),
      );
      currentStep = 'migration';
      await this.runResetStep(currentStep, () =>
        reset.database.migrate(record, reset.expectations.migrationRevision),
      );
      currentStep = 'bootstrap';
      await this.runResetStep(currentStep, () => reset.database.bootstrap(record));
      currentStep = 'seed';
      await this.runResetStep(currentStep, () => reset.database.seed(record, reset.expectations));
      currentStep = 'redis';
      report.redisKeysRemoved = await this.runResetStep(currentStep, () =>
        reset.redis.flush(record),
      );
      currentStep = 'mailhog';
      report.mailMessagesRemoved = await this.runResetStep(currentStep, () =>
        reset.mail.clear(record),
      );
      currentStep = 'restart-clients';
      await this.runResetStep(currentStep, () => reset.runtime.restartClients(record));
      currentStep = 'restart-porta';
      await this.runResetStep(currentStep, () => reset.runtime.restartPorta(record));
      currentStep = 'digest-count-checks';
      const observation = await this.runResetStep(currentStep, () =>
        reset.database.observe(record),
      );
      report.migrationDigest = observation.migrationDigest;
      report.fixtureDigest = observation.fixtureDigest;
      report.fixtureCounts = observation.fixtureCounts;
      const mismatch = verificationMismatch(observation, reset);
      if (mismatch !== undefined) {
        return { ...outcome(30), prerequisite: mismatch, report: freezeResetReport(report) };
      }
      currentStep = 'public-health';
      await this.runResetStep(currentStep, () => reset.publicVerification.verify(record));
      currentStep = 'verify-traffic-blocked';
      await this.runResetStep(currentStep, () => reset.traffic.verifyBlocked(record));
      currentStep = 'clear-poison';
      await this.runResetStep(currentStep, () => reset.state.persist(record, 'ready'));
      currentStep = 'flush-ready';
      await this.runResetStep(currentStep, () => reset.state.flush(record));
      currentStep = 'resume-traffic';
      await this.runResetStep(currentStep, () => reset.traffic.resume(record));
      return { ...outcome(0), report: freezeResetReport(report) };
    } catch (error) {
      if (!(await this.restorePoisonAfterFailure(record, reset, currentStep))) {
        return {
          ...outcome(60),
          prerequisite: prerequisiteForResetStep(currentStep),
          recoveryIdentifiers: safeIds(record),
          report: freezeResetReport(report),
        };
      }
      return {
        ...resetFailureOutcome(error, currentStep),
        prerequisite: prerequisiteForResetStep(currentStep),
        report: freezeResetReport(report),
      };
    }
  }

  /**
   * Atomically adopts and rebuilds a poisoned run for a replacement lifecycle supervisor.
   *
   * The second Compose probe closes the race between the initial absence proof and lease takeover.
   * Once takeover succeeds, every returned outcome carries the new capability so the replacement
   * supervisor can clean the run even when recreation fails.
   */
  protected async recreatePoisonedRun(
    staleRecord: LeaseRecord,
    reset: ResetDependencies,
  ): Promise<LifecycleRecoveryResult> {
    const newOwner = await this.dependencies.processes.currentIdentity();
    const transferred = await this.dependencies.leases.transferOwner(staleRecord, newOwner);
    if (transferred === 'mismatch') return cleanupFailure(staleRecord);

    const ownedRun = this.createOwnedRun(transferred);
    try {
      const secondInspection = await this.dependencies.compose.inspect(transferred.composeProject);
      if (secondInspection.presence !== 'absent') {
        return recoveryFailure(transferred, ownedRun);
      }
      await this.dependencies.compose.start(transferred.manifest);
      const resetOutcome = await this.executeReset(transferred, reset);
      const commonOutcome = lifecyclePart(resetOutcome);
      return {
        ...commonOutcome,
        recoveryIdentifiers:
          commonOutcome.exitCode === 0 ? [] : Object.freeze([...safeIds(transferred)]),
        ownedRun,
        report: resetOutcome.report,
      };
    } catch {
      return recoveryFailure(transferred, ownedRun);
    }
  }

  /** Applies the configured deadline to one named reset capability boundary. */
  protected runResetStep<T>(step: ResetStepName, work: () => Promise<T>): Promise<T> {
    return this.dependencies.deadlines.run(`reset:${step}`, work);
  }

  /**
   * Restores traffic fencing and durable poison when finalization partially succeeded.
   *
   * A failure after `clear-poison` or while resuming traffic can otherwise expose a reset whose
   * final state is unknown. Recovery actions are direct and bounded by their adapters; failure to
   * restore either fence is classified as cleanup failure by the caller.
   */
  protected async restorePoisonAfterFailure(
    record: LeaseRecord,
    reset: ResetDependencies,
    step: ResetStepName,
  ): Promise<boolean> {
    if (!postMutationSteps.has(step)) return true;
    try {
      if (step === 'resume-traffic') await reset.traffic.quiesce(record);
      await reset.state.persist(record, 'resetting-poisoned');
      await reset.state.flush(record);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Preserves fatal Redis and MailHog prerequisites for lightweight lifecycle consumers.
   *
   * Full reset users supply the reset capability bundle. Consumers that only need prerequisite
   * enforcement still receive the stable failure taxonomy instead of a vacuous success.
   */
  protected async executePrerequisiteReset(record: LeaseRecord): Promise<LifecycleResetOutcome> {
    for (const prerequisite of ['redis-reset', 'mailhog-reset'] as const) {
      try {
        await this.dependencies.prerequisites.run(prerequisite, record.manifest);
      } catch {
        return {
          ...outcome(30),
          prerequisite,
          report: emptyResetReport(record.runId),
        };
      }
    }
    return { ...outcome(0), report: emptyResetReport(record.runId) };
  }

  /** Creates and registers the only opaque capability accepted by later destructive operations. */
  protected createOwnedRun(record: LeaseRecord): OwnedRun {
    const ownedRun = Object.freeze({ [ownedRunBrand]: true as const, manifest: record.manifest });
    this.ownedRecords.set(ownedRun, record);
    return ownedRun;
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
    left.ownerProcess.pid === right.ownerProcess.pid &&
    left.ownerProcess.startedAtFingerprint === right.ownerProcess.startedAtFingerprint &&
    left.worktreePath === right.worktreePath &&
    left.composeProject === right.composeProject &&
    sameStrings(left.containerIds, right.containerIds) &&
    sameStrings(left.volumeNames, right.volumeNames) &&
    sameStrings(left.ownedPaths, right.ownedPaths) &&
    left.certificatePath === right.certificatePath &&
    sameManifest(left.manifest, right.manifest)
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
