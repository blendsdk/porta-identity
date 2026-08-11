import type {
  ChildExecutionAdapter,
  ComposeAdapter,
  ComposeInspection,
  DeadlineAdapter,
  EndpointAvailabilityAdapter,
  EndpointManifest,
  EndpointName,
  LeaseRecord,
  LeaseStateAdapter,
  LifecycleController,
  LifecycleDependencies,
  LifecycleRecoveryLookup,
  ManifestConsumerAdapter,
  Presence,
  PrerequisiteAdapter,
  PrerequisiteName,
  ProcessIdentity,
  ProcessProbeAdapter,
  SpawnRequest,
} from '../../fixtures/lifecycle-planned.js';
import { createLifecycleController } from '../../fixtures/lifecycle-planned.js';

/** Mutable controls exposed only to the specification suite's capability doubles. */
export interface LifecycleRigControls {
  readonly oneShotOccupiedEndpoints: Set<EndpointName>;
  readonly consumerManifests: Map<string, readonly EndpointManifest[]>;
  readonly prerequisiteCalls: PrerequisiteName[];
  readonly deletedRecords: LeaseRecord[];
  readonly releasedRecords: LeaseRecord[];
  readonly quarantinedLookups: LifecycleRecoveryLookup[];
  readonly spawnRequests: SpawnRequest[];
  processPresence: Presence;
  composeInspection: ComposeInspection;
  failedPrerequisite?: PrerequisiteName;
  cleanupFailure?: Error;
  leaseReadOverride?: LeaseRecord | 'missing' | 'malformed' | 'incomplete';
}

/** Test rig with transparent state for observing controller side effects. */
export interface LifecycleSpecRig {
  readonly controller: LifecycleController;
  readonly controls: LifecycleRigControls;
  readonly acquiredRecords: readonly LeaseRecord[];
}

/** Durable state shared by controllers that model different lifecycle processes. */
export interface LifecycleRigSharedState {
  readonly acquiredRecords: LeaseRecord[];
  readonly acquiredBlocks: Set<string>;
}

/** Creates empty durable lease state that may outlive one controller instance. */
export function createLifecycleRigSharedState(): LifecycleRigSharedState {
  return { acquiredRecords: [], acquiredBlocks: new Set<string>() };
}

