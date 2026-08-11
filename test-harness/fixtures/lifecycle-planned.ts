import { LifecycleControllerImplementation } from './lifecycle-controller.js';

/**
 * Typed contract for the harness lifecycle boundary.
 *
 * Public operations expose validated requests and opaque ownership handles. Capability adapters
 * keep operating-system and Docker effects replaceable so policy can be tested deterministically.
 */

/** Runtime brand preventing callers from fabricating an owned lifecycle capability. */
export const ownedRunBrand: unique symbol = Symbol('owned-run');

/** Stable classifications emitted by every lifecycle operation. */
export type LifecycleClassification =
  | 'success'
  | 'product-failure'
  | 'test-failure'
  | 'setup-failure'
  | 'cleanup-failure'
  | 'timeout'
  | 'interrupted';

/** Exit codes reserved by the lifecycle contract. */
export type LifecycleExitCode = 0 | 20 | 21 | 30 | 60 | 70 | 130 | 143;

/** Names of prerequisites that must complete before behavioral assertions begin. */
export type PrerequisiteName =
  | 'dns'
  | 'health'
  | 'migration'
  | 'seed'
  | 'fixture-verification'
  | 'redis-reset'
  | 'mailhog-reset';

/** Endpoint names that form one indivisible allocation block. */
export type EndpointName = 'porta' | 'app' | 'bff' | 'postgres' | 'redis' | 'mailhog';

/** Presence result that distinguishes absence from an unsafe probe failure. */
export type Presence = 'present' | 'absent' | 'unreadable';

/** Raw lifecycle input. Every field is untrusted until the controller validates it. */
export interface LifecycleStartRequest {
  /** Caller-generated run identifier. */
  readonly runId: string;
  /** Caller-selected scenario identifier. */
  readonly scenarioId: string;
  /** Absolute path of the worktree that owns the run. */
  readonly worktreePath: string;
  /** Environment name used to isolate the run. */
  readonly environmentName: string;
  /** First candidate port from which a complete block is derived. */
  readonly candidateBasePort: number;
  /** Maximum number of complete candidate blocks that may be attempted. */
  readonly collisionRetries: number;
}

/** Immutable endpoint identity shared by every lifecycle consumer. */
export interface EndpointManifest {
  /** Validated run identifier. */
  readonly runId: string;
  /** Validated scenario identifier. */
  readonly scenarioId: string;
  /** Validated Compose project name. */
  readonly composeProject: string;
  /** Canonical owning worktree path. */
  readonly worktreePath: string;
  /** Validated environment name. */
  readonly environmentName: string;
  /** Complete port assignment for this run. */
  readonly ports: Readonly<Record<EndpointName, number>>;
  /** Complete public and infrastructure endpoint assignment. */
  readonly urls: Readonly<Record<EndpointName, string>>;
  /** Canonical path to the generated certificate. */
  readonly certificatePath: string;
}

/** Process identity includes a start fingerprint so PID reuse cannot confer ownership. */
export interface ProcessIdentity {
  /** Operating-system process identifier. */
  readonly pid: number;
  /** Stable fingerprint of the process start instant. */
  readonly startedAtFingerprint: string;
}

/** Host child identity bound to one retained harness role. */
export interface HostProcessIdentity extends ProcessIdentity {
  /** Allowlisted child role used for exact cleanup diagnostics. */
  readonly role: 'spa' | 'bff';
}

/** Persisted ownership record used to fence cleanup and stale recovery. */
export interface LeaseRecord {
  /** Validated run identifier. */
  readonly runId: string;
  /** Internal acquisition identity that separates retries from concurrent same-run starters. */
  readonly startupIntentId: string;
  /** Process that acquired the lease. */
  readonly ownerProcess: ProcessIdentity;
  /** Canonical owning worktree path. */
  readonly worktreePath: string;
  /** Compose project carrying matching identity labels. */
  readonly composeProject: string;
  /** Container identities owned by the run. */
  readonly containerIds: readonly string[];
  /** Docker network identities owned by the run. */
  readonly networkIds: readonly string[];
  /** PID-reuse-resistant host children owned by the run. */
  readonly hostProcesses: readonly HostProcessIdentity[];
  /** Volume identities owned by the run. */
  readonly volumeNames: readonly string[];
  /** Canonical generated-resource paths owned by the run. */
  readonly ownedPaths: readonly string[];
  /** Canonical certificate identity owned by the run. */
  readonly certificatePath: string;
  /** Immutable endpoint identity for the run. */
  readonly manifest: EndpointManifest;
}

