import { createHash, randomBytes } from 'node:crypto';
import { request as plainHttpRequest } from 'node:http';

import {
  chromium,
  request,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type BrowserContext,
} from '@playwright/test';

import { LiveProtocolContext, livePkceChallenge } from '../tests/protocol-live-http.js';
import { LiveTenantAdminContext } from '../tests/tenant-admin-live-context.js';
import { handleSignOutConfirmation, loginWithPassword } from '../../tests/helpers.js';
import type {
  ProductionExposureContract,
  ProductionExposureObservation,
  ProductionExposureResponse,
} from '../tests/production-exposure-contract.js';
import type { ValidationExposureRawCase } from '../tests/validation-exposure-case-model.js';
import {
  boundedPublicResponse,
  classifyBody,
  exposesBodyInternalDetail,
  headerContractObserved,
  type BoundedPublicResponse,
} from './response-classifier.js';
import { OwnedDependencyController, type InterruptibleService } from './service-controller.js';
import { createdSessionIds, logoutInvalidatedCreatedSession } from './session-observer.js';

/** Observation state that is explicitly not available from the selected public boundary. */
const unobserved = 'unobserved' as const;

/** Converts a Playwright response into one bounded, non-secret in-process response. */
async function boundedResponse(response: APIResponse): Promise<BoundedPublicResponse> {
  return boundedPublicResponse(response.status(), response.headers(), await response.text());
}

