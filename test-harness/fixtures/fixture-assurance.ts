import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

import { chromium, request } from '@playwright/test';
import { z } from 'zod';

import playwrightConfiguration from '../playwright.config.js';
import {
  protectedCredentialDescriptors,
  publicFixtureManifest,
  resolvePublicFixtureManifest,
} from './fixture-definition.js';
import {
  readProtectedRuntimeCredential,
  readPublicRuntimeFixtureManifest,
  inspectProtectedRuntimeCredentials,
} from './fixture-runtime-files.js';
import type {
  AssuranceProjectDefinition,
  AssuranceRuntimeProfile,
  FixtureAssuranceSurface,
  FixtureResidueSnapshot,
  FixtureStoreDigests,
  PublicPostconditionResult,
  FixtureSequenceOutcome,
  TenantUserRouteCheck,
  TenantResourceObservation,
} from './fixture-assurance-contract.js';

export type * from './fixture-assurance-contract.js';

/** Observes tenant resource scoping through the public administrative boundary. */
async function observeTenantResource(
  administratorId: string,
  pathOrganizationId: 'alpha' | 'bravo',
  resourceId: string,
): Promise<TenantResourceObservation> {
  const endpoints = activeEndpoints();
  const manifest = resolvePublicFixtureManifest({
    appBaseUrl: endpoints.app,
    bffBaseUrl: endpoints.bff,
  });
  const resourceTenant = [manifest.alpha, manifest.bravo].find((tenant) =>
    tenant.resources.some((resource) => resource.id === resourceId),
  );
  const administrator = manifest.superAdmin.actors.find((actor) => actor.id === administratorId);
  if (administrator?.permissionSet !== 'full' || resourceTenant === undefined) {
    throw new Error('full administrator or resource is not registered');
  }
  const runtime = readPublicRuntimeFixtureManifest(endpoints.fixtureManifestPath);
  const entities = new Map(runtime.entities.map((entry) => [entry.alias, entry.id]));
  const organizationId = entities.get(pathOrganizationId);
  const resourceUserId = entities.get(resourceId.replace('-resource-primary', '-user-active'));
  if (organizationId === undefined || resourceUserId === undefined) {
    throw new Error('fixture organization or resource identifier is absent');
  }
  const token = readProtectedRuntimeCredential(
    endpoints.credentialManifestPath,
    administrator.tokenCredentialRef,
  );
  const api = await request.newContext({ ignoreHTTPSErrors: true });
  try {
    const sameTenant = pathOrganizationId === resourceTenant.id;
    const resourceOrganizationId = entities.get(resourceTenant.id);
    if (resourceOrganizationId === undefined) {
      throw new Error('fixture resource organization identifier is absent');
    }
    const headers = { Authorization: `Bearer ${token}` };
    const properUserUrl = `${endpoints.porta}/api/admin/organizations/${resourceOrganizationId}/users/${resourceUserId}`;
    const before = await api.get(properUserUrl, { headers });
    if (!before.ok()) throw new Error('own-tenant resource control failed');
    const beforeUser = z
      .object({
        id: z.string(),
        organizationId: z.string(),
        nickname: z.string().nullable(),
        status: z.string(),
      })
      .passthrough()
      .parse(z.object({ data: z.unknown() }).parse(await before.json()).data);
    if (beforeUser.organizationId !== resourceOrganizationId) {
      throw new Error('resource control returned the wrong owning organization');
    }
    if (sameTenant) {
      return {
        administratorId,
        pathOrganizationId,
        resourceId,
        observedOrganizationId: resourceTenant.id,
        status: 'allowed',
        routeChecks: [],
        targetUnchanged: true,
      };
    }

    const foreignBase = `${endpoints.porta}/api/admin/organizations/${organizationId}/users/${resourceUserId}`;
    const probes = [
      ['read', 'GET', foreignBase, undefined],
      ['update', 'PUT', foreignBase, { nickname: 'cross-tenant-write-must-not-persist' }],
      ['suspend', 'POST', `${foreignBase}/suspend`, { reason: 'cross-tenant-status-probe' }],
      ['roles', 'GET', `${foreignBase}/roles`, undefined],
      ['two-factor', 'GET', `${foreignBase}/two-factor/status`, undefined],
      ['export', 'GET', `${foreignBase}/export`, undefined],
      ['history', 'GET', `${foreignBase}/history`, undefined],
    ] as const;
    const routeChecks: TenantUserRouteCheck[] = [];
    for (const [operation, method, url, data] of probes) {
      const response = await api.fetch(url, { method, headers, data });
      if (response.status() !== 404) {
        throw new Error(`foreign-tenant ${operation} was not denied by organization scope`);
      }
      routeChecks.push({ operation, status: 'not-found' });
    }

    const after = await api.get(properUserUrl, { headers });
    if (!after.ok()) throw new Error('post-probe resource control failed');
    const afterUser = z
      .object({
        id: z.string(),
        organizationId: z.string(),
        nickname: z.string().nullable(),
        status: z.string(),
      })
      .passthrough()
      .parse(z.object({ data: z.unknown() }).parse(await after.json()).data);
    const targetUnchanged = JSON.stringify(afterUser) === JSON.stringify(beforeUser);
    return {
      administratorId,
      pathOrganizationId,
      resourceId,
      observedOrganizationId: resourceTenant.id,
      status: 'forbidden',
      routeChecks,
      targetUnchanged,
    };
  } finally {
    await api.dispose();
  }
}