/**
 * Narrow identity used by a fresh process to locate a persisted lease for recovery.
 *
 * Resource identifiers deliberately do not appear here. The controller must obtain them from the
 * durable lease after validating the run UUID and canonical owning worktree.
 */
export interface LifecycleRecoveryLookup {
  /** Validated UUID of the run whose persisted lease is being recovered. */
  readonly runId: string;
  /** Canonical path of the worktree recorded as the lease owner. */
  readonly worktreePath: string;
}

/** Opaque capability returned only after successful lifecycle ownership acquisition. */
export interface OwnedRun {
  /** Prevents callers from fabricating a cleanup capability. */
  readonly [ownedRunBrand]: true;
  /** Read-only endpoint identity safe for test execution. */
  readonly manifest: EndpointManifest;
}

/** Observable result of one lifecycle operation. */
export interface LifecycleOutcome {
  /** Final process exit code after cleanup precedence is applied. */
  readonly exitCode: LifecycleExitCode;
  /** Classification corresponding to the final exit code. */
  readonly classification: LifecycleClassification;
  /** Original outcome retained even when cleanup changes the final exit code. */
  readonly primaryExitCode: LifecycleExitCode;
  /** Failed prerequisite, when setup did not complete. */
  readonly prerequisite?: PrerequisiteName;
  /** Safe, exact identifiers an operator may use for manual recovery. */
  readonly recoveryIdentifiers: readonly string[];
}

/** Exact, non-secret facts emitted by a completed or failed reset. */
export interface ResetReport {
  /** Synthetic run identifier safe for diagnostics. */
  readonly runId: string;
  /** Exact migration revision requested by the reset. */
  readonly migrationRevision: string;
  /** Observed migration digest, when verification ran. */
  readonly migrationDigest?: string;
  /** Observed deterministic fixture digest, when verification ran. */
  readonly fixtureDigest?: string;
  /** Exact synthetic fixture counts by entity name. */
  readonly fixtureCounts: Readonly<Record<string, number>>;
  /** Number of harness-dedicated Redis keys removed. */
  readonly redisKeysRemoved: number;
  /** Number of MailHog messages removed. */
  readonly mailMessagesRemoved: number;
  /** Safe resource identifiers relevant to recovery. */
  readonly identifiers: readonly string[];
}

/** Lifecycle outcome returned by a capability-gated reset. */
export interface LifecycleResetOutcome extends LifecycleOutcome {
  /** Non-secret reset observations retained even when cleanup or recovery is required. */
  readonly report: ResetReport;
}

/** Result of starting a run; ownership exists only after complete setup succeeds. */
export interface LifecycleStartResult {
  /** Lifecycle outcome. */
  readonly outcome: LifecycleOutcome;
  /** Opaque cleanup capability present only for an owned run. */
  readonly ownedRun?: OwnedRun;
}

/** Result of stale recovery, including new ownership when a poisoned stack is rebuilt. */
export interface LifecycleRecoveryResult extends LifecycleOutcome {
  /** Opaque capability transferred to the recovery supervisor after an atomic takeover. */
  readonly ownedRun?: OwnedRun;
  /** Non-secret reset evidence when poisoned recovery attempted full recreation. */
  readonly report?: ResetReport;
}

/** Atomically persisted lease-state operations. */
export interface LeaseStateAdapter {
  /** Atomically acquires the complete candidate block or reports a collision. */
  tryAcquire(record: LeaseRecord): Promise<'acquired' | 'worktree-occupied' | 'block-occupied'>;
  /** Releases an exact startup intent after bounded block selection acquired no lease. */
  releaseIntent(record: LeaseRecord): Promise<void>;
  /** Reads a persisted lease without interpreting malformed data as absence. */
  read(
    lookup: LifecycleRecoveryLookup,
  ): Promise<LeaseRecord | 'missing' | 'malformed' | 'incomplete'>;
  /** Lists validated leases for one canonical worktree or reports unsafe unreadable state. */
  findByWorktree(worktreePath: string): Promise<readonly LeaseRecord[] | 'unreadable'>;
  /** Atomically transfers only process ownership when the complete prior record still matches. */
  transferOwner(
    expected: LeaseRecord,
    newOwner: ProcessIdentity,
  ): Promise<LeaseRecord | 'mismatch'>;
  /** Replaces provisional resource fields with exact post-start Docker identities. */
  finalizeResources(
    expected: LeaseRecord,
    discovered: LeaseRecord,
  ): Promise<LeaseRecord | 'mismatch'>;
  /** Releases exactly the supplied, identity-matched lease. */
  release(record: LeaseRecord): Promise<void>;
  /** Moves an unsafe record aside for explicit operator inspection. */
  quarantine(lookup: LifecycleRecoveryLookup): Promise<readonly string[]>;
}

