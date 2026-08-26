import type {
  ChildExecutionAdapter,
  ComposeAdapter,
  ComposeInspection,
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
  ResetDependencies,
  ResetExpectations,
} from '../../fixtures/lifecycle-planned.js';
import { createLifecycleController } from '../../fixtures/lifecycle-planned.js';
import { ResetSpecInterruption } from './reset-spec-rig.js';

/** Promise latch used to place concurrency assertions at an exact capability boundary. */
export interface QualityGate {
  /** Resolves when the capability has reached the gated boundary. */
  readonly entered: Promise<void>;
  /** Marks entry and waits until the test releases or rejects the boundary. */
  wait(): Promise<void>;
  /** Allows the gated capability to finish successfully. */
  release(): void;
  /** Makes the gated capability finish with the supplied interruption. */
  reject(error: Error): void;
}

/** Durable lifecycle state shared by fresh controller instances. */
export interface QualityRigSharedState {
  /** Persisted owned-run records. */
  readonly records: LeaseRecord[];
  /** Complete endpoint blocks currently reserved by leases or startup intents. */
  readonly blocks: Set<string>;
  /** Atomic pre-readiness claim keyed by canonical worktree identity. */
  readonly worktreeClaims: Map<string, string>;
  /** Reserved endpoint blocks whose malformed ownership requires operator recovery. */
  readonly collisionTombstones: Set<string>;
  /** Durable reset state keyed by run UUID. */
  readonly resetStates: Map<string, 'ready' | 'resetting-poisoned'>;
}

/** Deterministic controls and observations for corrective lifecycle specifications. */
export interface QualityRigControls {
  /** Ordered capability observations. */
  readonly calls: string[];
  /** Exact process identity returned to the controller. */
  readonly currentProcess: ProcessIdentity;
  /** Immutable Docker container IDs returned by discovery. */
  readonly actualContainerIds: readonly string[];
  /** Immutable Docker network IDs returned by discovery. */
  readonly actualNetworkIds: readonly string[];
  /** Presence result for stale-owner probes. */
  processPresence: Presence;
  /** Whether post-start Compose discovery finds the created project. */
  discovery: 'stored' | 'available' | 'missing';
  /** Optional durable lease read result used for recovery cases. */
  leaseReadOverride?: LeaseRecord | 'missing' | 'malformed' | 'incomplete';
  /** Optional interruption before startup reaches readiness. */
  prerequisiteFault?: Error;
  /** Optional gate holding Compose creation before readiness. */
  composeStartGate?: QualityGate;
  /** Optional gate holding reset at its first database mutation. */
  resetGate?: QualityGate;
  /** Optional signal or failure raised when the reset gate is released. */
  resetCompletionFault?: Error;
  /** Deadline behavior selected by the current case. */
  deadlineMode: 'pass' | 'timeout';
  /** Whether deadline expiry triggered its abort signal. */
  deadlineAbortObserved: boolean;
}

/** Controller rig exposing only capability effects relevant to accepted quality findings. */
export interface LifecycleQualitySpecRig {
  /** Real controller under specification. */
  readonly controller: LifecycleController;
  /** Deterministic controls and observations. */
  readonly controls: QualityRigControls;
  /** Durable state reusable by a fresh controller process model. */
  readonly sharedState: QualityRigSharedState;
}

/** Independent synthetic expectations used by reset serialization cases. */
const expectations: ResetExpectations = {
  migrationRevision: '202608110001-quality',
  migrationDigest: 'sha256:quality-migrations',
  fixtureDigest: 'sha256:quality-fixtures',
  fixtureCounts: { organizations: 1, users: 1, clients: 1 },
};

/** Creates empty durable state for one or more process-scoped controllers. */
export function createQualityRigSharedState(): QualityRigSharedState {
  return {
    records: [],
    blocks: new Set<string>(),
    worktreeClaims: new Map<string, string>(),
    collisionTombstones: new Set<string>(),
    resetStates: new Map<string, 'ready' | 'resetting-poisoned'>(),
  };
}

/** Creates a manually released gate and an independent entered notification. */
export function createQualityGate(): QualityGate {
  let releaseGate: (() => void) | undefined;
  let rejectGate: ((error: Error) => void) | undefined;
  let markEntered: (() => void) | undefined;
  const entered = new Promise<void>((resolveEntered) => {
    markEntered = resolveEntered;
  });
  const blocked = new Promise<void>((resolveBlocked, rejectBlocked) => {
    releaseGate = resolveBlocked;
    rejectGate = rejectBlocked;
  });
  return {
    entered,
    async wait() {
      markEntered?.();
      return blocked;
    },
    release() {
      releaseGate?.();
    },
    reject(error) {
      rejectGate?.(error);
    },
  };
}

