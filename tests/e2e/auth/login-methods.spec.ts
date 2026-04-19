/**
 * Login methods enforcement — E2E tests.
 *
 * Validates that the organization-default + per-client override
 * login-method configuration is enforced end-to-end across the
 * real HTTP surface:
 *
 *   • Password-only client   → POST /login succeeds, POST /magic-link → 403
 *   • Magic-link-only client → POST /magic-link succeeds, POST /login → 403
 *   • Both-methods client    → both POSTs accepted (baseline)
 *   • Org default governs    → client with `loginMethods: null` inherits org
 *   • Forgot-password        → blocked with 403 on magic-link-only clients
 *
 * Uses direct-DB factory helpers to create tenants with the desired
 * login-method configuration, then drives the OIDC interaction flow
 * through the real server. The enforcement path runs **before** user
 * lookup, CSRF, and rate-limit, so disabled-method POSTs return 403
 * with the localized error message regardless of credential validity.
 *
 * @see plans/client-login-methods/99-execution-plan.md — Phase 9, task 9.1.1
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { TestHttpClient } from '../helpers/http-client.js';
import { OidcTestClient } from '../helpers/oidc-client.js';
import { truncateAllTables, seedBaseData } from '../../integration/helpers/database.js';
import {
  createTestOrganization,
  createTestApplication,
  createTestClientWithSecret,
  createTestUserWithPassword,
} from '../../integration/helpers/factories.js';
import { DEFAULT_TEST_PASSWORD } from '../../helpers/constants.js';
import type { Organization } from '../../../src/organizations/types.js';
import type { Client } from '../../../src/clients/types.js';
import type { User } from '../../../src/users/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A self-contained tenant-and-user setup used by each scenario.
 *
 * Each test constructs its own tenant with explicit login-method config so
 * the scenarios stay readable and independent.
 */
interface ScenarioTenant {
  org: Organization;
  client: Client;
  clientSecret: string;
  user: User;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Login Methods Enforcement (E2E)', () => {
  let baseUrl: string;
  let http: TestHttpClient;

