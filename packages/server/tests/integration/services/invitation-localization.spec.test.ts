/** Localized preview and SMTP delivery retain invitation storage and transaction authority. */
import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import Koa from 'koa';
// The production body parser supplies Koa's request-body type augmentation.
import type {} from 'koa-bodyparser';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n } from '../../../src/auth/i18n.js';
import { setEmailTransport } from '../../../src/auth/email-service.js';
import { createSmtpTransport } from '../../../src/auth/email-transport.js';
import type { EmailTransport } from '../../../src/auth/email-transport.js';
import { config } from '../../../src/config/index.js';
import { getPool } from '../../../src/lib/database.js';
import { clearSystemConfigCache } from '../../../src/lib/system-config.js';
import { adminMutationAudit } from '../../../src/middleware/admin-mutation-audit.js';
import { findSuperAdminOrganization } from '../../../src/organizations/repository.js';
import { createUserRouter } from '../../../src/routes/users.js';
import { inviteUser } from '../../../src/users/invite-service.js';
import { MailHogClient } from '../../e2e/helpers/mailhog.js';
import { seedBaseData, truncateAllTables } from '../helpers/database.js';
import { createTestOrganization, createTestUser } from '../helpers/factories.js';
import { flushTestRedis } from '../helpers/redis.js';

// Identity is supplied by the fixture; route dispatch and permission checks remain real.
vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_context: object, next: () => Promise<void>) => next(),
}));

const mailhog = new MailHogClient();
let organization: Awaited<ReturnType<typeof createTestOrganization>>;
let administrator: Awaited<ReturnType<typeof createTestUser>>;
let controlOrganization: Awaited<ReturnType<typeof createTestOrganization>>;

/** Use the same persisted administrator and display name for preview and invitation creation. */
function actor() {
  return { kind: 'admin' as const, userId: administrator.id, displayName: 'Beheerder' };
}

/** Dispatch through the real router, using a trusted identity rather than a browser login fixture. */
async function preview(body: unknown, permissions = ['admin:user:invite']) {
  const socket = new Socket();
  const incoming = new IncomingMessage(socket);
  incoming.method = 'POST';
  incoming.url = `/api/admin/organizations/${organization.id}/users/invite/preview`;
  incoming.headers['accept-language'] = 'fr-FR';
  const router = createUserRouter();
  const context = Object.assign(new Koa().createContext(incoming, new ServerResponse(incoming)), {
    params: { orgId: organization.id },
    router,
  });
  context.request.body = body;
  context.state = {
    requestId: randomUUID(),
    organization: controlOrganization,
    adminUser: { ...administrator, roles: [], permissions },
  };
  try {
    await adminMutationAudit()(context, async () => {
      await router.routes()(context, async () => undefined);
    });
    return context;
  } finally {
    socket.destroy();
  }
}

/** Reject an unexpected HTTP envelope without casting unknown response data. */
function previewContent(body: unknown) {
  if (typeof body !== 'object' || body === null || !('data' in body)) {
    throw new Error('Expected a preview response envelope');
  }
  const data: unknown = body.data;
  if (
    typeof data !== 'object' ||
    data === null ||
    !('subject' in data) ||
    typeof data.subject !== 'string' ||
    !('html' in data) ||
    typeof data.html !== 'string' ||
    !('text' in data) ||
    typeof data.text !== 'string'
  ) {
    throw new Error('Expected complete invitation preview content');
  }
  return { subject: data.subject, html: data.html, text: data.text };
}

/** Read only non-secret durable fields; the query deliberately excludes token hashes and tokens. */
async function durableState(email: string) {
  const invitations = await getPool().query<{
    id: string;
    locale: string | null;
    expires_at: Date;
    used_at: Date | null;
    user_id: string | null;
    invited_by: string | null;
  }>(
    `SELECT id, locale, expires_at, used_at, user_id, invited_by
       FROM invitation_tokens WHERE organization_id = $1 AND email = $2`,
    [organization.id, email],
  );
  const audits = await getPool().query<{ actor_id: string; actor_type: string }>(
    `SELECT actor_id, actor_type FROM audit_log
      WHERE organization_id = $1 AND event_type = 'user.invited'`,
    [organization.id],
  );
  return { invitations: invitations.rows, audits: audits.rows };
}

