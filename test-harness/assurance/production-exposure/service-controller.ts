import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';

import { z } from 'zod';

import { readActiveCoverageRun, type ActiveCoverageRun } from '../coverage/index.js';
import { RuntimeCommandRunner } from '../../fixtures/lifecycle-runtime.js';

/** Dependency services that may be interrupted inside an owned disposable harness run. */
export type InterruptibleService = 'postgres' | 'redis' | 'mailhog';

/** Every exact Compose service identity used by dependency recovery. */
type OwnedService = InterruptibleService | 'porta';

const passwordResetJobSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(['available', 'claimed', 'completed', 'terminal_failure']),
    attemptCount: z.number().int().min(0).max(5),
    failureReason: z.string().nullable(),
    tokenCount: z.number().int().nonnegative(),
  })
  .strict();

const passwordResetStateSchema = z
  .object({
    jobs: z.array(passwordResetJobSchema).max(64),
    totalJobCount: z.number().int().nonnegative(),
    totalTokenCount: z.number().int().nonnegative(),
    orphanTokenCount: z.number().int().nonnegative(),
  })
  .strict();

/** Fixed, bounded recovery-state query that omits addresses, token hashes, and other secrets. */
const passwordResetStateQuery = `SELECT json_build_object(
  'jobs', COALESCE((
    SELECT json_agg(json_build_object(
      'id', observed.id,
      'status', observed.status,
      'attemptCount', observed.attempt_count,
      'failureReason', observed.last_failure_reason,
      'tokenCount', observed.token_count
    ) ORDER BY observed.created_at, observed.id)
    FROM (
      SELECT job.id, job.status, job.attempt_count, job.last_failure_reason, job.created_at,
             count(token.id)::integer AS token_count
      FROM auth_recovery_jobs AS job
      JOIN organizations AS organization ON organization.id = job.organization_id
      LEFT JOIN password_reset_tokens AS token ON token.recovery_job_id = job.id
      WHERE job.job_type = 'password_reset' AND organization.slug = 'alpha'
      GROUP BY job.id
      ORDER BY job.created_at DESC, job.id DESC
      LIMIT 64
    ) AS observed
  ), '[]'::json),
  'totalJobCount', (
    SELECT count(*)::integer
    FROM auth_recovery_jobs AS job
    JOIN organizations AS organization ON organization.id = job.organization_id
    WHERE job.job_type = 'password_reset' AND organization.slug = 'alpha'
  ),
  'totalTokenCount', (
    SELECT count(*)::integer
    FROM password_reset_tokens AS token
    JOIN auth_recovery_jobs AS job ON job.id = token.recovery_job_id
    JOIN organizations AS organization ON organization.id = job.organization_id
    WHERE job.job_type = 'password_reset' AND organization.slug = 'alpha'
  ),
  'orphanTokenCount', (
    SELECT count(*)::integer FROM password_reset_tokens WHERE recovery_job_id IS NULL
  )
)::text`;

/** One redacted password-reset job used only for before/after integrity comparison. */
export interface PasswordResetRecoveryJobObservation {
  /** One-way identity derived from the disposable job UUID. */
  readonly identity: string;
  /** Durable worker state. */
  readonly status: 'available' | 'claimed' | 'completed' | 'terminal_failure';
  /** Attempts already charged to this job. */
  readonly attemptCount: number;
  /** Closed, privacy-safe failure reason, when present. */
  readonly failureReason: string | null;
  /** Reset tokens owned by this exact job. */
  readonly tokenCount: number;
}

/** Bounded recovery-state snapshot that contains no address, token, or raw database identity. */
export interface PasswordResetRecoveryStateObservation {
  /** At most 64 recent jobs for the synthetic alpha organization. */
  readonly jobs: readonly PasswordResetRecoveryJobObservation[];
  /** Complete number of alpha password-reset jobs. */
  readonly totalJobCount: number;
  /** Complete number of alpha job-owned password-reset tokens. */
  readonly totalTokenCount: number;
  /** Global count of legacy or otherwise unowned password-reset tokens. */
  readonly orphanTokenCount: number;
}

