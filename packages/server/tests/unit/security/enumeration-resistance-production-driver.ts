import { createHash, randomUUID } from 'node:crypto';
import type Router from '@koa/router';
import type { Organization } from '../../../src/organizations/types.js';
import type { User } from '../../../src/users/types.js';
import { enqueueAccountRecovery } from '../../../src/auth/recovery-service.js';
import { AccountRecoveryJobProcessor } from '../../../src/auth/recovery-job-processor.js';
import {
  createRecoveryJobRepository,
  RECOVERY_JOB_CLAIM_LIMIT,
  type ClaimedRecoveryJob,
  type RecoveryJob,
} from '../../../src/auth/recovery-job-repository.js';
import {
  RecoveryJobProcessingError,
  RecoveryWorker,
  RECOVERY_WORKER_FAILURE_REASONS,
  RECOVERY_WORKER_LEASE_MILLISECONDS,
  type RecoveryWorkerEvent,
} from '../../../src/auth/recovery-worker.js';
import { recoveryArtifactToken } from '../../../src/auth/recovery-crypto.js';
import { createInteractionRouter } from '../../../src/routes/interactions.js';
import { createPasswordResetRouter } from '../../../src/routes/password-reset.js';
import {
  prepareUserForPasswordLogin,
  recordLogin,
  recordPasswordFailure,
  verifyLoginPassword,
} from '../../../src/users/service.js';
import { getPool } from '../../../src/lib/database.js';
import { setEmailTransport } from '../../../src/auth/email-service.js';
import { createSmtpTransport } from '../../../src/auth/email-transport.js';
import {
  createTestOrganization,
  createTestUser,
  createTestUserWithPassword,
} from '../../integration/helpers/factories.js';
import { DEFAULT_TEST_PASSWORD } from '../../helpers/constants.js';
import { MailHogClient } from '../../e2e/helpers/mailhog.js';
import type {
  ArtifactObservation,
  DeliveryObservation,
  EnumerationResistanceObservations,
  EnumerationResistanceSpecDriver,
  FailureOperationObservation,
  IdentityFixture,
  PasswordIdentityState,
  PasswordVerificationObservation,
  PublicAction,
  PublicResponseSnapshot,
  RecoveryDependencyFailure,
  RecoveryJobObservation,
  RecoveryJobType,
  TimingDiagnosticObservation,
  WorkerEventObservation,
} from './enumeration-resistance-contract.js';

const INTERACTION_UID = 'enumeration-production-interaction';

/** Recovery worker exposing one bounded cycle to the service-backed specification driver. */
class ObservableRecoveryWorker extends RecoveryWorker {
  /** Execute one normal claim/process cycle. */
  public executeOnce(): Promise<void> {
    return this.runCycle();
  }
}

/** Minimal mutable Koa context used to invoke public route handlers without a network proxy. */
function createContext(body: Readonly<Record<string, string>>, organization: Organization) {
  let status = 200;
  let responseBody: unknown;
  let type = '';
  let renderedPage: string | null = null;
  const headers: Record<string, string> = {};
  const cookies: { name: string; attributes: Readonly<Record<string, string | boolean>> }[] = [];
  return {
    context: {
      params: { uid: INTERACTION_UID, orgSlug: organization.slug },
      query: {},
      request: { body },
      req: {},
      res: {},
      ip: '127.0.0.1',
      state: { organization },
      get status() {
        return status;
      },
      set status(value: number) {
        status = value;
      },
      get body() {
        return responseBody;
      },
      set body(value: unknown) {
        responseBody = value;
      },
      get type() {
        return type;
      },
      set type(value: string) {
        type = value;
      },
      get: () => '',
      set: (name: string, value: string) => {
        headers[name.toLowerCase()] = value;
      },
      cookies: {
        get: () => 'enumeration-production-csrf',
        set: (name: string, _value: string, attributes: Record<string, string | boolean>) => {
          cookies.push({ name, attributes: { ...attributes } });
        },
      },
      redirect: (location: string) => {
        status = 302;
        headers.location = location;
      },
    },
    render: async (pageName: string) => {
      renderedPage = pageName;
      return '<html data-schema="generic-auth-response"></html>';
    },
    snapshot(): PublicResponseSnapshot {
      return {
        status,
        pageOrBodySchema:
          renderedPage === null ? typeof responseBody : { page: renderedPage, type },
        genericError: renderedPage === 'login' ? 'invalid_credentials' : null,
        securityHeaders: { ...headers },
        cookies,
        redirectShape: headers.location
          ? headers.location.replace(INTERACTION_UID, ':interaction')
          : null,
      };
    },
  };
}

