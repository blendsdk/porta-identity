/**
 * Trust-driven OIDC consent gate specification.
 *
 * DEF-21 makes the consent page reachable on purpose. A same-organization
 * client is only auto-consented while it is trusted; a client marked
 * `requireConsent` must show the consent page for every missing scope. These
 * tests are immutable oracles for the gate in the consent interaction:
 *
 *   1. Trusted client, missing scopes, no `prompt=consent` -> auto-consent.
 *   2. `requireConsent` client, missing scopes -> consent page.
 *   3. Trusted client, missing scopes, `prompt=consent` -> consent page.
 *   4. Nothing missing, even with `prompt=consent` -> finish silently.
 *   5. `prompt=none` with a missing scope -> `consent_required`, never a page.
 *   6. Per-scope memory: a repeat request does not re-prompt, an added scope does.
 *
 * The `requireConsent` client is created through the admin HTTP API with a raw
 * JSON body so this file compiles before the typed field exists and fails
 * behaviorally until the flag is honored.
 */

import crypto from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgresAdapter } from '../../../src/oidc/postgres-adapter.js';
import { ADMIN_ROLE_DEFINITIONS } from '../../../src/lib/admin-permissions.js';
import { assignRolesToUser } from '../../../src/rbac/mapping-repository.js';
import { findSuperAdminOrganization } from '../../../src/organizations/repository.js';
import { TestHttpClient, type TestResponse } from '../helpers/http-client.js';
import { OidcTestClient } from '../helpers/oidc-client.js';
import { truncateAllTables, seedBaseData } from '../../integration/helpers/database.js';
import { flushTestRedis } from '../../integration/helpers/redis.js';
import {
  createTestApplication,
  createTestClientWithSecret,
  createTestOrganization,
  createTestRole,
  createTestUser,
  createTestUserWithPassword,
} from '../../integration/helpers/factories.js';
import { DEFAULT_TEST_PASSWORD } from '../../helpers/constants.js';
import type { User } from '../../../src/users/types.js';

/** Outcome of driving one interactive authorization request. */
interface FlowOutcome {
  /** The consent page response when one was rendered, otherwise null. */
  readonly consentPage: TestResponse | null;
  /** The client callback URL carrying a code or error, otherwise null. */
  readonly callbackUrl: string | null;
}

/** Narrow an unknown JSON value to a property bag. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** Read the interaction UID from a provider redirect location. */
function extractInteractionUid(location: string | undefined): string | null {
  if (!location) return null;
  const match = /\/interaction\/([^/?]+)/.exec(location);
  return match?.[1] ?? null;
}

/** Identify the rendered consent page by its approval form. */
function isConsentPage(response: TestResponse): boolean {
  return (
    response.status === 200 &&
    (response.headers['content-type'] ?? '').includes('text/html') &&
    response.body.includes('name="decision"') &&
    response.body.includes('/confirm')
  );
}

/** Append an OIDC prompt parameter to an already built authorization URL. */
function withPrompt(authorizationUrl: string, prompt: string): string {
  return `${authorizationUrl}&prompt=${prompt}`;
}

