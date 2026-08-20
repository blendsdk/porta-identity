import { createHash, randomBytes } from 'node:crypto';
import { request as plainHttpRequest } from 'node:http';

import {
  chromium,
  request,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
} from '@playwright/test';

import { LiveProtocolContext, livePkceChallenge } from '../tests/protocol-live-http.js';
import { LiveTenantAdminContext } from '../tests/tenant-admin-live-context.js';
import { loginWithPassword } from '../../tests/helpers.js';
import type {
  ProductionExposureContract,
  ProductionExposureObservation,
  ProductionExposureResponse,
} from '../tests/production-exposure-contract.js';
import type { ValidationExposureRawCase } from '../tests/validation-exposure-case-model.js';
import {
  boundedPublicResponse,
  classifyBody,
  exposesInternalDetail,
  headerContractObserved,
  type BoundedPublicResponse,
} from './response-classifier.js';
import { OwnedDependencyController, type InterruptibleService } from './service-controller.js';

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
    headers[name] = value.includes('{synthetic-full-authority-token}')
      ? (context.adminHeaders('admin-full').Authorization ?? '')
      : value;
  }
  return Object.freeze(headers);
}

/** Converts concrete response facts into the stable public observation shape. */
function publicObservation(
  response: BoundedPublicResponse,
  requiredHeaders: readonly string[],
  bodyContract = classifyBody(response),
): ProductionExposureResponse {
  return Object.freeze({
    status: response.status,
    bodyContract,
    headerContracts: Object.freeze(
      Object.fromEntries(
        requiredHeaders.map((contract) => [contract, headerContractObserved(contract, response)]),
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
        response.resume();
        resolveProbe(false);
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
    return this.buildObservation(
      requirement,
      controlResponse,
      probeResponse,
      before === after,
      recovery.status === requirement.control.expectedStatus,
      undefined,
      provenAbsentEffects,
    );
  }

  /** Creates a real authorization interaction before observing the HTML response policy. */
  protected async observeHtmlPolicy(
    requirement: ValidationExposureRawCase,
  ): Promise<ProductionExposureObservation> {
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
    return this.buildObservation(requirement, controlResponse, probeResponse, true, true);
  }

  /** Authenticates in a real browser and observes exact session-cookie response metadata. */
  protected async observeCookiePolicy(
    requirement: ValidationExposureRawCase,
  ): Promise<ProductionExposureObservation> {
    const browser = await chromium.launch({ headless: true });
    try {
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
      return this.buildObservation(
        requirement,
        response,
        response,
        metadataObserved,
        metadataObserved,
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
    const recovery = await this.waitForControl(requirement);
    const after = await this.stateFingerprint();
    return this.buildObservation(
      requirement,
      controlResponse,
      probeResponse,
      before === after,
      recovery.status === requirement.control.expectedStatus,
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
        unobserved,
        recovery.status === requirement.control.expectedStatus,
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
  ): Promise<BoundedPublicResponse> {
    const deadline = Date.now() + 45_000;
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
    stateUnchanged: boolean | typeof unobserved,
    recoveryPassed: boolean,
    bodyContract = this.classifyCaseBody(requirement, probeResponse),
    provenAbsentEffects: ReadonlySet<string> = new Set(),
  ): ProductionExposureObservation {
    const headerContracts = Object.fromEntries(
      requirement.expected.headerContract.map((contract) => [
        contract,
        headerContractObserved(contract, probeResponse),
      ]),
    );
    const internalDetail = exposesInternalDetail(probeResponse);
    const expectedHeadersPassed = Object.values(headerContracts).every(Boolean);
    const independent = Object.fromEntries(
      requirement.independentStateObservations.map((name) => {
        if (/rate-limit-key|cookie-policy-unchanged/u.test(name)) return [name, unobserved];
        if (/request-completed-on-https-origin/u.test(name)) {
          return [name, this.admin.endpoints.porta.startsWith('https://')];
        }
        return [name, stateUnchanged];
      }),
    );
    const prohibited = Object.fromEntries(
      requirement.prohibitedSideEffects.map((name) => {
        if (provenAbsentEffects.has(name)) return [name, false];
        if (/rate-limit-budget/u.test(name)) return [name, unobserved];
        if (
          /version|stack|sql|filesystem|infrastructure|secret|token|dependency-error/u.test(name)
        ) {
          return [name, internalDetail];
        }
        if (/policy-weakened|insecure-cookie|domain-cookie/u.test(name)) {
          return [name, !expectedHeadersPassed];
        }
        if (/origin|credentials-authorized|method-admitted|header-admitted/u.test(name)) {
          return [name, !expectedHeadersPassed];
        }
        if (/mutated|partial-durable/u.test(name)) return [name, stateUnchanged !== true];
        return [name, unobserved];
      }),
    );
    return Object.freeze({
      caseId: requirement.id,
      profile: this.profile,
      control: publicObservation(controlResponse, []),
      probe: publicObservation(probeResponse, requirement.expected.headerContract, bodyContract),
      independentStateObservations: Object.freeze(independent),
      prohibitedSideEffects: Object.freeze(prohibited),
      recoveryPassed,
      correlatedLogCredit: false,
      correlatedLogGap: 'correlated-security-decision-event-unavailable',
    });
  }

  /** Classifies the small set of case-specific public body shapes from concrete bytes. */
  protected classifyCaseBody(
    requirement: ValidationExposureRawCase,
    response: BoundedPublicResponse,
  ): string {
    const general = classifyBody(response);
    if (requirement.family === 'mail-error-exposure' && !exposesInternalDetail(response)) {
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