/** Process-presence probe resistant to operating-system PID reuse. */
export interface ProcessProbeAdapter {
  /** Returns the full identity of the process executing the lifecycle operation. */
  currentIdentity(): Promise<ProcessIdentity>;
  /** Checks both PID and process-start fingerprint. */
  presence(identity: ProcessIdentity): Promise<Presence>;
}

/** Identity obtained from Compose labels and actual resources. */
export interface ComposeInspection {
  /** Whether the named project is present, absent, or unreadable. */
  readonly presence: Presence;
  /** Persisted identity labels when the project is readable. */
  readonly identity?: LeaseRecord;
}

/** Compose operations constrained by persisted resource identity. */
export interface ComposeAdapter {
  /** Inspects a project and its identity labels without mutation. */
  inspect(project: string): Promise<ComposeInspection>;
  /** Starts a stack from the supplied immutable manifest. */
  start(manifest: EndpointManifest, signal?: AbortSignal): Promise<void>;
  /** Removes only the resources whose observed identity matches the lease. */
  stop(record: LeaseRecord): Promise<void>;
}

/** Shell-free child-process execution request. */
export interface SpawnRequest {
  /** Executable path or fixed executable name. */
  readonly command: string;
  /** Argument array passed without shell parsing. */
  readonly args: readonly string[];
  /** Explicit environment passed to the child. */
  readonly environment: Readonly<Record<string, string>>;
  /** Shell execution is forbidden for lifecycle children. */
  readonly shell: false;
}

/** Shell-free command adapter used by compatibility entry points and setup steps. */
export interface ChildExecutionAdapter {
  /** Executes a bounded child and returns its numeric exit code. */
  spawn(request: SpawnRequest): Promise<number>;
}

/** Endpoint availability boundary for complete-block preflight checks. */
export interface EndpointAvailabilityAdapter {
  /** Returns every occupied endpoint; any result rejects the complete candidate. */
  occupiedEndpoints(manifest: EndpointManifest): Promise<readonly EndpointName[]>;
}

/** Required harness consumer that receives the same manifest object. */
export interface ManifestConsumerAdapter {
  /** Configures or verifies one lifecycle consumer. */
  apply(manifest: EndpointManifest): Promise<void>;
}

/** Public prerequisite checks whose failures must abort dependent assertions. */
export interface PrerequisiteAdapter {
  /** Executes one named prerequisite against the immutable manifest. */
  run(name: PrerequisiteName, manifest: EndpointManifest, signal?: AbortSignal): Promise<void>;
}

/** Deadline boundary that classifies bounded work without hiding cleanup. */
export interface DeadlineAdapter {
  /** Runs one operation within its named deadline and rejects on expiration. */
  run<T>(operation: string, work: (signal: AbortSignal) => Promise<T>): Promise<T>;
}

/** Traffic-admission boundary that keeps tests away from a mutating stack. */
export interface TrafficAdmissionAdapter {
  /** Blocks new test traffic and waits for admitted work to quiesce. */
  quiesce(record: LeaseRecord, signal?: AbortSignal): Promise<void>;
  /** Confirms no test traffic was admitted while reset was in progress. */
  verifyBlocked(record: LeaseRecord, signal?: AbortSignal): Promise<void>;
  /** Reopens test traffic only after poison is cleared following final verification. */
  resume(record: LeaseRecord, signal?: AbortSignal): Promise<void>;
  /** Restores the pre-reset admission state when no durable mutation began. */
  restore(record: LeaseRecord, signal?: AbortSignal): Promise<void>;
}

/** Porta and client runtime operations used during an ordered reset. */
export interface ResetRuntimeAdapter {
  /** Stops Porta before any backing store is changed. */
  stopPorta(record: LeaseRecord, signal?: AbortSignal): Promise<void>;
  /** Restarts harness clients after backing stores and fixtures are ready. */
  restartClients(record: LeaseRecord, signal?: AbortSignal): Promise<void>;
  /** Restarts Porta only after backing stores and fixtures are ready. */
  restartPorta(record: LeaseRecord, signal?: AbortSignal): Promise<void>;
}

/** Durable states that fence interrupted or failed resets. */
export type DurableResetState = 'ready' | 'resetting-poisoned';