/** Creates deterministic adapters without implementing lifecycle policy in the rig. */
export function createLifecycleQualitySpecRig(
  sharedState: QualityRigSharedState = createQualityRigSharedState(),
  processIdentity: ProcessIdentity = {
    pid: process.pid,
    startedAtFingerprint: `boot:${process.pid}:quality`,
  },
  includeReset = true,
): LifecycleQualitySpecRig {
  const controls: QualityRigControls = {
    calls: [],
    currentProcess: processIdentity,
    actualContainerIds: ['a'.repeat(64)],
    actualNetworkIds: ['b'.repeat(64)],
    processPresence: 'absent',
    discovery: 'available',
    deadlineMode: 'pass',
    deadlineAbortObserved: false,
  };
  const dependencies: LifecycleDependencies = {
    leases: createLeases(sharedState, controls),
    processes: createProcesses(controls),
    compose: createCompose(sharedState, controls),
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
    prerequisites: createPrerequisites(controls),
    deadlines: createDeadlines(controls),
    reset: includeReset ? createReset(sharedState, controls) : undefined,
  };
  return { controller: createLifecycleController(dependencies), controls, sharedState };
}

/** Creates an atomic lease store with same-worktree intent claims and retained tombstones. */
function createLeases(
  state: QualityRigSharedState,
  controls: QualityRigControls,
): LeaseStateAdapter {
  return {
    async tryAcquire(record) {
      const block = blockKey(record.manifest);
      const claimant = state.worktreeClaims.get(record.worktreePath);
      if (claimant !== undefined && claimant !== record.startupIntentId) {
        return 'worktree-occupied';
      }
      state.worktreeClaims.set(record.worktreePath, record.startupIntentId);
      if (state.blocks.has(block) || state.collisionTombstones.has(block)) {
        return 'block-occupied';
      }
      state.blocks.add(block);
      state.records.push(record);
      state.resetStates.set(record.runId, 'ready');
      return 'acquired';
    },
    async releaseIntent(record) {
      if (state.worktreeClaims.get(record.worktreePath) === record.startupIntentId) {
        state.worktreeClaims.delete(record.worktreePath);
      }
    },
    async read(lookup) {
      if (controls.leaseReadOverride !== undefined) return controls.leaseReadOverride;
      return findRecord(state, lookup) ?? 'missing';
    },
    async findByWorktree(worktreePath) {
      return state.records.filter((record) => record.worktreePath === worktreePath);
    },
    async transferOwner(expected, newOwner) {
      const index = state.records.findIndex((record) => record === expected);
      if (index < 0) return 'mismatch';
      const transferred = Object.freeze({ ...expected, ownerProcess: Object.freeze(newOwner) });
      state.records[index] = transferred;
      return transferred;
    },
    async finalizeResources(expected, discovered) {
      const index = state.records.findIndex((record) => record === expected);
      if (index < 0) return 'mismatch';
      state.records[index] = discovered;
      return discovered;
    },
    async release(record) {
      controls.calls.push('lease-release');
      const index = state.records.findIndex((candidate) => candidate === record);
      if (index >= 0) state.records.splice(index, 1);
      state.blocks.delete(blockKey(record.manifest));
      if (state.worktreeClaims.get(record.worktreePath) === record.startupIntentId) {
        state.worktreeClaims.delete(record.worktreePath);
      }
    },
    async quarantine(lookup) {
      controls.calls.push('lease-quarantine');
      const record = findRecord(state, lookup);
      if (record !== undefined) state.collisionTombstones.add(blockKey(record.manifest));
      return [`lease:${lookup.runId}`];
    },
  };
}

/** Creates a process adapter that preserves the supplied durable boot fingerprint exactly. */
function createProcesses(controls: QualityRigControls): ProcessProbeAdapter {
  return {
    async currentIdentity() {
      return controls.currentProcess;
    },
    async presence(_identity) {
      return controls.processPresence;
    },
  };
}

