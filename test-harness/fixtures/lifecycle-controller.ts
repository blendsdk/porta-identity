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
  type LifecycleResetOutcome,
  type LifecycleStartRequest,
  type LifecycleStartResult,
  type OwnedRun,
  type PrerequisiteName,
} from './lifecycle-planned.js';
import {
  createEndpointManifest,
  validateRecoveryLookup,
  validateStartRequest,
} from './lifecycle-validation.js';

const startupPrerequisites = [
  'dns',
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

  /** Returns setup failure until the reset state machine is installed by its owning task. */
  public async reset(ownedRun: OwnedRun): Promise<LifecycleResetOutcome> {
    return { ...outcome(30), report: emptyResetReport(ownedRun.manifest.runId) };
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
  public async recover(lookup: LifecycleRecoveryLookup): Promise<LifecycleOutcome> {
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
      await this.dependencies.compose.start(manifest);
      for (const prerequisite of startupPrerequisites) {
        try {
          await this.dependencies.prerequisites.run(prerequisite, manifest);
        } catch {
          return this.abortAcquiredStart(record, prerequisite);
        }
      }
      const ownedRun: OwnedRun = { [ownedRunBrand]: true, manifest };
      const frozenOwnedRun = Object.freeze(ownedRun);
      this.ownedRecords.set(frozenOwnedRun, record);
      return { outcome: outcome(0), ownedRun: frozenOwnedRun };
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
