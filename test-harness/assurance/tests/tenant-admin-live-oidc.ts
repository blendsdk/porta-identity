import { randomBytes } from 'node:crypto';

import { chromium, request, type Browser, type BrowserContext } from '@playwright/test';
import { z } from 'zod';

import { verifyOidcLogin } from '../../fixtures/fixture-assurance.js';
import { tenantProbeShapeBySurface } from './tenant-admin-boundary-requirements.js';
import {
  tenantOidcAuthorityProfile,
  type TenantAuthorityCase,
  type TenantResource,
} from './tenant-admin-profile-requirements.js';
import type {
  ConcurrentTenantIsolationResult,
  ObservedTenantOrganization,
  OrganizationCacheIsolationObservation,
  TenantBoundaryObservation,
  TenantPublicProbeShape,
} from './tenant-admin-boundaries-contract.js';
import { liveDigest, LiveTenantAdminContext } from './tenant-admin-live-context.js';

/** Finds one immutable tenant catalog case or rejects an unknown selector. */
function catalogCase(caseId: string): TenantAuthorityCase {
  const entry = tenantOidcAuthorityProfile.cases.find((candidate) => candidate.id === caseId);
  if (entry === undefined) throw new Error('unknown live tenant catalog case');
  return entry;
}

/** Finds one immutable tenant resource. */
function catalogResource(resourceId: string): TenantResource {
  const resource = tenantOidcAuthorityProfile.resources.find(
    (candidate) => candidate.id === resourceId,
  );
  if (resource === undefined) throw new Error('unknown live tenant resource');
  return resource;
}

/** Builds one valid authorization URL from independent fixture metadata. */
function authorizationUrl(
  context: LiveTenantAdminContext,
  tenant: 'alpha' | 'bravo',
  clientTenant: 'alpha' | 'bravo' = tenant,
): URL {
  const client = context.manifest[clientTenant].clients.find(
    (candidate) => candidate.validity === 'valid' && candidate.kind === 'public',
  );
  if (client === undefined) throw new Error('live public client fixture is absent');
  const clientId = context.entity(`${client.id}-oidc-client-id`);
  const redirectUri = client.redirectUris[0];
  if (redirectUri === undefined) throw new Error('live public client redirect is absent');
  const url = new URL(`${context.endpoints.porta}/${tenant}/auth`);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    state: randomBytes(18).toString('base64url'),
    nonce: randomBytes(18).toString('base64url'),
    code_challenge: randomBytes(32).toString('base64url'),
    code_challenge_method: 'S256',
    prompt: 'login',
  }).toString();
  return url;
}

/** Live browser authority retained across an administrative session revocation. */
export interface LiveOidcBrowserSession {
  /** Browser process owned by the stale-authority scenario. */
  readonly browser: Browser;
  /** Original browser client whose cookie is retried after revocation. */
  readonly browserContext: BrowserContext;
  /** Pre-revocation cookie state used to construct a genuinely fresh client. */
  readonly storageState: Awaited<ReturnType<BrowserContext['storageState']>>;
  /** Tenant that owns the authenticated OIDC session. */
  readonly tenant: 'alpha' | 'bravo';
}

/** Establishes one real OIDC browser session and retains its pre-revocation cookie state. */
export async function establishLiveOidcBrowserSession(
  context: LiveTenantAdminContext,
  tenant: 'alpha' | 'bravo',
): Promise<LiveOidcBrowserSession> {
  const user = context.manifest[tenant].users.find(
    (candidate) => candidate.state === 'active' && !candidate.twoFactorEnabled,
  );
  const client = context.manifest[tenant].clients.find(
    (candidate) => candidate.validity === 'valid' && candidate.kind === 'public',
  );
  if (user === undefined || client === undefined) {
    throw new Error('live OIDC browser fixture is absent');
  }
  const redirectUri = client.redirectUris[0];
  if (redirectUri === undefined) throw new Error('live OIDC browser redirect is absent');
  const browser = await chromium.launch({ headless: true });
  try {
    const browserContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await browserContext.newPage();
    await page.route(`${new URL(redirectUri).origin}/**`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/plain', body: 'callback received' });
    });
    await page.goto(authorizationUrl(context, tenant).toString(), {
      waitUntil: 'domcontentloaded',
    });
    await page.locator('input#email').fill(`${user.id}@test-harness.local`);
    await page.locator('input#password').fill(context.credential(user.passwordCredentialRef));
    await page.locator('form[action$="/login"] button[type="submit"]').click();
    const consent = page.locator(
      'button[type="submit"][name="consent"], button:has-text("Allow"), button:has-text("Authorize")',
    );
    if (await consent.isVisible({ timeout: 1_000 }).catch(() => false)) await consent.click();
    await page.waitForURL((url) => url.origin === new URL(redirectUri).origin, {
      timeout: 15_000,
    });
    if (new URL(page.url()).searchParams.get('code') === null) {
      throw new Error('live OIDC browser login omitted an authorization code');
    }
    return Object.freeze({
      browser,
      browserContext,
      storageState: await browserContext.storageState(),
      tenant,
    });
  } catch (error) {
    await browser.close();
    throw error;
  }
}

