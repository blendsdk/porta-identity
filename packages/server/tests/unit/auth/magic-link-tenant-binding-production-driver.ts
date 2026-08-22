import { randomUUID } from 'node:crypto';
import type Router from '@koa/router';
import type Provider from 'oidc-provider';
import { createMagicLinkRouter } from '../../../src/routes/magic-link.js';
import { createInteractionRouter } from '../../../src/routes/interactions.js';
import {
  consumeMagicLinkSession,
  type MagicLinkSessionAuthority,
} from '../../../src/auth/magic-link-session.js';
import { hashToken } from '../../../src/auth/tokens.js';
import { checkRateLimitStrict } from '../../../src/auth/rate-limiter.js';
import { createSmtpTransport } from '../../../src/auth/email-transport.js';
import { setEmailTransport } from '../../../src/auth/email-service.js';
import { AccountRecoveryJobProcessor } from '../../../src/auth/recovery-job-processor.js';
import { createRecoveryJobRepository } from '../../../src/auth/recovery-job-repository.js';
import { enqueueAccountRecovery } from '../../../src/auth/recovery-service.js';
import { getPool } from '../../../src/lib/database.js';
import { getRedis } from '../../../src/lib/redis.js';
import type { Organization } from '../../../src/organizations/types.js';
import {
  createTestApplication,
  createTestClient,
  createTestOrganization,
  createTestUser,
} from '../../integration/helpers/factories.js';
import { MailHogClient } from '../../e2e/helpers/mailhog.js';
import type {
  MagicLinkArtifactMode,
  MagicLinkAuthorityFixture,
  MagicLinkAuthorityObservations,
  MagicLinkPublicOutcome,
  MagicLinkTenantBindingSpecDriver,
} from './magic-link-tenant-binding-contract.js';

/** Fixed public failure classification derived from the real response status and content type. */
const GENERIC_MAGIC_LINK_FAILURE = 'invalid-or-expired';

/** Optional real application boundary used by the correction evidence collector. */
export interface MagicLinkPublicBoundary {
  /** Actual provider whose Interaction model owns live authority. */
  readonly provider: Provider;
  /** Loopback URL of the real Koa application. */
  readonly baseUrl: string;
}

/** Mutable cookie jar shared across one public presentation and its continuation attempts. */
interface CookieJar {
  /** Read one cookie value. */
  get(name: string): string | undefined;
  /** Apply one Koa cookie write. */
  set(name: string, value: string): void;
}

/** Minimal mutable context state observed after invoking a public route handler. */
interface PublicContextSnapshot {
  /** HTTP response status selected by the handler. */
  readonly status: number;
  /** HTTP response content type selected by the handler. */
  readonly type: string;
  /** Redirect target selected by the handler, if any. */
  readonly redirect: string | null;
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

/** Create a bounded Koa context with an observable cookie jar and response snapshot. */
function createContext(input: {
  readonly organization: Organization;
  readonly token: string;
  readonly interactionUid?: string;
  readonly socketPeer?: string;
  readonly jar: Map<string, string>;
}) {
  let status = 200;
  let type = '';
  let body: unknown;
  let redirect: string | null = null;
  const cookies: CookieJar = {
    get: (name) => input.jar.get(name),
    set: (name, value) => {
      if (value === '') input.jar.delete(name);
      else input.jar.set(name, value);
    },
  };
  const context = {
    params: { orgSlug: input.organization.slug, token: input.token },
    query: input.interactionUid === undefined ? {} : { interaction: input.interactionUid },
    request: { body: {} },
    req: { socket: { remoteAddress: input.socketPeer ?? '127.0.0.1' } },
    res: {},
    ip: '127.0.0.1',
    secure: true,
    state: { organization: input.organization },
    cookies,
    get status() {
      return status;
    },
    set status(value: number) {
      status = value;
    },
    get type() {
      return type;
    },
    set type(value: string) {
      type = value;
    },
    get body() {
      return body;
    },
    set body(value: unknown) {
      body = value;
    },
    get: () => '',
    set: () => undefined,
    redirect: (location: string) => {
      status = 302;
      redirect = location;
    },
  };
  return {
    context,
    snapshot: (): PublicContextSnapshot => ({ status, type, redirect }),
  };
}

/** Service-backed driver over real public handlers, PostgreSQL, Redis, and audit rows. */
export class ProductionMagicLinkTenantBindingDriver implements MagicLinkTenantBindingSpecDriver {
  private fixture: MagicLinkAuthorityFixture | null = null;
  private alpha: Organization | null = null;
  private bravo: Organization | null = null;
  private readonly jar = new Map<string, string>();
  private initialLoginCount = 0;
  private initialMailCount = 0;
  private continuationWrites = 0;
  private sessionMutations = 0;
  private callbackLimiterUnavailable = false;
  private alphaClientId: string | null = null;
  private bravoClientId: string | null = null;
  private deliveredUrl: string | null = null;