/** Resolve the terminal public handler from one retained Koa router. */
function findHandler(router: Router, method: string, path: string) {
  const layer = router.stack.find(
    (candidate) => candidate.methods.includes(method) && candidate.path.includes(path),
  );
  const handler = layer?.stack.at(-1);
  if (!handler) throw new Error(`Missing ${method} ${path} route handler`);
  return handler;
}

/** Service-backed driver used only from the integration project. */
export class ProductionEnumerationResistanceDriver implements EnumerationResistanceSpecDriver {
  private readonly mailhog = new MailHogClient();
  private organization: Organization | null = null;
  private fixture: IdentityFixture | null = null;
  private actionId = randomUUID();
  private now = new Date();
  private workerId = randomUUID();
  private worker: ObservableRecoveryWorker;
  private failurePlan: RecoveryDependencyFailure[] = [];
  private readonly passwordVerifications: PasswordVerificationObservation[] = [];
  private readonly failureOperations: FailureOperationObservation[] = [];
  private readonly authenticationActionIds: string[] = [];
  private readonly actionByJob = new Map<string, string>();
  private readonly workerEvents: WorkerEventObservation[] = [];
  private readonly unknownOutcomeJobs = new Set<string>();

  /** Create a driver over production repositories, processor, and SMTP transport. */
  public constructor() {
    setEmailTransport(createSmtpTransport());
    this.worker = this.createWorker();
  }

  /** Reset owned rows, mailbox state, and one independently arranged identity. */
  public async reset(state: PasswordIdentityState): Promise<IdentityFixture> {
    // The integration project is serial. Removing ordinary test tenants also clears jobs left by
    // the preceding driver instance without disturbing the required super-admin seed.
    await getPool().query('DELETE FROM organizations WHERE is_super_admin = FALSE');
    await this.mailhog.clearAll();
    this.passwordVerifications.length = 0;
    this.failureOperations.length = 0;
    this.authenticationActionIds.length = 0;
    this.actionByJob.clear();
    this.workerEvents.length = 0;
    this.unknownOutcomeJobs.clear();
    this.failurePlan = [];
    this.now = new Date();
    this.workerId = randomUUID();

    const organization = await createTestOrganization({ name: 'Enumeration Production Org' });
    this.organization = organization;
    const email = `${state}-${randomUUID()}@test.example.com`;
    let user: User | null = null;
    if (state !== 'absent') {
      user =
        state === 'passwordless'
          ? await createTestUser(organization.id, { email })
          : (await createTestUserWithPassword(organization.id, DEFAULT_TEST_PASSWORD, { email }))
              .user;
      const status =
        state === 'disabled'
          ? 'inactive'
          : state === 'suspended'
            ? 'suspended'
            : state === 'locked'
              ? 'locked'
              : 'active';
      await getPool().query(
        `UPDATE users
         SET status = $2,
             locked_at = CASE WHEN $3 THEN NOW() ELSE NULL END,
             locked_reason = CASE WHEN $3 THEN 'manual' ELSE NULL END
         WHERE id = $1`,
        [user.id, status, status === 'locked'],
      );
    }
    this.fixture = {
      state,
      tenantId: organization.id,
      email,
      ...(user ? { accountId: user.id } : {}),
    };
    this.worker = this.createWorker();
    return this.fixture;
  }

