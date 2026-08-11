import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

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
  lifecycleSocketPath,
  validateRecoveryLookup,
  validateStartRequest,
} from './lifecycle-validation.js';
import {
  cleanupFailure,
  emptyResetReport,
  ensureStartupActive,
  freezeResetReport,
  interruptionOutcome,
  isLeaseRecord,
  lifecyclePart,
  lookupFor,
  mutableResetReport,
  outcome,
  postMutationSteps,
  prerequisiteForResetStep,
  recoveryFailure,
  resetFailureOutcome,
  resourceDiscoveryCanAdvance,
  safeIds,
  sameLeaseAuthority,
  sameLeaseRecord,
  verificationMismatch,
  type ResetStepName,
} from './lifecycle-controller-support.js';

const startupPrerequisites = [
  'health',
  'migration',
  'seed',
  'fixture-verification',
] as const satisfies readonly PrerequisiteName[];

/** Implements lifecycle policy while delegating every external effect to explicit capabilities. */
export class LifecycleControllerImplementation implements LifecycleController {
  /**
   * Records the complete lease behind each capability created by this controller.
   *
   * A caller receives only the endpoint manifest. Keeping the deletion authority here prevents a
   * structurally similar object from nominating resources for cleanup.
   */
  protected readonly ownedRecords = new WeakMap<OwnedRun, LeaseRecord>();

  /** Per-capability operation tails that prevent reset and cleanup from overlapping. */
  protected readonly operationQueues = new WeakMap<OwnedRun, Promise<void>>();

  /** Creates a controller with one complete set of lifecycle capabilities. */
  public constructor(protected readonly dependencies: LifecycleDependencies) {}

  /** Validates input, leases a complete endpoint block, and starts one owned stack. */
  public async start(request: LifecycleStartRequest): Promise<LifecycleStartResult> {
    try {
      return await this.dependencies.deadlines.run('startup', (signal) =>
        this.startWithinDeadline(request, signal),
      );
    } catch (error) {
      return { outcome: interruptionOutcome(error) };
    }
  }

  /** Performs startup inside the configured aborting deadline boundary. */
  protected async startWithinDeadline(
    request: LifecycleStartRequest,
    signal: AbortSignal,
  ): Promise<LifecycleStartResult> {
    try {
      validateStartRequest(request);
    } catch {
      return { outcome: outcome(30) };
    }

    const startupIntentId = randomUUID();
    let unleasedIntent: LeaseRecord | undefined;
    for (let attempt = 0; attempt <= request.collisionRetries; attempt += 1) {
      let manifest: EndpointManifest;
      try {
        manifest = createEndpointManifest(request, attempt);
      } catch {
        return { outcome: outcome(30) };
      }
      if ((await this.dependencies.endpoints.occupiedEndpoints(manifest)).length > 0) continue;

      const record = await this.createLeaseRecord(manifest, startupIntentId);
      const acquisition = await this.dependencies.leases.tryAcquire(record);
      if (acquisition === 'worktree-occupied') return { outcome: outcome(30) };
      if (acquisition === 'block-occupied') {
        unleasedIntent = record;
        continue;
      }
      return this.startAcquiredRecord(record, signal);
    }
    if (unleasedIntent !== undefined) {
      try {
        await this.dependencies.leases.releaseIntent(unleasedIntent);
      } catch {
        return { outcome: cleanupFailure(unleasedIntent) };
      }
    }
    return { outcome: outcome(30) };
  }

  /** Resets every mutable dependency in one quiesced, durably poisoned transaction boundary. */
  public async reset(ownedRun: OwnedRun): Promise<LifecycleResetOutcome> {
    return this.serialize(ownedRun, () => this.resetOwned(ownedRun));
  }

