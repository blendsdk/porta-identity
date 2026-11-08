import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';

import { chromium, request, type APIRequestContext, type APIResponse } from '@playwright/test';
import { z } from 'zod';

import { activeEndpoints } from '../../fixtures/fixture-assurance.js';
import { resolvePublicFixtureManifest } from '../../fixtures/fixture-definition.js';
import {
  readProtectedRuntimeCredential,
  readPublicRuntimeFixtureManifest,
} from '../../fixtures/fixture-runtime-files.js';
import { jwksIdentities } from './protocol-live-jwks.js';
import { parseProtocolSecurityLog } from './protocol-live-log.js';

import type {
  FixtureClient,
  PublicFixtureManifest,
} from '../../fixtures/fixture-assurance-contract.js';

/** Public token endpoint fields needed by live protocol observations. */
const tokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    token_type: z.string().min(1),
    id_token: z.string().min(1).optional(),
    refresh_token: z.string().min(1).optional(),
  })
  .passthrough();

/** Public discovery fields needed to locate issuer-owned protocol endpoints. */
const discoverySchema = z
  .object({
    issuer: z.string().url(),
    authorization_endpoint: z.string().url(),
    token_endpoint: z.string().url(),
    userinfo_endpoint: z.string().url(),
    jwks_uri: z.string().url(),
    end_session_endpoint: z.string().url().optional(),
  })
  .passthrough();

/** Public OIDC discovery fields needed by the independent live protocol observer. */
export type LiveProtocolDiscovery = z.infer<typeof discoverySchema>;

/** One fixture client resolved to its generated public identifier and protected secret. */
export interface LiveProtocolClient {
  /** Independent fixture definition for the client. */
  readonly fixture: FixtureClient;
  /** Generated public OIDC client identifier. */
  readonly clientId: string;
  /** First exact registered callback. */
  readonly redirectUri: string;
  /** Protected client secret for a confidential client. */
  readonly clientSecret?: string;
}

/** Authorization artifacts returned only within one live test process. */
export interface LiveAuthorizationCode {
  /** Tenant issuer used for the authorization. */
  readonly tenant: 'alpha' | 'bravo';
  /** Client that initiated the request. */
  readonly client: LiveProtocolClient;
  /** Single-use authorization code. */
  readonly code: string;
  /** PKCE verifier corresponding to the request challenge. */
  readonly verifier: string;
  /** Client-generated state returned at the callback. */
  readonly state: string;
  /** Client-generated nonce bound into the ID token. */
  readonly nonce: string;
  /** Expected synthetic subject. */
  readonly subject: string;
  /** Redirect status observed from the authorization endpoint. */
  readonly authorizationStatus: number;
  /** Browser session cookies retained only for a same-session logout observation. */
  readonly sessionCookies?: readonly { readonly name: string; readonly value: string }[];
}

/** Parsed token endpoint response retained only for the current scenario. */
export type LiveTokenSet = z.infer<typeof tokenResponseSchema>;

/** Sanitized HTTP facts from one raw protocol request. */
export interface LiveProtocolResponse {
  /** HTTP status returned by the public endpoint. */
  readonly status: number;
  /** OAuth/OIDC error code, when returned. */
  readonly error: string | null;
  /** Redirect location, when returned. */
  readonly location: string | null;
  /** Server-generated correlation identifier returned by Porta. */
  readonly requestId: string | null;
  /** Underlying response retained only for bounded follow-up parsing. */
  readonly response: APIResponse;
}

/** One live administrative session projection with no secret material. */
export interface LiveAdminSession {
  /** Non-secret public session identifier. */
  readonly sessionId: string;
  /** Authenticated user UUID, or null before authentication completes. */
  readonly userId: string | null;
  /** Internal client UUID when one client is tracked. */
  readonly clientId: string | null;
  /** Organization UUID associated with the session. */
  readonly organizationId: string | null;
  /** Provider grant identifier, when the session published one. */
  readonly grantId: string | null;
  /** Session creation timestamp. */
  readonly createdAt: string;
  /** Session expiry timestamp. */
  readonly expiresAt: string;
  /** Revocation timestamp, or null while active. */
  readonly revokedAt: string | null;
}

