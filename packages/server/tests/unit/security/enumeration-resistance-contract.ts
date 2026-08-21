/** Stable failure text used when the behavioral observation capability is unavailable. */
export const ENUMERATION_RESISTANCE_CAPABILITY_MISSING =
  'ENUMERATION_RESISTANCE_CAPABILITY_MISSING';

/** Closed account-state catalog exercised by password and recovery specifications. */
export const PASSWORD_IDENTITY_STATES = [
  'active',
  'absent',
  'passwordless',
  'disabled',
  'suspended',
  'locked',
] as const;

/** Closed recovery-work catalog exercised by request and worker specifications. */
export const RECOVERY_JOB_TYPES = ['magic_link', 'password_reset'] as const;

/** Account state arranged by the test-owned driver. */
export type PasswordIdentityState = (typeof PASSWORD_IDENTITY_STATES)[number];
/** Recovery operation represented by an outbox job. */
export type RecoveryJobType = (typeof RECOVERY_JOB_TYPES)[number];
/** Transient dependency failure that the driver can inject before a worker attempt. */
export type RecoveryDependencyFailure = 'database' | 'smtp';

/** Immutable, requirement-derived bounds validated even without a live product driver. */
export interface EnumerationResistanceOracle {
  /** Complete ordered specification catalog owned by this contract. */
  readonly specificationCases: readonly [
    'password-failure-work-shape',
    'dummy-hash-has-no-authority',
    'recovery-request-work-shape',
    'recovery-worker-private-outcome',
    'recovery-worker-bounds',
    'timing-diagnostics-are-non-gating',
  ];
  /** Account states for which failure work must remain structurally equal. */
  readonly passwordIdentityStates: typeof PASSWORD_IDENTITY_STATES;
  /** Supported recovery work types. */
  readonly recoveryJobTypes: typeof RECOVERY_JOB_TYPES;
  /** Password-path operation-count and authentication constraints. */
  readonly password: {
    /** Required verification count for each admitted password attempt. */
    readonly argon2idVerificationsPerAdmittedAttempt: 1;
    /** Required accounting-operation count for each failed password attempt. */
    readonly failureOperationsPerFailedAttempt: 1;
    /** Whether a dummy-hash match has authentication authority. */
    readonly dummyVerificationCanAuthenticate: false;
  };
  /** Recovery request-path work constraints. */
  readonly recoveryRequest: {
    /** Required durable jobs inserted by each admitted request. */
    readonly jobsPerAdmittedRequest: 1;
    /** Whether account-specific work may complete in the public request. */
    readonly accountSpecificWorkInRequest: false;
  };
  /** Production boundaries from which behavioral evidence must be observed. */
  readonly evidence: {
    /** Password verification uses the product Argon2id service. */
    readonly passwordVerifier: 'production-service';
    /** Failure accounting uses the product repository transaction. */
    readonly failurePersistence: 'production-repository';
    /** Recovery processing uses the concrete account-recovery processor. */
    readonly recoveryProcessor: 'production-processor';
    /** Jobs and artifacts are observed from durable persistence. */
    readonly durableState: 'database-observer';
    /** Delivery is observed at the real mail-transport boundary. */
    readonly delivery: 'mail-transport-observer';
  };
  /** Fixed recovery-worker lifecycle and retry bounds. */
  readonly worker: {
    /** Maximum jobs claimed by one worker pass. */
    readonly claimBatchMaximum: 25;
    /** Poll interval used when no enqueue wake-up arrives. */
    readonly fallbackPollMilliseconds: 1_000;
    /** Maximum total processing attempts for one job. */
    readonly totalAttempts: 5;
    /** Fixed bounded retry-delay catalog. */
    readonly retryDelaysMilliseconds: readonly [1_000, 10_000, 60_000, 300_000];
    /** Claim age required before another worker may reclaim it. */
    readonly leaseMilliseconds: 300_000;
    /** Maximum graceful-shutdown settlement window. */
    readonly shutdownSettleMilliseconds: 30_000;
  };
  /** Restrictions on retained timing diagnostics. */
  readonly timing: {
    /** Whether diagnostic measurements can gate verification. */
    readonly gating: false;
    /** Permitted effect on a security claim. */
    readonly securityClaimImpact: 'none';
    /** Whether the diagnostic belongs to ordinary verification. */
    readonly ordinaryVerificationMember: false;
  };
}