/** Creates Compose effects with explicit post-start discovery and cleanup observations. */
function createCompose(state: QualityRigSharedState, controls: QualityRigControls): ComposeAdapter {
  return {
    async inspect(project) {
      controls.calls.push('compose-inspect');
      if (controls.discovery === 'missing') return { presence: 'absent' };
      const record = state.records.find((candidate) => candidate.composeProject === project);
      if (record === undefined) return { presence: 'absent' };
      if (controls.discovery === 'stored') return { presence: 'present', identity: record };
      const actualIdentity = Object.freeze({
        ...record,
        containerIds: controls.actualContainerIds,
        networkIds: controls.actualNetworkIds,
      });
      return { presence: 'present', identity: actualIdentity } satisfies ComposeInspection;
    },
    async start(_manifest) {
      controls.calls.push('compose-start');
      const gate = controls.composeStartGate;
      if (gate !== undefined) await waitAtGate(gate);
    },
    async stop(_record) {
      controls.calls.push('compose-stop');
    },
  };
}

/** Creates prerequisite behavior with an injectable pre-readiness interruption. */
function createPrerequisites(controls: QualityRigControls): PrerequisiteAdapter {
  return {
    async run(_name, _manifest) {
      if (controls.prerequisiteFault !== undefined) throw controls.prerequisiteFault;
    },
  };
}

/** Creates a deadline that can deterministically abort before invoking bounded work. */
function createDeadlines(controls: QualityRigControls): DeadlineAdapter {
  return {
    async run(_operation, work) {
      controls.calls.push('deadline-run');
      if (controls.deadlineMode === 'timeout') {
        const abort = new AbortController();
        abort.signal.addEventListener('abort', () => {
          controls.deadlineAbortObserved = true;
        });
        abort.abort();
        throw new ResetSpecInterruption('timeout');
      }
      return work(new AbortController().signal);
    },
  };
}

/** Creates reset effects with an exact gate at the first database mutation. */
function createReset(
  state: QualityRigSharedState,
  controls: QualityRigControls,
): ResetDependencies {
  return {
    expectations,
    traffic: {
      async quiesce(_record) {
        controls.calls.push('reset-quiesce');
      },
      async verifyBlocked(_record) {
        controls.calls.push('reset-verify-blocked');
      },
      async resume(_record) {
        controls.calls.push('reset-resume');
      },
      async restore(_record) {
        controls.calls.push('reset-restore');
      },
    },
    runtime: {
      async stopPorta(_record) {
        controls.calls.push('reset-stop-porta');
      },
      async restartClients(_record) {},
      async restartPorta(_record) {},
    },
    state: {
      async persist(record, resetState) {
        state.resetStates.set(record.runId, resetState);
      },
      async flush(_record) {},
      async read(record) {
        return state.resetStates.get(record.runId) ?? 'unreadable';
      },
    },
    database: {
      async recreate(_record) {
        controls.calls.push('reset-db-enter');
        const gate = controls.resetGate;
        if (gate !== undefined) await waitAtGate(gate);
        if (controls.resetCompletionFault !== undefined) throw controls.resetCompletionFault;
        controls.calls.push('reset-db-exit');
        return ['database:quality'];
      },
      async migrate(_record, _revision) {},
      async bootstrap(_record) {},
      async seed(_record, _expectations) {},
      async observe(_record) {
        return {
          migrationRevision: expectations.migrationRevision,
          migrationDigest: expectations.migrationDigest,
          fixtureDigest: expectations.fixtureDigest,
          fixtureCounts: expectations.fixtureCounts,
        };
      },
    },
    redis: {
      async flush(_record) {
        return 0;
      },
    },
    mail: {
      async clear(_record) {
        return 0;
      },
    },
    publicVerification: { async verify(_record) {} },
  };
}

/** Waits on a test gate without exposing its private promise on the public interface. */
async function waitAtGate(gate: QualityGate): Promise<void> {
  await gate.wait();
}

/** Locates one exact persisted lease. */
function findRecord(
  state: QualityRigSharedState,
  lookup: LifecycleRecoveryLookup,
): LeaseRecord | undefined {
  return state.records.find(
    (record) => record.runId === lookup.runId && record.worktreePath === lookup.worktreePath,
  );
}

/** Produces the stable collision identity for one complete endpoint block. */
function blockKey(manifest: EndpointManifest): string {
  return Object.values(manifest.ports).join(':');
}

/** Creates a no-op manifest consumer. */
function createConsumer(): ManifestConsumerAdapter {
  return { async apply(_manifest) {} };
}

/** Creates an always-available endpoint adapter. */
function createEndpoints(): EndpointAvailabilityAdapter {
  return {
    async occupiedEndpoints(_manifest) {
      return [];
    },
  };
}

/** Creates successful shell-free execution. */
function createChildren(): ChildExecutionAdapter {
  return {
    async spawn(_request) {
      return 0;
    },
  };
}
