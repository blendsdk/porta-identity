import type { QueryResult, QueryResultRow } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('argon2', () => ({
  hash: vi.fn().mockResolvedValue('$argon2id$v=19$m=65536,t=3,p=4$dummy'),
  verify: vi.fn().mockResolvedValue(false),
  argon2id: 2,
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import * as argon2 from 'argon2';
import {
  RecoveryJobRepository,
  type BeginRecoveryJobAttemptInput,
  type ClaimedRecoveryJob,
  type ClaimRecoveryJobsInput,
  type FinishRecoveryJobInput,
  type RecoveryJobDatabase,
  type RetryRecoveryJobInput,
} from '../../../src/auth/recovery-job-repository.js';
import {
  RECOVERY_WORKER_FAILURE_REASONS,
  RECOVERY_WORKER_LEASE_MILLISECONDS,
  RECOVERY_WORKER_RETRY_DELAYS_MILLISECONDS,
  RecoveryJobProcessingError,
  RecoveryWorker,
  type RecoveryWorkerClock,
  type RecoveryWorkerEvent,
  type RecoveryWorkerRepository,
} from '../../../src/auth/recovery-worker.js';
import { getDummyPasswordHash, initializeDummyPasswordHash } from '../../../src/users/password.js';

const NOW = new Date('2026-08-21T12:00:00.000Z');
const JOB_ID = '00000000-0000-4000-8000-000000000301';
const WORKER_ID = '00000000-0000-4000-8000-000000000401';
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000501';

/** Query boundary that records parameterized repository operations without a database service. */
class RecordingDatabase implements RecoveryJobDatabase {
  /** Ordered SQL calls and values received by the repository. */
  public readonly calls: { text: string; values: readonly unknown[] }[] = [];

  /** Record one parameterized operation and return an empty PostgreSQL result. */
  public async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    this.calls.push({ text, values });
    return { command: 'TEST', rowCount: 0, oid: 0, fields: [], rows: [] };
  }
}

function claimedJob(
  attemptCount: number,
  claimDisposition: ClaimedRecoveryJob['claimDisposition'] = 'available',
): ClaimedRecoveryJob {
  return {
    id: JOB_ID,
    jobType: 'magic_link',
    organizationId: ORGANIZATION_ID,
    protectedAddress: {
      ciphertext: 'protected-ciphertext',
      iv: 'protected-iv',
      tag: 'protected-tag',
      keyId: 'protected-key',
    },
    interactionUid: 'interaction-reference',
    idempotencyDigest: '0'.repeat(64),
    status: 'claimed',
    availableAt: NOW,
    claimedAt: NOW,
    claimedBy: WORKER_ID,
    attemptCount,
    lastFailureReason: null,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    claimDisposition,
  };
}

/** Controllable repository used to inspect product worker transitions. */
class WorkerRepository implements RecoveryWorkerRepository {
  /** Jobs leased by the latest claim operation. */
  private claimedJobs: readonly ClaimedRecoveryJob[] = [];
  /** Batches returned by consecutive claim operations. */
  public batches: (readonly ClaimedRecoveryJob[])[] = [];
  /** Claim inputs captured from the worker. */
  public readonly claims: ClaimRecoveryJobsInput[] = [];
  /** Attempt-start transitions captured from the worker. */
  public readonly attempts: BeginRecoveryJobAttemptInput[] = [];
  /** Retry transitions captured from the worker. */
  public readonly retries: RetryRecoveryJobInput[] = [];
  /** Completion transitions captured from the worker. */
  public readonly completions: FinishRecoveryJobInput[] = [];
  /** Terminal transitions captured from the worker. */
  public readonly terminals: FinishRecoveryJobInput[] = [];

  /** Return the next arranged claim batch. */
  public async claimAvailable(input: ClaimRecoveryJobsInput) {
    this.claims.push(input);
    this.claimedJobs = this.batches.shift() ?? [];
    return this.claimedJobs;
  }

  /** Charge one processing attempt and return the started claim. */
  public async beginAttempt(input: BeginRecoveryJobAttemptInput) {
    this.attempts.push(input);
    const job = this.claimedJobs.find((candidate) => candidate.id === input.jobId);
    if (!job || job.id !== input.jobId || job.attemptCount >= 5) return null;
    return { ...job, attemptCount: job.attemptCount + 1, updatedAt: input.now };
  }

  /** Record an owned retry. */
  public async scheduleRetry(input: RetryRecoveryJobInput): Promise<boolean> {
    this.retries.push(input);
    return true;
  }

  /** Record an owned completion. */
  public async markCompleted(input: FinishRecoveryJobInput): Promise<boolean> {
    this.completions.push(input);
    return true;
  }

  /** Record an owned terminal failure. */
  public async markTerminalFailure(input: FinishRecoveryJobInput): Promise<boolean> {
    this.terminals.push(input);
    return true;
  }
}

/** Product worker exposing one cycle for implementation-level tests. */
class TestRecoveryWorker extends RecoveryWorker {
  /** Execute one normal claim/process cycle without starting the poll loop. */
  public runOnce(): Promise<void> {
    return this.runCycle();
  }
}

/** Manual timer owner for deterministic start and shutdown tests. */
class ManualClock implements RecoveryWorkerClock {
  private nextId = 1;
  private readonly callbacks = new Map<number, () => void>();

  /** Return the fixed test instant. */
  public now(): Date {
    return NOW;
  }

  /** Retain a callback until the test explicitly fires it. */
  public setTimeout(callback: () => void, _milliseconds: number): ReturnType<typeof setTimeout> {
    const id = this.nextId;
    this.nextId += 1;
    this.callbacks.set(id, callback);
    return id as ReturnType<typeof setTimeout>;
  }

  /** Remove one retained callback. */
  public clearTimeout(timer: ReturnType<typeof setTimeout>): void {
    this.callbacks.delete(Number(timer));
  }

  /** Fire the oldest retained callback. */
  public fireNext(): void {
    const entry = this.callbacks.entries().next().value;
    if (!entry) throw new Error('No worker timer is scheduled');
    const [id, callback] = entry;
    this.callbacks.delete(id);
    callback();
  }
}

async function settleMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('recovery job repository implementation', () => {
  it('uses a bounded skip-locked claim and an owner-fenced retry transition', async () => {
    const database = new RecordingDatabase();
    const repository = new RecoveryJobRepository(database);
    const leaseCutoff = new Date(NOW.getTime() - RECOVERY_WORKER_LEASE_MILLISECONDS);

    await expect(
      repository.claimAvailable({
        workerId: WORKER_ID,
        now: NOW,
        leaseExpiredBefore: leaseCutoff,
        limit: 25,
      }),
    ).resolves.toStrictEqual([]);
    await expect(
      repository.scheduleRetry({
        jobId: JOB_ID,
        workerId: WORKER_ID,
        availableAt: new Date(NOW.getTime() + 1_000),
        reason: 'database_unavailable',
        now: NOW,
      }),
    ).resolves.toBe(false);

    expect(database.calls[0]?.text).toContain('FOR UPDATE SKIP LOCKED');
    expect(database.calls[0]?.text).toContain('LIMIT $3');
    expect(database.calls[0]?.values).toStrictEqual([NOW, leaseCutoff, 25, WORKER_ID, 5]);
    expect(database.calls[1]?.text).toContain('claimed_by = $2');
    expect(database.calls[1]?.text).toContain("status = 'claimed'");
  });

  it('rejects claim, retry, and terminal inputs outside their closed schemas', async () => {
    const database = new RecordingDatabase();
    const repository = new RecoveryJobRepository(database);

    await expect(
      repository.claimAvailable({
        workerId: WORKER_ID,
        now: NOW,
        leaseExpiredBefore: NOW,
        limit: 26,
      }),
    ).rejects.toThrow();
    await expect(
      repository.scheduleRetry({
        jobId: JOB_ID,
        workerId: WORKER_ID,
        availableAt: new Date(NOW.getTime() - 1),
        reason: 'database_unavailable',
        now: NOW,
      }),
    ).rejects.toThrow();
    await expect(
      repository.markTerminalFailure({
        jobId: JOB_ID,
        workerId: WORKER_ID,
        now: NOW,
        reason: 'raw SMTP failure: alice@example.com',
      }),
    ).rejects.toThrow();
    expect(database.calls).toStrictEqual([]);
  });
});

describe('recovery worker implementation', () => {
  it('uses the exact lease cutoff, claim maximum, and owner-fenced completion', async () => {
    const repository = new WorkerRepository();
    repository.batches = [[claimedJob(0)]];
    const events: RecoveryWorkerEvent[] = [];
    const worker = new TestRecoveryWorker({
      repository,
      workerId: WORKER_ID,
      processor: { process: async () => 'completed' },
      clock: {
        now: () => NOW,
        setTimeout,
        clearTimeout,
      },
      observer: (event) => events.push(event),
    });

    await worker.runOnce();

    expect(repository.claims[0]).toStrictEqual({
      workerId: WORKER_ID,
      now: NOW,
      leaseExpiredBefore: new Date(NOW.getTime() - RECOVERY_WORKER_LEASE_MILLISECONDS),
      limit: 25,
    });
    expect(repository.completions).toStrictEqual([
      { jobId: JOB_ID, workerId: WORKER_ID, now: NOW },
    ]);
    expect(events.map((event) => event.event)).toStrictEqual(['claimed', 'completed']);
  });

  it('emits lease recovery and terminally closes an exhausted unknown outcome', async () => {
    const reclaimedRepository = new WorkerRepository();
    reclaimedRepository.batches = [[claimedJob(1, 'lease_reclaimed')]];
    const reclaimedEvents: RecoveryWorkerEvent[] = [];
    await new TestRecoveryWorker({
      repository: reclaimedRepository,
      workerId: WORKER_ID,
      processor: { process: async () => 'no_op' },
      observer: (event) => reclaimedEvents.push(event),
    }).runOnce();
    expect(reclaimedEvents.map((event) => event.event)).toStrictEqual([
      'claimed',
      'lease_reclaimed',
      'no_op',
    ]);

    const exhaustedRepository = new WorkerRepository();
    exhaustedRepository.batches = [[claimedJob(5, 'lease_exhausted')]];
    const processor = vi.fn().mockResolvedValue('completed');
    await new TestRecoveryWorker({
      repository: exhaustedRepository,
      workerId: WORKER_ID,
      processor: { process: processor },
    }).runOnce();
    expect(processor).not.toHaveBeenCalled();
    expect(exhaustedRepository.terminals).toStrictEqual([
      { jobId: JOB_ID, workerId: WORKER_ID, now: expect.any(Date), reason: 'lease_exhausted' },
    ]);
  });

  it('schedules four exact retries before the fifth failure becomes terminal', async () => {
    const repository = new WorkerRepository();
    repository.batches = [0, 1, 2, 3, 4].map((attempt) => [claimedJob(attempt)]);
    const events: RecoveryWorkerEvent[] = [];
    const worker = new TestRecoveryWorker({
      repository,
      workerId: WORKER_ID,
      clock: { now: () => NOW, setTimeout, clearTimeout },
      processor: {
        process: async () => {
          throw new RecoveryJobProcessingError('smtp_outcome_unknown', true);
        },
      },
      observer: (event) => events.push(event),
    });

    for (let attempt = 0; attempt < 5; attempt += 1) await worker.runOnce();

    expect(
      repository.retries.map((retry) => retry.availableAt.getTime() - retry.now.getTime()),
    ).toStrictEqual(RECOVERY_WORKER_RETRY_DELAYS_MILLISECONDS);
    expect(repository.terminals).toHaveLength(1);
    expect(repository.terminals[0]?.reason).toBe('smtp_outcome_unknown');
    expect(events.filter((event) => event.event === 'retry_scheduled')).toHaveLength(4);
    expect(events.filter((event) => event.event === 'terminal_failure')).toHaveLength(1);
  });

  it('stops claiming, waits for active work, and emits settled shutdown', async () => {
    const repository = new WorkerRepository();
    repository.batches = [[claimedJob(0)]];
    const clock = new ManualClock();
    const events: RecoveryWorkerEvent[] = [];
    let releaseProcessor: (() => void) | undefined;
    const processorGate = new Promise<void>((resolve) => {
      releaseProcessor = resolve;
    });
    const worker = new RecoveryWorker({
      repository,
      workerId: WORKER_ID,
      clock,
      processor: {
        process: async () => {
          await processorGate;
          return 'completed';
        },
      },
      observer: (event) => events.push(event),
    });

    worker.start();
    clock.fireNext();
    await settleMicrotasks();
    const stopping = worker.stop();
    await settleMicrotasks();
    expect(events.map((event) => event.event)).toContain('shutdown_started');
    releaseProcessor?.();
    await expect(stopping).resolves.toBe(true);
    expect(events.at(-1)?.event).toBe('shutdown_settled');
    expect(repository.claims).toHaveLength(1);
  });

  it('exposes only closed reasons and never forwards raw processor diagnostics', async () => {
    const repository = new WorkerRepository();
    repository.batches = [[claimedJob(4)]];
    const events: RecoveryWorkerEvent[] = [];
    await new TestRecoveryWorker({
      repository,
      workerId: WORKER_ID,
      processor: {
        process: async () => {
          const raw = new Error('smtp alice@example.com token=protected-value');
          throw raw;
        },
      },
      observer: (event) => events.push(event),
    }).runOnce();

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('alice@example.com');
    expect(serialized).not.toContain('protected-value');
    expect(events.at(-1)?.reason).toBe('processing_failed');
    expect(RECOVERY_WORKER_FAILURE_REASONS).toContain(events.at(-1)?.reason);
  });
});

describe('dummy Argon2id implementation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates one process-cached Argon2id hash under concurrent initialization', async () => {
    await Promise.all([
      initializeDummyPasswordHash(),
      initializeDummyPasswordHash(),
      initializeDummyPasswordHash(),
    ]);

    expect(getDummyPasswordHash()).toContain('$argon2id$');
    expect(argon2.hash).toHaveBeenCalledTimes(1);
    expect(argon2.hash).toHaveBeenCalledWith(expect.any(String), { type: argon2.argon2id });
    const plaintext = vi.mocked(argon2.hash).mock.calls[0]?.[0];
    expect(plaintext).not.toContain('password');
    expect(plaintext).not.toContain('@');
  });
});