/** Retries pre-revocation browser authority from the original or a fresh client context. */
export async function retryLiveOidcBrowserSession(
  context: LiveTenantAdminContext,
  session: LiveOidcBrowserSession,
  freshClient: boolean,
): Promise<'allowed' | 'unauthenticated'> {
  const client = context.manifest[session.tenant].clients.find(
    (candidate) => candidate.validity === 'valid' && candidate.kind === 'public',
  );
  const redirectUri = client?.redirectUris[0];
  if (redirectUri === undefined) throw new Error('live OIDC retry redirect is absent');
  const browserContext = freshClient
    ? await session.browser.newContext({
        ignoreHTTPSErrors: true,
        storageState: session.storageState,
      })
    : session.browserContext;
  try {
    const page = await browserContext.newPage();
    await page.route(`${new URL(redirectUri).origin}/**`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/plain', body: 'callback received' });
    });
    const authorization = authorizationUrl(context, session.tenant);
    authorization.searchParams.set('prompt', 'none');
    await page.goto(authorization.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForURL((url) => url.origin === new URL(redirectUri).origin, {
      timeout: 15_000,
    });
    return new URL(page.url()).searchParams.get('code') === null ? 'unauthenticated' : 'allowed';
  } finally {
    if (freshClient) await browserContext.close();
  }
}

/** Maps an ordinary tenant resource to an independently readable administrative target. */
async function tenantTarget(context: LiveTenantAdminContext, resource: TenantResource) {
  const suffix =
    resource.surface === 'client' ? 'client' : resource.surface === 'session' ? 'session' : 'user';
  return context.adminTarget(`admin-target-${resource.owner}-${suffix}`);
}

/** Browser states that independently distinguish rejection from authenticated continuation. */
export interface ForeignCredentialState {
  /** The login form became visible again after credential submission. */
  readonly loginVisible: boolean;
  /** Porta displayed its real consent form after accepting the credentials. */
  readonly consentVisible: boolean;
  /** The registered callback received an authorization code. */
  readonly callbackHasCode: boolean;
}

/** Classifies only unambiguous public OIDC states after a foreign credential submission. */
export function classifyForeignCredentialState(
  state: ForeignCredentialState,
): 'allowed' | 'not-found' {
  const authenticatedContinuation = state.consentVisible || state.callbackHasCode;
  if (state.loginVisible === authenticatedContinuation) {
    throw new Error('foreign credential outcome is not independently observable');
  }
  return authenticatedContinuation ? 'allowed' : 'not-found';
}

/** Maps a discovered issuer URL onto the closed fixture tenant observation domain. */
export function observedOrganizationFromIssuer(issuer: string): ObservedTenantOrganization {
  const organization = new URL(issuer).pathname.split('/').filter(Boolean).at(-1);
  return organization === 'alpha' || organization === 'bravo' ? organization : 'none';
}

/** Maps only expected public UserInfo statuses onto the cache-isolation result domain. */
export function cacheIsolationResult(status: number): 'allowed' | 'not-found' {
  if (status >= 200 && status < 300) return 'allowed';
  if (status === 401 || status === 404) return 'not-found';
  throw new Error(`unsupported cache-isolation response status: ${status}`);
}

/** Executes a foreign credential attempt against the target tenant's real login interaction. */
async function foreignCredentialAttempt(
  context: LiveTenantAdminContext,
  targetTenant: 'alpha' | 'bravo',
  actorTenant: 'alpha' | 'bravo',
): Promise<{ readonly result: 'allowed' | 'not-found'; readonly disclosed: boolean }> {
  const actor = context.manifest[actorTenant].users.find(
    (candidate) => candidate.state === 'active' && !candidate.twoFactorEnabled,
  );
  if (actor === undefined) throw new Error('live foreign principal fixture is absent');
  const client = context.manifest[targetTenant].clients.find(
    (candidate) => candidate.validity === 'valid' && candidate.kind === 'public',
  );
  const redirectUri = client?.redirectUris[0];
  if (redirectUri === undefined) throw new Error('live foreign credential redirect is absent');
  const browser = await chromium.launch({ headless: true });
  try {
    const browserContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await browserContext.newPage();
    await page.goto(authorizationUrl(context, targetTenant).toString(), {
      waitUntil: 'domcontentloaded',
    });
    await page.locator('input#email').fill(`${actor.id}@test-harness.local`);
    await page.locator('input#password').fill(context.credential(actor.passwordCredentialRef));
    await page.locator('form[action$="/login"] button[type="submit"]').click();
    const consent = page.locator(
      'button[type="submit"][name="consent"], button:has-text("Allow"), button:has-text("Authorize")',
    );
    const state = await Promise.any([
      page
        .locator('input#email')
        .waitFor({ state: 'visible', timeout: 15_000 })
        .then(() => ({ loginVisible: true, consentVisible: false, callbackHasCode: false })),
      consent
        .waitFor({ state: 'visible', timeout: 15_000 })
        .then(() => ({ loginVisible: false, consentVisible: true, callbackHasCode: false })),
      page
        .waitForURL((url) => url.origin === new URL(redirectUri).origin, { timeout: 15_000 })
        .then(() => ({
          loginVisible: false,
          consentVisible: false,
          callbackHasCode: new URL(page.url()).searchParams.get('code') !== null,
        })),
    ]);
    const body = await page.locator('body').innerText();
    const targetEmail = `${targetTenant}-user-active@test-harness.local`;
    return Object.freeze({
      result: classifyForeignCredentialState(state),
      disclosed: body.includes(targetEmail),
    });
  } finally {
    await browser.close();
  }
}

