/**
 * Bounded lifecycle owner for durable account-recovery jobs.
 *
 * The worker has a single claim loop, processes one claimed batch sequentially, and never permits
 * overlapping polls. Repository ownership checks fence every transition. Product-specific token
 * and mail work is injected through a processor so the scheduler can be tested without coupling
 * its concurrency rules to route or template implementation.
 */

import { randomUUID } from 'node:crypto';
import { logger } from '../lib/logger.js';
import {
  RECOVERY_JOB_ATTEMPT_LIMIT,
  RECOVERY_JOB_CLAIM_LIMIT,
  type ClaimRecoveryJobsInput,
  type ClaimedRecoveryJob,
  type FinishRecoveryJobInput,
  type RetryRecoveryJobInput,
} from './recovery-job-repository.js';

/** Poll interval used when no enqueue wake-up arrives. */
export const RECOVERY_WORKER_POLL_MILLISECONDS = 1_000;

/** Lease age after which another worker may recover a crashed claim. */
export const RECOVERY_WORKER_LEASE_MILLISECONDS = 300_000;

/** Maximum graceful-shutdown wait for the active worker cycle. */
export const RECOVERY_WORKER_SHUTDOWN_MILLISECONDS = 30_000;

/** Four delays between the five permitted processing attempts. */
export const RECOVERY_WORKER_RETRY_DELAYS_MILLISECONDS = [1_000, 10_000, 60_000, 300_000] as const;

/** Closed privacy-safe worker failure reasons. */
export const RECOVERY_WORKER_FAILURE_REASONS = [
  'database_unavailable',
  'smtp_unavailable',
  'smtp_outcome_unknown',
  'invalid_protected_input',
  'template_unavailable',
  'lease_exhausted',
  'processing_failed',
] as const;

/** Privacy-safe reason accepted by recovery retry and terminal transitions. */
export type RecoveryWorkerFailureReason = (typeof RECOVERY_WORKER_FAILURE_REASONS)[number];

/** Durable transitions required by the worker scheduler. */
export interface RecoveryWorkerRepository {
  /** Atomically claim one bounded available or expired-lease batch. */
  claimAvailable(input: ClaimRecoveryJobsInput): Promise<readonly ClaimedRecoveryJob[]>;
  /** Return an owned transient failure to the queue. */
  scheduleRetry(input: RetryRecoveryJobInput): Promise<boolean>;
  /** Complete an owned claim. */
  markCompleted(input: FinishRecoveryJobInput): Promise<boolean>;
  /** Terminally close an owned claim. */
  markTerminalFailure(input: FinishRecoveryJobInput): Promise<boolean>;
}

/** Result returned by account-specific recovery processing. */
export type RecoveryJobProcessingResult = 'completed' | 'no_op';

/** Product-specific processor invoked only after a durable claim succeeds. */
export interface RecoveryJobProcessor {
  /**
   * Process one claimed job.
   *
   * @param job - Owner-fenced durable claim.
   * @returns Whether the job produced an intended effect or completed as a private no-op.
   */
  process(job: ClaimedRecoveryJob): Promise<RecoveryJobProcessingResult>;
}

/** Clock/timer boundary used for deterministic worker tests. */
export interface RecoveryWorkerClock {
  /** Read the repository clock. */
  now(): Date;
  /** Schedule a callback after a bounded delay. */
  setTimeout(callback: () => void, milliseconds: number): ReturnType<typeof setTimeout>;
  /** Cancel a previously scheduled callback. */
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

/** Privacy-safe lifecycle event exposed to owned test and metrics observers. */
export interface RecoveryWorkerEvent {
  /** Closed event category. */
  readonly event:
    | 'claimed'
    | 'completed'
    | 'no_op'
    | 'retry_scheduled'
    | 'lease_reclaimed'
    | 'terminal_failure'
    | 'shutdown_started'
    | 'shutdown_settled'
    | 'shutdown_timeout';
  /** Job identity for an in-process observer; the default logger never emits it. */
  readonly jobId?: string;
  /** Processing attempt when applicable. */
  readonly attempt?: number;
  /** Retry delay when applicable. */
  readonly delayMilliseconds?: number;
  /** Closed failure reason when applicable. */
  readonly reason?: RecoveryWorkerFailureReason;
}

/** Optional observer for metrics and implementation tests. */
export type RecoveryWorkerObserver = (event: RecoveryWorkerEvent) => void;

/** Construction dependencies for a recovery worker. */
export interface RecoveryWorkerOptions {
  /** Durable repository used for every ownership transition. */
  readonly repository: RecoveryWorkerRepository;
  /** Account-specific processor. */
  readonly processor: RecoveryJobProcessor;
  /** Stable worker-process UUID; defaults to a fresh UUID. */
  readonly workerId?: string;
  /** Deterministic clock/timer boundary. */
  readonly clock?: RecoveryWorkerClock;
  /** Optional in-process event observer. */
  readonly observer?: RecoveryWorkerObserver;
}

/** Typed processing failure with a closed public reason and retry policy. */
export class RecoveryJobProcessingError extends Error {
  /** Closed privacy-safe reason. */
  public readonly reason: RecoveryWorkerFailureReason;