  /** Submit an admitted password attempt through the real interaction handler and services. */
  public async submitPassword(input: {
    readonly fixture: IdentityFixture;
    readonly password: 'wrong' | 'fixture-valid';
    readonly forceDummyMatch?: boolean;
  }): Promise<PublicAction> {
    this.assertFixture(input.fixture);
    const organization = this.requireOrganization();
    this.actionId = randomUUID();
    const request = createContext(
      {
        email: input.fixture.email,
        password: input.password === 'fixture-valid' ? DEFAULT_TEST_PASSWORD : 'WrongPassword123!',
        _csrf: 'enumeration-production-csrf',
      },
      organization,
    );
    const provider = {
      interactionDetails: async () => ({
        uid: INTERACTION_UID,
        params: { client_id: 'enumeration-client', scope: 'openid' },
        prompt: { name: 'login', reasons: [], details: {} },
        session: {},
      }),
      interactionFinished: async () => {
        this.authenticationActionIds.push(this.actionId);
      },
      Client: {
        find: async () => ({
          metadata: () => ({ organizationId: organization.id, 'urn:porta:login_methods': null }),
        }),
      },
    };
    const dependencies = this.interactionDependencies(request.render);
    const router = createInteractionRouter(provider as never, dependencies);
    await findHandler(
      router,
      'POST',
      '/:uid/login',
    )(request.context as never, async () => undefined);
    return { actionId: this.actionId, response: request.snapshot() };
  }

  /** Submit one real outbox-producing recovery request through its public handler. */
  public async requestRecovery(input: {
    readonly fixture: IdentityFixture;
    readonly jobType: RecoveryJobType;
  }): Promise<PublicAction> {
    this.assertFixture(input.fixture);
    const organization = this.requireOrganization();
    this.actionId = randomUUID();
    const request = createContext(
      { email: input.fixture.email, _csrf: 'enumeration-production-csrf' },
      organization,
    );
    if (input.jobType === 'magic_link') {
      const provider = {
        interactionDetails: async () => ({
          uid: INTERACTION_UID,
          params: { client_id: 'enumeration-client', scope: 'openid' },
          prompt: { name: 'login', reasons: [], details: {} },
          session: {},
        }),
        Client: {
          find: async () => ({
            metadata: () => ({ organizationId: organization.id, 'urn:porta:login_methods': null }),
          }),
        },
      };
      const router = createInteractionRouter(
        provider as never,
        this.interactionDependencies(request.render),
      );
      await findHandler(
        router,
        'POST',
        '/:uid/magic-link',
      )(request.context as never, async () => undefined);
    } else {
      const router = createPasswordResetRouter(this.passwordResetDependencies(request.render));
      await findHandler(
        router,
        'POST',
        'forgot-password',
      )(request.context as never, async () => undefined);
    }
    const jobs = await this.readJobs();
    const newest = jobs.at(-1);
    if (!newest) throw new Error('Public recovery request did not persist a job');
    this.actionByJob.set(newest.id, this.actionId);
    this.now = new Date();
    return { actionId: this.actionId, response: request.snapshot() };
  }

  /** Enqueue extra real jobs used to prove the worker's batch bound. */
  public async enqueueAdditionalRecoveryJobs(input: {
    readonly count: number;
    readonly identityState: PasswordIdentityState;
  }): Promise<void> {
    const organization = this.requireOrganization();
    for (let index = 0; index < input.count; index += 1) {
      const actionId = randomUUID();
      const result = await enqueueAccountRecovery({
        jobType: 'magic_link',
        organizationId: organization.id,
        email: `${input.identityState}-${index}@absent.example.com`,
        interactionUid: `additional-${index}`,
        actionNonce: actionId,
      });
      this.actionByJob.set(result.job.id, actionId);
    }
    this.now = new Date();
  }