const projectIdSchema = z.enum(['spa', 'bff', 'protocol', 'security', 'compatibility']);

/** Lists all harness files so collection is derived from Playwright's actual project matchers. */
function harnessTestFiles(): readonly string[] {
  const harnessRoot = resolve(import.meta.dirname, '..');
  const pending = [resolve(harnessRoot, 'tests')];
  const files: string[] = [];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (directory === undefined) break;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      if (entry.isFile()) files.push(relative(harnessRoot, absolute).split(sep).join('/'));
    }
  }
  return files.sort();
}

/** Converts the resolved Playwright configuration into exact assurance collection evidence. */
function configuredProjects(): readonly AssuranceProjectDefinition[] {
  if (playwrightConfiguration.workers !== 1 || playwrightConfiguration.fullyParallel !== false) {
    throw new Error('Playwright assurance collection must remain one serial worker');
  }
  const allFiles = harnessTestFiles();
  return (playwrightConfiguration.projects ?? []).map((project) => {
    const id = projectIdSchema.parse(project.name);
    if (!(project.testMatch instanceof RegExp)) {
      throw new Error(`Playwright project ${id} must own one regular-expression matcher`);
    }
    const matcher = project.testMatch;
    return {
      id,
      pattern: matcher.source,
      workers: 1,
      files: allFiles.filter((file) => matcher.test(file.replace(/^tests\//u, ''))),
    };
  });
}

const projects = configuredProjects();
const profiles: readonly AssuranceRuntimeProfile[] = [
  {
    id: 'operational',
    environmentSecurityEvidenceEligible: false,
    productionModeRequired: false,
    tlsRequired: false,
    secureCookiesRequired: false,
    minimalErrorsRequired: false,
    securityHeadersRequired: false,
  },
  {
    id: 'production-security',
    environmentSecurityEvidenceEligible: true,
    productionModeRequired: true,
    tlsRequired: true,
    secureCookiesRequired: true,
    minimalErrorsRequired: true,
    securityHeadersRequired: true,
  },
];

/** Reads exact public endpoints after verifying fixture and endpoint run identity. */
/** Validated endpoints and owner-only fixture paths for the active harness run. */
export interface ActiveFixtureEndpoints {
  readonly runId: string;
  readonly profile: string;
  readonly porta: string;
  readonly app: string;
  readonly bff: string;
  readonly mailhog: string;
  readonly composeProject: string;
  readonly fixtureManifestPath: string;
  readonly credentialManifestPath: string;
}

/** Reads exact public endpoints after binding fixture and endpoint identities to the active run. */
export function activeEndpoints(): ActiveFixtureEndpoints {
  const activeRun = z
    .object({
      runId: z.uuid(),
      manifest: z.object({
        runId: z.uuid(),
        composeProject: z.string().min(1),
        environmentName: z.string().min(1),
      }),
    })
    .passthrough()
    .parse(
      JSON.parse(
        readFileSync(resolve(import.meta.dirname, '../.assurance-runtime/active-run.json'), 'utf8'),
      ),
    );
  const runtimeDirectory = resolve(import.meta.dirname, '../.assurance-runtime', activeRun.runId);
  const endpointManifestPath = resolve(runtimeDirectory, 'endpoint-manifest.json');
  const fixtureManifestPath = resolve(runtimeDirectory, 'fixture-public.json');
  const credentialManifestPath = resolve(runtimeDirectory, 'fixture-credentials.json');
  const endpoint = z
    .object({
      runId: z.uuid(),
      urls: z.object({
        porta: z.string().url(),
        app: z.string().url(),
        attacker: z.string().url(),
        bff: z.string().url(),
        mailhog: z.string().url(),
      }),
    })
    .passthrough()
    .parse(JSON.parse(readFileSync(endpointManifestPath, 'utf8')));
  const fixture = readPublicRuntimeFixtureManifest(fixtureManifestPath);
  if (
    activeRun.manifest.runId !== activeRun.runId ||
    fixture.runId !== activeRun.runId ||
    endpoint.runId !== activeRun.runId
  ) {
    throw new Error('active, fixture, and endpoint run identities differ');
  }
  return {
    ...endpoint.urls,
    runId: activeRun.runId,
    profile: activeRun.manifest.environmentName,
    composeProject: activeRun.manifest.composeProject,
    fixtureManifestPath,
    credentialManifestPath,
  };
}

/** Runs one public-boundary check while retaining only its stable result classification. */
async function publicResult(
  boundary: PublicPostconditionResult['boundary'],
  check: () => Promise<readonly string[]>,
): Promise<PublicPostconditionResult> {
  try {
    const observations = await check();
    return {
      boundary,
      status: 'passed',
      expectationSource: 'public-contract',
      productionDerived: false,
      observations,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const reason = /^[A-Za-z0-9 :_-]{1,120}$/u.test(message) ? message : 'unclassified';
    process.stderr.write(`HARNESS_PUBLIC_CHECK_FAILED: boundary=${boundary} reason=${reason}\n`);
    return {
      boundary,
      status: 'failed',
      expectationSource: 'public-contract',
      productionDerived: false,
      observations: [],
    };
  }
}

/** Converts arbitrary fixture identities into a stable redacted digest. */
function stableDigest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

/** Encodes PKCE input without padding using the OAuth base64url alphabet. */
function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** Replaces browser/library diagnostics with one stable non-secret OIDC stage. */
async function oidcStage<T>(stage: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch {
    throw new Error(`OIDC login failed at ${stage}`);
  }
}

/** Completes a real authorization-code journey and verifies the intended ordinary principal. */
export async function verifyOidcLogin(
  tenant: 'alpha' | 'bravo',
  kind: 'public' | 'confidential',
  endpoints: ReturnType<typeof activeEndpoints>,
  api: Awaited<ReturnType<typeof request.newContext>>,
): Promise<string> {
  const manifest = resolvePublicFixtureManifest({
    appBaseUrl: endpoints.app,
    bffBaseUrl: endpoints.bff,
  });
  const tenantFixture = manifest[tenant];
  const client = tenantFixture.clients.find(
    (entry) => entry.validity === 'valid' && entry.kind === kind,
  );
  const user = tenantFixture.users.find(
    (entry) => entry.state === 'active' && !entry.twoFactorEnabled,
  );
  if (client === undefined || user === undefined) throw new Error('OIDC control fixture is absent');
  const runtime = readPublicRuntimeFixtureManifest(endpoints.fixtureManifestPath);
  const entities = new Map(runtime.entities.map((entry) => [entry.alias, entry.id]));
  const clientId = entities.get(`${client.id}-oidc-client-id`);
  if (clientId === undefined) throw new Error('OIDC control client identifier is absent');
  const verifier = randomBytes(48).toString('base64url');
  const state = randomBytes(18).toString('base64url');
  const nonce = randomBytes(18).toString('base64url');
  const redirectUri = client.redirectUris[0];
  if (redirectUri === undefined) throw new Error('OIDC control redirect is absent');
  const authorization = new URL(`${endpoints.porta}/${tenant}/auth`);
  authorization.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: 'S256',
    prompt: 'login',
  }).toString();
  const browser = await oidcStage('browser launch', () => chromium.launch({ headless: true }));
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await page.route(`${new URL(redirectUri).origin}/**`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/plain', body: 'callback received' });
    });
    await oidcStage('authorization', () =>
      page.goto(authorization.toString(), { waitUntil: 'domcontentloaded' }),
    );
    await oidcStage('credential entry', async () => {
      await page.locator('input#email').fill(`${user.id}@test-harness.local`);
      await page
        .locator('input#password')
        .fill(
          readProtectedRuntimeCredential(
            endpoints.credentialManifestPath,
            user.passwordCredentialRef,
          ),
        );
      await page.locator('form[action$="/login"] button[type="submit"]').click();
    });
    const consent = page.locator(
      'button[type="submit"][name="consent"], button:has-text("Allow"), button:has-text("Authorize")',
    );
    if (await consent.isVisible({ timeout: 1_000 }).catch(() => false)) await consent.click();
    await oidcStage('callback', () =>
      page.waitForURL((url) => url.origin === new URL(redirectUri).origin, { timeout: 15_000 }),
    );
    const callback = new URL(page.url());
    const code = callback.searchParams.get('code');
    if (code === null || callback.searchParams.get('state') !== state) {
      throw new Error('OIDC callback omitted the expected code or state');
    }
    const tokenForm: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    };
    if (client.clientSecretCredentialRef !== undefined) {
      tokenForm.client_secret = readProtectedRuntimeCredential(
        endpoints.credentialManifestPath,
        client.clientSecretCredentialRef,
      );
    }
    const tokenResponse = await oidcStage('code exchange', () =>
      api.post(`${endpoints.porta}/${tenant}/token`, { form: tokenForm }),
    );
    if (!tokenResponse.ok()) throw new Error('OIDC code exchange failed');
    const token = z
      .object({ access_token: z.string().min(1) })
      .passthrough()
      .parse(await tokenResponse.json());
    const userinfo = await oidcStage('userinfo', () =>
      api.get(`${endpoints.porta}/${tenant}/me`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
      }),
    );
    if (!userinfo.ok()) throw new Error('OIDC userinfo control failed');
    const claims = z
      .object({ email: z.string().email() })
      .passthrough()
      .parse(await userinfo.json());
    if (claims.email !== `${user.id}@test-harness.local`) {
      throw new Error('OIDC journey authenticated the wrong ordinary principal');
    }
    return token.access_token;
  } finally {
    await browser.close();
  }
}