  /** Whether another bounded attempt may succeed. */
  public readonly retryable: boolean;

  /**
   * Create a worker-visible processing failure.
   *
   * @param reason - Closed privacy-safe failure reason.
   * @param retryable - Whether the job may be rescheduled below the attempt limit.
   */
  public constructor(reason: RecoveryWorkerFailureReason, retryable: boolean) {
    super(reason);
    this.name = 'RecoveryJobProcessingError';
    this.reason = reason;
    this.retryable = retryable;
  }
}

const systemClock: RecoveryWorkerClock = {
  now: () => new Date(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (timer) => clearTimeout(timer),
};

/**
 * Create a bounded recovery worker.
 *
 * @param options - Repository, processor, and optional deterministic boundaries.
 * @returns Stopped worker ready for explicit lifecycle ownership.
 */
export function createRecoveryWorker(options: RecoveryWorkerOptions): RecoveryWorker {
  return new RecoveryWorker(options);
}

/** Single-flight scheduler for durable recovery work. */
export class RecoveryWorker {
  /** Durable transition repository. */
  protected readonly repository: RecoveryWorkerRepository;

  /** Account-specific processing boundary. */
  protected readonly processor: RecoveryJobProcessor;

  /** Stable owner identity persisted with every claim. */
  protected readonly workerId: string;

  /** Clock and timer owner. */
  protected readonly clock: RecoveryWorkerClock;

  /** Optional metrics/test observer. */
  protected readonly observer?: RecoveryWorkerObserver;

  /** Whether the worker accepts polls and enqueue wake-ups. */
  protected running = false;

  /** Scheduled next poll, if any. */
  protected timer: ReturnType<typeof setTimeout> | null = null;

  /** Current single-flight claim/process cycle. */
  protected activeCycle: Promise<void> | null = null;

  /** Wake-up received while a cycle was already active. */
  protected wakePending = false;

  /**
   * Create a stopped worker.
   *
   * @param options - Required and optional lifecycle boundaries.
   */
  public constructor(options: RecoveryWorkerOptions) {
    this.repository = options.repository;
    this.processor = options.processor;
    this.workerId = options.workerId ?? randomUUID();
    this.clock = options.clock ?? systemClock;
    this.observer = options.observer;
  }

  /** Start polling immediately. Repeated calls are idempotent. */
  public start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule(0);
  }

  /** Wake the worker after a successful enqueue without creating an overlapping cycle. */
  public wake(): void {
    if (!this.running) return;
    if (this.activeCycle) {
      this.wakePending = true;
      return;
    }
    this.schedule(0);
  }

  /**
   * Stop claiming and wait a bounded time for the active cycle.
   *
   * @returns True when active work settled before the shutdown deadline.
   */
  public async stop(): Promise<boolean> {
    if (!this.running && !this.activeCycle) return true;
    this.running = false;
    this.wakePending = false;
    this.clearScheduledPoll();
    this.emit({ event: 'shutdown_started' });

    const active = this.activeCycle;
    if (!active) {
      this.emit({ event: 'shutdown_settled' });
      return true;
    }

    let timeout: ReturnType<typeof setTimeout> | null = null;
    const settled = await Promise.race([
      active.then(() => true),
      new Promise<boolean>((resolve) => {
        timeout = this.clock.setTimeout(
          () => resolve(false),
          RECOVERY_WORKER_SHUTDOWN_MILLISECONDS,
        );
      }),
    ]);

    if (timeout) this.clock.clearTimeout(timeout);
    this.emit({ event: settled ? 'shutdown_settled' : 'shutdown_timeout' });
    return settled;
  }

  /** Schedule the next single-flight cycle. */
  protected schedule(milliseconds: number): void {
    if (!this.running) return;
    this.clearScheduledPoll();
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      this.beginCycle();
    }, milliseconds);
  }

  /** Cancel the owned next-poll timer. */
  protected clearScheduledPoll(): void {
    if (!this.timer) return;
    this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  /** Begin one cycle or record a pending wake when another cycle owns execution. */
  protected beginCycle(): void {
    if (!this.running) return;
    if (this.activeCycle) {
      this.wakePending = true;
      return;
    }

    const cycle = this.runCycle();
    this.activeCycle = cycle;
    void cycle
      .catch(() => {
        logger.error({ event: 'recovery_worker_cycle_failed' }, 'Recovery worker cycle failed');
      })
      .finally(() => {
        if (this.activeCycle === cycle) this.activeCycle = null;
        if (!this.running) return;
        const runImmediately = this.wakePending;
        this.wakePending = false;
        this.schedule(runImmediately ? 0 : RECOVERY_WORKER_POLL_MILLISECONDS);
      });
  }

  /** Claim and process one bounded batch. */
  protected async runCycle(): Promise<void> {
    const now = this.clock.now();
    const jobs = await this.repository.claimAvailable({
      workerId: this.workerId,
      now,
      leaseExpiredBefore: new Date(now.getTime() - RECOVERY_WORKER_LEASE_MILLISECONDS),
      limit: RECOVERY_JOB_CLAIM_LIMIT,
    });

    for (const job of jobs) {
      this.emit({ event: 'claimed', jobId: job.id, attempt: job.attemptCount });
      if (job.claimDisposition === 'lease_reclaimed') {
        this.emit({ event: 'lease_reclaimed', jobId: job.id, attempt: job.attemptCount });
      }
      await this.processClaim(job);
    }

    if (jobs.length === RECOVERY_JOB_CLAIM_LIMIT) this.wakePending = true;
  }

  /** Process one claim and finish, retry, or terminally close it. */
  protected async processClaim(job: ClaimedRecoveryJob): Promise<void> {
    if (job.claimDisposition === 'lease_exhausted') {
      await this.finishTerminal(job, 'lease_exhausted');
      return;
    }

    try {
      const result = await this.processor.process(job);
      const completed = await this.repository.markCompleted({
        jobId: job.id,
        workerId: this.workerId,
        now: this.clock.now(),
      });
      if (!completed) {
        logger.warn({ event: 'recovery_worker_claim_lost' }, 'Recovery worker claim was lost');
        return;
      }
      this.emit({
        event: result === 'no_op' ? 'no_op' : 'completed',
        jobId: job.id,
        attempt: job.attemptCount,
      });
    } catch (error) {
      const failure =
        error instanceof RecoveryJobProcessingError
          ? error
          : new RecoveryJobProcessingError('processing_failed', true);
      if (failure.retryable && job.attemptCount < RECOVERY_JOB_ATTEMPT_LIMIT) {
        await this.retry(job, failure.reason);
        return;
      }
      await this.finishTerminal(job, failure.reason);
    }
  }

  /** Reschedule an owned transient failure with its exact attempt delay. */
  protected async retry(
    job: ClaimedRecoveryJob,
    reason: RecoveryWorkerFailureReason,
  ): Promise<void> {
    const delay = RECOVERY_WORKER_RETRY_DELAYS_MILLISECONDS[job.attemptCount - 1];
    if (delay === undefined) {
      await this.finishTerminal(job, reason);
      return;
    }

    const now = this.clock.now();
    const scheduled = await this.repository.scheduleRetry({
      jobId: job.id,
      workerId: this.workerId,
      availableAt: new Date(now.getTime() + delay),
      reason,
      now,
    });
    if (!scheduled) {
      logger.warn({ event: 'recovery_worker_claim_lost' }, 'Recovery worker claim was lost');
      return;
    }
    this.emit({
      event: 'retry_scheduled',
      jobId: job.id,
      attempt: job.attemptCount,
      delayMilliseconds: delay,
      reason,
    });
  }

  /** Terminally close an owned claim without exposing raw failure data. */
  protected async finishTerminal(
    job: ClaimedRecoveryJob,
    reason: RecoveryWorkerFailureReason,
  ): Promise<void> {
    const finished = await this.repository.markTerminalFailure({
      jobId: job.id,
      workerId: this.workerId,
      now: this.clock.now(),
      reason,
    });
    if (!finished) {
      logger.warn({ event: 'recovery_worker_claim_lost' }, 'Recovery worker claim was lost');
      return;
    }
    this.emit({ event: 'terminal_failure', jobId: job.id, attempt: job.attemptCount, reason });
  }

  /** Notify the optional in-process observer without letting it break processing. */
  protected emit(event: RecoveryWorkerEvent): void {
    if (!this.observer) return;
    try {
      this.observer(event);
    } catch {
      logger.warn({ event: 'recovery_worker_observer_failed' }, 'Recovery worker observer failed');
    }
  }
}