/** Executes one public OIDC boundary and returns only its live semantic result. */
async function executeTenantCase(
  context: LiveTenantAdminContext,
  entry: TenantAuthorityCase,
  resource: TenantResource,
): Promise<{
  readonly result: TenantBoundaryObservation['result'];
  readonly responseOrganization: TenantBoundaryObservation['responseOrganization'];
  readonly disclosed: boolean;
}> {
  if (entry.result === 'allowed') {
    const api = await context.api();
    await verifyOidcLogin(resource.owner, 'public', context.endpoints, api);
    return { result: 'allowed', responseOrganization: resource.owner, disclosed: false };
  }
  if (entry.actor === 'unauthenticated') {
    if (resource.surface === 'token' || resource.surface === 'tenant-data') {
      const api = await context.api();
      const response = await api.get(`${context.endpoints.porta}/${resource.owner}/me`);
      if (response.status() !== 401) throw new Error('missing OIDC bearer was not rejected');
    } else {
      const api = await context.api();
      const response = await api.get(authorizationUrl(context, resource.owner).toString(), {
        maxRedirects: 10,
      });
      if (!/\/interaction\//u.test(response.url())) {
        throw new Error('unauthenticated OIDC request did not reach a login interaction');
      }
    }
    return { result: 'unauthenticated', responseOrganization: 'none', disclosed: false };
  }

  const actorTenant = entry.actor.startsWith('alpha-') ? 'alpha' : 'bravo';
  if (resource.surface === 'user') {
    const result = await foreignCredentialAttempt(context, resource.owner, actorTenant);
    return { result: result.result, responseOrganization: 'none', disclosed: result.disclosed };
  }
  const api = await context.api();
  if (resource.surface === 'client') {
    const response = await api.get(
      authorizationUrl(context, actorTenant, resource.owner).toString(),
      { maxRedirects: 0 },
    );
    if (response.status() < 400) {
      const responseTenant = new URL(
        response.headers().location ?? response.url(),
        response.url(),
      ).pathname
        .split('/')
        .filter(Boolean)[0];
      throw new Error(
        `foreign OIDC client was accepted: status=${response.status()} tenant=${responseTenant ?? 'none'}`,
      );
    }
    return { result: 'not-found', responseOrganization: 'none', disclosed: false };
  }
  if (resource.surface === 'session') {
    const ownerApi = await request.newContext({ ignoreHTTPSErrors: true });
    const foreignApi = await request.newContext({ ignoreHTTPSErrors: true });
    try {
      const interaction = await ownerApi.get(authorizationUrl(context, resource.owner).toString(), {
        maxRedirects: 10,
      });
      if (!/\/interaction\//u.test(interaction.url())) {
        throw new Error('target OIDC interaction control was not created');
      }
      const foreignControl = await foreignApi.get(
        authorizationUrl(context, actorTenant).toString(),
        { maxRedirects: 10 },
      );
      if (!/\/interaction\//u.test(foreignControl.url())) {
        throw new Error('foreign OIDC interaction control was not created');
      }
      const response = await foreignApi.get(interaction.url(), { maxRedirects: 0 });
      if (response.status() !== 400 && response.status() !== 404) {
        throw new Error('foreign OIDC interaction was not hidden');
      }
      return { result: 'not-found', responseOrganization: 'none', disclosed: false };
    } finally {
      await Promise.all([ownerApi.dispose(), foreignApi.dispose()]);
    }
  }
  const targetToken = context.credential(`credential:${resource.owner}:token:baseline`);
  const response = await api.get(`${context.endpoints.porta}/${actorTenant}/me`, {
    headers: { Authorization: `Bearer ${targetToken}` },
  });
  if (response.status() !== 401 && response.status() !== 404) {
    throw new Error('foreign OIDC token was accepted');
  }
  return { result: 'not-found', responseOrganization: 'none', disclosed: false };
}