/** One live connected application projection with no token material. */
export interface LiveConnectedApp {
  /** Provider grant identifier. */
  readonly grantId: string;
  /** Public OAuth client identifier. */
  readonly clientId: string;
  /** Human-readable client name. */
  readonly clientName: string;
  /** Internal application UUID. */
  readonly applicationId: string;
  /** Granted OIDC and resource scopes. */
  readonly scopes: readonly string[];
  /** Grant creation timestamp. */
  readonly createdAt: string;
  /** Grant expiry timestamp, or null for a non-expiring grant. */
  readonly expiresAt: string | null;
}

/** Independent session and consent state for one user and tenant. */
export interface LiveUserState {
  /** Active public sessions for the user. */
  readonly activeSessions: readonly LiveAdminSession[];
  /** Live connected applications for the user. */
  readonly connectedApps: readonly LiveConnectedApp[];
}

/** Validates one administrative session record. */
const adminSessionSchema = z.object({
  sessionId: z.string().min(1),
  userId: z.string().uuid().nullable(),
  clientId: z.string().uuid().nullable(),
  organizationId: z.string().uuid().nullable(),
  grantId: z.string().min(1).nullable(),
  createdAt: z.string().min(1),
  expiresAt: z.string().min(1),
  revokedAt: z.string().nullable(),
});

/** Validates the paginated administrative session envelope. */
const adminSessionsSchema = z.object({ data: z.array(adminSessionSchema) });

/** Validates one connected-app record. */
const connectedAppSchema = z.object({
  grantId: z.string().min(1),
  clientId: z.string().min(1),
  clientName: z.string(),
  applicationId: z.string().uuid(),
  scopes: z.array(z.string()),
  createdAt: z.string().min(1),
  expiresAt: z.string().nullable(),
});

/** Validates the connected-app list envelope. */
const connectedAppsSchema = z.object({ data: z.array(connectedAppSchema) });

/** Creates the RFC 7636 S256 challenge for one verifier. */
export function livePkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** Measures whether every supplied asynchronous request shared a real open interval. */
export async function runOverlapping<T>(
  operations: readonly (() => Promise<T>)[],
): Promise<{ readonly values: readonly T[]; readonly overlapped: boolean }> {
  const intervals: Array<{ startedAt: number; completedAt: number }> = [];
  let ready = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const work = operations.map(async (operation) => {
    ready += 1;
    if (ready === operations.length) release?.();
    await gate;
    const startedAt = performance.now();
    const value = await operation();
    intervals.push({ startedAt, completedAt: performance.now() });
    return value;
  });
  const values = await Promise.all(work);
  const overlapped =
    intervals.length > 1 &&
    Math.max(...intervals.map(({ startedAt }) => startedAt)) <
      Math.min(...intervals.map(({ completedAt }) => completedAt));
  return Object.freeze({ values: Object.freeze(values), overlapped });
}

/**
 * Live retained-harness protocol context.
 *
 * It resolves only active owner-fenced fixture files, keeps credentials in memory, and exercises
 * Porta through HTTPS and a headless browser. Returned observations never include secrets.
 */
export class LiveProtocolContext {
  /** Active owner-fenced endpoints. */
  public readonly endpoints = activeEndpoints();

  /** Independent public fixture definition resolved for the active callback origins. */
  public readonly manifest: PublicFixtureManifest;

  private readonly entities: ReadonlyMap<string, string>;
  private apiPromise?: Promise<APIRequestContext>;

  /** Binds this observer to the exact active endpoint and fixture run. */
  public constructor() {
    const runtime = readPublicRuntimeFixtureManifest(this.endpoints.fixtureManifestPath);
    if (runtime.runId !== this.endpoints.runId) throw new Error('protocol fixture run mismatch');
    this.manifest = resolvePublicFixtureManifest({
      appBaseUrl: this.endpoints.app,
      bffBaseUrl: this.endpoints.bff,
    });
    this.entities = new Map(runtime.entities.map((entry) => [entry.alias, entry.id]));
  }