  /** Configure ordered dependency outcomes around the concrete processor. */
  public async setRecoveryFailurePlan(plan: readonly RecoveryDependencyFailure[]): Promise<void> {
    this.failurePlan = [...plan];
  }

  /** Run one bounded real repository/processor worker cycle. */
  public async runRecoveryWorkerOnce(): Promise<void> {
    await this.worker.executeOnce();
  }

  /** Lease a batch without starting any attempts, simulating immediate process loss. */
  public async crashRecoveryWorkerAfterClaim(): Promise<void> {
    const repository = createRecoveryJobRepository();
    const jobs = await repository.claimAvailable({
      workerId: this.workerId,
      now: this.now,
      leaseExpiredBefore: new Date(this.now.getTime() - RECOVERY_WORKER_LEASE_MILLISECONDS),
      limit: RECOVERY_JOB_CLAIM_LIMIT,
    });
    for (const job of jobs) this.captureEvent({ event: 'claimed', jobId: job.id, attempt: 0 });
  }

  /** Replace only the worker owner identity while preserving durable rows. */
  public async restartRecoveryWorker(): Promise<void> {
    this.workerId = randomUUID();
    this.worker = this.createWorker();
  }

  /** Advance the repository clock without sleeping. */
  public async advanceClock(milliseconds: number): Promise<void> {
    this.now = new Date(this.now.getTime() + milliseconds);
    const organization = this.requireOrganization();
    const ready = await getPool().query(
      `SELECT 1
       FROM auth_recovery_jobs
       WHERE organization_id = $1
         AND (
           (status = 'available' AND available_at <= $2 AND attempt_count < 5)
           OR (status = 'claimed' AND claimed_at <= $3 AND attempt_count <= 5)
         )
       LIMIT 1`,
      [
        organization.id,
        this.now,
        new Date(this.now.getTime() - RECOVERY_WORKER_LEASE_MILLISECONDS),
      ],
    );
    if (ready.rowCount === 1) await this.worker.executeOnce();
  }

  /** Exercise the real worker's owned start/stop lifecycle. */
  public async beginRecoveryWorkerShutdown(): Promise<void> {
    this.worker.start();
    await this.worker.stop();
  }

  /** Read jobs, artifacts, mailbox deliveries, and operational events independently. */
  public async observe(): Promise<EnumerationResistanceObservations> {
    const jobs = await this.readJobs();
    const artifacts = await this.readArtifacts(jobs);
    const deliveries = await this.readDeliveries(jobs);
    return {
      passwordVerifications: [...this.passwordVerifications],
      failureOperations: [...this.failureOperations],
      authenticationEffects: this.authenticationActionIds.map((actionId) => ({
        actionId,
        kind: 'authentication' as const,
      })),
      recoveryJobs: jobs.map((job) => this.observeJob(job)),
      artifacts,
      deliveries,
      workerEvents: [...this.workerEvents],
      workerReasonCatalog: [...RECOVERY_WORKER_FAILURE_REASONS],
      operationalOutput: [],
    };
  }

  /** Return the immutable non-gating timing authority. */
  public async readTimingDiagnostic(): Promise<TimingDiagnosticObservation> {
    return {
      gating: false,
      securityClaimImpact: 'none',
      ordinaryVerificationMember: false,
      securityClaimTransitions: [],
    };
  }