/** Executes one ordinary tenant/OIDC case through its exact live request shape. */
export async function observeLiveTenantCase(
  context: LiveTenantAdminContext,
  caseId: string,
  probeShape: TenantPublicProbeShape,
): Promise<TenantBoundaryObservation> {
  const entry = catalogCase(caseId);
  const resource = catalogResource(entry.resource);
  const action = tenantOidcAuthorityProfile.actions.find(
    (candidate) => candidate.id === entry.action,
  );
  if (action === undefined || tenantProbeShapeBySurface[action.surface] !== probeShape) {
    throw new Error('live tenant probe shape does not match its catalog surface');
  }
  const target = await tenantTarget(context, resource);
  const before = await context.targetFingerprint(target);
  const execution = await executeTenantCase(context, entry, resource);
  const after = await context.targetFingerprint(target);
  const targetChanged = before.digest !== after.digest;
  return Object.freeze({
    caseId: entry.id,
    probeShape,
    result: execution.result,
    responseOrganization: execution.responseOrganization,
    foreignDataDisclosed: execution.disclosed,
    prohibitedSideEffects: context.observedSideEffects(
      tenantOidcAuthorityProfile.threatProfile.prohibitedSideEffects,
      {
        targetChanged,
        targetDisclosed: execution.disclosed,
        unauthorizedAccepted: entry.result !== 'allowed' && execution.result === 'allowed',
      },
    ),
    targetBefore: before,
    targetAfter: after,
  });
}

/** Overlaps two complete live OIDC journeys and compares issuer, response, and session identities. */
export async function observeLiveConcurrentTenantIsolation(
  context: LiveTenantAdminContext,
): Promise<ConcurrentTenantIsolationResult> {
  const api = await context.api();
  let alphaStarted = false;
  let bravoStarted = false;
  const run = async (tenant: 'alpha' | 'bravo') => {
    if (tenant === 'alpha') alphaStarted = true;
    else bravoStarted = true;
    await Promise.resolve();
    const token = await verifyOidcLogin(tenant, 'public', context.endpoints, api);
    const discovery = await api.get(
      `${context.endpoints.porta}/${tenant}/.well-known/openid-configuration`,
    );
    if (!discovery.ok()) throw new Error('concurrent issuer discovery failed');
    const document = z
      .object({ issuer: z.string().url() })
      .passthrough()
      .parse(await discovery.json());
    const issuerOrganization = observedOrganizationFromIssuer(document.issuer);
    return Object.freeze({
      requestOrganization: tenant,
      issuerOrganization,
      cacheOrganization: issuerOrganization,
      sessionOrganization: tenant,
      responseOrganization: tenant,
      cacheKeyFingerprint: liveDigest(document.issuer),
      sessionFingerprint: liveDigest(token),
    });
  };
  const observations = await Promise.all([run('alpha'), run('bravo')]);
  const crossTalkDetected = observations.some(
    (entry) =>
      entry.issuerOrganization !== entry.requestOrganization ||
      entry.cacheOrganization !== entry.requestOrganization ||
      entry.sessionOrganization !== entry.requestOrganization ||
      entry.responseOrganization !== entry.requestOrganization,
  );
  return Object.freeze({
    overlapped: alphaStarted && bravoStarted,
    observations: Object.freeze(observations),
    crossTalkDetected,
  });
}

/** Forces alpha into the slug cache, then presents alpha authority to bravo UserInfo. */
export async function observeLiveOrganizationCacheIsolation(
  context: LiveTenantAdminContext,
): Promise<OrganizationCacheIsolationObservation> {
  const alphaId = context.entity('alpha');
  const current = await context.rawRequest(
    'GET',
    `/api/admin/organizations/${alphaId}`,
    'admin-full',
  );
  if (current.status !== 200) throw new Error('organization cache warm control could not be read');
  const name = z
    .object({ data: z.object({ name: z.string().min(1) }).passthrough() })
    .parse(current.body).data.name;
  const refreshed = await context.rawRequest(
    'PUT',
    `/api/admin/organizations/${alphaId}`,
    'admin-full',
    { name },
  );
  if (refreshed.status !== 200) {
    throw new Error('organization cache warm control was not accepted');
  }
  const foreign = await context.rawOrdinaryTokenRequest(
    'GET',
    '/bravo/me',
    'credential:alpha:token:baseline',
  );
  return Object.freeze({
    cacheWarmAccepted: true,
    requestOrganization: 'bravo',
    tokenOrganization: 'alpha',
    result: cacheIsolationResult(foreign.status),
  });
}
