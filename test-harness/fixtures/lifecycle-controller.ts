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

/** Implements lifecycle policy while delegating every external effect to explicit capabilities. */
export class LifecycleControllerImplementation implements LifecycleController {
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

  /** Returns setup failure until fenced cleanup is installed by its owning task. */
  public async stop(_ownedRun: OwnedRun): Promise<LifecycleOutcome> {
    return outcome(30);
  }

  /** Validates lookup input but defers stale recovery to the fenced-cleanup task. */
  public async recover(lookup: LifecycleRecoveryLookup): Promise<LifecycleOutcome> {
    try {
      validateRecoveryLookup(lookup);
    } catch {
      return outcome(60);
    }
    return outcome(30);
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
      return { outcome: outcome(0), ownedRun: Object.freeze(ownedRun) };
    } catch {
      return this.abortAcquiredStart(record);
    }
  }

  /** Cleans a failed start and gives cleanup failure precedence over setup failure. */
  protected async abortAcquiredStart(
    record: LeaseRecord,
    prerequisite?: PrerequisiteName,
  ): Promise<LifecycleStartResult> {
    try {
      await this.dependencies.compose.stop(record);
      await this.dependencies.leases.release(record);
      return { outcome: { ...outcome(30), prerequisite } };
    } catch {
      return {
        outcome: { ...outcome(60, 30), prerequisite, recoveryIdentifiers: safeIds(record) },
      };
    }
  }
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