  beforeAll(() => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'http://localhost:3000';
  });

  beforeEach(async () => {
    // Each scenario starts with a clean slate — factories insert the
    // exact entities the scenario needs.
    await truncateAllTables();
    await seedBaseData();
    http = new TestHttpClient(baseUrl);
  });

  // ── Helpers ────────────────────────────────────────────────────

  /**
   * Build a tenant with caller-controlled login-method configuration.
   *
   * @param options - Overrides for the org's default methods and the
   *                  client's loginMethods override (undefined = omit,
   *                  null = explicit "inherit", array = explicit override)
   */
  async function createScenarioTenant(options: {
    orgName: string;
    defaultLoginMethods?: ('password' | 'magic_link')[];
    clientLoginMethods?: ('password' | 'magic_link')[] | null;
  }): Promise<ScenarioTenant> {
    const org = await createTestOrganization({
      name: options.orgName,
      ...(options.defaultLoginMethods !== undefined && {
        defaultLoginMethods: options.defaultLoginMethods,
      }),
    });
    const app = await createTestApplication();
    const created = await createTestClientWithSecret(org.id, app.id, {
      grantTypes: ['authorization_code', 'refresh_token'],
      redirectUris: ['http://localhost:3001/callback'],
      responseTypes: ['code'],
      requirePkce: true,
      ...(options.clientLoginMethods !== undefined && {
        loginMethods: options.clientLoginMethods,
      }),
    });
    const { user } = await createTestUserWithPassword(org.id);
    return {
      org,
      client: created.client,
      clientSecret: created.clientSecret,
      user,
    };
  }

  /**
   * Drive a fresh OIDC authorization request through to the login page,
   * returning the interaction UID and CSRF token ready for a POST.
   */
  async function startFlow(tenant: ScenarioTenant): Promise<{
    uid: string;
    csrfToken: string;
  }> {
    const oidc = new OidcTestClient(
      baseUrl,
      tenant.org.slug,
      tenant.client.clientId,
      tenant.clientSecret,
    );
    const { url } = oidc.buildAuthorizationUrl();

    const authResponse = await http.get(url);
    expect([302, 303]).toContain(authResponse.status);
    expect(authResponse.location).toContain('/interaction/');

    const loginResponse = await http.get(authResponse.location!);
    expect(loginResponse.status).toBe(200);

    const csrfToken = http.extractCsrfToken(loginResponse.body);
    expect(csrfToken).toBeTruthy();

    const uid = authResponse.location!
      .split('/interaction/')[1]
      ?.split('/')[0]
      ?.split('?')[0];
    expect(uid).toBeTruthy();

    return { uid: uid!, csrfToken: csrfToken! };
  }

  // ── Scenario 1: password-only client blocks magic-link POST ────

  it('blocks POST /magic-link when client is password-only', async () => {
    const tenant = await createScenarioTenant({
      orgName: 'Password Only E2E',
      clientLoginMethods: ['password'],
    });
    const { uid, csrfToken } = await startFlow(tenant);

    // Password login should still succeed (or at least not 403)
    const loginResp = await http.post(`/interaction/${uid}/login`, {
      email: tenant.user.email,
      password: DEFAULT_TEST_PASSWORD,
      _csrf: csrfToken,
      _csrfStored: csrfToken,
    });
    expect(loginResp.status).not.toBe(403);

    // Fresh flow for the magic-link request (login consumed the interaction)
    const second = await createScenarioTenant({
      orgName: 'Password Only E2E (retry)',
      clientLoginMethods: ['password'],
    });
    const { uid: uid2, csrfToken: csrf2 } = await startFlow(second);

    // Magic-link POST must be rejected with 403
    const magicResp = await http.post(`/interaction/${uid2}/magic-link`, {
      email: second.user.email,
      _csrf: csrf2,
      _csrfStored: csrf2,
    });
    expect(magicResp.status).toBe(403);
  });

  // ── Scenario 2: magic-link-only client blocks password POST ────

  it('blocks POST /login when client is magic-link-only', async () => {
    const tenant = await createScenarioTenant({
      orgName: 'Magic Link Only E2E',
      clientLoginMethods: ['magic_link'],
    });
    const { uid, csrfToken } = await startFlow(tenant);

    // Password POST must be rejected with 403 — before credential validation
    const loginResp = await http.post(`/interaction/${uid}/login`, {
      email: tenant.user.email,
      password: DEFAULT_TEST_PASSWORD,
      _csrf: csrfToken,
      _csrfStored: csrfToken,
    });
    expect(loginResp.status).toBe(403);
  });

  // ── Scenario 3: both-methods client accepts both POSTs ─────────

  it('accepts both POSTs when client allows both methods', async () => {
    const tenant = await createScenarioTenant({
      orgName: 'Both Methods E2E',
      clientLoginMethods: ['password', 'magic_link'],
    });

    // Password path
    const first = await startFlow(tenant);
    const loginResp = await http.post(`/interaction/${first.uid}/login`, {
      email: tenant.user.email,
      password: DEFAULT_TEST_PASSWORD,
      _csrf: first.csrfToken,
      _csrfStored: first.csrfToken,
    });
    expect(loginResp.status).not.toBe(403);

    // Magic-link path (fresh interaction)
    const second = await createScenarioTenant({
      orgName: 'Both Methods E2E (retry)',
      clientLoginMethods: ['password', 'magic_link'],
    });
    const { uid: uid2, csrfToken: csrf2 } = await startFlow(second);
    const magicResp = await http.post(`/interaction/${uid2}/magic-link`, {
      email: second.user.email,
      _csrf: csrf2,
      _csrfStored: csrf2,
    });
    expect(magicResp.status).not.toBe(403);
  });

  // ── Scenario 4: client inherits when loginMethods is null ──────

  it('inherits organization defaults when client override is null', async () => {
    // Org default = password-only; client explicitly sets loginMethods = null
    const tenant = await createScenarioTenant({
      orgName: 'Inherit Password Only E2E',
      defaultLoginMethods: ['password'],
      clientLoginMethods: null,
    });
    const { uid, csrfToken } = await startFlow(tenant);

    // Magic-link POST must be rejected — org default excludes magic_link
    const magicResp = await http.post(`/interaction/${uid}/magic-link`, {
      email: tenant.user.email,
      _csrf: csrfToken,
      _csrfStored: csrfToken,
    });
    expect(magicResp.status).toBe(403);
  });

  // ── Scenario 5: client override can be broader than org default ─

  it('applies client override even when broader than org default', async () => {
    // Org default = password-only; client explicitly allows magic_link too
    const tenant = await createScenarioTenant({
      orgName: 'Client Broader Than Org E2E',
      defaultLoginMethods: ['password'],
      clientLoginMethods: ['password', 'magic_link'],
    });
    const { uid, csrfToken } = await startFlow(tenant);

    // Magic-link POST should NOT be blocked — client override wins
    const magicResp = await http.post(`/interaction/${uid}/magic-link`, {
      email: tenant.user.email,
      _csrf: csrfToken,
      _csrfStored: csrfToken,
    });
    expect(magicResp.status).not.toBe(403);
  });

  // ── Scenario 6: forgot-password blocked on magic-link-only ─────

  it('blocks POST /auth/forgot-password when org disables password', async () => {
    // Org default = magic-link-only → password reset must be 403 even though
    // the route is org-scoped (no client_id in URL). Resolver uses
    // resolveLoginMethods(org, { loginMethods: null }) which returns
    // org.defaultLoginMethods verbatim.
    const tenant = await createScenarioTenant({
      orgName: 'Forgot Password Blocked E2E',
      defaultLoginMethods: ['magic_link'],
      clientLoginMethods: null,
    });

    // GET the forgot-password page to obtain a CSRF token
    const page = await http.get(`/${tenant.org.slug}/auth/forgot-password`);
    // The route may itself 403 on GET — either way, we verify the enforcement.
    if (page.status === 403) {
      // GET enforcement already blocks — scenario confirmed.
      return;
    }
    expect(page.status).toBe(200);
    const csrfToken = http.extractCsrfToken(page.body);
    expect(csrfToken).toBeTruthy();

    const postResp = await http.post(
      `/${tenant.org.slug}/auth/forgot-password`,
      {
        email: tenant.user.email,
        _csrf: csrfToken,
        _csrfStored: csrfToken,
      },
    );
    // Enforcement layer returns 403 before user lookup
    expect(postResp.status).toBe(403);
  });
});