  /** Executes one reset after all earlier operations on the capability have completed. */
  protected async resetOwned(ownedRun: OwnedRun): Promise<LifecycleResetOutcome> {
    const record = this.ownedRecords.get(ownedRun);
    const reset = this.dependencies.reset;
    if (record === undefined) {
      return { ...outcome(30), report: emptyResetReport(ownedRun.manifest.runId) };
    }
    if (reset === undefined) {
      return {
        ...outcome(30),
        prerequisite: 'fixture-verification',
        report: emptyResetReport(record.runId),
      };
    }
    const state = await reset.state.read(record);
    if (state !== 'ready') {
      return { ...outcome(60), report: emptyResetReport(record.runId) };
    }
    return this.executeReset(record, reset);
  }

  /** Clears only transient harness dependencies without claiming database reset evidence. */
  public async prepare(ownedRun: OwnedRun): Promise<LifecycleResetOutcome> {
    return this.serialize(ownedRun, () => this.prepareOwned(ownedRun));
  }

  /** Executes narrow preparation after all earlier operations on the capability have completed. */
  protected async prepareOwned(ownedRun: OwnedRun): Promise<LifecycleResetOutcome> {
    const record = this.ownedRecords.get(ownedRun);
    if (record === undefined) {
      return { ...outcome(30), report: emptyResetReport(ownedRun.manifest.runId) };
    }
    return this.executePrerequisiteReset(record);
  }

  /** Stops and releases only the exact lease represented by a controller-issued capability. */
  public async stop(ownedRun: OwnedRun): Promise<LifecycleOutcome> {
    return this.serialize(ownedRun, () => this.stopOwned(ownedRun));
  }

