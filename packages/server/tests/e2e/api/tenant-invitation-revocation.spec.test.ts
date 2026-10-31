/** A real service token can revoke an emailed invitation through the SDK before public acceptance. */
import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPortaClient } from '../../../../sdk/src/index.js';
import { createNodeTransport } from '../../../../sdk/src/node.js';
import { getPool } from '../../../src/lib/database.js';
import { DEFAULT_TEST_PASSWORD } from '../../helpers/constants.js';
import { seedBaseData, truncateAllTables } from '../../integration/helpers/database.js';
import {
  createTestApplication, createTestClientWithSecret, createTestOrganization,
} from '../../integration/helpers/factories.js';
import { flushTestRedis } from '../../integration/helpers/redis.js';
import { TestHttpClient } from '../helpers/http-client.js';
import type { TestResponse } from '../helpers/http-client.js';
import { MailHogClient } from '../helpers/mailhog.js';
import { OidcTestClient } from '../helpers/oidc-client.js';

const INVITE_SCOPE = 'org:user:invite';
let baseUrl: string;
const mailhog = new MailHogClient();

/** Credential-bearing URLs and token endpoint errors must never enter failure diagnostics. */
async function privateRequest<T>(label: string, operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch { throw new Error(`${label} failed; credential-bearing diagnostics were withheld`); }
}

/** Read only the non-secret invitation identity from the documented creation envelope. */
function createdInvitationId(response: TestResponse): string {
  const envelope = response.json;
  if (typeof envelope !== 'object' || envelope === null || !('data' in envelope)) {
    throw new Error('Invitation creation must return a data envelope');
  }
  const data = envelope.data;
  if (typeof data !== 'object' || data === null ||
      !('invitationId' in data) || typeof data.invitationId !== 'string') {
    throw new Error('Invitation creation must return its invitation identifier');
  }
  return data.invitationId;
}

/** Validate the real emailed destination without printing the credential-bearing URL. */
function acceptanceDestination(link: string | null, organizationSlug: string) {
  if (!link) throw new Error('The delivered invitation must contain its acceptance link');
  let url: URL;
  try { url = new URL(link); }
  catch { throw new Error('The delivered invitation acceptance link must be a valid URL'); }
  expect(url.origin === new URL(baseUrl).origin).toBe(true);
  expect(url.pathname.startsWith(`/${organizationSlug}/auth/accept-invite/`)).toBe(true);
  const token = url.pathname.split('/').at(-1);
  if (!token) throw new Error('The delivered invitation must contain an acceptance token');
  return { path: url.pathname, token };
}

/** Assert generic rejection using booleans, so HTML or private values cannot appear in diffs. */
function expectExpired(page: TestResponse, privateValues: readonly string[]): void {
  expect(page.status).toBe(400);
  expect(page.body.includes('Invitation expired')).toBe(true);
  expect(/<html\b[^>]*\blang="en"/.test(page.body)).toBe(true);
  for (const value of privateValues) expect(page.body.includes(value)).toBe(false);
}

/** Random response nonces and CSRF fields do not distinguish otherwise identical rejection pages. */
function comparableHtml(page: TestResponse): string {
  return page.body.replace(/<input\b[^>]*>/gi, (input) =>
    /\bname=["']_?csrf["']/i.test(input)
      ? input.replace(/(\bvalue=["'])[^"']*(["'])/i, '$1[csrf]$2') : input,
  ).replace(/(\bnonce=["'])[^"']*(["'])/gi, '$1[nonce]$2');
}

/** Observe account creation without selecting password hashes or recipient profile data. */
async function recipientCount(organizationId: string, email: string): Promise<number> {
  const result = await getPool().query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM users WHERE organization_id = $1 AND email = $2',
    [organizationId, email],
  );
  return result.rows[0].count;
}

beforeAll(() => {
  const configured = process.env.TEST_SERVER_URL;
  if (!configured) throw new Error('The existing E2E server setup must provide TEST_SERVER_URL');
  baseUrl = configured;
});

beforeEach(async () => {
  await truncateAllTables();
  await seedBaseData();
  await flushTestRedis();
  await mailhog.clearAll();
  await createTestApplication({ name: 'Porta Admin', slug: 'porta-admin' });
});

