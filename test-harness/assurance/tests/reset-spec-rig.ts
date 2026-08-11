import type {
  ChildExecutionAdapter,
  ComposeAdapter,
  DeadlineAdapter,
  EndpointAvailabilityAdapter,
  EndpointManifest,
  LeaseRecord,
  LeaseStateAdapter,
  LifecycleController,
  LifecycleDependencies,
  LifecycleRecoveryLookup,
  ManifestConsumerAdapter,
  Presence,
  PrerequisiteAdapter,
  ProcessIdentity,
  ProcessProbeAdapter,
  ResetDatabaseObservation,
  ResetDependencies,
  ResetExpectations,
} from '../../fixtures/lifecycle-planned.js';
import { createLifecycleController } from '../../fixtures/lifecycle-planned.js';

/** Ordered reset operations observable at capability boundaries. */
export type ResetStep =
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

/** Interruption classes injected immediately around one capability boundary. */
export type ResetInterruptionKind =
  'failure' | 'SIGINT' | 'SIGTERM' | 'cancellation' | 'timeout' | 'unknown';

/** Configurable interruption point used by table-driven reset specifications. */
export interface ResetFault {
  readonly step: ResetStep;
  readonly timing: 'before' | 'after';
  readonly kind: ResetInterruptionKind;
  readonly message?: string;
}

/** One completed capability call and the exact ownership identity it observed. */
export interface ResetCall {
  readonly step: ResetStep;
  readonly record: LeaseRecord;
  readonly manifest: EndpointManifest;
  /** Whether traffic was blocked when the capability action completed. */
  readonly trafficBlocked: boolean;
}

/** Durable state shared across controller instances to model process replacement. */
export interface ResetRigSharedState {
  readonly leases: LeaseRecord[];
  readonly blocks: Set<string>;
  readonly resetStates: Map<string, 'ready' | 'resetting-poisoned'>;
  nextControllerOrdinal: number;
}

/** Mutable controls and observations exposed by the reset capability doubles. */
export interface ResetRigControls {
  readonly calls: ResetCall[];
  readonly currentProcess: ProcessIdentity;
  processPresence: Presence;
  composePresence: Presence;
  leaseReadOverride?: LeaseRecord | 'missing' | 'malformed' | 'incomplete';
  fault?: ResetFault;
  databaseObservation: ResetDatabaseObservation;
  redisKeysRemoved: number;
  mailMessagesRemoved: number;
  trafficBlocked: boolean;
  readonly migrationRevisions: string[];
  readonly seedExpectations: ResetExpectations[];
}

/** Transparent reset rig that delegates all policy decisions to the controller. */
export interface ResetSpecRig {
  readonly controller: LifecycleController;
  readonly controls: ResetRigControls;
  readonly sharedState: ResetRigSharedState;
}

/** Independent reset expectations that are never derived from production logic. */
export const resetExpectations: ResetExpectations = {
  migrationRevision: '202608110001-reset-assurance',
  migrationDigest: 'sha256:migration-fixture-digest',
  fixtureDigest: 'sha256:deterministic-fixture-digest',
  fixtureCounts: { organizations: 2, users: 4, clients: 3 },
};

/** Creates empty durable state that may be reused by a fresh controller process model. */
export function createResetRigSharedState(): ResetRigSharedState {
  return {
    leases: [],
    blocks: new Set<string>(),
    resetStates: new Map<string, 'ready' | 'resetting-poisoned'>(),
    nextControllerOrdinal: 1,
  };
}

/** Creates capability doubles whose calls expose order, identity, and durable state. */
export function createResetSpecRig(
  sharedState: ResetRigSharedState = createResetRigSharedState(),
): ResetSpecRig {
  const ordinal = sharedState.nextControllerOrdinal++;
  const controls: ResetRigControls = {
    calls: [],
    currentProcess: { pid: process.pid, startedAtFingerprint: `reset-rig-${ordinal}` },
    processPresence: 'absent',
    composePresence: 'absent',
    databaseObservation: {
      migrationRevision: resetExpectations.migrationRevision,
      migrationDigest: resetExpectations.migrationDigest,
      fixtureDigest: resetExpectations.fixtureDigest,
      fixtureCounts: resetExpectations.fixtureCounts,
    },
    redisKeysRemoved: 7,
    mailMessagesRemoved: 5,
    trafficBlocked: false,
    migrationRevisions: [],
    seedExpectations: [],
  };

  const leases: LeaseStateAdapter = {
    async tryAcquire(record) {
      const block = Object.values(record.manifest.ports).join(':');
      if (sharedState.blocks.has(block)) return 'occupied';
      sharedState.blocks.add(block);
      sharedState.leases.push(record);
      sharedState.resetStates.set(record.runId, 'ready');
      return 'acquired';
    },
    async read(lookup) {
      if (controls.leaseReadOverride !== undefined) return controls.leaseReadOverride;
      return findLease(sharedState, lookup) ?? 'missing';
    },
    async release(_record) {},
    async quarantine(lookup) {
      return [`lease:${lookup.runId}`];
    },
  };

  const processes: ProcessProbeAdapter = {
    async currentIdentity() {
      return controls.currentProcess;
    },
    async presence(_identity) {
      return controls.processPresence;
    },
  };

  const compose: ComposeAdapter = {
    async inspect(_project) {
      return { presence: controls.composePresence };
    },
    async start(_manifest) {},
    async stop(_record) {},
  };

  const reset = createResetDependencies(sharedState, controls);
  const dependencies: LifecycleDependencies = {
    leases,
    processes,
    compose,
    children: createChildren(),
    endpoints: createEndpoints(),
    composeConfig: createConsumer(),
    nginx: createConsumer(),
    seed: createConsumer(),
    spa: createConsumer(),
    bff: createConsumer(),
    playwright: createConsumer(),
    health: createConsumer(),
    evidence: createConsumer(),
    prerequisites: createPrerequisites(),
    deadlines: createDeadlines(),
    reset,
  };

  return { controller: createLifecycleController(dependencies), controls, sharedState };
}

