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
      return Object.freeze({
        tenant,
        client,
        code,
        verifier,
        state,
        nonce,
        subject: this.entity(user.id),
        authorizationStatus,
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
  ): Promise<{ readonly response: LiveProtocolResponse; readonly disclosed: boolean }> {
    const api = await this.api();
    const raw = await api.get(`${this.endpoints.porta}/${tenant}/me`, {
      headers: { Authorization: `Bearer ${artifact}` },
    });
    return Object.freeze({ response: await this.sanitize(raw), disclosed: raw.ok() });
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

  /** Proves a correlated privacy-safe rejection event exists without retaining its values. */
  public securityLog(
    response: LiveProtocolResponse,
    forbiddenValues: readonly string[],
  ): { readonly event: string; readonly fields: readonly string[] } {
    if (response.requestId === null) throw new Error('protocol response omitted correlation');
    const logs = execFileSync(
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
    if (!logs.includes(response.requestId) || !logs.includes('protocol-security-rejection')) {
      throw new Error('correlated protocol rejection event is absent');
    }
    for (const value of forbiddenValues) {
      if (value.length > 0 && logs.includes(value)) {
        throw new Error('protocol logs retained a forbidden artifact');
      }
    }
    const fields = ['synthetic-correlation-id', 'event-class', 'public-client-id-digest'] as const;
    if (fields.some((field) => !logs.includes(field))) {
      throw new Error('protocol rejection event omitted a required field');
    }
    return Object.freeze({ event: 'protocol-security-rejection', fields });
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