/** Frozen runtime oracle used to detect accidental requirement drift. */
export const ENUMERATION_RESISTANCE_ORACLE = Object.freeze({
  specificationCases: [
    'password-failure-work-shape',
    'dummy-hash-has-no-authority',
    'recovery-request-work-shape',
    'recovery-worker-private-outcome',
    'recovery-worker-bounds',
    'timing-diagnostics-are-non-gating',
  ],
  passwordIdentityStates: PASSWORD_IDENTITY_STATES,
  recoveryJobTypes: RECOVERY_JOB_TYPES,
  password: {
    argon2idVerificationsPerAdmittedAttempt: 1,
    failureOperationsPerFailedAttempt: 1,
    dummyVerificationCanAuthenticate: false,
  },
  recoveryRequest: {
    jobsPerAdmittedRequest: 1,
    accountSpecificWorkInRequest: false,
  },
  evidence: {
    passwordVerifier: 'production-service',
    failurePersistence: 'production-repository',
    recoveryProcessor: 'production-processor',
    durableState: 'database-observer',
    delivery: 'mail-transport-observer',
  },
  worker: {
    claimBatchMaximum: 25,
    fallbackPollMilliseconds: 1_000,
    totalAttempts: 5,
    retryDelaysMilliseconds: [1_000, 10_000, 60_000, 300_000],
    leaseMilliseconds: 300_000,
    shutdownSettleMilliseconds: 30_000,
  },
  timing: {
    gating: false,
    securityClaimImpact: 'none',
    ordinaryVerificationMember: false,
  },
} as const satisfies EnumerationResistanceOracle);

/** Identity and tenant facts arranged independently for one scenario. */
export interface IdentityFixture {
  /** Account state represented by the fixture. */
  readonly state: PasswordIdentityState;
  /** Tenant submitted through the public boundary. */
  readonly tenantId: string;
  /** Scenario email, retained only so privacy assertions can search for it. */
  readonly email: string;
  /** Real account identifier when the arranged state owns an account. */
  readonly accountId?: string;
}

/** Canonical public response facts with nondeterministic secret values excluded. */
export interface PublicResponseSnapshot {
  /** Public HTTP status. */
  readonly status: number;
  /** Structural page or response-body representation. */
  readonly pageOrBodySchema: unknown;
  /** Public generic error, or null for a successful response. */
  readonly genericError: string | null;
  /** Security-relevant response headers. */
  readonly securityHeaders: Readonly<Record<string, string>>;
  /** Cookie names and attributes without random cookie values. */
  readonly cookies: readonly {
    /** Public cookie name. */
    readonly name: string;
    /** Security and scope attributes attached to the cookie. */
    readonly attributes: Readonly<Record<string, string | boolean>>;
  }[];
  /** Canonical redirect shape without random identifiers, or null. */
  readonly redirectShape: string | null;
}

/** Public action result correlated to independent owned-state observations. */
export interface PublicAction {
  /** Driver-generated correlation identifier. */
  readonly actionId: string;
  /** Canonical public response. */
  readonly response: PublicResponseSnapshot;
}

/** Independently captured password-verifier invocation. */
export interface PasswordVerificationObservation {
  /** Public action that caused the invocation. */
  readonly actionId: string;
  /** Password verification algorithm actually invoked. */
  readonly algorithm: 'argon2id';
  /** Opaque fixture classification of the hash passed to the verifier. */
  readonly hashSource: 'account' | 'dummy';
  /** Authentication-eligible result returned by the production verifier. */
  readonly matched: boolean;
}