  /** Executes cleanup only after every earlier operation on the capability has completed. */
  protected async stopOwned(ownedRun: OwnedRun): Promise<LifecycleOutcome> {
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

  /** Adopts and removes a stale ready stack only after exact dead-owner/resource proof. */
  public async cleanupStale(lookup: LifecycleRecoveryLookup): Promise<LifecycleOutcome> {
    try {
      validateRecoveryLookup(lookup);
    } catch {
      return outcome(60);
    }
    const persisted = await this.dependencies.leases.read(lookup);
    if (!isLeaseRecord(persisted)) return outcome(60);
    try {
      if ((await this.dependencies.processes.presence(persisted.ownerProcess)) !== 'absent') {
        return cleanupFailure(persisted);
      }
      const inspection = await this.dependencies.compose.inspect(persisted.composeProject);
      if (inspection.presence === 'unreadable') return cleanupFailure(persisted);
      let recoverable = persisted;
      if (inspection.presence === 'present') {
        if (inspection.identity === undefined) return cleanupFailure(persisted);
        if (!sameLeaseRecord(inspection.identity, recoverable)) {
          if (!resourceDiscoveryCanAdvance(recoverable, inspection.identity)) {
            return cleanupFailure(persisted);
          }
          const finalized = await this.dependencies.leases.finalizeResources(
            recoverable,
            inspection.identity,
          );
          if (finalized === 'mismatch') return cleanupFailure(persisted);
          recoverable = finalized;
        }
      }
      const transferred = await this.dependencies.leases.transferOwner(
        recoverable,
        await this.dependencies.processes.currentIdentity(),
      );
      if (transferred === 'mismatch') return cleanupFailure(persisted);
      const ownedRun = this.createOwnedRun(transferred);
      return this.stopOwned(ownedRun);
    } catch {
      return cleanupFailure(persisted);
    }
  }

  /** Creates the persisted identity used to fence every later lifecycle operation. */
  protected async createLeaseRecord(
    manifest: EndpointManifest,
    startupIntentId: string,
  ): Promise<LeaseRecord> {
    const runtimeDirectory = resolve(
      manifest.worktreePath,
      'test-harness/.assurance-runtime',
      manifest.runId,
    );
    return Object.freeze({
      runId: manifest.runId,
      startupIntentId,
      ownerProcess: Object.freeze(await this.dependencies.processes.currentIdentity()),
      worktreePath: manifest.worktreePath,
      composeProject: manifest.composeProject,
      containerIds: Object.freeze([]),
      networkIds: Object.freeze([]),
      hostProcesses: Object.freeze([]),
      volumeNames: Object.freeze([]),
      ownedPaths: Object.freeze([
        runtimeDirectory,
        resolve(runtimeDirectory, 'endpoint-manifest.json'),
        lifecycleSocketPath(manifest.runId),
      ]),
      certificatePath: manifest.certificatePath,
      manifest,
    });
  }

  /** Configures every consumer from the same manifest and runs fatal prerequisites in order. */
  protected async startAcquiredRecord(
    record: LeaseRecord,
    signal?: AbortSignal,
  ): Promise<LifecycleStartResult> {
    let activeRecord = record;
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
      ensureStartupActive(signal);
      try {
        await this.dependencies.prerequisites.run('dns', manifest, signal);
      } catch {
        return this.abortAcquiredStart(record, 'dns');
      }
      await this.dependencies.compose.start(manifest, signal);
      ensureStartupActive(signal);
      const inspection = await this.dependencies.compose.inspect(record.composeProject);
      if (inspection.presence !== 'present' || inspection.identity === undefined) {
        return this.abortAcquiredStart(activeRecord);
      }
      const finalized = await this.dependencies.leases.finalizeResources(
        activeRecord,
        inspection.identity,
      );
      if (finalized === 'mismatch') return this.abortAcquiredStart(activeRecord);
      activeRecord = finalized;
      for (const prerequisite of startupPrerequisites) {
        try {
          await this.dependencies.prerequisites.run(prerequisite, manifest, signal);
        } catch {
          return this.abortAcquiredStart(activeRecord, prerequisite);
        }
        ensureStartupActive(signal);
      }
      const persisted = await this.dependencies.leases.read(lookupFor(activeRecord));
      if (!isLeaseRecord(persisted) || !sameLeaseAuthority(activeRecord, persisted)) {
        return this.abortAcquiredStart(activeRecord);
      }
      activeRecord = persisted;
      if (this.dependencies.reset !== undefined) {
        await this.dependencies.reset.state.persist(activeRecord, 'ready');
        await this.dependencies.reset.state.flush(activeRecord);
      }
      return { outcome: outcome(0), ownedRun: this.createOwnedRun(activeRecord) };
    } catch {
      return this.abortAcquiredStart(activeRecord);
    }
  }