/** Creates a stable digest for independent before/after response-state comparisons. */
function responseDigest(response: BoundedPublicResponse): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify({ status: response.status, body: response.body }))
    .digest('hex')}`;
}

/** Replaces only the closed placeholders used by the production-exposure requirement catalog. */
function replacePathPlaceholders(
  value: string,
  context: LiveTenantAdminContext,
  protocol: LiveProtocolContext,
): string {
  const client = protocol.client('alpha', 'public');
  const verifier = randomBytes(48).toString('base64url');
  return value
    .replaceAll('{alphaOrgId}', context.entity('alpha'))
    .replaceAll('{alphaClientId}', encodeURIComponent(client.clientId))
    .replaceAll('{registeredRedirect}', encodeURIComponent(client.redirectUri))
    .replaceAll('{validS256Challenge}', livePkceChallenge(verifier));
}

/** Maps a requirement request into concrete headers without retaining bearer material. */
function concreteHeaders(
  requirementHeaders: Readonly<Record<string, string>>,
  context: LiveTenantAdminContext,
): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(requirementHeaders)) {
    if (value.includes('{synthetic-full-authority-token}')) {
      headers[name] = context.adminHeaders('admin-full').Authorization ?? '';
    } else if (value === 'https://app-harness.ci.portaidentity.com') {
      headers[name] = new URL(context.endpoints.app).origin;
    } else {
      headers[name] = value;
    }
  }
  return Object.freeze(headers);
}

/** Converts concrete response facts into the stable public observation shape. */
function publicObservation(
  response: BoundedPublicResponse,
  requiredHeaders: readonly string[],
  bodyContract = classifyBody(response),
  configuredOrigin?: string,
): ProductionExposureResponse {
  return Object.freeze({
    status: response.status,
    bodyContract,
    headerContracts: Object.freeze(
      Object.fromEntries(
        requiredHeaders.map((contract) => [
          contract,
          headerContractObserved(contract, response, configuredOrigin),
        ]),
      ),
    ),
  });
}

/** Returns the dependency service selected by one immutable arrangement. */
function dependencyService(requirement: ValidationExposureRawCase): InterruptibleService {
  switch (requirement.harnessArrangement) {
    case 'owned-database-unavailable':
      return 'postgres';
    case 'owned-cache-unavailable':
      return 'redis';
    case 'owned-mail-unavailable-with-acquired-csrf-browser':
      return 'mailhog';
    default:
      throw new Error('production exposure case does not select an interruptible dependency');
  }
}

/** Proves that cleartext HTTP cannot complete on the run-owned TLS listener. */
function plaintextTlsRejected(port: number): Promise<boolean> {
  return new Promise((resolveProbe) => {
    const request = plainHttpRequest(
      { host: '127.0.0.1', port, path: '/health', method: 'GET', timeout: 5_000 },
      (response) => {
        const rejectedWithoutCookie =
          (response.statusCode ?? 0) >= 400 && response.headers['set-cookie'] === undefined;
        response.resume();
        resolveProbe(rejectedWithoutCookie);
      },
    );
    request.once('error', () => resolveProbe(true));
    request.once('timeout', () => {
      request.destroy();
      resolveProbe(true);
    });
    request.end();
  });
}

/**
 * Live production-policy observer bound to the exact active lifecycle.
 *
 * Unknown observations remain explicit rather than being converted into passing booleans. This
 * lets the executable specification report incomplete evidence without manufacturing safety.
 */
export class LiveProductionExposureContract implements ProductionExposureContract {
  /** Public administrative context used for credentials and independent state reads. */
  protected readonly admin = new LiveTenantAdminContext();
  /** Public OIDC context used to create valid client and interaction controls. */
  protected readonly protocol = new LiveProtocolContext();
  /** Exact lease-bound dependency interruption authority. */
  protected readonly dependencies = OwnedDependencyController.fromActiveRun(process.cwd());
  /** Validated active lifecycle profile. */
  protected readonly profile: 'operational' | 'production-security';
  /** Lazily created raw request context released by `close`. */
  protected apiPromise?: Promise<APIRequestContext>;

  /** Validates the active endpoint profile before any observation can begin. */
  public constructor() {
    const profile = this.admin.endpoints.profile;
    if (profile !== 'operational' && profile !== 'production-security') {
      throw new Error('production exposure active profile is invalid');
    }
    this.profile = profile;
  }

  /** Executes one immutable requirement through its real public boundary. */
  public async observe(
    requirement: ValidationExposureRawCase,
  ): Promise<ProductionExposureObservation> {
    if (!requirement.executionProfiles.includes(this.profile)) {
      throw new Error('production exposure case does not belong to the active profile');
    }
    if (requirement.id === 'st55-production-html-csp-policy') {
      return this.observeHtmlPolicy(requirement);
    }
    if (requirement.id === 'st55-production-session-cookie-policy') {
      return this.observeCookiePolicy(requirement);
    }
    if (requirement.harnessArrangement !== 'none') {
      return this.observeDependencyFailure(requirement);
    }
    return this.observeRawPolicy(requirement);
  }

  /** Releases the request contexts owned by this observer. */
  public async close(): Promise<void> {
    const api = await this.apiPromise;
    await api?.dispose();
    await this.protocol.close();
    await this.admin.close();
  }

  /** Returns one reusable TLS-tolerant request context. */
  protected api(): Promise<APIRequestContext> {
    this.apiPromise ??= request.newContext({ ignoreHTTPSErrors: true });
    return this.apiPromise;
  }

  /** Executes one ordinary raw policy case and compares state before and after. */
  protected async observeRawPolicy(
    requirement: ValidationExposureRawCase,
  ): Promise<ProductionExposureObservation> {
    const before = await this.stateFingerprint();
    const controlResponse = await this.executeRequest(requirement.control.request, requirement);
    const probeResponse = await this.executeRequest(requirement.request, requirement);
    const after = await this.stateFingerprint();
    const recovery = await this.executeRequest(requirement.control.request, requirement);
    const provenAbsentEffects = new Set<string>();
    if (
      requirement.id === 'st55-production-response-policy' &&
      (await plaintextTlsRejected(Number(new URL(this.admin.endpoints.porta).port)))
    ) {
      provenAbsentEffects.add('plaintext-session-created');
    }
    const unchanged = before === after;
    return this.buildObservation(
      requirement,
      controlResponse,
      probeResponse,
      this.rawStateObservations(requirement, unchanged),
      this.controlPassed(requirement, recovery),
      undefined,
      provenAbsentEffects,
    );
  }

  /** Creates a real authorization interaction before observing the HTML response policy. */
  protected async observeHtmlPolicy(
    requirement: ValidationExposureRawCase,
  ): Promise<ProductionExposureObservation> {
    const before = await this.stateFingerprint();
    const client = this.protocol.client('alpha', 'public');
    const verifier = randomBytes(48).toString('base64url');
    const authorization = new URL(`${this.admin.endpoints.porta}/alpha/auth`);
    authorization.search = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: client.redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      state: randomBytes(18).toString('base64url'),
      nonce: randomBytes(18).toString('base64url'),
      code_challenge: livePkceChallenge(verifier),
      code_challenge_method: 'S256',
      prompt: 'login',
    }).toString();
    const api = await this.api();
    const started = await api.get(authorization.toString(), { maxRedirects: 0 });
    const location = started.headers().location;
    if (started.status() !== 303 || location === undefined) {
      throw new Error('real authorization interaction control was not created');
    }
    const interactionUrl = new URL(location, this.admin.endpoints.porta);
    if (!/^\/interaction\/[A-Za-z0-9_-]+$/u.test(interactionUrl.pathname)) {
      throw new Error('authorization interaction location is malformed');
    }
    const controlResponse = await boundedResponse(await api.get(interactionUrl.toString()));
    const probeResponse = await boundedResponse(await api.get(interactionUrl.toString()));
    const after = await this.stateFingerprint();
    const interactionBound =
      controlResponse.status === probeResponse.status &&
      responseDigest(controlResponse) === responseDigest(probeResponse);
    return this.buildObservation(
      requirement,
      controlResponse,
      probeResponse,
      this.namedStateObservations(requirement, {
        'interaction-identity-remains-bound-to-the-created-authorization-request': interactionBound,
        'no-production-config-mutated': before === after,
      }),
      interactionBound,
    );
  }

  /** Authenticates in a real browser and observes exact session-cookie response metadata. */
  protected async observeCookiePolicy(
    requirement: ValidationExposureRawCase,
  ): Promise<ProductionExposureObservation> {
    const browser = await chromium.launch({ headless: true });
    try {
      const priorSessionIds = await this.admin.observeActiveSessionIds('alpha');
      const context = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await context.newPage();
      const sessionHeaders: string[] = [];
      page.on('response', async (response) => {
        if (new URL(response.url()).origin !== new URL(this.admin.endpoints.porta).origin) return;
        for (const value of await response.headerValues('set-cookie')) {
          if (value.startsWith('_session=')) sessionHeaders.push(value);
        }
      });
      await page.goto(this.admin.endpoints.app);
      await page.locator('[data-testid="login-btn"]').click();
      await page.waitForURL((url) => url.origin === new URL(this.admin.endpoints.porta).origin);
      await loginWithPassword(page);
      await page.waitForURL((url) => url.origin === new URL(this.admin.endpoints.app).origin);
      const cookie = (await context.cookies(this.admin.endpoints.porta)).find(
        (entry) => entry.name === '_session',
      );
      const setCookie = sessionHeaders.at(-1) ?? '';
      const response = boundedPublicResponse(303, { 'set-cookie': setCookie }, '');
      const metadataObserved =
        cookie !== undefined &&
        cookie.secure &&
        cookie.httpOnly &&
        cookie.sameSite === 'Lax' &&
        !/(?:^|;)\s*domain=/iu.test(setCookie);
      const activeSessionIds = await this.admin.observeActiveSessionIds('alpha');
      const newSessionIds = createdSessionIds(priorSessionIds, activeSessionIds);
      const sessionRecordCountIsOne = newSessionIds.length === 1;

      await page.locator('[data-testid="logout-btn"]').click();
      await handleSignOutConfirmation(page);
      await page.waitForURL((url) => url.origin === new URL(this.admin.endpoints.app).origin);
      await page.locator('[data-testid="status"]').filter({ hasText: 'NOT LOGGED IN' }).waitFor();
      const sessionsAfterLogout = await this.admin.observeActiveSessionIds('alpha');
      const cookieReuseRejected =
        cookie !== undefined && (await this.sessionCookieReuseRejected(browser, cookie.value));
      const logoutInvalidatedSession = logoutInvalidatedCreatedSession(
        newSessionIds,
        sessionsAfterLogout,
        cookieReuseRejected,
      );
      return this.buildObservation(
        requirement,
        response,
        response,
        this.namedStateObservations(requirement, {
          'browser-cookie-metadata-read-independently': metadataObserved,
          'session-record-count-is-one': sessionRecordCountIsOne,
        }),
        logoutInvalidatedSession,
        'empty-redirect-response-without-session-identifier',
        new Set(['session-cookie-in-response-body']),
      );
    } finally {
      await browser.close();
    }
  }

  /** Executes a healthy control, interrupts one exact dependency, restores it, and reruns control. */
  protected async observeDependencyFailure(
    requirement: ValidationExposureRawCase,
  ): Promise<ProductionExposureObservation> {
    if (requirement.family === 'mail-error-exposure') {
      return this.observeMailFailure(requirement);
    }
    const before = await this.stateFingerprint();
    const controlResponse = await this.executeRequest(requirement.control.request, requirement);
    const probeResponse = await this.dependencies.whileUnavailable(
      dependencyService(requirement),
      () => this.executeRequest(requirement.request, requirement),
    );
    let recoveryMode: ProductionExposureObservation['recoveryMode'] = 'dependency-only';
    let recovery: BoundedPublicResponse;
    try {
      recovery = await this.waitForControl(requirement, 15_000);
    } catch {
      await this.dependencies.restartPorta();
      recoveryMode = 'porta-restart-required';
      recovery = await this.waitForControl(requirement, 45_000);
    }
    const after = await this.stateFingerprint();
    return this.buildObservation(
      requirement,
      controlResponse,
      probeResponse,
      this.namedStateObservations(requirement, {
        'protected-state-fingerprint-after-equals-before': before === after,
        'no-partial-durable-effect': before === after,
      }),
      recovery.status === requirement.control.expectedStatus,
      undefined,
      new Set(),
      recoveryMode,
    );
  }

  /** Uses a browser-acquired CSRF proof for both healthy and unavailable-mail submissions. */
  protected async observeMailFailure(
    requirement: ValidationExposureRawCase,
  ): Promise<ProductionExposureObservation> {
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ ignoreHTTPSErrors: true });
      const healthy = await this.submitForgotPassword(context);
      const probe = await this.dependencies.whileUnavailable('mailhog', () =>
        this.submitForgotPassword(context),
      );
      const recovery = await this.submitForgotPassword(context);
      return this.buildObservation(
        requirement,
        healthy,
        probe,
        this.namedStateObservations(requirement, {
          'protected-state-fingerprint-after-equals-before': unobserved,
          'no-partial-durable-effect': unobserved,
        }),
        recovery.status === requirement.control.expectedStatus,
        undefined,
        new Set(),
        'dependency-only',
      );
    } finally {
      await browser.close();
    }
  }

  /** Acquires a fresh CSRF cookie/form proof and submits one real forgot-password request. */
  protected async submitForgotPassword(context: BrowserContext): Promise<BoundedPublicResponse> {
    const page = await context.newPage();
    try {
      const url = `${this.admin.endpoints.porta}/alpha/auth/forgot-password`;
      await page.goto(url);
      await page.locator('input[name="email"]').fill('alpha-user-active@test-harness.local');
      const [response] = await Promise.all([
        page.waitForResponse(
          (candidate) => candidate.url() === url && candidate.request().method() === 'POST',
        ),
        page.locator('button[type="submit"]').click(),
      ]);
      return boundedPublicResponse(
        response.status(),
        await response.allHeaders(),
        await response.text(),
      );
    } finally {
      await page.close();
    }
  }

  /** Replays the captured cookie in a fresh browser and requires prompt-none rejection. */
  protected async sessionCookieReuseRejected(
    browser: Browser,
    cookieValue: string,
  ): Promise<boolean> {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      await context.addCookies([
        {
          name: '_session',
          value: cookieValue,
          url: this.admin.endpoints.porta,
          secure: true,
          httpOnly: true,
          sameSite: 'Lax',
        },
      ]);
      const client = this.protocol.client('alpha', 'public');
      const verifier = randomBytes(48).toString('base64url');
      const authorization = new URL(`${this.admin.endpoints.porta}/alpha/auth`);
      authorization.search = new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: client.redirectUri,
        response_type: 'code',
        scope: 'openid profile email',
        state: randomBytes(18).toString('base64url'),
        nonce: randomBytes(18).toString('base64url'),
        code_challenge: livePkceChallenge(verifier),
        code_challenge_method: 'S256',
        prompt: 'none',
      }).toString();
      const api = context.request;
      const replay = await api.get(authorization.toString(), { maxRedirects: 0 });
      const location = replay.headers().location;
      if (replay.status() !== 303 || location === undefined) return false;
      const result = new URL(location, this.admin.endpoints.porta).searchParams;
      return result.get('error') === 'login_required' && !result.has('code');
    } finally {
      await context.close();
    }
  }

  /** Executes one concrete requirement request without following redirects. */
  protected async executeRequest(
    raw: ValidationExposureRawCase['request'],
    requirement: ValidationExposureRawCase,
  ): Promise<BoundedPublicResponse> {
    const api = await this.api();
    const path = replacePathPlaceholders(raw.path, this.admin, this.protocol);
    const candidate = new URL(path, this.admin.endpoints.porta);
    const activeOrigin = new URL(this.admin.endpoints.porta);
    if (candidate.hostname === activeOrigin.hostname) {
      candidate.protocol = activeOrigin.protocol;
      candidate.port = activeOrigin.port;
    }
    try {
      const response = await api.fetch(candidate.toString(), {
        method: raw.method,
        headers: concreteHeaders(raw.headers, this.admin),
        data: raw.body ?? undefined,
        maxRedirects: 0,
        timeout: requirement.harnessArrangement === 'none' ? 30_000 : 10_000,
      });
      return boundedResponse(response);
    } catch {
      return boundedPublicResponse(599, { 'x-assurance-observation': 'transport-failure' }, '');
    }
  }

  /** Reads one stable administrative state fingerprint without trusting the probe response. */
  protected async stateFingerprint(): Promise<string> {
    const response = await this.admin.rawRequest('GET', '/api/admin/organizations', 'admin-full');
    if (response.status !== 200) throw new Error('production exposure state control failed');
    return responseDigest(
      boundedPublicResponse(
        response.status,
        { 'content-type': 'application/json' },
        JSON.stringify(response.body),
      ),
    );
  }

  /** Repeats a healthy control until the restored service and Porta are ready. */
  protected async waitForControl(
    requirement: ValidationExposureRawCase,
    timeoutMilliseconds: number,
  ): Promise<BoundedPublicResponse> {
    const deadline = Date.now() + timeoutMilliseconds;
    while (Date.now() < deadline) {
      try {
        const response = await this.executeRequest(requirement.control.request, requirement);
        if (response.status === requirement.control.expectedStatus) return response;
      } catch {
        // The exact restored dependency may be healthy before Porta reconnects.
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
    throw new Error('same-handler recovery control did not recover before the deadline');
  }

  /** Builds conservative independent-state and prohibited-effect observations. */
  protected buildObservation(
    requirement: ValidationExposureRawCase,
    controlResponse: BoundedPublicResponse,
    probeResponse: BoundedPublicResponse,
    independentStateObservations: Readonly<Record<string, boolean | typeof unobserved>>,
    recoveryPassed: boolean,
    bodyContract = this.classifyCaseBody(requirement, probeResponse),
    provenAbsentEffects: ReadonlySet<string> = new Set(),
    recoveryMode: ProductionExposureObservation['recoveryMode'] = 'none',
  ): ProductionExposureObservation {
    const headerContracts = Object.fromEntries(
      requirement.expected.headerContract.map((contract) => [
        contract,
        headerContractObserved(contract, probeResponse, new URL(this.admin.endpoints.app).origin),
      ]),
    );
    const bodyInternalDetail = exposesBodyInternalDetail(probeResponse);
    const secretMaterial = /(?:bearer\s+[a-z0-9._~-]+|[?&](?:token|code|secret)=)/iu.test(
      `${probeResponse.body}\n${Object.values(probeResponse.headers).join('\n')}`,
    );
    const versionMaterial = Object.values(probeResponse.headers).some((value) =>
      /(?:nginx|porta)\/\d/iu.test(value),
    );
    const expectedHeadersPassed = Object.values(headerContracts).every(Boolean);
    const prohibited = Object.fromEntries(
      requirement.prohibitedSideEffects.map((name) => {
        if (provenAbsentEffects.has(name)) return [name, false];
        if (/rate-limit-budget/u.test(name)) return [name, unobserved];
        if (/version/u.test(name)) return [name, versionMaterial];
        if (/secret|token/u.test(name)) return [name, secretMaterial];
        if (/stack|sql|filesystem|infrastructure|dependency-error/u.test(name)) {
          return [name, bodyInternalDetail];
        }
        if (/policy-weakened|insecure-cookie|domain-cookie/u.test(name)) {
          return [name, !expectedHeadersPassed];
        }
        if (/origin|credentials-authorized|method-admitted|header-admitted/u.test(name)) {
          return [name, !expectedHeadersPassed];
        }
        if (/mutated|partial-durable/u.test(name)) {
          const unchanged = Object.values(independentStateObservations).every(
            (value) => value === true,
          );
          return [name, !unchanged];
        }
        return [name, unobserved];
      }),
    );
    return Object.freeze({
      caseId: requirement.id,
      profile: this.profile,
      control: publicObservation(
        controlResponse,
        requirement.family === 'cors-policy' ? requirement.control.requiredObservations : [],
        undefined,
        new URL(this.admin.endpoints.app).origin,
      ),
      probe: publicObservation(
        probeResponse,
        requirement.expected.headerContract,
        bodyContract,
        new URL(this.admin.endpoints.app).origin,
      ),
      independentStateObservations,
      prohibitedSideEffects: Object.freeze(prohibited),
      recoveryPassed,
      recoveryMode,
      correlatedLogCredit: false,
      correlatedLogGap: 'correlated-security-decision-event-unavailable',
    });
  }

  /** Requires callers to supply every named state fact and forbids undeclared substitutions. */
  protected namedStateObservations(
    requirement: ValidationExposureRawCase,
    observations: Readonly<Record<string, boolean | typeof unobserved>>,
  ): Readonly<Record<string, boolean | typeof unobserved>> {
    const expected = [...requirement.independentStateObservations].sort();
    const actual = Object.keys(observations).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error('production exposure independent state observation set is not exact');
    }
    return Object.freeze({ ...observations });
  }

  /** Maps ordinary raw cases through their explicitly named independent observers. */
  protected rawStateObservations(
    requirement: ValidationExposureRawCase,
    stateUnchanged: boolean,
  ): Readonly<Record<string, boolean | typeof unobserved>> {
    const observations: Record<string, boolean | typeof unobserved> = {};
    for (const name of requirement.independentStateObservations) {
      switch (name) {
        case 'configured-public-origin-unchanged':
        case 'cookie-policy-unchanged':
        case 'rate-limit-key-uses-direct-peer-not-spoofed-value':
          observations[name] = unobserved;
          break;
        case 'request-completed-on-https-origin':
          observations[name] = this.admin.endpoints.porta.startsWith('https://');
          break;
        case 'server-state-fingerprint-after-equals-before':
        case 'target-cardinality-after-equals-before':
        case 'no-production-config-mutated':
          observations[name] = stateUnchanged;
          break;
        default:
          throw new Error('production exposure raw state observer is unsupported');
      }
    }
    return this.namedStateObservations(requirement, observations);
  }

  /** Validates the exact positive-control status and CORS response headers. */
  protected controlPassed(
    requirement: ValidationExposureRawCase,
    response: BoundedPublicResponse,
  ): boolean {
    if (response.status !== requirement.control.expectedStatus) return false;
    if (requirement.family !== 'cors-policy') return true;
    const origin = new URL(this.admin.endpoints.app).origin;
    return requirement.control.requiredObservations.every((contract) =>
      headerContractObserved(contract, response, origin),
    );
  }

  /** Classifies the small set of case-specific public body shapes from concrete bytes. */
  protected classifyCaseBody(
    requirement: ValidationExposureRawCase,
    response: BoundedPublicResponse,
  ): string {
    const general = classifyBody(response);
    if (requirement.family === 'mail-error-exposure' && !exposesBodyInternalDetail(response)) {
      return 'generic-stable-response-without-dependency-or-product-detail';
    }
    if (requirement.family === 'forwarded-host' || requirement.family === 'forwarded-proto') {
      return response.status === 200 &&
        classifyBody(response) === 'stable-health-response-without-product-version'
        ? 'normal-health-body-with-approved-ingress-context'
        : general;
    }
    if (
      requirement.family === 'forwarded-client-ip' &&
      response.status === 200 &&
      classifyBody(response) === 'stable-health-response-without-product-version'
    ) {
      return 'normal-health-body-with-direct-peer-rate-limit-identity';
    }
    return general;
  }
}