/** Independently captured password-failure persistence operation. */
export interface FailureOperationObservation {
  /** Public action that caused the operation. */
  readonly actionId: string;
  /** Stable ordered field/query-boundary shape without sensitive values. */
  readonly operationShape: readonly string[];
}

/** Authentication, session, or token effect observed outside the request result. */
export interface AuthenticationEffectObservation {
  /** Public action that caused the effect. */
  readonly actionId: string;
  /** Security effect category. */
  readonly kind: 'authentication' | 'session' | 'token';
}

/** Durable recovery job observed directly from owned persistence. */
export interface RecoveryJobObservation {
  /** Public action that inserted the job. */
  readonly actionId: string;
  /** Durable job identifier. */
  readonly jobId: string;
  /** Recovery operation requested by the job. */
  readonly jobType: RecoveryJobType;
  /** Tenant authority persisted with the job. */
  readonly organizationId: string;
  /** Stable ordered job-field shape without protected values. */
  readonly schema: readonly string[];
  /** Whether the job improperly contains an authentication token. */
  readonly containsToken: boolean;
  /** Current durable lifecycle state. */
  readonly status: 'available' | 'claimed' | 'completed' | 'terminal_failure';
  /** Durable processing-attempt count. */
  readonly attemptCount: number;
}

/** Authentication artifact observed independently from worker reporting. */
export interface ArtifactObservation {
  /** Recovery job that owns the artifact. */
  readonly jobId: string;
  /** Recovery operation represented by the artifact. */
  readonly jobType: RecoveryJobType;
  /** Whether the artifact remains active. */
  readonly active: boolean;
}

/** Mail delivery observed independently from worker reporting. */
export interface DeliveryObservation {
  /** Recovery job correlated to the delivery. */
  readonly jobId: string;
  /** Recovery operation represented by the delivery. */
  readonly jobType: RecoveryJobType;
  /** Domain-separated digest identifying the delivered artifact without retaining it. */
  readonly artifactIdentity: string;
  /** Observed SMTP outcome for this physical delivery. */
  readonly outcome: 'accepted' | 'accepted_outcome_unknown';
}

/** Privacy-safe worker lifecycle event captured from operational output. */
export interface WorkerEventObservation {
  /** Closed lifecycle event name. */
  readonly event:
    | 'claimed'
    | 'completed'
    | 'retry_scheduled'
    | 'lease_reclaimed'
    | 'terminal_failure'
    | 'shutdown_started'
    | 'shutdown_settled';
  /** Related job identifier when the event is job-specific. */
  readonly jobId?: string;
  /** Attempt number when the event describes processing. */
  readonly attempt?: number;
  /** Scheduled retry delay when applicable. */
  readonly delayMilliseconds?: number;
  /** Closed terminal or retry reason when applicable. */
  readonly reason?: string;
}

/** Retained timing diagnostic authority metadata. */
export interface TimingDiagnosticObservation {
  /** Whether the diagnostic gates any command. */
  readonly gating: boolean;
  /** Diagnostic effect on security claims. */
  readonly securityClaimImpact: string;
  /** Whether ordinary verification executes the diagnostic. */
  readonly ordinaryVerificationMember: boolean;
  /** Security-claim transitions attributed to the diagnostic. */
  readonly securityClaimTransitions: readonly string[];
}