/** Verifies active HTTP, protocol, browser, and email-capture boundaries. */
async function verifyPublicPostconditions(
  profileId: 'operational' | 'production-security',
): Promise<readonly PublicPostconditionResult[]> {
  const endpoints = activeEndpoints();
  if (endpoints.profile !== profileId) throw new Error('active runtime profile does not match');
  const api = await request.newContext({ ignoreHTTPSErrors: true });
  try {
    const http = await publicResult('http', async () => {
      const response = await api.get(`${endpoints.porta}/health`);
      if (!response.ok()) throw new Error('public health endpoint failed');
      return ['health'];
    });
    const protocol = await publicResult('protocol', async () => {
      for (const tenant of ['alpha', 'bravo'] as const) {
        const response = await api.get(
          `${endpoints.porta}/${tenant}/.well-known/openid-configuration`,
        );
        if (!response.ok()) throw new Error('tenant discovery failed');
        const discovery = z
          .object({ issuer: z.string().url(), authorization_endpoint: z.string().url() })
          .passthrough()
          .parse(await response.json());
        if (discovery.issuer !== `${endpoints.porta}/${tenant}`) {
          throw new Error('tenant issuer did not match the public contract');
        }
      }
      return ['discovery:alpha', 'discovery:bravo'];
    });
    const email = await publicResult('email', async () => {
      const response = await api.get(`${endpoints.mailhog}/api/v2/messages`);
      if (!response.ok()) throw new Error('MailHog public API failed');
      z.object({ items: z.array(z.unknown()) })
        .passthrough()
        .parse(await response.json());
      return ['mailhog-inventory'];
    });
    const browser = await publicResult('browser', async () => {
      const instance = await chromium.launch({ headless: true });
      try {
        const context = await instance.newContext({ ignoreHTTPSErrors: true });
        const page = await context.newPage();
        const response = await page.goto(endpoints.app, { waitUntil: 'domcontentloaded' });
        if (response === null || !response.ok()) throw new Error('retained SPA did not load');
        await page.locator('[data-testid="login-btn"]').waitFor({ state: 'visible' });
      } finally {
        await instance.close();
      }
      return ['retained-spa'];
    });
    const fixtures = await publicResult('fixtures', async () => {
      const runtime = readPublicRuntimeFixtureManifest(endpoints.fixtureManifestPath);
      const resolved = resolvePublicFixtureManifest({
        appBaseUrl: endpoints.app,
        bffBaseUrl: endpoints.bff,
      });
      if (JSON.stringify(runtime.publicManifest) !== JSON.stringify(resolved)) {
        throw new Error('public fixture manifest differs from the seeded endpoint contract');
      }
      const credentialInspection = inspectProtectedRuntimeCredentials(
        endpoints.credentialManifestPath,
      );
      if (!credentialInspection.pairwiseDistinct) {
        throw new Error('protected fixture credentials are not pairwise distinct');
      }
      const entities = new Map(runtime.entities.map((entry) => [entry.alias, entry.id]));
      const observations: string[] = [];
      for (const tenant of ['alpha', 'bravo'] as const) {
        let ordinaryAccessToken: string | undefined;
        for (const kind of ['public', 'confidential'] as const) {
          const accessToken = await verifyOidcLogin(tenant, kind, endpoints, api);
          if (kind === 'public') ordinaryAccessToken = accessToken;
          observations.push(`oidc-login:${tenant}:${kind}`);
        }
        const validPublic = resolved[tenant].clients.find(
          (entry) => entry.validity === 'valid' && entry.kind === 'public',
        );
        const clientId =
          validPublic === undefined ? undefined : entities.get(`${validPublic.id}-oidc-client-id`);
        if (clientId === undefined) throw new Error('public OIDC client identifier is absent');
        const invalidDefinition = resolved[tenant].clients.find(
          (entry) => entry.invalidConfiguration?.field === 'redirect-uri',
        );
        if (invalidDefinition?.invalidConfiguration === undefined) {
          throw new Error('invalid redirect fixture is absent');
        }
        const invalidRedirect = await api.get(`${endpoints.porta}/${tenant}/auth`, {
          maxRedirects: 0,
          params: {
            client_id: clientId,
            redirect_uri: invalidDefinition.invalidConfiguration.value,
            response_type: 'code',
            scope: 'openid',
            state: 'fixture-invalid-state',
            nonce: 'fixture-invalid-nonce',
            code_challenge: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            code_challenge_method: 'S256',
          },
        });
        if (invalidRedirect.status() !== 400 || invalidRedirect.headers().location !== undefined) {
          throw new Error('invalid redirect was not rejected before interaction');
        }
        observations.push(`invalid-redirect:${tenant}`);
        if (ordinaryAccessToken === undefined) throw new Error('ordinary access token is absent');
        const tokenControl = await api.get(`${endpoints.porta}/${tenant}/me`, {
          headers: { Authorization: `Bearer ${ordinaryAccessToken}` },
        });
        if (!tokenControl.ok()) throw new Error('ordinary token control failed');
        const tokenClaims = z
          .object({ email: z.string().email() })
          .passthrough()
          .parse(await tokenControl.json());
        if (tokenClaims.email !== `${tenant}-user-active@test-harness.local`) {
          throw new Error('ordinary token belongs to the wrong fixture principal');
        }
        const invalidOrigin = await api.get(`${endpoints.porta}/${tenant}/me`, {
          headers: {
            Authorization: `Bearer ${ordinaryAccessToken}`,
            Origin: 'https://attacker.invalid',
          },
        });
        if (
          profileId === 'production-security' &&
          invalidOrigin.headers()['access-control-allow-origin'] === 'https://attacker.invalid'
        ) {
          throw new Error('invalid origin candidate received CORS authorization');
        }
        if (profileId === 'operational' && !invalidOrigin.ok()) {
          throw new Error('operational origin control failed');
        }
        observations.push(
          profileId === 'production-security'
            ? `invalid-origin:${tenant}`
            : `invalid-origin:${tenant}:profile-not-eligible`,
          `fixture-session-token:${tenant}`,
        );
      }
      return observations;
    });
    const administration = await publicResult('administration', async () => {
      const manifest = resolvePublicFixtureManifest({
        appBaseUrl: endpoints.app,
        bffBaseUrl: endpoints.bff,
      });
      const actors = new Map(
        manifest.superAdmin.actors.map((actor) => [actor.permissionSet, actor]),
      );
      const full = actors.get('full');
      const limited = actors.get('limited');
      const unprivileged = actors.get('unprivileged');
      if (full === undefined || limited === undefined || unprivileged === undefined) {
        throw new Error('administrative fixture actor matrix is incomplete');
      }
      const tokenFor = (reference: string): string =>
        readProtectedRuntimeCredential(endpoints.credentialManifestPath, reference);
      const organizationsUrl = `${endpoints.porta}/api/admin/organizations`;
      const observations: string[] = [];
      for (const actor of [full, limited]) {
        const response = await api.get(organizationsUrl, {
          headers: { Authorization: `Bearer ${tokenFor(actor.tokenCredentialRef)}` },
        });
        if (!response.ok()) throw new Error(`${actor.permissionSet} admin read control failed`);
        observations.push(`admin:${actor.permissionSet}-read`);
      }
      const denied = await api.get(organizationsUrl, {
        headers: { Authorization: `Bearer ${tokenFor(unprivileged.tokenCredentialRef)}` },
      });
      if (denied.status() !== 403) throw new Error('unprivileged admin control was not forbidden');
      observations.push('admin:unprivileged-denied');
      const limitedWrite = await api.post(organizationsUrl, {
        headers: { Authorization: `Bearer ${tokenFor(limited.tokenCredentialRef)}` },
        data: { name: 'Must not be created', slug: 'must-not-be-created' },
      });
      if (limitedWrite.status() !== 403) throw new Error('limited administrator write was allowed');
      observations.push('admin:limited-write-denied');
      const runtime = readPublicRuntimeFixtureManifest(endpoints.fixtureManifestPath);
      const entities = new Map(runtime.entities.map((entry) => [entry.alias, entry.id]));
      for (const tenant of [manifest.alpha, manifest.bravo]) {
        const organizationId = entities.get(tenant.id);
        if (organizationId === undefined) throw new Error('fixture organization ID is absent');
        const users = await api.get(
          `${endpoints.porta}/api/admin/organizations/${organizationId}/users?pageSize=100`,
          { headers: { Authorization: `Bearer ${tokenFor(full.tokenCredentialRef)}` } },
        );
        if (!users.ok()) throw new Error('admin fixture-user inventory failed');
        const body = z
          .object({
            data: z.array(z.object({ email: z.string(), status: z.string() }).passthrough()),
          })
          .passthrough()
          .parse(await users.json());
        for (const expected of tenant.users) {
          const actual = body.data.find(
            (entry) => entry.email === `${expected.id}@test-harness.local`,
          );
          if (actual?.status !== expected.state)
            throw new Error('fixture user state differs from contract');
        }
        observations.push(`fixture-users:${tenant.id}`);
        const twoFactorUser = tenant.users.find((entry) => entry.twoFactorEnabled);
        const twoFactorUserId =
          twoFactorUser === undefined ? undefined : entities.get(twoFactorUser.id);
        if (twoFactorUserId === undefined) throw new Error('two-factor fixture user is absent');
        const status = await api.get(
          `${endpoints.porta}/api/admin/organizations/${organizationId}/users/${twoFactorUserId}/two-factor/status`,
          { headers: { Authorization: `Bearer ${tokenFor(full.tokenCredentialRef)}` } },
        );
        if (!status.ok()) throw new Error('fixture two-factor status failed');
        const statusBody = z
          .object({ data: z.object({ enabled: z.literal(true) }).passthrough() })
          .passthrough()
          .parse(await status.json());
        if (statusBody.data.enabled !== true) throw new Error('fixture two-factor state differs');
        observations.push(`fixture-two-factor:${tenant.id}`);
      }
      return observations;
    });
    return [administration, browser, email, fixtures, http, protocol];
  } finally {
    await api.dispose();
  }
}