/** Durable poison state used to prevent unsafe in-place retry. */
export interface ResetStateAdapter {
  /** Persists a state transition for the exact owned run. */
  persist(record: LeaseRecord, state: DurableResetState, signal?: AbortSignal): Promise<void>;
  /** Flushes the state transition before destructive work may begin. */
  flush(record: LeaseRecord, signal?: AbortSignal): Promise<void>;
  /** Reads the durable state for admission and recovery decisions. */
  read(record: LeaseRecord, signal?: AbortSignal): Promise<DurableResetState | 'unreadable'>;
}

/** Expected database and fixture identity supplied independently of production logic. */
export interface ResetExpectations {
  /** Exact migration revision that must be applied. */
  readonly migrationRevision: string;
  /** Exact digest of the expected migration set. */
  readonly migrationDigest: string;
  /** Exact digest of deterministic synthetic fixtures. */
  readonly fixtureDigest: string;
  /** Exact deterministic synthetic entity counts. */
  readonly fixtureCounts: Readonly<Record<string, number>>;
}

/** Observed database identity after reset operations finish. */
export interface ResetDatabaseObservation {
  /** Applied migration revision. */
  readonly migrationRevision: string;
  /** Digest of the applied migration set. */
  readonly migrationDigest: string;
  /** Digest of the installed deterministic fixtures. */
  readonly fixtureDigest: string;
  /** Observed synthetic entity counts. */
  readonly fixtureCounts: Readonly<Record<string, number>>;
}

/** PostgreSQL recreation, exact migration, bootstrap, seed, and verification boundary. */
export interface ResetDatabaseAdapter {
  /** Drops and recreates the harness-owned database. */
  recreate(record: LeaseRecord, signal?: AbortSignal): Promise<readonly string[]>;
  /** Applies exactly the supplied migration revision. */
  migrate(record: LeaseRecord, revision: string, signal?: AbortSignal): Promise<void>;
  /** Installs bootstrap records required by deterministic fixtures. */
  bootstrap(record: LeaseRecord, signal?: AbortSignal): Promise<void>;
  /** Installs deterministic synthetic fixture data. */
  seed(record: LeaseRecord, expectations: ResetExpectations, signal?: AbortSignal): Promise<void>;
  /** Reads migration and fixture identity without deriving the expected values. */
  observe(record: LeaseRecord, signal?: AbortSignal): Promise<ResetDatabaseObservation>;
}

/** Harness-dedicated Redis reset boundary. */
export interface ResetRedisAdapter {
  /** Flushes only the Redis allocation owned by the harness run. */
  flush(record: LeaseRecord, signal?: AbortSignal): Promise<number>;
}

/** MailHog reset boundary. */
export interface ResetMailAdapter {
  /** Removes all messages from the harness-owned MailHog allocation. */
  clear(record: LeaseRecord, signal?: AbortSignal): Promise<number>;
}

/** Public checks that gate reuse of a reset stack. */
export interface ResetPublicVerificationAdapter {
  /** Verifies public health and reset postconditions using the immutable endpoint manifest. */
  verify(record: LeaseRecord, signal?: AbortSignal): Promise<void>;
}

/** Capability bundle required only when the controller performs reset or poisoned recovery. */
export interface ResetDependencies {
  /** Independent expected migration and fixture identity. */
  readonly expectations: ResetExpectations;
  /** Traffic quiescence and admission fencing. */
  readonly traffic: TrafficAdmissionAdapter;
  /** Porta and client runtime lifecycle. */
  readonly runtime: ResetRuntimeAdapter;
  /** Durable reset/poison state. */
  readonly state: ResetStateAdapter;
  /** PostgreSQL recreation and deterministic data installation. */
  readonly database: ResetDatabaseAdapter;
  /** Harness-dedicated Redis reset. */
  readonly redis: ResetRedisAdapter;
  /** MailHog message reset. */
  readonly mail: ResetMailAdapter;
  /** Final public health and postcondition checks. */
  readonly publicVerification: ResetPublicVerificationAdapter;
}