  /** Create a driver with an optional full HTTP/provider boundary. */
  public constructor(private readonly publicBoundary?: MagicLinkPublicBoundary) {}

  /** Reset owned tenant state and arrange one authority-bound durable artifact. */
  public async reset(input: {
    readonly mode: MagicLinkArtifactMode;
  }): Promise<MagicLinkAuthorityFixture> {
    await getPool().query('DELETE FROM organizations WHERE is_super_admin = FALSE');
    await getRedis().flushdb();
    this.jar.clear();
    this.continuationWrites = 0;
    this.sessionMutations = 0;
    this.callbackLimiterUnavailable = false;
    this.alpha = await createTestOrganization({
      name: 'Magic Alpha',
      slug: `magic-alpha-${randomUUID()}`,
    });
    this.bravo = await createTestOrganization({
      name: 'Magic Bravo',
      slug: `magic-bravo-${randomUUID()}`,
    });
    const application = await createTestApplication();
    const alphaClient = await createTestClient(this.alpha.id, application.id);
    const bravoClient = await createTestClient(this.bravo.id, application.id);
    this.alphaClientId = alphaClient.clientId;
    this.bravoClientId = bravoClient.clientId;
    this.deliveredUrl = null;
    const email = `magic-${randomUUID()}@test.example.com`;
    const user = await createTestUser(this.alpha.id, { email, emailVerified: false });
    const tokenValue = randomUUID();
    const interactionUid = `alpha-${randomUUID()}`;
    const changedInteractionUid = `changed-${randomUUID()}`;
    const foreignClientInteractionUid = `bravo-${randomUUID()}`;
    await getPool().query(
      `INSERT INTO magic_link_tokens
         (user_id, token_hash, expires_at, organization_id, interaction_uid, authority_bound)
       VALUES ($1, $2, NOW() + INTERVAL '15 minutes', $3, $4, TRUE)`,
      [
        user.id,
        hashToken(tokenValue),
        this.alpha.id,
        input.mode === 'interaction-bound' ? interactionUid : null,
      ],
    );
    await getRedis().set(`interaction:org:${interactionUid}`, this.alpha.id, 'EX', 3600);
    await getRedis().set(`interaction:client:${interactionUid}`, alphaClient.clientId, 'EX', 3600);
    await getRedis().set(
      `interaction:org:${foreignClientInteractionUid}`,
      this.bravo.id,
      'EX',
      3600,
    );
    await getRedis().set(
      `interaction:client:${foreignClientInteractionUid}`,
      bravoClient.clientId,
      'EX',
      3600,
    );
    if (this.publicBoundary && input.mode === 'interaction-bound') {
      await this.replaceProviderInteraction(interactionUid, alphaClient.clientId);
    }
    const account = await getPool().query<{ login_count: number }>(
      'SELECT login_count FROM users WHERE id = $1',
      [user.id],
    );
    this.initialLoginCount = account.rows[0]?.login_count ?? 0;
    this.initialMailCount = await this.mailCount();
    this.fixture = {
      organizationId: this.alpha.id,
      foreignOrganizationId: this.bravo.id,
      userId: user.id,
      email,
      tokenValue,
      interactionUid,
      changedInteractionUid,
      foreignClientInteractionUid,
    };
    return this.fixture;
  }