  /** Cleans a failed start and gives cleanup failure precedence over setup failure. */
  protected async abortAcquiredStart(
    record: LeaseRecord,
    prerequisite?: PrerequisiteName,
  ): Promise<LifecycleStartResult> {
    const persisted = await this.dependencies.leases.read(lookupFor(record));
    const cleanupRecord =
      isLeaseRecord(persisted) && sameLeaseAuthority(record, persisted) ? persisted : record;
    if (await this.cleanupOwnedRecord(cleanupRecord)) {
      return { outcome: { ...outcome(30), prerequisite } };
    }
    return {
      outcome: { ...outcome(60, 30), prerequisite, recoveryIdentifiers: safeIds(cleanupRecord) },
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
      let cleanupRecord = persisted;
      const inspection = await this.dependencies.compose.inspect(record.composeProject);
      if (inspection.presence === 'unreadable') return false;
      if (inspection.presence === 'present') {
        if (
          inspection.identity === undefined ||
          !sameLeaseAuthority(inspection.identity, cleanupRecord)
        ) {
          return false;
        }
        if (!sameLeaseRecord(inspection.identity, cleanupRecord)) {
          if (!resourceDiscoveryCanAdvance(cleanupRecord, inspection.identity)) return false;
          const finalized = await this.dependencies.leases.finalizeResources(
            cleanupRecord,
            inspection.identity,
          );
          if (finalized === 'mismatch') return false;
          cleanupRecord = finalized;
        }
      }
      await this.dependencies.compose.stop(cleanupRecord);
      await this.dependencies.leases.release(cleanupRecord);
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
      await this.runResetStep(currentStep, (signal) => reset.traffic.quiesce(record, signal));
      currentStep = 'stop-porta';
      await this.runResetStep(currentStep, (signal) => reset.runtime.stopPorta(record, signal));
      currentStep = 'persist-poison';
      await this.runResetStep(currentStep, (signal) =>
        reset.state.persist(record, 'resetting-poisoned', signal),
      );
      currentStep = 'flush-poison';
      await this.runResetStep(currentStep, (signal) => reset.state.flush(record, signal));
      currentStep = 'db-recreate';
      report.identifiers.push(
        ...(await this.runResetStep(currentStep, (signal) =>
          reset.database.recreate(record, signal),
        )),
      );
      currentStep = 'migration';
      await this.runResetStep(currentStep, (signal) =>
        reset.database.migrate(record, reset.expectations.migrationRevision, signal),
      );
      currentStep = 'bootstrap';
      await this.runResetStep(currentStep, (signal) => reset.database.bootstrap(record, signal));
      currentStep = 'seed';
      await this.runResetStep(currentStep, (signal) =>
        reset.database.seed(record, reset.expectations, signal),
      );
      currentStep = 'redis';
      report.redisKeysRemoved = await this.runResetStep(currentStep, (signal) =>
        reset.redis.flush(record, signal),
      );
      currentStep = 'mailhog';
      report.mailMessagesRemoved = await this.runResetStep(currentStep, (signal) =>
        reset.mail.clear(record, signal),
      );
      currentStep = 'restart-clients';
      await this.runResetStep(currentStep, (signal) =>
        reset.runtime.restartClients(record, signal),
      );
      currentStep = 'restart-porta';
      await this.runResetStep(currentStep, (signal) => reset.runtime.restartPorta(record, signal));
      currentStep = 'digest-count-checks';
      const observation = await this.runResetStep(currentStep, (signal) =>
        reset.database.observe(record, signal),
      );
      report.migrationDigest = observation.migrationDigest;
      report.fixtureDigest = observation.fixtureDigest;
      report.fixtureCounts = observation.fixtureCounts;
      const mismatch = verificationMismatch(observation, reset);
      if (mismatch !== undefined) {
        return { ...outcome(30), prerequisite: mismatch, report: freezeResetReport(report) };
      }
      currentStep = 'public-health';
      await this.runResetStep(currentStep, (signal) =>
        reset.publicVerification.verify(record, signal),
      );
      currentStep = 'verify-traffic-blocked';
      await this.runResetStep(currentStep, (signal) => reset.traffic.verifyBlocked(record, signal));
      currentStep = 'clear-poison';
      await this.runResetStep(currentStep, (signal) =>
        reset.state.persist(record, 'ready', signal),
      );
      currentStep = 'flush-ready';
      await this.runResetStep(currentStep, (signal) => reset.state.flush(record, signal));
      currentStep = 'resume-traffic';
      await this.runResetStep(currentStep, (signal) => reset.traffic.resume(record, signal));
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
  protected runResetStep<T>(
    step: ResetStepName,
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
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

  /** Runs one capability operation after its predecessor and keeps rejection from breaking the tail. */
  protected serialize<T>(ownedRun: OwnedRun, operation: () => Promise<T>): Promise<T> {
    const predecessor = this.operationQueues.get(ownedRun) ?? Promise.resolve();
    const current = predecessor.then(operation, operation);
    const tail = current.then(
      () => undefined,
      () => undefined,
    );
    this.operationQueues.set(ownedRun, tail);
    void tail.finally(() => {
      if (this.operationQueues.get(ownedRun) === tail) this.operationQueues.delete(ownedRun);
    });
    return current;
  }
}

/** Throws the stable timeout discriminator after an owning startup deadline aborts. */