/** Boolean integrity result returned by one unavailable-mail probe. */
export interface PasswordResetMailFailureIntegrity {
  /** Exactly one new job reached an allowed failed-delivery state. */
  readonly validFailureState: boolean;
  /** The new token is unique, job-owned, and introduced no orphan. */
  readonly validTokenOwnership: boolean;
}

/** Probe response plus independently observed recovery-state integrity. */
export interface PasswordResetMailFailureObservation<T> {
  /** Public response returned while the owned mail service was unavailable. */
  readonly response: T;
  /** Independent database facts reduced to non-sensitive booleans. */
  readonly integrity: PasswordResetMailFailureIntegrity;
}

/** Evaluates one completed unavailable-mail transition without trusting its public response. */
export function passwordResetMailFailureIntegrity(
  before: PasswordResetRecoveryStateObservation,
  after: PasswordResetRecoveryStateObservation,
): PasswordResetMailFailureIntegrity {
  const previousIdentities = new Set(before.jobs.map((job) => job.identity));
  const addedJobs = after.jobs.filter((job) => !previousIdentities.has(job.identity));
  const addedJob = addedJobs[0];
  const validFailureState =
    after.totalJobCount === before.totalJobCount + 1 &&
    addedJobs.length === 1 &&
    addedJob !== undefined &&
    ((addedJob.status === 'available' && addedJob.attemptCount >= 1 && addedJob.attemptCount < 5) ||
      (addedJob.status === 'terminal_failure' && addedJob.attemptCount === 5)) &&
    addedJob.failureReason === 'smtp_outcome_unknown';
  const validTokenOwnership =
    addedJob !== undefined &&
    addedJob.tokenCount === 1 &&
    after.totalTokenCount === before.totalTokenCount + 1 &&
    after.orphanTokenCount === before.orphanTokenCount;
  return Object.freeze({ validFailureState, validTokenOwnership });
}

/** Shell-free command result used by the dependency controller. */
export interface ProductionExposureCommandResult {
  /** Process exit code. */
  readonly exitCode: number;
  /** Bounded standard output. */
  readonly stdout: string;
  /** Bounded standard error. */
  readonly stderr: string;
}

/** Shell-free runner seam used by implementation tests. */
export interface ProductionExposureCommandRunner {
  /** Runs one fixed command or rejects on non-zero exit. */
  checked(
    command: string,
    args: readonly string[],
    options: {
      readonly cwd: string;
      readonly environment: Readonly<Record<string, string>>;
      readonly timeoutMilliseconds?: number;
      readonly signal?: AbortSignal;
    },
  ): Promise<ProductionExposureCommandResult>;
}

/** Copies defined environment variables for shell-free Docker children. */
function currentEnvironment(): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
  );
}

/** Delays one bounded health-poll iteration. */
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

/**
 * Controls only dependency containers listed in the active lifecycle lease.
 *
 * The controller never uses a Compose project-wide mutation. The immutable container ID remains
 * the authority for stop, start, inspection, and restoration.
 */
export class OwnedDependencyController {
  /** Canonical worktree that owns the active lifecycle. */
  protected readonly repositoryRoot: string;
  /** Complete durable run and resource identity. */
  protected readonly activeRun: ActiveCoverageRun;
  /** Defined environment inherited by shell-free Docker children. */
  protected readonly environment: Readonly<Record<string, string>>;

  /** Creates a controller bound to one already validated active lifecycle. */
  public constructor(
    repositoryRoot: string,
    activeRun: ActiveCoverageRun,
    protected readonly runner: ProductionExposureCommandRunner = new RuntimeCommandRunner(),
  ) {
    this.repositoryRoot = realpathSync(repositoryRoot);
    this.activeRun = activeRun;
    this.environment = currentEnvironment();
    if (realpathSync(activeRun.lease.worktreePath) !== this.repositoryRoot) {
      throw new Error('active dependency controller worktree mismatch');
    }
  }

  /** Creates a controller from the exact durable active-run and lease records. */
  public static fromActiveRun(
    repositoryRoot: string,
    runner?: ProductionExposureCommandRunner,
  ): OwnedDependencyController {
    return new OwnedDependencyController(
      repositoryRoot,
      readActiveCoverageRun(repositoryRoot),
      runner,
    );
  }