  /** Replace the provider-owned client mapping for the exact persisted interaction. */
  public async setLiveAuthority(state: 'matching' | 'missing' | 'foreign-client'): Promise<void> {
    const fixture = this.requireFixture();
    if (this.publicBoundary) {
      const clientId = state === 'matching' ? this.alphaClientId : this.bravoClientId;
      await this.replaceProviderInteraction(
        fixture.interactionUid,
        state === 'missing' ? null : clientId,
      );
      return;
    }
    const key = `interaction:client:${fixture.interactionUid}`;
    if (state === 'missing') {
      await getRedis().del(key);
      return;
    }
    const clientId = state === 'matching' ? this.alphaClientId : this.bravoClientId;
    if (!clientId) throw new Error('Magic-link client authority is not initialized');
    await getRedis().set(key, clientId, 'EX', 3600);
  }

  /** Remove the arranged artifact while preserving its future callback identity. */
  public async removeArtifact(): Promise<void> {
    const fixture = this.requireFixture();
    await getPool().query('DELETE FROM magic_link_tokens WHERE token_hash = $1', [
      hashToken(fixture.tokenValue),
    ]);
  }

  /** Insert the arranged bound artifact after callback-attempt state has been established. */
  public async activateArtifact(): Promise<void> {
    const fixture = this.requireFixture();
    await getPool().query(
      `INSERT INTO magic_link_tokens
         (user_id, token_hash, expires_at, organization_id, interaction_uid, authority_bound)
       VALUES ($1, $2, NOW() + INTERVAL '15 minutes', $3, $4, TRUE)`,
      [
        fixture.userId,
        hashToken(fixture.tokenValue),
        fixture.organizationId,
        fixture.interactionUid,
      ],
    );
  }

  /** Deliver one standalone artifact through the production outbox processor. */
  public async deliverStandaloneArtifact(): Promise<MagicLinkAuthorityFixture> {
    const fixture = await this.reset({ mode: 'standalone' });
    await this.removeArtifact();
    const mailhog = new MailHogClient();
    await mailhog.clearAll();
    this.initialMailCount = 0;
    setEmailTransport(createSmtpTransport());
    const enqueued = await enqueueAccountRecovery({
      jobType: 'magic_link',
      organizationId: fixture.organizationId,
      email: fixture.email,
      interactionUid: null,
      actionNonce: randomUUID(),
    });
    const repository = createRecoveryJobRepository();
    const workerId = randomUUID();
    const now = new Date();
    const claimed = await repository.claimAvailable({
      workerId,
      now,
      leaseExpiredBefore: new Date(now.getTime() - 300_000),
      limit: 1,
    });
    const job = claimed.find((candidate) => candidate.id === enqueued.job.id);
    if (!job) throw new Error('Standalone magic-link recovery job was not claimed');
    const started = await repository.beginAttempt({ jobId: job.id, workerId, now });
    if (!started) throw new Error('Standalone magic-link recovery attempt did not start');
    const result = await new AccountRecoveryJobProcessor().process({ ...job, attemptCount: 1 });
    if (result !== 'completed') throw new Error('Standalone magic-link recovery did not complete');
    const completed = await repository.markCompleted({ jobId: job.id, workerId, now: new Date() });
    if (!completed) throw new Error('Standalone magic-link recovery completion was not persisted');
    const message = await mailhog.waitForMessage(fixture.email);
    const deliveredUrl = mailhog.extractLink(
      message,
      /https?:\/\/[^\s"<>]+\/auth\/magic-link\/[^\s"<>]+/,
    );
    if (!deliveredUrl) throw new Error('Standalone magic-link delivery URL was unavailable');
    const parsed = new URL(deliveredUrl);
    const tokenValue = decodeURIComponent(parsed.pathname.split('/').at(-1) ?? '');
    if (!tokenValue) throw new Error('Standalone magic-link artifact was unavailable');
    this.deliveredUrl = deliveredUrl;
    this.fixture = { ...fixture, tokenValue };
    return this.fixture;
  }

  /** Return the latest standalone delivery URL without exposing mailbox internals. */
  public readDeliveredUrl(): string | null {
    return this.deliveredUrl;
  }