/** Extract only the trusted tenant invitation destination, without including its token in failures. */
function invitationUrl(text: string): string {
  const prefix = `${config.issuerBaseUrl}/${organization.slug}/auth/accept-invite/`;
  const token = text.split(prefix)[1]?.match(/^[A-Za-z0-9_-]+/)?.[0];
  if (!token) throw new Error('Expected the trusted invitation destination');
  return `${prefix}${token}`;
}

/** Replace just the known destination; copy, whitespace, markup and escaping stay untouched. */
function withoutInvitationUrl(content: string, url: string): string {
  return content.replaceAll(url, '[INVITATION_URL]');
}

beforeAll(async () => {
  await initI18n();
});
beforeEach(async () => {
  await truncateAllTables();
  await seedBaseData();
  await flushTestRedis();
  clearSystemConfigCache();
  await mailhog.clearAll();
  const control = await findSuperAdminOrganization();
  if (!control) throw new Error('Expected the seeded control-plane organization');
  controlOrganization = control;
  administrator = await createTestUser(control.id, {
    email: `inviter-${randomUUID()}@test.example.com`, givenName: 'Beheerder', familyName: null,
  });
  organization = await createTestOrganization({ name: 'Acme', brandingCompanyName: 'Acme' });
  setEmailTransport(createSmtpTransport());
});
afterEach(async () => {
  setEmailTransport(null);
  clearSystemConfigCache();
  vi.restoreAllMocks();
  await mailhog.clearAll();
});

