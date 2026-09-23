import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setEmailTransport } from '../../../src/auth/email-service.js';
import { initI18n } from '../../../src/auth/i18n.js';
import { insertInvitationToken } from '../../../src/auth/token-repository.js';
import { generateToken } from '../../../src/auth/tokens.js';
import { getPool } from '../../../src/lib/database.js';
import { initTemplateEngine } from '../../../src/auth/template-engine.js';
import { createInvitationRouter } from '../../../src/routes/invitation.js';
import { createUserRouter } from '../../../src/routes/users.js';
import type { Organization } from '../../../src/organizations/types.js';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import {
  createTestApplication,
  createTestClaimDefinition,
  createTestOrganization,
  createTestRole,
  createTestUser,
} from '../helpers/factories.js';
import { flushTestRedis } from '../helpers/redis.js';

interface MutableRouteContext {
  params: Record<string, string>;
  request: { body: Record<string, unknown> };
  state: Record<string, unknown>;
  cookies: {
    get(name: string): string | undefined;
    set(name: string, value: string): void;
  };
  get(name: string): string;
  throw(status: number, message: string): never;
  ip: string;
  secure: boolean;
  status: number;
  type: string;
  body: unknown;
}

function routeContext(options: {
  params: Record<string, string>;
  body: Record<string, unknown>;
  organization?: Organization;
  adminUser?: { id: string; givenName: string | null; familyName: string | null; email: string };
  csrf?: string;
}): MutableRouteContext {
  let status = 200;
  let responseType = '';
  let responseBody: unknown;
  return {
    params: options.params,
    request: { body: options.body },
    state: {
      ...(options.organization ? { organization: options.organization } : {}),
      ...(options.adminUser ? { adminUser: options.adminUser } : {}),
    },
    cookies: {
      get: (name) => (name === '_csrf' ? options.csrf : undefined),
      set: () => undefined,
    },
    get: () => '',
    throw: (errorStatus, message) => {
      const error = new Error(message) as Error & { status: number };
      error.status = errorStatus;
      throw error;
    },
    ip: '127.0.0.1',
    secure: false,
    get status() {
      return status;
    },
    set status(value: number) {
      status = value;
    },
    get type() {
      return responseType;
    },
    set type(value: string) {
      responseType = value;
    },
    get body() {
      return responseBody;
    },
    set body(value: unknown) {
      responseBody = value;
    },
  };
}

function invitationCreationHandler() {
  const layer = createUserRouter().stack.find(
    (candidate) =>
      candidate.methods.includes('POST') &&
      candidate.path === '/api/admin/organizations/:orgId/users/invite',
  );
  expect(layer, 'POST /invite route must exist').toBeDefined();
  return layer!.stack[layer!.stack.length - 1]!;
}

function invitationAcceptanceHandler() {
  const layer = createInvitationRouter().stack.find(
    (candidate) =>
      candidate.methods.includes('POST') &&
      candidate.path === '/:orgSlug/auth/accept-invite/:token',
  );
  expect(layer, 'POST accept-invite route must exist').toBeDefined();
  return layer!.stack[layer!.stack.length - 1]!;
}

async function invoke(
  handler: ReturnType<typeof invitationCreationHandler>,
  context: MutableRouteContext,
): Promise<void> {
  await handler(context as never, async () => undefined);
}

async function storedInvitation(email: string): Promise<{
  user_id: string;
  details: Record<string, unknown> | null;
} | null> {
  const result = await getPool().query<{
    user_id: string;
    details: Record<string, unknown> | null;
  }>(
    `SELECT token.user_id, token.details
     FROM invitation_tokens token
     JOIN users account ON account.id = token.user_id
     WHERE account.email = $1`,
    [email],
  );
  return result.rows[0] ?? null;
}