  /** Runs a probe while one exact owned dependency is unavailable, then restores it in `finally`. */
  public async whileUnavailable<T>(
    service: InterruptibleService,
    probe: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const containerId = await this.resolveContainer(service, signal);
    await this.runner.checked('docker', ['stop', '--time', '10', '--', containerId], {
      cwd: this.repositoryRoot,
      environment: this.environment,
      timeoutMilliseconds: 30_000,
      signal,
    });
    let result: T | undefined;
    let probeError: unknown;
    try {
      result = await probe();
    } catch (error) {
      probeError = error;
    } finally {
      // Restoration deliberately ignores the caller's aborted signal. Once the owned service has
      // been stopped, cleanup must finish or fail explicitly instead of inheriting cancellation.
      await this.restore(containerId, service);
    }
    if (probeError !== undefined) throw probeError;
    if (result === undefined) throw new Error('dependency probe returned no observation');
    return result;
  }

  /**
   * Runs one forgot-password probe while MailHog is unavailable and independently checks the
   * resulting durable retry state.
   *
   * The healthy control may still be finishing asynchronously when this method starts. It first
   * waits for existing recovery work to settle so only the probe's job is measured.
   */
  public async observePasswordResetMailFailure<T>(
    probe: () => Promise<T>,
  ): Promise<PasswordResetMailFailureObservation<T>> {
    const postgres = await this.resolveContainer('postgres');
    const before = await this.waitForPasswordResetState(
      postgres,
      (state) => state.jobs.every((job) => this.isSettledRecoveryJob(job)),
      15_000,
    );
    return this.whileUnavailable('mailhog', async () => {
      const response = await probe();
      const after = await this.waitForPasswordResetState(
        postgres,
        (state) => this.hasObservedFailedProbe(before, state),
        // A stopped container can consume Nodemailer's two-minute connection deadline before the
        // worker records its retry. The margin observes that real boundary without changing Porta.
        135_000,
        1_000,
      );
      return Object.freeze({
        response,
        integrity: passwordResetMailFailureIntegrity(before, after),
      });
    });
  }

  /** Restarts only the exact lease-owned Porta container when dependency reconnection requires it. */
  public async restartPorta(): Promise<void> {
    const containerId = await this.resolveContainer('porta');
    await this.runner.checked('docker', ['restart', '--time', '10', '--', containerId], {
      cwd: this.repositoryRoot,
      environment: this.environment,
      timeoutMilliseconds: 60_000,
    });
    await this.waitUntilHealthy(containerId, 'porta');
  }

  /** Resolves and verifies one exact service container from active-run labels and lease IDs. */
  protected async resolveContainer(service: OwnedService, signal?: AbortSignal): Promise<string> {
    const listed = await this.runner.checked(
      'docker',
      [
        'ps',
        '-aq',
        '--no-trunc',
        '--filter',
        `label=com.docker.compose.project=${this.activeRun.composeProject}`,
        '--filter',
        `label=com.docker.compose.service=${service}`,
      ],
      {
        cwd: this.repositoryRoot,
        environment: this.environment,
        timeoutMilliseconds: 30_000,
        signal,
      },
    );
    const identifiers = listed.stdout.trim().split(/\s+/u).filter(Boolean);
    const identifier = identifiers[0];
    if (
      identifiers.length !== 1 ||
      identifier === undefined ||
      !/^[0-9a-f]{64}$/u.test(identifier) ||
      !this.activeRun.lease.containerIds.includes(identifier)
    ) {
      throw new Error('owned dependency container identity is unavailable');
    }
    const inspected = await this.runner.checked(
      'docker',
      [
        'inspect',
        '--format',
        '{{index .Config.Labels "io.porta.assurance.run-id"}}|{{index .Config.Labels "io.porta.assurance.worktree"}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}',
        identifier,
      ],
      {
        cwd: this.repositoryRoot,
        environment: this.environment,
        timeoutMilliseconds: 30_000,
        signal,
      },
    );
    const [runId, worktreePath, composeProject, observedService, extra] = inspected.stdout
      .trim()
      .split('|');
    if (
      extra !== undefined ||
      runId !== this.activeRun.runId ||
      worktreePath !== this.repositoryRoot ||
      composeProject !== this.activeRun.composeProject ||
      observedService !== service
    ) {
      throw new Error('owned dependency labels do not match the active lifecycle');
    }
    return identifier;
  }