/** Executes one fixed lifecycle child with a bounded process-group deadline. */
async function runLifecycleChild(
  action: 'reset' | 'project',
  options: readonly string[] = [],
): Promise<void> {
  const root = resolve(import.meta.dirname, '../..');
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'test-harness/scripts/lifecycle.ts', action, ...options],
    {
      cwd: root,
      env: process.env,
      detached: process.platform !== 'win32',
      shell: false,
      stdio: 'inherit',
    },
  );
  const timeout = setTimeout(() => {
    if (child.pid === undefined) return;
    try {
      if (process.platform === 'win32') child.kill('SIGTERM');
      else process.kill(-child.pid, 'SIGTERM');
    } catch {
      // A concurrent natural exit already satisfies the timeout cleanup goal.
    }
  }, 1_800_000);
  const code = await new Promise<number>((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', (exitCode) => resolveExit(exitCode ?? 30));
  }).finally(() => clearTimeout(timeout));
  if (code !== 0) throw new Error(`fixture lifecycle child failed: ${action}`);
}

/** Runs one shell-free observation command and returns bounded standard output. */
async function observationOutput(command: string, arguments_: readonly string[]): Promise<string> {
  const root = resolve(import.meta.dirname, '../..');
  return new Promise((resolveOutput, rejectOutput) => {
    const child = spawn(command, arguments_, {
      cwd: root,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > 64 * 1024) child.kill('SIGTERM');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 64 * 1024) child.kill('SIGTERM');
    });
    child.once('error', rejectOutput);
    child.once('exit', (code) => {
      if (code === 0) resolveOutput(stdout.trim());
      else rejectOutput(new Error(`fixture observation command failed: ${command}`));
    });
  });
}