describe('invitation continuity after optional preassignment deletion', () => {
  beforeAll(async () => {
    await initI18n();
    await initTemplateEngine();
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();
    setEmailTransport({
      send: async () => ({ messageId: 'test-invitation', accepted: [], rejected: [] }),
    });
  });

  afterEach(() => {
    setEmailTransport(null);
  });

  it('creates an invitation for deployment-global application role and claim references', async () => {
    const org = await createTestOrganization();
    const administrator = await createTestUser(org.id);
    const application = await createTestApplication();
    const role = await createTestRole(application.id);
    const claim = await createTestClaimDefinition(application.id);
    const email = `invite-${randomUUID()}@test.example.com`;
    const context = routeContext({
      params: { orgId: org.id },
      body: {
        email,
        roles: [{ applicationId: application.id, roleId: role.id }],
        claims: [
          {
            applicationId: application.id,
            claimDefinitionId: claim.id,
            value: 'engineering',
          },
        ],
      },
      adminUser: {
        id: administrator.id,
        givenName: administrator.givenName,
        familyName: administrator.familyName,
        email: administrator.email,
      },
    });

    await invoke(invitationCreationHandler(), context);

    expect(context.status).toBe(201);
    expect(await storedInvitation(email)).toEqual(
      expect.objectContaining({
        details: expect.objectContaining({
          roles: [{ applicationId: application.id, roleId: role.id }],
          claims: [
            {
              applicationId: application.id,
              claimDefinitionId: claim.id,
              value: 'engineering',
            },
          ],
        }),
      }),
    );
  });

  it('rejects role and claim preassignments whose live records belong to another application', async () => {
    const org = await createTestOrganization();
    const administrator = await createTestUser(org.id);
    const declaredApplication = await createTestApplication();
    const actualApplication = await createTestApplication();
    const role = await createTestRole(actualApplication.id);
    const claim = await createTestClaimDefinition(actualApplication.id);

    for (const body of [
      { roles: [{ applicationId: declaredApplication.id, roleId: role.id }] },
      {
        claims: [
          {
            applicationId: declaredApplication.id,
            claimDefinitionId: claim.id,
            value: 'engineering',
          },
        ],
      },
    ]) {
      const email = `wrong-parent-${randomUUID()}@test.example.com`;
      const context = routeContext({
        params: { orgId: org.id },
        body: { email, ...body },
        adminUser: {
          id: administrator.id,
          givenName: administrator.givenName,
          familyName: administrator.familyName,
          email: administrator.email,
        },
      });

      await invoke(invitationCreationHandler(), context);

      expect(context.status).toBe(400);
      expect(await storedInvitation(email)).toBeNull();
    }
  });

  it('accepts a mixed invitation by skipping deleted and wrong-parent references and applying every live entry', async () => {
    const org = await createTestOrganization();
    const invitedUser = await createTestUser(org.id);
    const application = await createTestApplication();
    const otherApplication = await createTestApplication();
    const liveRole = await createTestRole(application.id);
    const deletedRole = await createTestRole(application.id);
    const wrongParentRole = await createTestRole(otherApplication.id);
    const liveClaim = await createTestClaimDefinition(application.id);
    const deletedClaim = await createTestClaimDefinition(application.id);
    const wrongParentClaim = await createTestClaimDefinition(otherApplication.id);
    await getPool().query('DELETE FROM roles WHERE id = $1', [deletedRole.id]);
    await getPool().query('DELETE FROM custom_claim_definitions WHERE id = $1', [deletedClaim.id]);
    const token = generateToken();
    const details = {
      roles: [
        { applicationId: application.id, roleId: deletedRole.id },
        { applicationId: application.id, roleId: wrongParentRole.id },
        { applicationId: application.id, roleId: liveRole.id },
      ],
      claims: [
        {
          applicationId: application.id,
          claimDefinitionId: deletedClaim.id,
          value: 'deleted',
        },
        {
          applicationId: application.id,
          claimDefinitionId: wrongParentClaim.id,
          value: 'wrong-parent',
        },
        {
          applicationId: application.id,
          claimDefinitionId: liveClaim.id,
          value: 'live',
        },
      ],
    };
    await insertInvitationToken(
      invitedUser.id,
      token.hash,
      new Date(Date.now() + 3_600_000),
      details,
    );
    const stored = await getPool().query<{ details: Record<string, unknown> }>(
      'SELECT details FROM invitation_tokens WHERE token_hash = $1',
      [token.hash],
    );
    expect(stored.rows[0]?.details).toEqual(details);
    const csrf = randomUUID();
    const context = routeContext({
      params: { orgSlug: org.slug, token: token.plaintext },
      body: {
        password: 'Correct Horse Battery Staple 2026!',
        confirmPassword: 'Correct Horse Battery Staple 2026!',
        _csrf: csrf,
      },
      organization: org,
      csrf,
    });

    await invoke(invitationAcceptanceHandler(), context);

    expect(context.status).toBe(200);
    expect(
      await getPool().query<{ role_id: string }>(
        'SELECT role_id FROM user_roles WHERE user_id = $1 ORDER BY role_id',
        [invitedUser.id],
      ),
    ).toMatchObject({ rows: [{ role_id: liveRole.id }] });
    expect(
      await getPool().query<{ claim_id: string; value: unknown }>(
        'SELECT claim_id, value FROM custom_claim_values WHERE user_id = $1 ORDER BY claim_id',
        [invitedUser.id],
      ),
    ).toMatchObject({ rows: [{ claim_id: liveClaim.id, value: 'live' }] });
    const accepted = await getPool().query<{ used_at: Date | null; email_verified: boolean }>(
      `SELECT token.used_at, account.email_verified
       FROM invitation_tokens token
       JOIN users account ON account.id = token.user_id
       WHERE token.token_hash = $1`,
      [token.hash],
    );
    expect(accepted.rows[0]?.used_at).toBeInstanceOf(Date);
    expect(accepted.rows[0]?.email_verified).toBe(true);
  });

  it('cascades an invited user owned invitation token without rewriting its payload', async () => {
    const org = await createTestOrganization();
    const invitedUser = await createTestUser(org.id);
    const token = generateToken();
    const details = {
      roles: [{ applicationId: randomUUID(), roleId: randomUUID() }],
      claims: [
        {
          applicationId: randomUUID(),
          claimDefinitionId: randomUUID(),
          value: 'preserve-until-delete',
        },
      ],
    };
    await insertInvitationToken(
      invitedUser.id,
      token.hash,
      new Date(Date.now() + 3_600_000),
      details,
    );
    const before = await getPool().query<{ details: Record<string, unknown> }>(
      'SELECT details FROM invitation_tokens WHERE token_hash = $1',
      [token.hash],
    );

    expect(before.rows[0]?.details).toEqual(details);
    await getPool().query('DELETE FROM users WHERE id = $1', [invitedUser.id]);

    const remaining = await getPool().query(
      'SELECT id FROM invitation_tokens WHERE token_hash = $1',
      [token.hash],
    );
    expect(remaining.rows).toHaveLength(0);
  });
});