/** Complete independent observation snapshot for the current arranged scenario. */
export interface EnumerationResistanceObservations {
  /** Captured password-verifier invocations. */
  readonly passwordVerifications: readonly PasswordVerificationObservation[];
  /** Captured failure-accounting operations. */
  readonly failureOperations: readonly FailureOperationObservation[];
  /** Captured authentication-related effects. */
  readonly authenticationEffects: readonly AuthenticationEffectObservation[];
  /** Persisted recovery jobs. */
  readonly recoveryJobs: readonly RecoveryJobObservation[];
  /** Persisted authentication artifacts. */
  readonly artifacts: readonly ArtifactObservation[];
  /** Captured mail deliveries. */
  readonly deliveries: readonly DeliveryObservation[];
  /** Captured privacy-safe worker lifecycle events. */
  readonly workerEvents: readonly WorkerEventObservation[];
  /** Closed reason-code catalog exported by the live worker boundary. */
  readonly workerReasonCatalog: readonly string[];
  /** Raw bounded operational output used for canary assertions. */
  readonly operationalOutput: readonly string[];
}

/** Swappable test-owned driver over public actions and independent observers. */
export interface EnumerationResistanceSpecDriver {
  /** Reset owned state and arrange one identity scenario. */
  reset(state: PasswordIdentityState): Promise<IdentityFixture>;
  /** Submit an admitted password attempt through the public boundary. */
  submitPassword(input: {
    /** Arranged identity submitted by the request. */
    readonly fixture: IdentityFixture;
    /** Closed password fixture selection. */
    readonly password: 'wrong' | 'fixture-valid';
    /** Force a dummy verifier match to prove that it lacks authentication authority. */
    readonly forceDummyMatch?: boolean;
  }): Promise<PublicAction>;
  /** Submit an admitted recovery request through the public boundary. */
  requestRecovery(input: {
    /** Arranged identity submitted by the request. */
    readonly fixture: IdentityFixture;
    /** Requested recovery operation. */
    readonly jobType: RecoveryJobType;
  }): Promise<PublicAction>;
  /** Insert additional independently observable jobs for batch-bound testing. */
  enqueueAdditionalRecoveryJobs(input: {
    /** Number of additional jobs to insert. */
    readonly count: number;
    /** Account state resolved when each additional job runs. */
    readonly identityState: PasswordIdentityState;
  }): Promise<void>;
  /** Configure an ordered transient-failure sequence. */
  setRecoveryFailurePlan(plan: readonly RecoveryDependencyFailure[]): Promise<void>;
  /** Run one bounded worker claim-and-process pass. */
  runRecoveryWorkerOnce(): Promise<void>;
  /** Claim one batch and simulate process loss before completion. */
  crashRecoveryWorkerAfterClaim(): Promise<void>;
  /** Restore the worker without changing durable state. */
  restartRecoveryWorker(): Promise<void>;
  /** Advance the driver's deterministic clock. */
  advanceClock(milliseconds: number): Promise<void>;
  /** Start bounded graceful shutdown. */
  beginRecoveryWorkerShutdown(): Promise<void>;
  /** Read independent owned-state and operational observations. */
  observe(): Promise<EnumerationResistanceObservations>;
  /** Read retained timing diagnostic authority metadata. */
  readTimingDiagnostic(): Promise<TimingDiagnosticObservation>;
}

/** Live capability that can create a truthful behavioral driver. */
export interface LiveEnumerationResistanceCapability {
  /** Discriminator admitting behavioral specification execution. */
  readonly available: true;
  /** Fixed admission marker excluding a test-owned behavioral simulation. */
  readonly evidenceBoundary: 'production-services';
  /** Create an isolated driver instance. */
  createDriver(): Promise<EnumerationResistanceSpecDriver>;
}

/** Fail-closed capability returned until truthful observers are wired. */
export interface UnavailableEnumerationResistanceCapability {
  /** Discriminator preventing behavioral specification admission. */
  readonly available: false;
  /** Stable unavailable reason. */
  readonly reason: typeof ENUMERATION_RESISTANCE_CAPABILITY_MISSING;
}

/** Capability union consumed by the immutable specification suite. */
export type EnumerationResistanceCapability =
  LiveEnumerationResistanceCapability | UnavailableEnumerationResistanceCapability;