describe('localized invitation preview and real SMTP delivery', () => {
  it.each([
    ['nl', 'en', 'nl'], ['nl-NL', 'en', 'nl'], ['fr', 'nl', 'nl'],
    [undefined, 'nl', 'nl'], [undefined, 'en', 'en'], ['en', 'nl', 'en'],
  ] as const)(
    'should render input %s with organization %s as %s without rewriting its stored locale',
    async (locale, orgLocale, selected) => {
      await getPool().query('UPDATE organizations SET default_locale = $1 WHERE id = $2', [
        orgLocale, organization.id,
      ]);
      const input = {
        email: `invited-${randomUUID()}@test.example.com`,
        givenName: 'Ada', familyName: 'Lovelace', personalMessage: 'Welcome & enjoy', locale,
      };
      const originalInput = structuredClone(input);
      const smtp = createSmtpTransport();
      const sent = vi.spyOn(smtp, 'send');
      setEmailTransport(smtp);
      const response = await preview(input);
      expect(response.status).toBe(200);
      const rendered = previewContent(response.body);
      expect(sent.mock.calls.length).toBe(0);
      expect(await durableState(input.email)).toEqual({ invitations: [], audits: [] });
      expect((await mailhog.getMessages()).length).toBe(0);

      const earliestExpiry = Date.now() + 604800_000;
      const result = await inviteUser({ organizationId: organization.id, input, actor: actor() });
      const latestExpiry = Date.now() + 604800_000;
      expect(result).toMatchObject({ email: input.email, invitationSent: true, emailDelivery: 'sent' });
      expect(sent.mock.calls.length).toBe(1);
      const outgoing = sent.mock.calls[0]?.[0];
      if (!outgoing) throw new Error('Expected exactly one SMTP submission');
      const previewUrl = invitationUrl(rendered.text);
      const sentUrl = invitationUrl(outgoing.text);
      expect(previewUrl.endsWith('/PREVIEW_TOKEN')).toBe(true);
      expect(sentUrl === previewUrl).toBe(false);
      expect(outgoing.subject).toBe(rendered.subject);
      // Compare complete renderer output before MIME encoding, without newline normalization.
      for (const format of ['html', 'text'] as const) {
        expect(outgoing[format].includes(sentUrl)).toBe(true);
        expect(rendered[format].includes(previewUrl)).toBe(true);
        expect(withoutInvitationUrl(outgoing[format], sentUrl)).toBe(
          withoutInvitationUrl(rendered[format], previewUrl),
        );
      }
      const subject = selected === 'nl'
        ? 'Beheerder heeft u uitgenodigd voor Acme' : 'Beheerder has invited you to Acme';
      const action = selected === 'nl' ? 'Uitnodiging accepteren' : 'Accept Invitation';
      const duration = selected === 'nl' ? '7 dagen' : '7 days';
      expect(rendered.subject).toBe(subject);
      expect(withoutInvitationUrl(rendered.html, previewUrl)).toContain(`lang="${selected}"`);
      const received = await mailhog.waitForMessage(input.email);
      expect(received.subject).toBe(subject);
      for (const content of [received.html, received.body]) {
        const sanitized = withoutInvitationUrl(content, sentUrl);
        expect(sanitized).toContain(action);
        expect(sanitized).toContain(duration);
        expect(content.includes(sentUrl)).toBe(true);
      }
      expect((await mailhog.getMessages()).length).toBe(1);

      const stored = await durableState(input.email);
      expect(stored.invitations).toEqual([{
        id: result.invitationId, locale: locale ?? null, expires_at: new Date(result.expiresAt),
        used_at: null, user_id: null, invited_by: administrator.id,
      }]);
      expect(stored.audits).toEqual([{ actor_id: administrator.id, actor_type: 'user' }]);
      expect(Date.parse(result.expiresAt)).toBeGreaterThanOrEqual(earliestExpiry);
      expect(Date.parse(result.expiresAt)).toBeLessThanOrEqual(latestExpiry);
      expect(input).toEqual(originalInput);
    },
  );

  it('should preserve the committed invitation and audit when delivery fails without retrying', async () => {
    const input = { email: `failed-${randomUUID()}@test.example.com`, locale: 'nl-NL' };
    let atDelivery: Awaited<ReturnType<typeof durableState>> | undefined;
    const send = vi.fn<EmailTransport['send']>(async () => {
      atDelivery = await durableState(input.email);
      throw new Error('Test delivery unavailable');
    });
    setEmailTransport({ send });
    const result = await inviteUser({ organizationId: organization.id, input, actor: actor() });
    expect(result).toMatchObject({ email: input.email, invitationSent: false, emailDelivery: 'failed' });
    expect(send.mock.calls.length).toBe(1);
    if (!atDelivery) throw new Error('Expected delivery to observe the committed invitation');
    expect(atDelivery.invitations).toEqual([{
      id: result.invitationId, locale: 'nl-NL', expires_at: new Date(result.expiresAt),
      used_at: null, user_id: null, invited_by: administrator.id,
    }]);
    expect(atDelivery.audits).toEqual([{ actor_id: administrator.id, actor_type: 'user' }]);
    expect(await durableState(input.email)).toEqual(atDelivery);
    expect((await mailhog.getMessages()).length).toBe(0);
  });

  it('should deny preview without invitation permission and leave storage and SMTP untouched', async () => {
    const input = { email: `denied-${randomUUID()}@test.example.com`, locale: 'nl' };
    const smtp = createSmtpTransport();
    const sent = vi.spyOn(smtp, 'send');
    setEmailTransport(smtp);
    const response = await preview(input, []);
    expect(response.status).toBe(403);
    expect(sent.mock.calls.length).toBe(0);
    expect(await durableState(input.email)).toEqual({ invitations: [], audits: [] });
    expect((await mailhog.getMessages()).length).toBe(0);
  });
});