/** Returns the exact persisted lease selected by the narrow recovery lookup. */
function findLease(
  state: ResetRigSharedState,
  lookup: LifecycleRecoveryLookup,
): LeaseRecord | undefined {
  return state.leases.find(
    (record) => record.runId === lookup.runId && record.worktreePath === lookup.worktreePath,
  );
}

/** Builds reset-specific adapters around one observable boundary helper. */
function createResetDependencies(
  state: ResetRigSharedState,
  controls: ResetRigControls,
): ResetDependencies {
  return {
    expectations: resetExpectations,
    traffic: {
      async quiesce(record) {
        await atBoundary(controls, 'quiesce', record, () => {
          controls.trafficBlocked = true;
        });
      },
      async verifyBlocked(record) {
        await atBoundary(controls, 'verify-traffic-blocked', record);
      },
      async resume(record) {
        await atBoundary(controls, 'resume-traffic', record, () => {
          controls.trafficBlocked = false;
        });
      },
    },
    runtime: {
      async stopPorta(record) {
        await atBoundary(controls, 'stop-porta', record);
      },
      async restartClients(record) {
        await atBoundary(controls, 'restart-clients', record);
      },
      async restartPorta(record) {
        await atBoundary(controls, 'restart-porta', record);
      },
    },
    state: {
      async persist(record, durableState) {
        const step = durableState === 'ready' ? 'clear-poison' : 'persist-poison';
        await atBoundary(controls, step, record, () => {
          state.resetStates.set(record.runId, durableState);
        });
      },
      async flush(record) {
        const durableState = state.resetStates.get(record.runId);
        const step = durableState === 'ready' ? 'flush-ready' : 'flush-poison';
        await atBoundary(controls, step, record);
      },
      async read(record) {
        return state.resetStates.get(record.runId) ?? 'unreadable';
      },
    },
    database: {
      async recreate(record) {
        await atBoundary(controls, 'db-recreate', record);
        return [`database:${record.runId}`];
      },
      async migrate(record, revision) {
        await atBoundary(controls, 'migration', record, () => {
          controls.migrationRevisions.push(revision);
        });
      },
      async bootstrap(record) {
        await atBoundary(controls, 'bootstrap', record);
      },
      async seed(record, expectations) {
        await atBoundary(controls, 'seed', record, () => {
          controls.seedExpectations.push(expectations);
        });
      },
      async observe(record) {
        await atBoundary(controls, 'digest-count-checks', record);
        return controls.databaseObservation;
      },
    },
    redis: {
      async flush(record) {
        await atBoundary(controls, 'redis', record);
        return controls.redisKeysRemoved;
      },
    },
    mail: {
      async clear(record) {
        await atBoundary(controls, 'mailhog', record);
        return controls.mailMessagesRemoved;
      },
    },
    publicVerification: {
      async verify(record) {
        await atBoundary(controls, 'public-health', record);
      },
    },
  };
}

/** Runs one adapter action with optional failure immediately before or after it. */
async function atBoundary(
  controls: ResetRigControls,
  step: ResetStep,
  record: LeaseRecord,
  action: () => void = () => undefined,
): Promise<void> {
  throwConfiguredFault(controls, step, 'before');
  action();
  controls.calls.push({
    step,
    record,
    manifest: record.manifest,
    trafficBlocked: controls.trafficBlocked,
  });
  throwConfiguredFault(controls, step, 'after');
}

/** Throws the selected interruption without translating its classification. */
function throwConfiguredFault(
  controls: ResetRigControls,
  step: ResetStep,
  timing: 'before' | 'after',
): void {
  const fault = controls.fault;
  if (fault?.step === step && fault.timing === timing) {
    throw new ResetSpecInterruption(fault.kind, fault.message);
  }
}

/** Distinct error carrying the interruption class observed by the controller. */
export class ResetSpecInterruption extends Error {
  /** Interruption class that the lifecycle outcome must preserve. */
  public readonly kind: ResetInterruptionKind;

  /** Creates an injected reset interruption. */
  public constructor(kind: ResetInterruptionKind, message = `reset ${kind}`) {
    super(message);
    this.name = 'ResetSpecInterruption';
    this.kind = kind;
  }
}

/** Creates a no-op manifest consumer for successful start setup. */
function createConsumer(): ManifestConsumerAdapter {
  return { async apply(_manifest) {} };
}

/** Creates an always-available endpoint probe. */
function createEndpoints(): EndpointAvailabilityAdapter {
  return {
    async occupiedEndpoints(_manifest) {
      return [];
    },
  };
}

/** Creates a successful shell-free child adapter. */
function createChildren(): ChildExecutionAdapter {
  return {
    async spawn(_request) {
      return 0;
    },
  };
}

/** Creates successful prerequisite checks for arranging an owned run. */
function createPrerequisites(): PrerequisiteAdapter {
  return { async run(_name, _manifest) {} };
}

/** Creates a deadline adapter that delegates timing policy to the controller. */
function createDeadlines(): DeadlineAdapter {
  return {
    async run(_operation, work) {
      return work();
    },
  };
}
