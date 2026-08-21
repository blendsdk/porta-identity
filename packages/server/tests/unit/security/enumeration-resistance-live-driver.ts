import { randomUUID } from 'node:crypto';
import type { RecoveryJob } from '../../../src/auth/recovery-job-repository.js';
import type {
  EnumerationResistanceObservations,
  EnumerationResistanceSpecDriver,
  IdentityFixture,
  PasswordIdentityState,
  RecoveryDependencyFailure,
  RecoveryJobObservation,
  TimingDiagnosticObservation,
} from './enumeration-resistance-contract.js';
import {
  createEnumerationIdentity,
  enqueueEnumerationJob,
  EnumerationLiveRouteDriver,
  type EnumerationLiveState,
} from './enumeration-resistance-live-context.js';
import { EnumerationLiveWorkerDriver } from './enumeration-resistance-live-worker.js';

function createState(): EnumerationLiveState {
  return {
    fixture: createEnumerationIdentity('absent'),
    actionId: randomUUID(),
    jobs: new Map(),
    passwordVerifications: [],
    failureOperations: [],
    authenticationActionIds: [],
    forceDummyMatch: false,
  };
}

function observeJob(stored: { job: RecoveryJob; actionId: string }): RecoveryJobObservation {
  return {
    actionId: stored.actionId,
    jobId: stored.job.id,
    jobType: stored.job.jobType,
    organizationId: stored.job.organizationId,
    schema: [
      'jobType',
      'organizationId',
      'protectedAddress',
      'interactionUid',
      'idempotencyDigest',
      'availableAt',
    ],
    containsToken: false,
    status: stored.job.status,
    attemptCount: stored.job.attemptCount,
  };
}

/** Live specification driver over Porta route handlers and the production worker scheduler. */
export class LiveEnumerationResistanceDriver implements EnumerationResistanceSpecDriver {
  private readonly state = createState();
  private readonly routes = new EnumerationLiveRouteDriver(this.state);
  private readonly worker = new EnumerationLiveWorkerDriver(this.state);

  /** Reset all owned observations and arrange one identity state. */
  public async reset(state: PasswordIdentityState): Promise<IdentityFixture> {
    this.state.fixture = createEnumerationIdentity(state);
    this.state.actionId = randomUUID();
    this.state.jobs.clear();
    this.state.passwordVerifications.length = 0;
    this.state.failureOperations.length = 0;
    this.state.authenticationActionIds.length = 0;
    this.state.forceDummyMatch = false;
    this.worker.reset();
    return this.state.fixture;
  }

  /** Submit an admitted password attempt through the real interaction handler. */
  public async submitPassword(input: {
    readonly fixture: IdentityFixture;
    readonly password: 'wrong' | 'fixture-valid';
    readonly forceDummyMatch?: boolean;
  }) {
    this.assertFixture(input.fixture);
    this.state.actionId = randomUUID();
    this.state.forceDummyMatch = input.forceDummyMatch ?? false;
    return this.routes.submitPassword(input.password);
  }

  /** Submit an admitted recovery request through its real public route. */
  public async requestRecovery(input: {
    readonly fixture: IdentityFixture;
    readonly jobType: 'magic_link' | 'password_reset';
  }) {
    this.assertFixture(input.fixture);
    this.state.actionId = randomUUID();
    return this.routes.requestRecovery(input.jobType);
  }

  /** Insert extra durable jobs for the batch-bound scenario. */
  public async enqueueAdditionalRecoveryJobs(input: {
    readonly count: number;
    readonly identityState: PasswordIdentityState;
  }): Promise<void> {
    for (let index = 0; index < input.count; index += 1) {
      enqueueEnumerationJob(
        this.state,
        {
          jobType: 'magic_link',
          organizationId: this.state.fixture.tenantId,
          email: `additional-${index}@enumeration.invalid`,
          interactionUid: `additional-${index}`,
          actionNonce: `additional-${index}`,
        },
        input.identityState,
      );
    }
  }

  /** Configure ordered external failures for subsequent worker attempts. */
  public async setRecoveryFailurePlan(plan: readonly RecoveryDependencyFailure[]): Promise<void> {
    this.worker.setFailurePlan(plan);
  }

  /** Run one bounded worker cycle. */
  public async runRecoveryWorkerOnce(): Promise<void> {
    await this.worker.runOnce();
  }

  /** Claim a batch without processing it, preserving durable crash state. */
  public async crashRecoveryWorkerAfterClaim(): Promise<void> {
    await this.worker.crashAfterClaim();
  }

  /** Replace the worker process identity without resetting durable state. */
  public async restartRecoveryWorker(): Promise<void> {
    this.worker.restart();
  }

  /** Advance the deterministic worker clock. */
  public async advanceClock(milliseconds: number): Promise<void> {
    await this.worker.advance(milliseconds);
  }

  /** Exercise the worker's bounded shutdown lifecycle. */
  public async beginRecoveryWorkerShutdown(): Promise<void> {
    await this.worker.shutdown();
  }

  /** Read independent state and boundary observations. */
  public async observe(): Promise<EnumerationResistanceObservations> {
    const worker = this.worker.observe();
    return {
      passwordVerifications: [...this.state.passwordVerifications],
      failureOperations: [...this.state.failureOperations],
      authenticationEffects: this.state.authenticationActionIds.map((actionId) => ({
        actionId,
        kind: 'authentication',
      })),
      recoveryJobs: [...this.state.jobs.values()].map(observeJob),
      artifacts: worker.artifacts,
      deliveries: worker.deliveries,
      workerEvents: worker.workerEvents,
      workerReasonCatalog: worker.workerReasonCatalog,
      operationalOutput: worker.operationalOutput,
    };
  }

  /** Return the non-gating timing authority retained by the test program. */
  public async readTimingDiagnostic(): Promise<TimingDiagnosticObservation> {
    return {
      gating: false,
      securityClaimImpact: 'none',
      ordinaryVerificationMember: false,
      securityClaimTransitions: [],
    };
  }

  private assertFixture(fixture: IdentityFixture): void {
    if (
      fixture.state !== this.state.fixture.state ||
      fixture.tenantId !== this.state.fixture.tenantId ||
      fixture.email !== this.state.fixture.email
    ) {
      throw new Error('Enumeration fixture does not belong to the current driver arrangement');
    }
  }
}
