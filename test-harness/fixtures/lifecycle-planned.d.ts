/**
 * Declaration-only contract for the harness lifecycle boundary.
 *
 * The runtime module is intentionally absent while the specification suite is being authored.
 * A later implementation must satisfy these declarations without changing the specification.
 */

declare const ownedRunBrand: unique symbol;

/** Stable classifications emitted by every lifecycle operation. */
export type LifecycleClassification =
  | 'success'
  | 'setup-failure'
  | 'cleanup-failure'
  | 'timeout'
  | 'interrupted';

/** Exit codes reserved by the lifecycle contract. */
export type LifecycleExitCode = 0 | 30 | 60 | 70 | 130 | 143;

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

/** Persisted ownership record used to fence cleanup and stale recovery. */
export interface LeaseRecord {
  /** Validated run identifier. */
  readonly runId: string;
  /** Process that acquired the lease. */
  readonly ownerProcess: ProcessIdentity;
  /** Canonical owning worktree path. */
  readonly worktreePath: string;
  /** Compose project carrying matching identity labels. */
  readonly composeProject: string;
  /** Container identities owned by the run. */
  readonly containerIds: readonly string[];
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

/** Result of starting a run; ownership exists only after complete setup succeeds. */
export interface LifecycleStartResult {
  /** Lifecycle outcome. */
  readonly outcome: LifecycleOutcome;
  /** Opaque cleanup capability present only for an owned run. */
  readonly ownedRun?: OwnedRun;
}

/** Atomically persisted lease-state operations. */
export interface LeaseStateAdapter {
  /** Atomically acquires the complete candidate block or reports a collision. */
  tryAcquire(record: LeaseRecord): Promise<'acquired' | 'occupied'>;
  /** Reads a persisted lease without interpreting malformed data as absence. */
  read(
    lookup: LifecycleRecoveryLookup,
  ): Promise<LeaseRecord | 'missing' | 'malformed' | 'incomplete'>;
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
  start(manifest: EndpointManifest): Promise<void>;
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
  run(name: PrerequisiteName, manifest: EndpointManifest): Promise<void>;
}

/** Deadline boundary that classifies bounded work without hiding cleanup. */
export interface DeadlineAdapter {
  /** Runs one operation within its named deadline and rejects on expiration. */
  run<T>(operation: string, work: () => Promise<T>): Promise<T>;
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
}

/** Public lifecycle operations. */
export interface LifecycleController {
  /** Validates input, acquires a complete block, and creates an ephemeral stack. */
  start(request: LifecycleStartRequest): Promise<LifecycleStartResult>;
  /** Resets mutable services before a dependent scenario executes. */
  reset(ownedRun: OwnedRun): Promise<LifecycleOutcome>;
  /** Cleans exactly the resources still owned by the supplied capability. */
  stop(ownedRun: OwnedRun): Promise<LifecycleOutcome>;
  /** Reclaims persisted ownership only after lookup validation and two independent absence proofs. */
  recover(lookup: LifecycleRecoveryLookup): Promise<LifecycleOutcome>;
}

/** Creates a lifecycle controller from explicit capability adapters. */
export function createLifecycleController(dependencies: LifecycleDependencies): LifecycleController;

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
export function runCompatibilityCommand(
  request: CompatibilityCommandRequest,
  children: ChildExecutionAdapter,
): Promise<LifecycleOutcome>;