  /** Returns one reusable TLS-tolerant raw HTTP client. */
  public api(): Promise<APIRequestContext> {
    this.apiPromise ??= request.newContext({ ignoreHTTPSErrors: true });
    return this.apiPromise;
  }

  /** Resolves one generated identifier without placing its alias in diagnostics. */
  public entity(alias: string): string {
    const value = this.entities.get(alias);
    if (value === undefined) throw new Error('required protocol fixture identity is absent');
    return value;
  }

  /** Returns the fixture user UUID used by the ordinary browser authorization flow. */
  public fixtureUserId(tenant: 'alpha' | 'bravo'): string {
    const user = this.manifest[tenant].users.find(
      (candidate) => candidate.state === 'active' && !candidate.twoFactorEnabled,
    );
    if (user === undefined) throw new Error('required protocol user fixture is absent');
    return this.entity(user.id);
  }

  /** Resolves a valid tenant client and its protected secret at the last possible moment. */
  public client(tenant: 'alpha' | 'bravo', kind: 'public' | 'confidential'): LiveProtocolClient {
    const fixture = this.manifest[tenant].clients.find(
      (candidate) => candidate.validity === 'valid' && candidate.kind === kind,
    );
    const redirectUri = fixture?.redirectUris[0];
    if (fixture === undefined || redirectUri === undefined) {
      throw new Error('required protocol client fixture is absent');
    }
    const clientId = this.entity(`${fixture.id}-oidc-client-id`);
    const clientSecret =
      fixture.clientSecretCredentialRef === undefined
        ? undefined
        : readProtectedRuntimeCredential(
            this.endpoints.credentialManifestPath,
            fixture.clientSecretCredentialRef,
          );
    return Object.freeze({ fixture, clientId, redirectUri, clientSecret });
  }

  /** Retrieves and validates tenant discovery from the public issuer. */
  public async discovery(tenant: 'alpha' | 'bravo'): Promise<LiveProtocolDiscovery> {
    const api = await this.api();
    const response = await api.get(
      `${this.endpoints.porta}/${tenant}/.well-known/openid-configuration`,
    );
    if (!response.ok()) throw new Error('protocol discovery control failed');
    return discoverySchema.parse(await response.json());
  }

  /** Fetches the tenant JWKS document without importing Porta token helpers. */
  public async jwks(tenant: 'alpha' | 'bravo'): Promise<unknown> {
    const discovery = await this.discovery(tenant);
    const api = await this.api();
    const response = await api.get(discovery.jwks_uri);
    if (!response.ok()) throw new Error('protocol JWKS control failed');
    return response.json();
  }

