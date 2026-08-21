import { randomUUID } from 'node:crypto';
import {
  RECOVERY_JOB_ATTEMPT_LIMIT,
  RECOVERY_JOB_CLAIM_LIMIT,
  type ClaimedRecoveryJob,
  type ClaimRecoveryJobsInput,
  type FinishRecoveryJobInput,
  type RecoveryJob,
  type RetryRecoveryJobInput,
} from '../../../src/auth/recovery-job-repository.js';
import {
  RECOVERY_WORKER_FAILURE_REASONS,
  RecoveryJobProcessingError,
  RecoveryWorker,
  type RecoveryWorkerEvent,
  type RecoveryWorkerRepository,
} from '../../../src/auth/recovery-worker.js';
import type {
  ArtifactObservation,
  DeliveryObservation,
  PasswordIdentityState,
  RecoveryDependencyFailure,
  WorkerEventObservation,
} from './enumeration-resistance-contract.js';
import type { EnumerationLiveState } from './enumeration-resistance-live-context.js';

interface StoredJob {
  job: RecoveryJob;
  actionId: string;
  identityState: PasswordIdentityState;
}

function updateJob(state: EnumerationLiveState, stored: StoredJob, job: RecoveryJob): void {
  state.jobs.set(job.id, { ...stored, job });
}

/** In-memory durable transition boundary used only by the live specification driver. */
class EnumerationRecoveryRepository implements RecoveryWorkerRepository {
  /** Create a repository over the shared independently observed state. */
  public constructor(private readonly state: EnumerationLiveState) {}

  /** Atomically claim one ordered bounded batch. */
  public async claimAvailable(input: ClaimRecoveryJobsInput): Promise<ClaimedRecoveryJob[]> {
    const limit = Math.min(input.limit ?? RECOVERY_JOB_CLAIM_LIMIT, RECOVERY_JOB_CLAIM_LIMIT);
    const selected = [...this.state.jobs.values()]
      .filter(
        ({ job }) =>
          (job.status === 'available' && job.availableAt.getTime() <= input.now.getTime()) ||
          (job.status === 'claimed' &&
            job.claimedAt !== null &&
            job.claimedAt.getTime() <= input.leaseExpiredBefore.getTime()),
      )
      .slice(0, limit);

    return selected.map((stored) => {
      const previous = stored.job;
      const disposition =
        previous.status === 'available'
          ? 'available'
          : previous.attemptCount >= RECOVERY_JOB_ATTEMPT_LIMIT
            ? 'lease_exhausted'
            : 'lease_reclaimed';
      const claimed: ClaimedRecoveryJob = {
        ...previous,
        status: 'claimed',
        claimedAt: input.now,
        claimedBy: input.workerId,
        attemptCount: Math.min(previous.attemptCount + 1, RECOVERY_JOB_ATTEMPT_LIMIT),
        lastFailureReason: null,
        completedAt: null,
        updatedAt: input.now,
        claimDisposition: disposition,
      };
      updateJob(this.state, stored, claimed);
      return claimed;
    });
  }

  /** Return an owned claim to the available queue. */
  public async scheduleRetry(input: RetryRecoveryJobInput): Promise<boolean> {
    const stored = this.state.jobs.get(input.jobId);
    if (!stored || stored.job.status !== 'claimed' || stored.job.claimedBy !== input.workerId) {
      return false;
    }
    updateJob(this.state, stored, {
      ...stored.job,
      status: 'available',
      availableAt: input.availableAt,
      claimedAt: null,
      claimedBy: null,
      lastFailureReason: input.reason,
      updatedAt: input.now,
    });
    return true;
  }

  /** Complete an owned claim. */
  public async markCompleted(input: FinishRecoveryJobInput): Promise<boolean> {
    return this.finish(input, 'completed');
  }

  /** Terminally close an owned claim. */
  public async markTerminalFailure(input: FinishRecoveryJobInput): Promise<boolean> {
    return this.finish(input, 'terminal_failure');
  }

  private finish(input: FinishRecoveryJobInput, status: 'completed' | 'terminal_failure'): boolean {
    const stored = this.state.jobs.get(input.jobId);
    if (!stored || stored.job.status !== 'claimed' || stored.job.claimedBy !== input.workerId) {
      return false;
    }
    updateJob(this.state, stored, {
      ...stored.job,
      status,
      claimedAt: null,
      claimedBy: null,
      lastFailureReason: status === 'terminal_failure' ? (input.reason ?? null) : null,
      completedAt: input.now,
      updatedAt: input.now,
    });
    return true;
  }
}

/** Recovery worker exposing one bounded cycle to the specification driver. */
class EnumerationRecoveryWorker extends RecoveryWorker {
  /** Execute the same single-flight product cycle used by the scheduler. */
  public executeCycle(): Promise<void> {
    return this.runCycle();
  }
}