/** Resolves one exact active Compose service container from the canonical run identity. */
async function activeServiceContainer(service: 'postgres' | 'redis'): Promise<string> {
  const active = activeEndpoints();
  const output = await observationOutput('docker', [
    'ps',
    '-aq',
    '--no-trunc',
    '--filter',
    `label=com.docker.compose.project=${active.composeProject}`,
    '--filter',
    `label=com.docker.compose.service=${service}`,
  ]);
  const identifiers = output.split(/\s+/u).filter(Boolean);
  if (identifiers.length !== 1 || identifiers[0] === undefined) {
    throw new Error(`active ${service} container identity is not unique`);
  }
  return identifiers[0];
}

/** One exact mutable-store observation used for both drift counts and identity comparison. */
export interface ObservedFixtureState {
  /** Aggregate counts retained as a small human-readable drift summary. */
  readonly counts: FixtureResidueSnapshot;
  /** Canonical redacted state that prevents equal counts from hiding replacement. */
  readonly digests: FixtureStoreDigests;
}

/** Observes mutable stores without retaining bearer values or production-derived expectations. */
export async function observeFixtureState(): Promise<ObservedFixtureState> {
  const endpoints = activeEndpoints();
  const postgres = await activeServiceContainer('postgres');
  const redis = await activeServiceContainer('redis');
  const durableRows = Number(
    await observationOutput('docker', [
      'exec',
      postgres,
      'psql',
      '-U',
      'porta',
      '-d',
      'porta',
      '-At',
      '-c',
      'SELECT (SELECT count(*) FROM organizations) + (SELECT count(*) FROM users) + (SELECT count(*) FROM clients) + (SELECT count(*) FROM roles) + (SELECT count(*) FROM oidc_payloads)',
    ]),
  );
  const sessions = Number(
    await observationOutput('docker', [
      'exec',
      postgres,
      'psql',
      '-U',
      'porta',
      '-d',
      'porta',
      '-At',
      '-c',
      'SELECT count(*) FROM admin_sessions',
    ]),
  );
  const cacheEntries = Number(
    await observationOutput('docker', ['exec', redis, 'redis-cli', 'DBSIZE']),
  );
  const mailResponse = await fetch(`${endpoints.mailhog}/api/v2/messages`);
  if (!mailResponse.ok) throw new Error('MailHog residue observation failed');
  const mailPayload: unknown = await mailResponse.json();
  const mailItems = z
    .object({ items: z.array(z.unknown()) })
    .passthrough()
    .parse(mailPayload).items;
  const mailMessages = mailItems.length;
  for (const count of [durableRows, sessions, cacheEntries, mailMessages]) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('fixture residue is invalid');
  }
  const databaseIdentity = await observationOutput('docker', [
    'exec',
    postgres,
    'psql',
    '-U',
    'porta',
    '-d',
    'porta',
    '-At',
    '-c',
    `SELECT kind || ':' || identity FROM (
       SELECT 'organization' AS kind, slug || ':' || status AS identity FROM organizations
       UNION ALL
       SELECT 'user', o.slug || ':' || u.email::text || ':' || u.status || ':' || u.two_factor_enabled::text
         FROM users u JOIN organizations o ON o.id = u.organization_id
       UNION ALL
       SELECT 'client', o.slug || ':' || c.client_name || ':' || c.client_type
         FROM clients c JOIN organizations o ON o.id = c.organization_id
       UNION ALL
       SELECT 'role', a.slug || ':' || r.slug FROM roles r JOIN applications a ON a.id = r.application_id
     ) identity_rows ORDER BY kind, identity`,
  ]);
  const sessionTokenIdentity = await observationOutput('docker', [
    'exec',
    postgres,
    'psql',
    '-U',
    'porta',
    '-d',
    'porta',
    '-At',
    '-c',
    `SELECT identity FROM (
       SELECT 'session:' || s.grant_id || ':' || o.slug || ':' || u.email::text || ':' || c.client_name AS identity
         FROM admin_sessions s
         JOIN organizations o ON o.id = s.organization_id
         JOIN users u ON u.id = s.user_id
         JOIN clients c ON c.id = s.client_id
       UNION ALL
       SELECT 'token:' || COALESCE(p.grant_id, '') || ':' || p.type || ':' ||
              COALESCE(c.client_name, CASE WHEN p.payload->>'clientId' = 'porta-admin-assurance'
                                           THEN 'porta-admin-assurance' ELSE 'unmapped-client' END)
         FROM oidc_payloads p
         LEFT JOIN clients c ON c.client_id = p.payload->>'clientId'
     ) identity_rows ORDER BY identity`,
  ]);
  const redisIdentity = await observationOutput('docker', ['exec', redis, 'redis-cli', '--scan']);
  const mailIdentity = mailItems.map((item) => stableDigest(item)).sort();
  return {
    counts: { durableRows, cacheEntries, mailMessages, sessions },
    digests: {
      database: stableDigest(databaseIdentity.split(/\r?\n/u).filter(Boolean)),
      sessionAndToken: stableDigest(sessionTokenIdentity.split(/\r?\n/u).filter(Boolean)),
      redis: stableDigest(redisIdentity.split(/\r?\n/u).filter(Boolean).sort()),
      mail: stableDigest(mailIdentity),
    },
  };
}

