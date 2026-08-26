import { randomUUID } from 'node:crypto';
import type Router from '@koa/router';
import type { Organization } from '../../../src/organizations/types.js';
import type { User } from '../../../src/users/types.js';
import {
  createInteractionRouter,
  type EnumerationSensitiveInteractionDependencies,
} from '../../../src/routes/interactions.js';
import {
  createPasswordResetRouter,
  type RecoveryRequestRouteDependencies,
} from '../../../src/routes/password-reset.js';
import type { EnqueueAccountRecoveryInput } from '../../../src/auth/recovery-service.js';
import type {
  EnqueueRecoveryJobResult,
  RecoveryJob,
} from '../../../src/auth/recovery-job-repository.js';
import type {
  FailureOperationObservation,
  IdentityFixture,
  PasswordIdentityState,
  PasswordVerificationObservation,
  PublicAction,
  PublicResponseSnapshot,
  RecoveryJobType,
} from './enumeration-resistance-contract.js';

/** Mutable observations shared by the live route and worker boundaries. */
export interface EnumerationLiveState {
  /** Current arranged identity. */
  fixture: IdentityFixture;
  /** Current action correlation identifier. */
  actionId: string;
  /** Persisted recovery jobs and their arranged account state. */
  jobs: Map<string, { job: RecoveryJob; actionId: string; identityState: PasswordIdentityState }>;
  /** Password verification calls captured at the injected hash boundary. */
  passwordVerifications: PasswordVerificationObservation[];
  /** Fixed-shape failed-login operations captured at persistence boundary. */
  failureOperations: FailureOperationObservation[];
  /** Authentication effects captured at the provider boundary. */
  authenticationActionIds: string[];
  /** Whether the next dummy verification must report a match. */
  forceDummyMatch: boolean;
}

const TENANT_ID = '00000000-0000-4000-8000-000000000101';
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000201';
const INTERACTION_UID = 'enumeration-interaction';

function createOrganization(): Organization {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: TENANT_ID,
    name: 'Enumeration Test Organization',
    slug: 'enumeration-test',
    status: 'active',
    isSuperAdmin: false,
    brandingLogoUrl: null,
    brandingFaviconUrl: null,
    brandingPrimaryColor: null,
    brandingCompanyName: null,
    brandingCustomCss: null,
    defaultLocale: 'en',
    twoFactorPolicy: 'optional',
    defaultLoginMethods: ['password', 'magic_link'],
    createdAt: now,
    updatedAt: now,
  };
}

function createUser(fixture: IdentityFixture): User | null {
  if (fixture.state === 'absent') return null;
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: ACCOUNT_ID,
    organizationId: TENANT_ID,
    email: fixture.email,
    emailVerified: true,
    hasPassword: fixture.state !== 'passwordless',
    passwordChangedAt: now,
    givenName: 'Enumeration',
    familyName: 'Fixture',
    middleName: null,
    nickname: null,
    preferredUsername: null,
    profileUrl: null,
    pictureUrl: null,
    websiteUrl: null,
    gender: null,
    birthdate: null,
    zoneinfo: null,
    locale: 'en',
    phoneNumber: null,
    phoneNumberVerified: false,
    addressStreet: null,
    addressLocality: null,
    addressRegion: null,
    addressPostalCode: null,
    addressCountry: null,
    twoFactorEnabled: false,
    twoFactorMethod: null,
    status:
      fixture.state === 'disabled'
        ? 'inactive'
        : fixture.state === 'suspended'
          ? 'suspended'
          : fixture.state === 'locked'
            ? 'locked'
            : 'active',
    lockedAt: fixture.state === 'locked' ? now : null,
    lockedReason: fixture.state === 'locked' ? 'manual' : null,
    lastLoginAt: null,
    loginCount: 0,
    failedLoginCount: 0,
    lastFailedLoginAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function createContext(body: Readonly<Record<string, string>>, organization: Organization) {
  let status = 200;
  let responseBody: unknown;
  let type = '';
  const headers: Record<string, string> = {};
  const cookies: { name: string; attributes: Readonly<Record<string, string | boolean>> }[] = [];
  return {
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
      get: () => 'enumeration-csrf',
      set: (name: string, _value: string, attributes: Record<string, string | boolean>) => {
        cookies.push({ name, attributes: { ...attributes } });
      },
    },
    redirect: (location: string) => {
      status = 302;
      headers.location = location;
    },
    snapshot(pageName: string | null): PublicResponseSnapshot {
      return {
        status,
        pageOrBodySchema: pageName === null ? typeof responseBody : { page: pageName, type },
        genericError: pageName === 'login' ? 'invalid_credentials' : null,
        securityHeaders: { ...headers },
        cookies,
        redirectShape: headers.location
          ? headers.location.replace(INTERACTION_UID, ':interaction')
          : null,
      };
    },
  };
}

function findHandler(router: Router, method: string, path: string) {
  const layer = router.stack.find(
    (candidate) => candidate.methods.includes(method) && candidate.path.includes(path),
  );
  const handler = layer?.stack.at(-1);
  if (!handler) throw new Error(`Missing ${method} ${path} route handler`);
  return handler;
}

function recoveryResult(job: RecoveryJob): EnqueueRecoveryJobResult {
  return { job, inserted: true };
}