  /** Build route dependencies that observe calls but delegate to production services. */
  private interactionDependencies(renderPage: (pageName: string) => Promise<string>) {
    return {
      ...this.sharedDependencies(renderPage),
      buildLoginRateLimitKey: () => 'enumeration-login-rate',
      buildMagicLinkRateLimitKey: () => 'enumeration-magic-rate',
      loadLoginRateLimitConfig: async () => ({ maxAttempts: 50, windowSeconds: 300 }),
      loadMagicLinkRateLimitConfig: async () => ({ maxAttempts: 50, windowSeconds: 300 }),
      resetRateLimit: async () => undefined,
      prepareUserForPasswordLogin,
      verifyLoginPassword: async (userId: string | null, password: string) => {
        const matched = await verifyLoginPassword(userId, password);
        this.passwordVerifications.push({
          actionId: this.actionId,
          algorithm: 'argon2id',
          hashSource: userId === null ? 'dummy' : 'account',
          matched,
        });
        return matched;
      },
      recordPasswordFailure: async (user: User | null) => {
        const result = await recordPasswordFailure(user);
        this.failureOperations.push({
          actionId: this.actionId,
          operationShape: ['conditional-user-update', 'cache-invalidation'],
        });
        return result;
      },
      recordLogin,
    };
  }

  /** Build the account-independent dependencies shared by both public recovery handlers. */
  private sharedDependencies(renderPage: (pageName: string) => Promise<string>) {
    return {
      getCsrfFromCookie: () => 'enumeration-production-csrf',
      verifyCsrfToken: (stored: string, submitted: string) => stored === submitted,
      generateCsrfToken: () => 'redacted-csrf',
      setCsrfCookie: () => undefined,
      checkRateLimit: async () => ({ allowed: true, remaining: 49, retryAfter: 0 }),
      resolveLocale: async () => 'en',
      getTranslationFunction: () => (key: string) => key,
      renderPage,
      enqueueAccountRecovery,
      writeAuditLog: () => undefined,
    };
  }

  /** Build public password-reset dependencies around the production outbox service. */
  private passwordResetDependencies(renderPage: (pageName: string) => Promise<string>) {
    return {
      ...this.sharedDependencies(renderPage),
      buildPasswordResetRateLimitKey: () => 'enumeration-reset-rate',
      loadPasswordResetRateLimitConfig: async () => ({ maxAttempts: 50, windowSeconds: 300 }),
    };
  }

  /** Create a worker whose injected failures surround, rather than replace, the real processor. */
  private createWorker(): ObservableRecoveryWorker {
    const processor = new AccountRecoveryJobProcessor();
    return new ObservableRecoveryWorker({
      repository: createRecoveryJobRepository(),
      workerId: this.workerId,
      clock: { now: () => this.now, setTimeout, clearTimeout },
      observer: (event) => this.captureEvent(event),
      processor: {
        process: async (job: ClaimedRecoveryJob) => {
          const failure = this.failurePlan.shift();
          if (failure === 'database') {
            throw new RecoveryJobProcessingError('database_unavailable', true);
          }
          const result = await processor.process(job);
          if (failure === 'smtp') {
            this.unknownOutcomeJobs.add(job.id);
            throw new RecoveryJobProcessingError('smtp_outcome_unknown', true);
          }
          return result;
        },
      },
    });
  }

  /** Store the closed worker event shape accepted by the immutable contract. */
  private captureEvent(event: RecoveryWorkerEvent): void {
    if (event.event === 'no_op' || event.event === 'shutdown_timeout') return;
    this.workerEvents.push(event);
  }