/** Computes absolute store-count drift from the independently observed fresh baseline. */
function residueDifference(
  baseline: FixtureResidueSnapshot,
  observed: FixtureResidueSnapshot,
): FixtureResidueSnapshot {
  return {
    durableRows: Math.abs(observed.durableRows - baseline.durableRows),
    cacheEntries: Math.abs(observed.cacheEntries - baseline.cacheEntries),
    mailMessages: Math.abs(observed.mailMessages - baseline.mailMessages),
    sessions: Math.abs(observed.sessions - baseline.sessions),
  };
}

/** Runs every project in one deterministic order and resets all resulting mutable state. */
async function runSequence(order: 'reverse' | 'shuffled'): Promise<FixtureSequenceOutcome> {
  if (activeEndpoints().profile !== 'operational') {
    throw new Error('fixture sequences require the operational runtime profile');
  }
  const projectsByOrder = {
    reverse: ['compatibility', 'security', 'protocol', 'bff', 'spa'],
    shuffled: ['security', 'spa', 'compatibility', 'bff', 'protocol'],
  } as const;
  await runLifecycleChild('reset');
  const baselineState = await observeFixtureState();
  const baselineResults = await verifyPublicPostconditions('operational');
  if (baselineResults.some((result) => result.status !== 'passed')) {
    throw new Error('fresh fixture baseline postconditions failed');
  }
  const projectResults: Array<{ readonly project: string; readonly status: 'passed' }> = [];
  for (const project of projectsByOrder[order]) {
    await runLifecycleChild('reset');
    await runLifecycleChild('project', ['--name', project]);
    projectResults.push({ project, status: 'passed' });
  }
  await runLifecycleChild('reset');
  const publicResults = await verifyPublicPostconditions('operational');
  if (publicResults.some((result) => result.status !== 'passed')) {
    throw new Error('fixture sequence postconditions failed');
  }
  await runLifecycleChild('reset');
  const finalState = await observeFixtureState();
  const outcomeDigest = createHash('sha256')
    .update(
      JSON.stringify({
        projects: projectResults.sort((left, right) => left.project.localeCompare(right.project)),
        publicResults: [...publicResults]
          .map(({ boundary, status }) => ({ boundary, status }))
          .sort((left, right) => left.boundary.localeCompare(right.boundary)),
      }),
    )
    .digest('hex');
  return {
    outcomeDigest,
    residue: residueDifference(baselineState.counts, finalState.counts),
    baselineStoreDigests: baselineState.digests,
    finalStoreDigests: finalState.digests,
  };
}

/** Loads the implemented fixture ontology; later boundaries fail closed until installed. */
export async function loadFixtureAssuranceSurface(): Promise<FixtureAssuranceSurface> {
  const activeRun = resolve(import.meta.dirname, '../.assurance-runtime/active-run.json');
  const manifest = existsSync(activeRun)
    ? resolvePublicFixtureManifest({
        appBaseUrl: activeEndpoints().app,
        bffBaseUrl: activeEndpoints().bff,
      })
    : publicFixtureManifest;
  return {
    publicManifest: manifest,
    protectedCredentials: protectedCredentialDescriptors,
    projects,
    profiles,
    observeTenantResource,
    runSequence,
    verifyPublicPostconditions,
  };
}