  /** Completes a real browser authorization and returns one unredeemed code. */
  public async issueCode(
    tenant: 'alpha' | 'bravo',
    kind: 'public' | 'confidential' = 'public',
    fixed?: { readonly state?: string; readonly nonce?: string },
  ): Promise<LiveAuthorizationCode> {
    const client = this.client(tenant, kind);
    const user = this.manifest[tenant].users.find(
      (candidate) => candidate.state === 'active' && !candidate.twoFactorEnabled,
    );
    if (user === undefined) throw new Error('required protocol user fixture is absent');
    const verifier = randomBytes(48).toString('base64url');
    const state = fixed?.state ?? randomBytes(18).toString('base64url');
    const nonce = fixed?.nonce ?? randomBytes(18).toString('base64url');
    const authorization = new URL(`${this.endpoints.porta}/${tenant}/auth`);
    authorization.search = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: client.redirectUri,
      response_type: 'code',
      scope: 'openid profile email offline_access',
      state,
      nonce,
      code_challenge: livePkceChallenge(verifier),
      code_challenge_method: 'S256',
      prompt: 'login',
    }).toString();
    const browser = await chromium.launch({ headless: true });
    try {
      const browserContext = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await browserContext.newPage();
      let authorizationStatus: number | undefined;
      page.on('response', (response) => {
        const url = new URL(response.url());
        if (url.origin === new URL(this.endpoints.porta).origin && url.pathname.endsWith('/auth')) {
          authorizationStatus = response.status();
        }
      });
      await page.route(`${new URL(client.redirectUri).origin}/**`, async (route) => {
        await route.fulfill({ status: 200, contentType: 'text/plain', body: 'callback received' });
      });
      await page.goto(authorization.toString(), { waitUntil: 'domcontentloaded' });
      await page.locator('input#email').fill(`${user.id}@test-harness.local`);
      await page
        .locator('input#password')
        .fill(
          readProtectedRuntimeCredential(
            this.endpoints.credentialManifestPath,
            user.passwordCredentialRef,
          ),
        );
      await page.locator('form[action$="/login"] button[type="submit"]').click();
      const consent = page.locator(
        'button[type="submit"][name="consent"], button:has-text("Allow"), button:has-text("Authorize")',
      );
      if (await consent.isVisible({ timeout: 1_000 }).catch(() => false)) await consent.click();
      await page.waitForURL((url) => url.origin === new URL(client.redirectUri).origin, {
        timeout: 15_000,
      });
      const callback = new URL(page.url());
      const code = callback.searchParams.get('code');
      if (code === null || callback.searchParams.get('state') !== state) {
        throw new Error('protocol callback omitted its bound code or state');
      }
      if (authorizationStatus === undefined) {
        throw new Error('protocol authorization redirect status was not observed');
      }
      const sessionCookies = (await browserContext.cookies())
        .filter((cookie) => cookie.name.startsWith('_session'))
        .map((cookie) => ({ name: cookie.name, value: cookie.value }));
      return Object.freeze({
        tenant,
        client,
        code,
        verifier,
        state,
        nonce,
        subject: this.entity(user.id),
        authorizationStatus,
        sessionCookies: Object.freeze(sessionCookies),
      });
    } finally {
      await browser.close();
    }
  }

  /** Exchanges one code with explicit client, redirect, and verifier substitutions. */
  public async exchangeCode(
    authorization: LiveAuthorizationCode,
    substitutions: {
      readonly client?: LiveProtocolClient;
      readonly redirectUri?: string;
      readonly verifier?: string;
    } = {},
  ): Promise<{ readonly sanitized: LiveProtocolResponse; readonly tokens: LiveTokenSet | null }> {
    const client = substitutions.client ?? authorization.client;
    const api = await this.api();
    const response = await api.post(`${this.endpoints.porta}/${authorization.tenant}/token`, {
      form: {
        grant_type: 'authorization_code',
        code: authorization.code,
        redirect_uri: substitutions.redirectUri ?? authorization.client.redirectUri,
        client_id: client.clientId,
        code_verifier: substitutions.verifier ?? authorization.verifier,
        ...(client.clientSecret === undefined ? {} : { client_secret: client.clientSecret }),
      },
    });
    return Object.freeze({
      sanitized: await this.sanitize(response),
      tokens: response.ok() ? tokenResponseSchema.parse(await response.json()) : null,
    });
  }

  /** Uses one refresh token through the public token endpoint. */
  public async refresh(
    tenant: 'alpha' | 'bravo',
    client: LiveProtocolClient,
    refreshToken: string,
  ): Promise<{ readonly sanitized: LiveProtocolResponse; readonly tokens: LiveTokenSet | null }> {
    const api = await this.api();
    const response = await api.post(`${this.endpoints.porta}/${tenant}/token`, {
      form: {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: client.clientId,
        ...(client.clientSecret === undefined ? {} : { client_secret: client.clientSecret }),
      },
    });
    return Object.freeze({
      sanitized: await this.sanitize(response),
      tokens: response.ok() ? tokenResponseSchema.parse(await response.json()) : null,
    });
  }

  /** Calls UserInfo with one supplied bearer artifact and retains no identity fields. */
  public async userinfo(
    tenant: 'alpha' | 'bravo',
    artifact: string,
  ): Promise<{
    readonly response: LiveProtocolResponse;
    readonly disclosed: boolean;
    readonly subject: string | null;
  }> {
    const api = await this.api();
    const raw = await api.get(`${this.endpoints.porta}/${tenant}/me`, {
      headers: { Authorization: `Bearer ${artifact}` },
    });
    if (!raw.ok()) {
      return Object.freeze({
        response: await this.sanitize(raw),
        disclosed: false,
        subject: null,
      });
    }
    const body: unknown = await raw.json().catch(() => ({}));
    const candidate =
      typeof body === 'object' && body !== null && !Array.isArray(body)
        ? Reflect.get(body, 'sub')
        : undefined;
    const subject = typeof candidate === 'string' ? candidate : null;
    const response: LiveProtocolResponse = Object.freeze({
      status: raw.status(),
      error: null,
      location: null,
      requestId: raw.headers()['x-request-id'] ?? null,
      response: raw,
    });
    return Object.freeze({ response, disclosed: true, subject });
  }

  /** Creates one valid pending interaction and returns its provider UID. */
  public async pendingInteractionUid(
    tenant: 'alpha' | 'bravo',
    client: LiveProtocolClient,
  ): Promise<string> {
    const verifier = randomBytes(48).toString('base64url');
    const response = await this.authorizeRaw(tenant, {
      client_id: client.clientId,
      redirect_uri: client.redirectUri,
      response_type: 'code',
      scope: 'openid profile email offline_access',
      state: randomBytes(18).toString('base64url'),
      nonce: randomBytes(18).toString('base64url'),
      code_challenge: livePkceChallenge(verifier),
      code_challenge_method: 'S256',
      prompt: 'login',
    });
    const match =
      response.location === null ? null : /\/interaction\/([^/]+)/u.exec(response.location);
    if (match?.[1] === undefined) throw new Error('pending interaction was not created');
    return match[1];
  }

  /** Sends a raw authorization request without following redirects. */
  public async authorizeRaw(
    tenant: 'alpha' | 'bravo',
    parameters: Readonly<Record<string, string>>,
  ): Promise<LiveProtocolResponse> {
    const api = await this.api();
    const url = new URL(`${this.endpoints.porta}/${tenant}/auth`);
    url.search = new URLSearchParams(parameters).toString();
    return this.sanitize(await api.get(url.toString(), { maxRedirects: 0 }));
  }

  /** Reads the full administrative fixture token without retaining it in evidence. */
  private adminToken(): string {
    const actor = this.manifest.superAdmin.actors.find(
      (candidate) => candidate.permissionSet === 'full',
    );
    if (actor === undefined) throw new Error('full administrative fixture actor is absent');
    return readProtectedRuntimeCredential(
      this.endpoints.credentialManifestPath,
      actor.tokenCredentialRef,
    );
  }

  /** Performs one authenticated public Admin API read. */
  private async adminGet(path: string): Promise<APIResponse> {
    const api = await this.api();
    return api.get(`${this.endpoints.porta}${path}`, {
      headers: { Authorization: `Bearer ${this.adminToken()}` },
      maxRedirects: 0,
    });
  }

  /** Performs one authenticated public Admin API delete. */
  private async adminDelete(path: string): Promise<APIResponse> {
    const api = await this.api();
    return api.delete(`${this.endpoints.porta}${path}`, {
      headers: { Authorization: `Bearer ${this.adminToken()}` },
      maxRedirects: 0,
    });
  }

  /**
   * Lists sessions for one user through the public Admin API.
   *
   * The user UUID is globally unique, so the observation does not depend on the session
   * tracking row retaining an organization value.
   */
  public async adminSessions(
    userId: string,
    activeOnly = true,
  ): Promise<readonly LiveAdminSession[]> {
    const query = new URLSearchParams({
      userId,
      activeOnly: activeOnly ? 'true' : 'false',
      pageSize: '100',
    });
    const response = await this.adminGet(`/api/admin/sessions?${query.toString()}`);
    if (!response.ok()) throw new Error('administrative session read failed');
    const sessions = adminSessionsSchema.parse(await response.json()).data;
    if (sessions.some((session) => session.userId !== null && session.userId !== userId)) {
      throw new Error('administrative session read returned another user');
    }
    return Object.freeze(sessions);
  }

  /** Lists the user's live connected applications through the public Admin API. */
  public async adminConnectedApps(
    tenant: 'alpha' | 'bravo',
    userId: string,
  ): Promise<readonly LiveConnectedApp[]> {
    const organizationId = this.entity(tenant);
    const response = await this.adminGet(
      `/api/admin/organizations/${organizationId}/users/${userId}/connected-apps`,
    );
    if (!response.ok()) throw new Error('administrative connected-app read failed');
    return Object.freeze(connectedAppsSchema.parse(await response.json()).data);
  }

  /** Captures the independent session and consent state for one user and tenant. */
  public async userState(tenant: 'alpha' | 'bravo', userId: string): Promise<LiveUserState> {
    const [activeSessions, connectedApps] = await Promise.all([
      this.adminSessions(userId),
      this.adminConnectedApps(tenant, userId),
    ]);
    return Object.freeze({ activeSessions, connectedApps });
  }

  /** Returns the stable content identities in one tenant's trusted JWKS document. */
  public async jwksKeyIdentities(tenant: 'alpha' | 'bravo'): Promise<readonly string[]> {
    return jwksIdentities(await this.jwks(tenant));
  }

  /** Revokes every live grant for one user and client through the public Admin API. */
  public async revokeClientGrants(
    tenant: 'alpha' | 'bravo',
    userId: string,
    clientId: string,
  ): Promise<number> {
    const organizationId = this.entity(tenant);
    const apps = await this.adminConnectedApps(tenant, userId);
    const matching = apps.filter((app) => app.clientId === clientId);
    for (const app of matching) {
      const response = await this.adminDelete(
        `/api/admin/organizations/${organizationId}/users/${userId}/connected-apps/${app.grantId}`,
      );
      if (!response.ok() && response.status() !== 404) {
        throw new Error('connected-app reset failed');
      }
    }
    return matching.length;
  }

  /**
   * Restarts the owned Porta process and waits for its discovery endpoint.
   *
   * The lifecycle supervisor owns the restart. The process start time must change, so a no-op
   * restart cannot be reported as fresh-process evidence.
   */
  public async restartServer(): Promise<void> {
    const container = execFileSync(
      'docker',
      [
        'compose',
        '-p',
        this.endpoints.composeProject,
        '-f',
        'test-harness/docker-compose.yml',
        'ps',
        '-q',
        'porta',
      ],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 30_000 },
    ).trim();
    if (container.length === 0) throw new Error('protocol server container is absent');
    const startedBefore = execFileSync(
      'docker',
      ['inspect', '-f', '{{.State.StartedAt}}', container],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 30_000 },
    ).trim();
    execFileSync(
      process.execPath,
      ['--import', 'tsx', 'test-harness/scripts/lifecycle.ts', 'restart-porta'],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: 'ignore',
        timeout: 120_000,
      },
    );
    const deadline = Date.now() + 60_000;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        const api = await this.api();
        const response = await api.get(
          `${this.endpoints.porta}/alpha/.well-known/openid-configuration`,
          { timeout: 5_000 },
        );
        if (response.ok()) {
          ready = true;
          break;
        }
      } catch {
        // The process is still starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error('protocol server did not become ready after restart');
    const startedAfter = execFileSync(
      'docker',
      ['inspect', '-f', '{{.State.StartedAt}}', container],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 30_000 },
    ).trim();
    if (startedAfter === startedBefore) {
      throw new Error('protocol server restart was not observed');
    }
  }

  /** Performs the real confirmation-form logout with the originating browser session cookies. */
  public async logout(
    tenant: 'alpha' | 'bravo',
    idToken: string,
    sessionCookies: readonly { readonly name: string; readonly value: string }[],
  ): Promise<{
    readonly status: number;
    readonly completed: boolean;
    readonly response: LiveProtocolResponse;
  }> {
    const discovery = await this.discovery(tenant);
    const api = await this.api();
    const cookie = sessionCookies.map((value) => `${value.name}=${value.value}`).join('; ');
    const headers: Record<string, string> = cookie.length === 0 ? {} : { Cookie: cookie };
    const endSessionUrl = new URL(
      discovery.end_session_endpoint ?? `${this.endpoints.porta}/${tenant}/session/end`,
    );
    if (endSessionUrl.origin !== new URL(this.endpoints.porta).origin) {
      throw new Error('end-session endpoint changed origin');
    }
    const confirmation = await api.get(endSessionUrl.toString(), {
      params: { id_token_hint: idToken },
      headers,
      maxRedirects: 0,
    });
    const html = await confirmation.text().catch(() => '');
    const forms = [...html.matchAll(/<form\b[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/giu)];
    const logoutForm = forms.find(([, , body]) => /name="xsrf"/iu.test(body ?? ''));
    const action = logoutForm?.[1];
    const formBody = logoutForm?.[2] ?? '';
    if (action === undefined) {
      const response = await this.sanitize(confirmation);
      return Object.freeze({
        status: response.status,
        completed: response.status < 300,
        response,
      });
    }
    const form: Record<string, string> = { logout: 'yes' };
    for (const input of formBody.matchAll(/<input\b[^>]*>/giu)) {
      const name = /name="([^"]+)"/iu.exec(input[0])?.[1];
      const value = /value="([^"]*)"/iu.exec(input[0])?.[1] ?? '';
      if (name !== undefined) form[name] = value;
    }
    const actionUrl = new URL(action.replaceAll('&amp;', '&'), this.endpoints.porta);
    if (actionUrl.origin !== new URL(this.endpoints.porta).origin) {
      throw new Error('logout form action changed origin');
    }
    const completed = await api.post(actionUrl.toString(), {
      form,
      headers,
      maxRedirects: 0,
    });
    const response = await this.sanitize(completed);
    return Object.freeze({
      status: response.status,
      completed: response.status < 400,
      response,
    });
  }

  /** Reads the bounded compose log stream without exposing command errors. */
  private readLogs(): string {
    try {
      return execFileSync(
        'docker',
        [
          'compose',
          '-p',
          this.endpoints.composeProject,
          '-f',
          'test-harness/docker-compose.yml',
          'logs',
          '--no-color',
          '--since',
          '5m',
          'porta',
        ],
        { cwd: process.cwd(), encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
      );
    } catch {
      throw new Error('protocol security log read failed');
    }
  }

  /** Fails when any ephemeral artifact appears in the captured server logs. */
  public scanLogsForForbiddenValues(forbiddenValues: readonly string[]): void {
    const logs = this.readLogs();
    for (const value of forbiddenValues) {
      if (value.length > 0 && logs.includes(value)) {
        throw new Error('protocol logs retained a forbidden artifact');
      }
    }
  }

  /** Proves exactly one correlated privacy-safe rejection event without retaining its values. */
  public securityLog(
    response: LiveProtocolResponse,
    forbiddenValues: readonly string[],
  ): { readonly event: string; readonly fields: readonly string[] } {
    if (response.requestId === null) throw new Error('protocol response omitted correlation');
    return parseProtocolSecurityLog(this.readLogs(), response.requestId, forbiddenValues);
  }

  /** Releases the reusable request context. */
  public async close(): Promise<void> {
    if (this.apiPromise !== undefined) await (await this.apiPromise).dispose();
  }

  private async sanitize(response: APIResponse): Promise<LiveProtocolResponse> {
    let error: string | null = null;
    const contentType = response.headers()['content-type'] ?? '';
    if (contentType.includes('json')) {
      const body = z
        .object({ error: z.string().optional() })
        .passthrough()
        .safeParse(await response.json().catch(() => ({})));
      if (body.success) error = body.data.error ?? null;
    } else if (response.status() >= 400) {
      const publicBody = await response.text().catch(() => '');
      if (publicBody.includes('invalid_redirect_uri')) error = 'invalid_redirect_uri';
      else if (publicBody.includes('invalid_request')) error = 'invalid_request';
    }
    const location = response.headers().location ?? null;
    if (error === null && location !== null) {
      error = new URL(location, this.endpoints.porta).searchParams.get('error');
    }
    return Object.freeze({
      status: response.status(),
      error,
      location,
      requestId: response.headers()['x-request-id'] ?? null,
      response,
    });
  }
}