  /** Present the arranged artifact through the real public magic-link route handler. */
  public async present(input: {
    readonly routeOrganizationId: string;
    readonly interactionUid?: string;
    readonly socketPeer?: string;
  }): Promise<MagicLinkPublicOutcome> {
    const fixture = this.requireFixture();
    const organization = this.requireOrganization(input.routeOrganizationId);
    if (this.publicBoundary && !this.callbackLimiterUnavailable && input.socketPeer === undefined) {
      const url = new URL(
        `/${organization.slug}/auth/magic-link/${encodeURIComponent(fixture.tokenValue)}`,
        this.publicBoundary.baseUrl,
      );
      if (input.interactionUid !== undefined) {
        url.searchParams.set('interaction', input.interactionUid);
      }
      const response = await fetch(url, { redirect: 'manual' });
      const body = await response.text();
      const contentType = response.headers.get('content-type')?.split(';', 1)[0] ?? 'unknown';
      const redirect = response.headers.get('location');
      const accepted =
        response.status === 200 || response.status === 302 || response.status === 303;
      const protectedValueExposed = [fixture.tokenValue, fixture.email, fixture.userId].some(
        (value) => body.includes(value),
      );
      return {
        accepted,
        responseShape: redirect
          ? 'interaction-redirect'
          : response.status === 400 && contentType === 'text/html' && !protectedValueExposed
            ? '400:text/html:error-page'
            : `${response.status}:${contentType}:unexpected`,
        genericError: accepted || protectedValueExposed ? null : GENERIC_MAGIC_LINK_FAILURE,
      };
    }
    const request = createContext({
      organization,
      token: fixture.tokenValue,
      ...(input.interactionUid === undefined ? {} : { interactionUid: input.interactionUid }),
      ...(input.socketPeer === undefined ? {} : { socketPeer: input.socketPeer }),
      jar: this.jar,
    });
    const provider = {
      Interaction: {
        find: async (uid: string) => {
          const clientId = await getRedis().get(`interaction:client:${uid}`);
          return clientId ? { uid, params: { client_id: clientId } } : undefined;
        },
      },
    };
    const handler = findHandler(
      createMagicLinkRouter(provider, {
        checkCallbackRateLimit: async (key, config) => {
          if (this.callbackLimiterUnavailable) throw new Error('callback limiter unavailable');
          return checkRateLimitStrict(key, config);
        },
      }),
      'GET',
      'magic-link',
    );
    await handler(request.context as never, async () => undefined);
    const snapshot = request.snapshot();
    const accepted = snapshot.status === 200 || snapshot.status === 302;
    const continuationToken = this.jar.get('_ml_session');
    if (accepted && continuationToken) {
      const exists = await getRedis().exists(`ml_session:${continuationToken}`);
      if (exists === 1) this.continuationWrites += 1;
    }
    return {
      accepted,
      responseShape: snapshot.redirect
        ? 'interaction-redirect'
        : snapshot.status === 400 && snapshot.type === 'text/html'
          ? '400:text/html:error-page'
          : `${snapshot.status}:${snapshot.type}:unexpected`,
      genericError: accepted ? null : GENERIC_MAGIC_LINK_FAILURE,
    };
  }

  /** Select whether callback-limit storage fails before the next public presentation. */
  public setCallbackLimiterUnavailable(unavailable: boolean): void {
    this.callbackLimiterUnavailable = unavailable;
  }

  /** Mark only the arranged durable artifact consumed. */
  public async consumeArtifact(): Promise<void> {
    const fixture = this.requireFixture();
    await getPool().query('UPDATE magic_link_tokens SET used_at = NOW() WHERE token_hash = $1', [
      hashToken(fixture.tokenValue),
    ]);
  }

  /** Expire only the arranged durable artifact. */
  public async expireArtifact(): Promise<void> {
    const fixture = this.requireFixture();
    await getPool().query(
      "UPDATE magic_link_tokens SET expires_at = NOW() - INTERVAL '1 second' WHERE token_hash = $1",
      [hashToken(fixture.tokenValue)],
    );
  }