  /** Reads one bounded, redacted password-reset recovery snapshot from the owned database. */
  protected async passwordResetRecoveryState(
    postgresContainerId: string,
  ): Promise<PasswordResetRecoveryStateObservation> {
    const result = await this.runner.checked(
      'docker',
      [
        'exec',
        postgresContainerId,
        'psql',
        '-U',
        'porta',
        '-d',
        'porta',
        '-At',
        '-c',
        passwordResetStateQuery,
      ],
      {
        cwd: this.repositoryRoot,
        environment: this.environment,
        timeoutMilliseconds: 10_000,
      },
    );
    const parsed = passwordResetStateSchema.parse(JSON.parse(result.stdout.trim()));
    return Object.freeze({
      jobs: Object.freeze(
        parsed.jobs.map((job) =>
          Object.freeze({
            identity: `sha256:${createHash('sha256').update(job.id).digest('hex')}`,
            status: job.status,
            attemptCount: job.attemptCount,
            failureReason: job.failureReason,
            tokenCount: job.tokenCount,
          }),
        ),
      ),
      totalJobCount: parsed.totalJobCount,
      totalTokenCount: parsed.totalTokenCount,
      orphanTokenCount: parsed.orphanTokenCount,
    });
  }

  /** Polls until one stable recovery-state predicate is satisfied or the evidence becomes invalid. */
  protected async waitForPasswordResetState(
    postgresContainerId: string,
    accepts: (state: PasswordResetRecoveryStateObservation) => boolean,
    timeoutMilliseconds: number,
    pollMilliseconds = 250,
  ): Promise<PasswordResetRecoveryStateObservation> {
    const deadline = Date.now() + timeoutMilliseconds;
    while (Date.now() < deadline) {
      const state = await this.passwordResetRecoveryState(postgresContainerId);
      if (accepts(state)) return state;
      await delay(pollMilliseconds);
    }
    throw new Error('password-reset recovery state was not observable before the deadline');
  }

  /** Reports whether an existing job can no longer race with the unavailable-mail probe. */
  protected isSettledRecoveryJob(job: PasswordResetRecoveryJobObservation): boolean {
    return job.status === 'completed' || job.status === 'terminal_failure';
  }

  /** Reports when every newly admitted probe job has reached a failed-delivery state. */
  protected hasObservedFailedProbe(
    before: PasswordResetRecoveryStateObservation,
    after: PasswordResetRecoveryStateObservation,
  ): boolean {
    if (after.totalJobCount <= before.totalJobCount) return false;
    const previousIdentities = new Set(before.jobs.map((job) => job.identity));
    const addedJobs = after.jobs.filter((job) => !previousIdentities.has(job.identity));
    return (
      addedJobs.length > 0 &&
      addedJobs.every(
        (job) =>
          job.attemptCount > 0 && (job.status === 'available' || job.status === 'terminal_failure'),
      )
    );
  }

  /** Restarts the exact stopped container and waits for a truthful running/healthy state. */
  protected async restore(
    containerId: string,
    service: InterruptibleService,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.runner.checked('docker', ['start', '--', containerId], {
      cwd: this.repositoryRoot,
      environment: this.environment,
      timeoutMilliseconds: 30_000,
      signal,
    });
    await this.waitUntilHealthy(containerId, service, signal);
  }

  /** Waits for one exact restarted service to become running and, where declared, healthy. */
  protected async waitUntilHealthy(
    containerId: string,
    service: OwnedService,
    signal?: AbortSignal,
  ): Promise<void> {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      const inspected = await this.runner.checked(
        'docker',
        [
          'inspect',
          '--format',
          '{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}',
          containerId,
        ],
        {
          cwd: this.repositoryRoot,
          environment: this.environment,
          timeoutMilliseconds: 10_000,
          signal,
        },
      );
      const [running, health, extra] = inspected.stdout.trim().split('|');
      if (extra !== undefined) throw new Error('dependency health response is malformed');
      if (
        running === 'true' &&
        (service === 'mailhog' ? health === 'none' : health === 'healthy')
      ) {
        return;
      }
      await delay(250);
    }
    throw new Error('owned dependency did not recover before the deadline');
  }
}