/** Drives the real recovery scheduler over deterministic external dependencies. */
export class EnumerationLiveWorkerDriver {
  private readonly repository: EnumerationRecoveryRepository;
  private worker: EnumerationRecoveryWorker;
  private workerId = randomUUID();
  private now = new Date('2026-01-01T00:00:00.000Z');
  private failurePlan: RecoveryDependencyFailure[] = [];
  private readonly artifacts: ArtifactObservation[] = [];
  private readonly deliveries: DeliveryObservation[] = [];
  private readonly events: WorkerEventObservation[] = [];
  private readonly output: string[] = [];

  /** Create a worker driver over shared durable state. */
  public constructor(private readonly state: EnumerationLiveState) {
    this.repository = new EnumerationRecoveryRepository(state);
    this.worker = this.createWorker();
  }

  /** Reset transient effects while preserving the current arranged job store. */
  public reset(): void {
    this.failurePlan = [];
    this.artifacts.length = 0;
    this.deliveries.length = 0;
    this.events.length = 0;
    this.output.length = 0;
    this.workerId = randomUUID();
    this.worker = this.createWorker();
  }

  /** Configure an ordered dependency-failure plan. */
  public setFailurePlan(plan: readonly RecoveryDependencyFailure[]): void {
    this.failurePlan = [...plan];
  }

  /** Execute one bounded product worker cycle. */
  public async runOnce(): Promise<void> {
    await this.worker.executeCycle();
  }

  /** Claim one batch without running processors, simulating immediate process loss. */
  public async crashAfterClaim(): Promise<void> {
    const claimed = await this.repository.claimAvailable({
      workerId: this.workerId,
      now: this.now,
      leaseExpiredBefore: new Date(this.now.getTime() - 300_000),
      limit: RECOVERY_JOB_CLAIM_LIMIT,
    });
    for (const job of claimed)
      this.observeWorkerEvent({ event: 'claimed', jobId: job.id, attempt: job.attemptCount });
  }

  /** Replace only the process identity, preserving durable jobs. */
  public restart(): void {
    this.workerId = randomUUID();
    this.worker = this.createWorker();
  }

  /** Advance the deterministic clock and process work that becomes available at the new time. */
  public async advance(milliseconds: number): Promise<void> {
    this.now = new Date(this.now.getTime() + milliseconds);
    if (
      [...this.state.jobs.values()].some(
        ({ job }) =>
          (job.status === 'available' && job.availableAt.getTime() <= this.now.getTime()) ||
          (job.status === 'claimed' &&
            job.claimedAt !== null &&
            job.claimedAt.getTime() <= this.now.getTime() - 300_000),
      )
    ) {
      await this.runOnce();
    }
  }

  /** Emit the real bounded graceful-shutdown lifecycle. */
  public async shutdown(): Promise<void> {
    this.worker.start();
    await this.worker.stop();
  }

  /** Read independently captured worker effects. */
  public observe() {
    return {
      artifacts: [...this.artifacts],
      deliveries: [...this.deliveries],
      workerEvents: [...this.events],
      workerReasonCatalog: [...RECOVERY_WORKER_FAILURE_REASONS],
      operationalOutput: [...this.output],
    };
  }

  private createWorker(): EnumerationRecoveryWorker {
    return new EnumerationRecoveryWorker({
      repository: this.repository,
      workerId: this.workerId,
      clock: {
        now: () => this.now,
        setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
        clearTimeout: (timer) => clearTimeout(timer),
      },
      processor: {
        process: async (job) => {
          const failure = this.failurePlan.shift();
          if (failure) {
            throw new RecoveryJobProcessingError(
              failure === 'database' ? 'database_unavailable' : 'smtp_outcome_unknown',
              true,
            );
          }
          const stored = this.state.jobs.get(job.id);
          if (!stored || stored.identityState !== 'active') return 'no_op';
          if (!this.artifacts.some((artifact) => artifact.jobId === job.id)) {
            this.artifacts.push({ jobId: job.id, jobType: job.jobType, active: true });
          }
          if (!this.deliveries.some((delivery) => delivery.jobId === job.id)) {
            this.deliveries.push({
              jobId: job.id,
              jobType: job.jobType,
              artifactIdentity: `synthetic:${job.id}`,
              outcome: 'accepted',
            });
          }
          return 'completed';
        },
      },
      observer: (event) => this.observeWorkerEvent(event),
    });
  }

  private observeWorkerEvent(event: RecoveryWorkerEvent): void {
    if (event.event === 'shutdown_timeout') return;
    const normalizedEvent = event.event === 'no_op' ? 'completed' : event.event;
    this.events.push({
      event: normalizedEvent,
      ...(event.jobId === undefined ? {} : { jobId: event.jobId }),
      ...(event.attempt === undefined ? {} : { attempt: event.attempt }),
      ...(event.delayMilliseconds === undefined
        ? {}
        : { delayMilliseconds: event.delayMilliseconds }),
      ...(event.reason === undefined ? {} : { reason: event.reason }),
    });
    this.output.push(
      normalizedEvent === 'completed'
        ? 'recovery_job_settled'
        : `recovery_worker_event=${normalizedEvent}`,
    );
  }
}