describe('tenant invitation revocation through the SDK', () => {
  it('should reject public acceptance without creating an account and retain the real client audit', async () => {
    const organization = await createTestOrganization({ defaultLocale: 'en' });
    const application = await createTestApplication({ name: 'Invitation service' });
    const { client, clientSecret } = await createTestClientWithSecret(
      organization.id, application.id, {
        grantTypes: ['client_credentials'],
        scope: INVITE_SCOPE,
        tokenEndpointAuthMethod: 'client_secret_basic',
        redirectUris: ['https://example.test/callback'],
      },
    );
    const oidc = new OidcTestClient(baseUrl, organization.slug, client.clientId, clientSecret);
    const tokens = await privateRequest('Real client-credentials exchange', () =>
      oidc.clientCredentials(INVITE_SCOPE));
    expect(typeof tokens.access_token === 'string' && tokens.access_token.length > 0).toBe(true);
    const email = `revoked-recipient-${randomUUID()}@example.test`;
    const creator = new TestHttpClient(baseUrl);
    const created = await privateRequest('Tenant invitation creation', () => creator.postJson(
      `/api/organizations/${organization.id}/users/invite`,
      { email },
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json',
        },
      },
    ));
    expect(created.status).toBe(201);
    const invitationId = createdInvitationId(created);
    const message = await mailhog.waitForMessage(email);
    const destination = acceptanceDestination(mailhog.extractLink(
      message, /https?:\/\/[^\s"'<>]+\/auth\/accept-invite\/[^\s"'<>]+/,
    ), organization.slug);

    // Preserve a genuine form and its cookies before revocation, not a manufactured CSRF token.
    const recipient = new TestHttpClient(baseUrl);
    const form = await privateRequest('Read live acceptance form', () =>
      recipient.get(`${destination.path}?step=password`));
    expect(form.status).toBe(200);
    const csrf = recipient.extractCsrfToken(form.body);
    if (!csrf) throw new Error('The live invitation form must provide CSRF protection');
    expect(await recipientCount(organization.id, email)).toBe(0);

    const sdk = createPortaClient({ transport: createNodeTransport({
      baseUrl,
      apiPrefix: '/api',
      auth: { getToken: async () => tokens.access_token },
    }) });
    await privateRequest('SDK users.revokeInvitation', () => sdk.users.revokeInvitation({
      organizationId: organization.id, invitationId,
    }));

    const unknownToken = randomBytes(32).toString('base64url');
    const privateValues = [
      tokens.access_token, clientSecret, destination.token, unknownToken, csrf,
      DEFAULT_TEST_PASSWORD, email,
    ];
    // Separate readers cannot replace the cookie belonging to the previously opened form.
    const reader = new TestHttpClient(baseUrl);
    const rejected = await privateRequest('Read revoked acceptance link', () =>
      reader.get(destination.path));
    const baseline = await privateRequest('Read unknown acceptance link', () =>
      reader.get(`/${organization.slug}/auth/accept-invite/${unknownToken}`));
    expectExpired(rejected, privateValues);
    expectExpired(baseline, privateValues);
    expect(comparableHtml(rejected) === comparableHtml(baseline),
      'Revoked and unknown invitations must have the same generic rejection').toBe(true);

    const submitted = await privateRequest('Submit revoked acceptance form', () => recipient.post(
      destination.path,
      { password: DEFAULT_TEST_PASSWORD, confirmPassword: DEFAULT_TEST_PASSWORD, _csrf: csrf },
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    ));
    expectExpired(submitted, privateValues);
    expect(await recipientCount(organization.id, email)).toBe(0);

    const audit = await getPool().query<{
      actor_type: string; actor_id: string | null; actor_client_id: string | null;
      actor_client_name: string | null; organization_id: string; user_id: string | null;
      metadata: Record<string, unknown>;
    }>(`SELECT actor_type, actor_id, actor_client_id, actor_client_name, organization_id, user_id, metadata
          FROM audit_log WHERE organization_id = $1 AND event_type = 'user.invite.revoked'`,
    [organization.id]);
    // Boolean comparisons also prevent unexpected stored credentials from appearing in diffs.
    const serializedAudit = JSON.stringify(audit.rows);
    for (const value of privateValues) expect(serializedAudit.includes(value)).toBe(false);
    expect(audit.rows.length).toBe(1);
    const entry = audit.rows[0];
    expect(entry.actor_type === 'client' && entry.actor_id === null &&
      entry.actor_client_id === client.clientId && entry.actor_client_name === client.clientName &&
      entry.organization_id === organization.id && entry.user_id === null &&
      entry.metadata !== null && Object.keys(entry.metadata).length === 2 &&
      entry.metadata.invitationId === invitationId && entry.metadata.applicationId === application.id,
    'One durable client-attributed event must contain exactly the invitation and application ids').toBe(true);
  });
});