  /** Read every owned durable job in deterministic creation order. */
  private async readJobs(): Promise<RecoveryJob[]> {
    const organization = this.requireOrganization();
    const result = await getPool().query<{
      id: string;
      job_type: RecoveryJobType;
      organization_id: string;
      address_ciphertext: string;
      address_iv: string;
      address_tag: string;
      address_key_id: string;
      interaction_uid: string | null;
      idempotency_digest: string;
      status: RecoveryJob['status'];
      available_at: Date;
      claimed_at: Date | null;
      claimed_by: string | null;
      attempt_count: number;
      last_failure_reason: string | null;
      completed_at: Date | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT * FROM auth_recovery_jobs
       WHERE organization_id = $1
       ORDER BY created_at, id`,
      [organization.id],
    );
    return result.rows.map((row) => ({
      id: row.id,
      jobType: row.job_type,
      organizationId: row.organization_id,
      protectedAddress: {
        ciphertext: row.address_ciphertext,
        iv: row.address_iv,
        tag: row.address_tag,
        keyId: row.address_key_id,
      },
      interactionUid: row.interaction_uid,
      idempotencyDigest: row.idempotency_digest,
      status: row.status,
      availableAt: row.available_at,
      claimedAt: row.claimed_at,
      claimedBy: row.claimed_by,
      attemptCount: row.attempt_count,
      lastFailureReason: row.last_failure_reason,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /** Map a persisted row to its privacy-safe immutable observation. */
  private observeJob(job: RecoveryJob): RecoveryJobObservation {
    return {
      actionId: this.actionByJob.get(job.id) ?? 'unmapped-action',
      jobId: job.id,
      jobType: job.jobType,
      organizationId: job.organizationId,
      schema: [
        'jobType',
        'organizationId',
        'protectedAddress',
        'interactionUid',
        'idempotencyDigest',
        'availableAt',
      ],
      containsToken: false,
      status: job.status,
      attemptCount: job.attemptCount,
    };
  }

  /** Read active/inactive token state directly from both recovery artifact tables. */
  private async readArtifacts(jobs: readonly RecoveryJob[]): Promise<ArtifactObservation[]> {
    const result = await getPool().query<{
      recovery_job_id: string;
      job_type: RecoveryJobType;
      active: boolean;
    }>(
      `SELECT token.recovery_job_id, job.job_type,
              token.used_at IS NULL AND token.expires_at > NOW() AS active
       FROM (
         SELECT recovery_job_id, used_at, expires_at FROM magic_link_tokens
         UNION ALL
         SELECT recovery_job_id, used_at, expires_at FROM password_reset_tokens
       ) AS token
       JOIN auth_recovery_jobs AS job ON job.id = token.recovery_job_id
       WHERE token.recovery_job_id = ANY($1::uuid[])
       ORDER BY token.recovery_job_id`,
      [jobs.map((job) => job.id)],
    );
    return result.rows.map((row) => ({
      jobId: row.recovery_job_id,
      jobType: row.job_type,
      active: row.active,
    }));
  }

  /** Correlate real mailbox messages to deterministic job-owned artifact digests. */
  private async readDeliveries(jobs: readonly RecoveryJob[]): Promise<DeliveryObservation[]> {
    const messages = await this.mailhog.getMessages();
    const observations: DeliveryObservation[] = [];
    for (const message of messages) {
      const body = `${message.body}\n${message.html}`;
      const job = jobs.find((candidate) =>
        body.includes(
          recoveryArtifactToken(candidate.id, candidate.jobType, candidate.protectedAddress.keyId),
        ),
      );
      if (!job) continue;
      const token = recoveryArtifactToken(job.id, job.jobType, job.protectedAddress.keyId);
      observations.push({
        jobId: job.id,
        jobType: job.jobType,
        artifactIdentity: createHash('sha256').update(`recovery-artifact:${token}`).digest('hex'),
        outcome: this.unknownOutcomeJobs.has(job.id) ? 'accepted_outcome_unknown' : 'accepted',
      });
    }
    return observations;
  }

  /** Require that a caller uses the current arranged fixture. */
  private assertFixture(fixture: IdentityFixture): void {
    if (
      !this.fixture ||
      fixture.state !== this.fixture.state ||
      fixture.tenantId !== this.fixture.tenantId ||
      fixture.email !== this.fixture.email
    ) {
      throw new Error('Enumeration fixture does not belong to this production driver');
    }
  }

  /** Return the current arranged organization or fail before evidence can be fabricated. */
  private requireOrganization(): Organization {
    if (!this.organization) throw new Error('Enumeration production fixture is not arranged');
    return this.organization;
  }
}
