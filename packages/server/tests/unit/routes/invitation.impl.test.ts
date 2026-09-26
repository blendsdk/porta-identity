/**
 * Implementation tests for invitation route internals.
 *
 * The specification tests cover the externally visible behavior; these assert the render context and
 * audit metadata that only the handlers know about.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));

vi.mock('../../../src/auth/csrf.js', () => ({
  generateCsrfToken: vi.fn().mockReturnValue('csrf-token-abc'),
  verifyCsrfToken: vi.fn().mockReturnValue(true),
  setCsrfCookie: vi.fn(),
  getCsrfFromCookie: vi.fn().mockReturnValue('csrf-token-abc'),
}));

vi.mock('../../../src/auth/tokens.js', () => ({
  hashToken: vi.fn().mockReturnValue('hashed-token'),
}));

vi.mock('../../../src/auth/token-repository.js', () => ({
  findValidInvitationToken: vi.fn(),
}));

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(() => ({ query: poolQuery })),
}));

vi.mock('../../../src/auth/i18n.js', () => ({
  resolveLocale: vi.fn().mockResolvedValue('en'),
  getTranslationFunction: vi.fn().mockReturnValue((key: string) => `t:${key}`),
}));

vi.mock('../../../src/auth/template-engine.js', () => ({
  renderPage: vi.fn().mockResolvedValue('<html>rendered</html>'),
}));

vi.mock('../../../src/auth/effective-branding.js', () => ({
  resolveEffectiveBranding: vi.fn().mockResolvedValue({ companyName: 'Acme Corp', imageSources: {} }),
}));

vi.mock('../../../src/users/service.js', () => ({
  getUserByEmail: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../src/users/invitation-service.js', () => ({
  acceptInvitation: vi.fn(),
}));

vi.mock('../../../src/users/password.js', () => ({
  validatePassword: vi.fn().mockReturnValue({ isValid: true }),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({ writeAuditLog: vi.fn() }));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/config/index.js', () => ({
  config: { issuerBaseUrl: 'https://auth.example.com' },
}));

import * as tokenRepo from '../../../src/auth/token-repository.js';
import * as invitationService from '../../../src/users/invitation-service.js';
import * as auditLog from '../../../src/lib/audit-log.js';
import * as templateEngine from '../../../src/auth/template-engine.js';
import { createInvitationRouter } from '../../../src/routes/invitation.js';
import type { Organization } from '../../../src/organizations/types.js';

function org(): Organization {
  return {
    id: 'org-1',
    name: 'Test Org',
    slug: 'test-org',
    status: 'active',
    isSuperAdmin: false,
    brandingLogoUrl: null,
    brandingFaviconUrl: null,
    brandingPrimaryColor: '#3B82F6',
    brandingCompanyName: 'Test Corp',
    brandingCustomCss: null,
    defaultLocale: 'en',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
}

function ctx(overrides: { query?: Record<string, string>; body?: Record<string, string> } = {}) {
  let status = 200;
  return {
    params: { orgSlug: 'test-org', token: 'token-1' },
    query: overrides.query ?? {},
    request: { body: overrides.body ?? {} },
    ip: '127.0.0.1',
    state: { organization: org() },
    cookies: { get: () => 'csrf-token-abc', set: () => undefined },
    get: () => '',
    get status() {
      return status;
    },
    set status(value: number) {
      status = value;
    },
    body: undefined as unknown,
    type: '',
  };
}

function invitation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    userId: null,
    tokenHash: 'hashed-token',
    expiresAt: new Date('2026-10-03T00:00:00Z'),
    usedAt: null,
    createdAt: new Date('2026-09-26T00:00:00Z'),
    details: null,
    invitedBy: 'admin-1',
    organizationId: 'org-1',
    email: 'invitee@example.com',
    givenName: null,
    familyName: null,
    locale: null,
    ...overrides,
  };
}

async function run(method: string, context: ReturnType<typeof ctx>) {
  const layer = createInvitationRouter().stack.find(
    (entry) => entry.methods.includes(method) && entry.path.includes('accept-invite'),
  );
  await layer!.stack[layer!.stack.length - 1](context as never, vi.fn());
}

describe('invitation route internals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(invitation() as never);
  });

  it('should pass the inviter name to the confirmation page when present', async () => {
    vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(
      invitation({ details: { inviterName: 'Ada Admin' } }) as never,
    );

    await run('GET', ctx());

    expect(templateEngine.renderPage).toHaveBeenCalledWith(
      'confirm-invite',
      expect.objectContaining({ inviterName: 'Ada Admin' }),
    );
  });

  it('should pass the invited email and organization name to the password form', async () => {
    await run('GET', ctx({ query: { step: 'password' } }));

    expect(templateEngine.renderPage).toHaveBeenCalledWith(
      'accept-invite',
      expect.objectContaining({ email: 'invitee@example.com', orgName: 'Acme Corp' }),
    );
  });

  it('should record pre-assignment counts in the acceptance audit', async () => {
    vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(
      invitation({
        details: {
          roles: [{ applicationId: 'app-1', roleId: 'role-1' }],
          claims: [{ applicationId: 'app-1', claimDefinitionId: 'claim-1', value: 'x' }],
        },
      }) as never,
    );
    vi.mocked(invitationService.acceptInvitation).mockResolvedValue({
      userId: 'user-1',
      email: 'invitee@example.com',
    });
    poolQuery.mockResolvedValue({ rows: [{ id: 'role-1' }], rowCount: 1 });

    await run('POST', ctx({ body: { password: 'Passw0rd-123!', confirmPassword: 'Passw0rd-123!', _csrf: 'tok' } }));

    expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'user.invite.accepted',
        metadata: { preAssignedRoles: 1, preAssignedClaims: 1 },
      }),
    );
  });

  it('should keep the invited email in the re-rendered password form after a mismatch', async () => {
    await run(
      'POST',
      ctx({ body: { password: 'Password1!', confirmPassword: 'Different!', _csrf: 'tok' } }),
    );

    expect(templateEngine.renderPage).toHaveBeenCalledWith(
      'accept-invite',
      expect.objectContaining({ email: 'invitee@example.com' }),
    );
  });
});