/** Persist one test-owned job with the same public schema observed from the route boundary. */
export function enqueueEnumerationJob(
  state: EnumerationLiveState,
  input: EnqueueAccountRecoveryInput,
  identityState: PasswordIdentityState = state.fixture.state,
): RecoveryJob {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const job: RecoveryJob = {
    id: randomUUID(),
    jobType: input.jobType,
    organizationId: input.organizationId,
    protectedAddress: {
      ciphertext: 'protected',
      iv: 'protected',
      tag: 'protected',
      keyId: 'key00001',
    },
    interactionUid: input.interactionUid,
    idempotencyDigest: '0'.repeat(64),
    status: 'available',
    availableAt: now,
    claimedAt: null,
    claimedBy: null,
    attemptCount: 0,
    lastFailureReason: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  state.jobs.set(job.id, { job, actionId: state.actionId, identityState });
  return job;
}

/** Execute the real public login and recovery handlers over independently observed boundaries. */
export class EnumerationLiveRouteDriver {
  private readonly organization = createOrganization();
  private renderedPage: string | null = null;

  /** Create a route driver over the mutable scenario state. */
  public constructor(private readonly state: EnumerationLiveState) {}

  /** Submit one password attempt through the real interaction route handler. */
  public async submitPassword(password: 'wrong' | 'fixture-valid'): Promise<PublicAction> {
    const ctx = createContext(
      { email: this.state.fixture.email, password, _csrf: 'enumeration-csrf' },
      this.organization,
    );
    this.renderedPage = null;
    const dependencies = this.interactionDependencies(password);
    const provider = this.provider();
    const router = createInteractionRouter(provider as never, dependencies);
    await findHandler(router, 'POST', '/:uid/login')(ctx as never, async () => undefined);
    return { actionId: this.state.actionId, response: ctx.snapshot(this.renderedPage) };
  }

  /** Submit one recovery request through its real public route handler. */
  public async requestRecovery(jobType: RecoveryJobType): Promise<PublicAction> {
    const ctx = createContext(
      { email: this.state.fixture.email, _csrf: 'enumeration-csrf' },
      this.organization,
    );
    this.renderedPage = null;
    if (jobType === 'magic_link') {
      const router = createInteractionRouter(
        this.provider() as never,
        this.interactionDependencies('wrong'),
      );
      await findHandler(router, 'POST', '/:uid/magic-link')(ctx as never, async () => undefined);
    } else {
      const router = createPasswordResetRouter(this.passwordResetDependencies());
      await findHandler(router, 'POST', 'forgot-password')(ctx as never, async () => undefined);
    }
    return { actionId: this.state.actionId, response: ctx.snapshot(this.renderedPage) };
  }

  private provider() {
    return {
      interactionDetails: async () => ({
        uid: INTERACTION_UID,
        params: { client_id: 'enumeration-client', scope: 'openid' },
        prompt: { name: 'login', reasons: [], details: {} },
        session: {},
      }),
      interactionFinished: async () => {
        this.state.authenticationActionIds.push(this.state.actionId);
      },
      Client: {
        find: async () => ({
          metadata: () => ({ 'urn:porta:login_methods': null, organizationId: TENANT_ID }),
        }),
      },
    };
  }

  private sharedDependencies() {
    return {
      getCsrfFromCookie: () => 'enumeration-csrf',
      verifyCsrfToken: (stored: string, submitted: string) => stored === submitted,
      generateCsrfToken: () => 'redacted-csrf',
      setCsrfCookie: () => undefined,
      checkRateLimit: async () => ({ allowed: true, remaining: 4, retryAfter: 0 }),
      resolveLocale: async () => 'en',
      getTranslationFunction: () => (key: string) => key,
      renderPage: async (pageName: string) => {
        this.renderedPage = pageName;
        return '<html data-schema="generic-auth-response"></html>';
      },
      enqueueAccountRecovery: async (input: EnqueueAccountRecoveryInput) =>
        recoveryResult(enqueueEnumerationJob(this.state, input)),
      writeAuditLog: () => undefined,
    };
  }

  private interactionDependencies(
    password: 'wrong' | 'fixture-valid',
  ): EnumerationSensitiveInteractionDependencies {
    const shared = this.sharedDependencies();
    return {
      ...shared,
      buildLoginRateLimitKey: () => 'login-rate-key',
      buildMagicLinkRateLimitKey: () => 'magic-rate-key',
      loadLoginRateLimitConfig: async () => ({ maxAttempts: 5, windowSeconds: 300 }),
      loadMagicLinkRateLimitConfig: async () => ({ maxAttempts: 5, windowSeconds: 300 }),
      resetRateLimit: async () => undefined,
      prepareUserForPasswordLogin: async () => createUser(this.state.fixture),
      verifyLoginPassword: async (userId: string | null) => {
        const rawMatched =
          userId !== null ? password === 'fixture-valid' : this.state.forceDummyMatch;
        const matched = userId !== null && rawMatched;
        this.state.passwordVerifications.push({
          actionId: this.state.actionId,
          algorithm: 'argon2id',
          hashSource: userId === null ? 'dummy' : 'account',
          rawMatched,
          matched,
        });
        return matched;
      },
      recordPasswordFailure: async () => {
        this.state.failureOperations.push({
          actionId: this.state.actionId,
          operationShape: ['conditional-user-update', 'cache-invalidation'],
        });
        return { locked: false, failedCount: 1 };
      },
      recordLogin: async () => undefined,
    };
  }

  private passwordResetDependencies(): RecoveryRequestRouteDependencies {
    const shared = this.sharedDependencies();
    return {
      ...shared,
      buildPasswordResetRateLimitKey: () => 'reset-rate-key',
      loadPasswordResetRateLimitConfig: async () => ({ maxAttempts: 5, windowSeconds: 300 }),
    };
  }
}

/** Create a fresh arranged identity fixture. */
export function createEnumerationIdentity(state: PasswordIdentityState): IdentityFixture {
  return {
    state,
    tenantId: TENANT_ID,
    email: `${state}@enumeration.invalid`,
    ...(state === 'absent' ? {} : { accountId: ACCOUNT_ID }),
  };
}