describe('Trust-driven consent gate (E2E)', () => {
  let baseUrl: string;
  let http: TestHttpClient;

  beforeAll(() => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'https://porta.local:3443';
  });

  beforeEach(async () => {
    await truncateAllTables();
    await flushTestRedis();
    await seedBaseData();
    http = new TestHttpClient(baseUrl);
  });

  /** Issue an opaque admin access token for the control-plane organization. */
  async function createAdminToken(): Promise<string> {
    const organization = await findSuperAdminOrganization();
    if (!organization) throw new Error('Control-plane seed is missing');
    const application = await createTestApplication({ name: 'Porta Admin', slug: 'porta-admin' });
    const role = await createTestRole(application.id, ADMIN_ROLE_DEFINITIONS.APP_ADMIN);
    const user = await createTestUser(organization.id, {
      email: `consent-${crypto.randomUUID()}@pentest.example`,
    });
    await assignRolesToUser(organization.id, user.id, [role.id]);
    const token = `consent-pentest-${crypto.randomUUID()}`;
    const now = Math.floor(Date.now() / 1000);
    await new PostgresAdapter('AccessToken').upsert(
      token,
      { accountId: user.id, iat: now, exp: now + 3600 },
      3600,
    );
    return token;
  }

  /**
   * Create a `requireConsent` client through the admin API using a raw JSON
   * body. The body deliberately includes the not-yet-typed `requireConsent`
   * field so the test fails behaviorally, not at compile time.
   */
  async function createRequireConsentClient(
    token: string,
    organizationId: string,
    applicationId: string,
  ): Promise<{ clientId: string; clientSecret: string }> {
    const response = await http.postJson(
      '/api/admin/clients',
      {
        organizationId,
        applicationId,
        clientName: 'Trust-driven consent client',
        clientType: 'confidential',
        applicationType: 'web',
        redirectUris: ['http://localhost:3001/callback'],
        grantTypes: ['authorization_code', 'refresh_token'],
        scope: 'openid profile email address',
        requireConsent: true,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );
    expect(response.status).toBe(201);

    const data = asRecord(asRecord(response.json)?.data);
    const client = asRecord(data?.client);
    const secret = asRecord(data?.secret);
    const clientId = client?.clientId;
    const clientSecret = secret?.plaintext;
    if (typeof clientId !== 'string' || typeof clientSecret !== 'string') {
      throw new Error('Admin client creation did not return a usable credential');
    }
    return { clientId, clientSecret };
  }

  /** Log in through the interactive flow and return the login POST response. */
  async function authenticate(authorizationUrl: string, user: User): Promise<TestResponse> {
    const authorization = await http.get(authorizationUrl);
    const uid = extractInteractionUid(authorization.location);
    if (!uid || !authorization.location)
      throw new Error('Authorization did not start an interaction');

    const loginPage = await http.get(authorization.location);
    const csrf = http.extractCsrfToken(loginPage.body);
    if (!csrf) throw new Error('Login page did not expose a CSRF token');

    return http.post(`/interaction/${uid}/login`, {
      email: user.email,
      password: DEFAULT_TEST_PASSWORD,
      _csrf: csrf,
    });
  }

  /** Follow a redirect chain until a consent page or the client callback is reached. */
  async function followToOutcome(
    startLocation: string | undefined,
    maxHops = 10,
  ): Promise<FlowOutcome> {
    let next = startLocation;
    for (let hop = 0; hop < maxHops && next; hop++) {
      if (next.includes('/callback')) return { consentPage: null, callbackUrl: next };
      const response = await http.get(next);
      if (isConsentPage(response)) return { consentPage: response, callbackUrl: null };
      if (response.location?.includes('/callback')) {
        return { consentPage: null, callbackUrl: response.location };
      }
      next = response.location;
    }
    return { consentPage: null, callbackUrl: next ?? null };
  }

  /** Approve a rendered consent page and follow the chain to the callback. */
  async function approveConsent(consentPage: TestResponse): Promise<FlowOutcome> {
    const consentUid = /\/interaction\/([^/"']+)\/confirm/.exec(consentPage.body)?.[1];
    const csrf = http.extractCsrfToken(consentPage.body);
    if (!consentUid || !csrf)
      throw new Error('Consent page did not expose a form target and token');

    const approval = await http.post(`/interaction/${consentUid}/confirm`, {
      decision: 'approve',
      _csrf: csrf,
    });
    return followToOutcome(approval.location);
  }

  it('auto-consents a trusted same-organization client without a consent page', async () => {
    const organization = await createTestOrganization({ name: 'Trusted Consent Org' });
    const application = await createTestApplication();
    const { client, clientSecret } = await createTestClientWithSecret(
      organization.id,
      application.id,
      {
        grantTypes: ['authorization_code', 'refresh_token'],
        redirectUris: ['http://localhost:3001/callback'],
        responseTypes: ['code'],
        requirePkce: true,
      },
    );
    const { user } = await createTestUserWithPassword(organization.id);
    const oidc = new OidcTestClient(baseUrl, organization.slug, client.clientId, clientSecret);

    const login = await authenticate(oidc.buildAuthorizationUrl().url, user);
    const outcome = await followToOutcome(login.location);

    expect(outcome.consentPage).toBeNull();
    expect(outcome.callbackUrl).toContain('code=');
  });

  it('renders the consent page for a requireConsent client', async () => {
    const token = await createAdminToken();
    const organization = await createTestOrganization({ name: 'Required Consent Org' });
    const application = await createTestApplication();
    const { clientId, clientSecret } = await createRequireConsentClient(
      token,
      organization.id,
      application.id,
    );
    const { user } = await createTestUserWithPassword(organization.id);
    const oidc = new OidcTestClient(baseUrl, organization.slug, clientId, clientSecret);

    const login = await authenticate(oidc.buildAuthorizationUrl().url, user);
    const outcome = await followToOutcome(login.location);

    expect(outcome.consentPage).not.toBeNull();
    expect(outcome.consentPage!.body).toContain('/confirm');
    expect(outcome.callbackUrl).toBeNull();
  });

  it('renders the consent page when a trusted client sends prompt=consent with missing scopes', async () => {
    const organization = await createTestOrganization({ name: 'Prompt Consent Org' });
    const application = await createTestApplication();
    const { client, clientSecret } = await createTestClientWithSecret(
      organization.id,
      application.id,
      {
        grantTypes: ['authorization_code', 'refresh_token'],
        redirectUris: ['http://localhost:3001/callback'],
        responseTypes: ['code'],
        requirePkce: true,
      },
    );
    const { user } = await createTestUserWithPassword(organization.id);
    const oidc = new OidcTestClient(baseUrl, organization.slug, client.clientId, clientSecret);

    const authorizationUrl = withPrompt(oidc.buildAuthorizationUrl().url, 'consent');
    const login = await authenticate(authorizationUrl, user);
    const outcome = await followToOutcome(login.location);

    expect(outcome.consentPage).not.toBeNull();
    expect(outcome.callbackUrl).toBeNull();
  });

  it('finishes silently when nothing is missing even with prompt=consent', async () => {
    const organization = await createTestOrganization({ name: 'Nothing Missing Org' });
    const application = await createTestApplication();
    const { client, clientSecret } = await createTestClientWithSecret(
      organization.id,
      application.id,
      {
        grantTypes: ['authorization_code', 'refresh_token'],
        redirectUris: ['http://localhost:3001/callback'],
        responseTypes: ['code'],
        requirePkce: true,
      },
    );
    const { user } = await createTestUserWithPassword(organization.id);
    const oidc = new OidcTestClient(baseUrl, organization.slug, client.clientId, clientSecret);

    // First request grants the scopes through auto-consent.
    const firstLogin = await authenticate(oidc.buildAuthorizationUrl().url, user);
    const firstOutcome = await followToOutcome(firstLogin.location);
    expect(firstOutcome.callbackUrl).toContain('code=');

    // Second request forces consent, but the existing grant already covers every scope.
    const forcedAuthorization = withPrompt(oidc.buildAuthorizationUrl().url, 'consent');
    const forcedStart = await http.get(forcedAuthorization);
    const forcedOutcome = await followToOutcome(forcedStart.location);

    expect(forcedOutcome.consentPage).toBeNull();
    expect(forcedOutcome.callbackUrl).toContain('code=');
  });

  it('returns consent_required for prompt=none with a missing scope and never renders a page', async () => {
    const organization = await createTestOrganization({ name: 'Prompt None Org' });
    const application = await createTestApplication();
    const { client, clientSecret } = await createTestClientWithSecret(
      organization.id,
      application.id,
      {
        grantTypes: ['authorization_code', 'refresh_token'],
        redirectUris: ['http://localhost:3001/callback'],
        responseTypes: ['code'],
        scope: 'openid profile email phone',
        requirePkce: true,
      },
    );
    const { user } = await createTestUserWithPassword(organization.id);
    const oidc = new OidcTestClient(baseUrl, organization.slug, client.clientId, clientSecret);

    // Establish a session and grant the initial scopes.
    const firstLogin = await authenticate(
      oidc.buildAuthorizationUrl({ scope: 'openid profile email' }).url,
      user,
    );
    const firstOutcome = await followToOutcome(firstLogin.location);
    expect(firstOutcome.callbackUrl).toContain('code=');

    // `phone` is registered but not yet granted, so prompt=none must fail closed.
    const noneAuthorization = withPrompt(
      oidc.buildAuthorizationUrl({ scope: 'openid profile email phone' }).url,
      'none',
    );
    const response = await http.get(noneAuthorization);

    expect([302, 303]).toContain(response.status);
    expect(response.location).toContain('error=consent_required');
    expect(response.body).not.toContain('name="decision"');
  });

  it('remembers approved scopes: the same scopes do not re-prompt but an added scope does', async () => {
    const token = await createAdminToken();
    const organization = await createTestOrganization({ name: 'Per Scope Org' });
    const application = await createTestApplication();
    const { clientId, clientSecret } = await createRequireConsentClient(
      token,
      organization.id,
      application.id,
    );
    const { user } = await createTestUserWithPassword(organization.id);
    const oidc = new OidcTestClient(baseUrl, organization.slug, clientId, clientSecret);

    // First request must show consent, then the user approves its scopes.
    const firstLogin = await authenticate(
      oidc.buildAuthorizationUrl({ scope: 'openid profile email' }).url,
      user,
    );
    const firstOutcome = await followToOutcome(firstLogin.location);
    expect(firstOutcome.consentPage).not.toBeNull();
    const approved = await approveConsent(firstOutcome.consentPage!);
    expect(approved.callbackUrl).toContain('code=');

    // A repeat request for the same scopes is already covered by the grant.
    const repeatStart = await http.get(
      oidc.buildAuthorizationUrl({ scope: 'openid profile email' }).url,
    );
    const repeatOutcome = await followToOutcome(repeatStart.location);
    expect(repeatOutcome.consentPage).toBeNull();
    expect(repeatOutcome.callbackUrl).toContain('code=');

    // Requesting an additional registered scope must re-prompt for that scope.
    const addedStart = await http.get(
      oidc.buildAuthorizationUrl({ scope: 'openid profile email address' }).url,
    );
    const addedOutcome = await followToOutcome(addedStart.location);
    expect(addedOutcome.consentPage).not.toBeNull();
  });
});