  /** Consume the continuation using real Lua authority and interaction completion boundaries. */
  public async consumeContinuation(
    input: MagicLinkSessionAuthority,
  ): Promise<{ readonly sessionCreated: boolean }> {
    const fixture = this.requireFixture();
    if (
      input.interactionUid !== fixture.interactionUid ||
      input.organizationId !== fixture.organizationId
    ) {
      const request = createContext({
        organization: this.requireOrganization(fixture.organizationId),
        token: fixture.tokenValue,
        jar: this.jar,
      });
      const session = await consumeMagicLinkSession(request.context as never, input);
      return { sessionCreated: session !== null };
    }

    let created = false;
    const provider = {
      interactionFinished: async () => {
        created = true;
        this.sessionMutations += 1;
      },
      interactionDetails: async () => ({
        uid: input.interactionUid,
        params: { client_id: 'magic-alpha-client', scope: 'openid' },
        prompt: { name: 'login', reasons: [], details: {} },
        session: {},
      }),
      Client: { find: async () => undefined },
    };
    const request = createContext({
      organization: this.requireOrganization(fixture.organizationId),
      token: fixture.tokenValue,
      interactionUid: input.interactionUid,
      jar: new Map(this.jar),
    });
    request.context.params = { uid: input.interactionUid } as never;
    const handler = findHandler(createInteractionRouter(provider as never), 'GET', '/:uid');
    await handler(request.context as never, async () => undefined);
    if (created) this.jar.delete('_ml_session');
    return { sessionCreated: created };
  }

  /** Read durable and continuation effects independently from handler return values. */
  public async observe(): Promise<MagicLinkAuthorityObservations> {
    const fixture = this.requireFixture();
    const artifact = await getPool().query<{ used_at: Date | null }>(
      'SELECT used_at FROM magic_link_tokens WHERE token_hash = $1',
      [hashToken(fixture.tokenValue)],
    );
    const account = await getPool().query<{ login_count: number }>(
      'SELECT login_count FROM users WHERE id = $1',
      [fixture.userId],
    );
    const audits = await getPool().query<{ event_type: string; description: string | null }>(
      `SELECT event_type, description
       FROM audit_log
       WHERE organization_id = $1 AND created_at >= NOW() - INTERVAL '5 minutes'
       ORDER BY created_at`,
      [fixture.organizationId],
    );
    const continuationToken = this.jar.get('_ml_session');
    const continuationExists = continuationToken
      ? (await getRedis().exists(`ml_session:${continuationToken}`)) === 1
      : false;
    const loginCount = account.rows[0]?.login_count ?? this.initialLoginCount;
    return {
      artifactConsumptionCount: artifact.rows[0]?.used_at ? 1 : 0,
      userMutations: loginCount - this.initialLoginCount,
      emailMutations: (await this.mailCount()) - this.initialMailCount,
      loginEffects: loginCount - this.initialLoginCount,
      successfulAuditEvents: audits.rows.filter(
        (entry) => entry.event_type === 'user.login.magic_link',
      ).length,
      continuationWrites: this.continuationWrites,
      sessionMutations: this.sessionMutations,
      continuationExists,
      operationalOutput: audits.rows.map(
        (entry) => `${entry.event_type}:${entry.description ?? ''}`,
      ),
    };
  }

  /** Return the arranged fixture or fail when the specification skipped reset. */
  private requireFixture(): MagicLinkAuthorityFixture {
    if (!this.fixture) throw new Error('Magic-link authority fixture is not initialized');
    return this.fixture;
  }

  /** Resolve one of the two owned test organizations. */
  private requireOrganization(id: string): Organization {
    if (this.alpha?.id === id) return this.alpha;
    if (this.bravo?.id === id) return this.bravo;
    throw new Error('Magic-link route organization is outside the owned fixture');
  }

  /** Replace one exact provider-owned interaction without touching its durable artifact. */
  private async replaceProviderInteraction(uid: string, clientId: string | null): Promise<void> {
    const provider = this.publicBoundary?.provider;
    if (!provider) return;
    const existing = await provider.Interaction.find(uid);
    if (existing) await existing.destroy();
    if (!clientId) return;
    const interaction = new provider.Interaction(uid, {
      params: { client_id: clientId, scope: 'openid' },
      prompt: { name: 'login', reasons: [], details: {} },
      returnTo: '/',
    });
    await interaction.save(3_600);
  }

  /** Read the MailHog message count without retaining message content. */
  private async mailCount(): Promise<number> {
    const response = await fetch('http://localhost:8025/api/v2/messages?limit=1');
    if (!response.ok) throw new Error('MailHog observation failed');
    const payload: unknown = await response.json();
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw new Error('MailHog observation was malformed');
    }
    const total = Reflect.get(payload, 'total');
    if (typeof total !== 'number') throw new Error('MailHog total was unavailable');
    return total;
  }
}