/** Creates deterministic capability doubles without implementing lifecycle policy. */
export function createLifecycleSpecRig(
  sharedState: LifecycleRigSharedState = createLifecycleRigSharedState(),
): LifecycleSpecRig {
  const { acquiredRecords, acquiredBlocks } = sharedState;
  const controls: LifecycleRigControls = {
    oneShotOccupiedEndpoints: new Set<EndpointName>(),
    consumerManifests: new Map<string, readonly EndpointManifest[]>(),
    prerequisiteCalls: [],
    deletedRecords: [],
    releasedRecords: [],
    quarantinedLookups: [],
    spawnRequests: [],
    processPresence: 'absent',
    composeInspection: { presence: 'absent' },
  };

  const leases: LeaseStateAdapter = {
    async tryAcquire(record) {
      const key = Object.values(record.manifest.ports).join(':');
      if (acquiredBlocks.has(key)) return 'block-occupied';
      acquiredBlocks.add(key);
      acquiredRecords.push(record);
      return 'acquired';
    },
    async releaseIntent(_record) {},
    async read(lookup) {
      if (controls.leaseReadOverride !== undefined) return controls.leaseReadOverride;
      return (
        acquiredRecords.find(
          (record) => record.runId === lookup.runId && record.worktreePath === lookup.worktreePath,
        ) ?? 'missing'
      );
    },
    async findByWorktree(worktreePath) {
      return acquiredRecords.filter((record) => record.worktreePath === worktreePath);
    },
    async transferOwner(expected, newOwner) {
      const index = acquiredRecords.findIndex((record) => record === expected);
      if (index < 0) return 'mismatch';
      const transferred = Object.freeze({ ...expected, ownerProcess: Object.freeze(newOwner) });
      acquiredRecords[index] = transferred;
      return transferred;
    },
    async finalizeResources(expected, discovered) {
      const index = acquiredRecords.findIndex((record) => record === expected);
      if (index < 0) return 'mismatch';
      acquiredRecords[index] = discovered;
      return discovered;
    },
    async release(record) {
      controls.releasedRecords.push(record);
    },
    async quarantine(lookup) {
      controls.quarantinedLookups.push(lookup);
      return [`lease:${lookup.runId}`];
    },
  };

  const processes: ProcessProbeAdapter = {
    async currentIdentity() {
      return { pid: process.pid, startedAtFingerprint: `rig-${process.pid}` };
    },
    async presence(_identity: ProcessIdentity) {
      return controls.processPresence;
    },
  };

  const compose: ComposeAdapter = {
    async inspect(project: string) {
      const provisional = acquiredRecords.find(
        (record) => record.composeProject === project && record.containerIds.length === 0,
      );
      if (provisional !== undefined) {
        return {
          presence: 'present',
          identity: {
            ...provisional,
            containerIds: ['a'.repeat(64)],
            networkIds: ['b'.repeat(64)],
          },
        };
      }
      return controls.composeInspection;
    },
    async start(manifest) {
      recordConsumerManifest(controls, 'compose', manifest);
    },
    async stop(record) {
      if (controls.cleanupFailure !== undefined) throw controls.cleanupFailure;
      controls.deletedRecords.push(record);
    },
  };

  const children: ChildExecutionAdapter = {
    async spawn(request) {
      controls.spawnRequests.push(request);
      return 0;
    },
  };

  const endpoints: EndpointAvailabilityAdapter = {
    async occupiedEndpoints(manifest) {
      const occupied = (Object.keys(manifest.ports) as EndpointName[]).filter((endpoint) =>
        controls.oneShotOccupiedEndpoints.has(endpoint),
      );
      controls.oneShotOccupiedEndpoints.clear();
      return occupied;
    },
  };

  const deadlines: DeadlineAdapter = {
    async run(_operation, work) {
      return work(new AbortController().signal);
    },
  };

  const prerequisites: PrerequisiteAdapter = {
    async run(name, _manifest) {
      controls.prerequisiteCalls.push(name);
      if (controls.failedPrerequisite === name) throw new Error(`${name} failed`);
    },
  };

  const dependencies: LifecycleDependencies = {
    leases,
    processes,
    compose,
    children,
    endpoints,
    composeConfig: createConsumer(controls, 'compose-config'),
    nginx: createConsumer(controls, 'nginx'),
    seed: createConsumer(controls, 'seed'),
    spa: createConsumer(controls, 'spa'),
    bff: createConsumer(controls, 'bff'),
    playwright: createConsumer(controls, 'playwright'),
    health: createConsumer(controls, 'health'),
    evidence: createConsumer(controls, 'evidence'),
    prerequisites,
    deadlines,
  };

  return { controller: createLifecycleController(dependencies), controls, acquiredRecords };
}

/** Records one consumer observation without transforming the supplied manifest. */
function recordConsumerManifest(
  controls: LifecycleRigControls,
  consumer: string,
  manifest: EndpointManifest,
): void {
  const previous = controls.consumerManifests.get(consumer) ?? [];
  controls.consumerManifests.set(consumer, [...previous, manifest]);
}

/** Creates a named manifest consumer with observable calls. */
function createConsumer(controls: LifecycleRigControls, name: string): ManifestConsumerAdapter {
  return {
    async apply(manifest) {
      recordConsumerManifest(controls, name, manifest);
    },
  };
}

/** Returns a valid request suitable for focused lifecycle tests. */
export function validLifecycleRequest(
  overrides: Partial<{
    runId: string;
    scenarioId: string;
    worktreePath: string;
    environmentName: string;
    candidateBasePort: number;
    collisionRetries: number;
  }> = {},
) {
  return {
    runId: '8f41b7d1-89b5-4ea9-a248-d1807f370888',
    scenarioId: 'login-basic',
    worktreePath: '/worktrees/porta-a',
    environmentName: 'assurance-a',
    candidateBasePort: 41_000,
    collisionRetries: 2,
    ...overrides,
  };
}