/** Injectable lifecycle capabilities used by the controller. */
export interface LifecycleDependencies {
  /** Durable atomic lease state. */
  readonly leases: LeaseStateAdapter;
  /** PID and process-start fingerprint probe. */
  readonly processes: ProcessProbeAdapter;
  /** Compose inspection and execution. */
  readonly compose: ComposeAdapter;
  /** Shell-free child execution. */
  readonly children: ChildExecutionAdapter;
  /** Complete-block endpoint availability. */
  readonly endpoints: EndpointAvailabilityAdapter;
  /** Compose configuration consumer. */
  readonly composeConfig: ManifestConsumerAdapter;
  /** Nginx configuration consumer. */
  readonly nginx: ManifestConsumerAdapter;
  /** Seed consumer. */
  readonly seed: ManifestConsumerAdapter;
  /** SPA configuration consumer. */
  readonly spa: ManifestConsumerAdapter;
  /** BFF configuration consumer. */
  readonly bff: ManifestConsumerAdapter;
  /** Playwright configuration consumer. */
  readonly playwright: ManifestConsumerAdapter;
  /** Health-check consumer. */
  readonly health: ManifestConsumerAdapter;
  /** Evidence consumer. */
  readonly evidence: ManifestConsumerAdapter;
  /** Ordered prerequisite runner. */
  readonly prerequisites: PrerequisiteAdapter;
  /** Bounded-operation deadline enforcement. */
  readonly deadlines: DeadlineAdapter;
  /** Reset-only capabilities; callers that never reset may omit this bundle. */
  readonly reset?: ResetDependencies;
}

/** Public lifecycle operations. */
export interface LifecycleController {
  /** Validates input, acquires a complete block, and creates an ephemeral stack. */
  start(request: LifecycleStartRequest): Promise<LifecycleStartResult>;
  /** Clears only transient Redis and MailHog prerequisites without claiming a complete reset. */
  prepare(ownedRun: OwnedRun): Promise<LifecycleResetOutcome>;
  /** Resets mutable services before a dependent scenario executes. */
  reset(ownedRun: OwnedRun): Promise<LifecycleResetOutcome>;
  /** Cleans exactly the resources still owned by the supplied capability. */
  stop(ownedRun: OwnedRun): Promise<LifecycleOutcome>;
  /** Reclaims persisted ownership only after lookup validation and two independent absence proofs. */
  recover(lookup: LifecycleRecoveryLookup): Promise<LifecycleRecoveryResult>;
  /** Cleans a stale ready stack after dead-owner proof and exact resource inspection. */
  cleanupStale(lookup: LifecycleRecoveryLookup): Promise<LifecycleOutcome>;
}

/** Creates a lifecycle controller from explicit capability adapters. */
export function createLifecycleController(
  dependencies: LifecycleDependencies,
): LifecycleController {
  return new LifecycleControllerImplementation(dependencies);
}

/** Signals understood by the thin compatibility command. */
export type LifecycleSignal = 'SIGINT' | 'SIGTERM';

/** Request passed to the thin compatibility command boundary. */
export interface CompatibilityCommandRequest {
  /** Fixed lifecycle action. */
  readonly action: 'start' | 'reset' | 'stop' | 'recover';
  /** Unparsed argument vector forwarded to the TypeScript entry point. */
  readonly args: readonly string[];
  /** Explicit environment forwarded to the TypeScript entry point. */
  readonly environment: Readonly<Record<string, string>>;
  /** Optional terminating signal received by the wrapper. */
  readonly signal?: LifecycleSignal;
}

/** Executes the compatibility boundary while preserving lifecycle exit semantics. */
export async function runCompatibilityCommand(
  request: CompatibilityCommandRequest,
  children: ChildExecutionAdapter,
): Promise<LifecycleOutcome> {
  const exitCode = await children.spawn({
    command: process.execPath,
    args: ['--import', 'tsx', 'test-harness/scripts/lifecycle.ts', request.action, ...request.args],
    environment: request.environment,
    shell: false,
  });
  const finalExitCode =
    exitCode === 0 && request.signal === 'SIGINT'
      ? 130
      : exitCode === 0 && request.signal === 'SIGTERM'
        ? 143
        : exitCode;
  const normalizedExitCode = isLifecycleExitCode(finalExitCode) ? finalExitCode : 30;
  return {
    exitCode: normalizedExitCode,
    classification: classificationForExit(normalizedExitCode),
    primaryExitCode: isLifecycleExitCode(exitCode) ? exitCode : 30,
    recoveryIdentifiers: [],
  };
}

/** Returns whether a numeric child result belongs to the stable lifecycle taxonomy. */
function isLifecycleExitCode(value: number): value is LifecycleExitCode {
  return [0, 20, 21, 30, 60, 70, 130, 143].includes(value);
}

/** Maps a stable lifecycle exit to its public classification. */
function classificationForExit(exitCode: LifecycleExitCode): LifecycleClassification {
  if (exitCode === 0) return 'success';
  if (exitCode === 20) return 'product-failure';
  if (exitCode === 21) return 'test-failure';
  if (exitCode === 30) return 'setup-failure';
  if (exitCode === 60) return 'cleanup-failure';
  if (exitCode === 70) return 'timeout';
  return 'interrupted';
}
