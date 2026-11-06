/** Focused implementation tests for invitation role validation and exact forwarding. */

import { describe, expect, it, vi } from 'vitest';

import { createAdminUserOperations } from '../../src/admin/user-service.js';
import type { AdminInviteUserInput } from '../../src/admin/user-service.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const applicationId = '33333333-3333-4333-8333-333333333333';
const roleId = '44444444-4444-4444-8444-444444444444';
const secondRoleId = '66666666-6666-4666-8666-666666666666';

/** Supplies every SDK operation while allowing focused overrides. */
function domain(overrides: Record<string, unknown> = {}) {
  return {
    list: vi.fn(),
    get: vi.fn(),
    getHistory: vi.fn(),
    invitePreview: vi.fn(),
    create: vi.fn(),
    invite: vi.fn(),
    update: vi.fn(),
    setPassword: vi.fn(),
    clearPassword: vi.fn(),
    verifyEmail: vi.fn(),
    deactivate: vi.fn(),
    activate: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

/** A complete accepted invitation used by forwarding cases. */
function accepted(email = 'person@example.test') {
  return {
    invitationId: '55555555-5555-4555-8555-555555555555',
    email,
    invitationSent: true,
    emailDelivery: 'sent' as const,
    expiresAt: '2026-08-31T10:00:00.000Z',
  };
}

/** Deliberately bypasses the static shape so runtime validation is observable. */
function runtimeInvite(value: Record<string, unknown>): AdminInviteUserInput {
  return value as unknown as AdminInviteUserInput;
}

describe('invitation role validation', () => {
  it('forwards the exact validated role pairs and omits no selected roles', async () => {
    const invite = vi.fn().mockResolvedValue(accepted());
    const operations = createAdminUserOperations(() => domain({ invite }));

    await operations.invite(organizationId, {
      email: 'person@example.test',
      roles: [
        { applicationId, roleId },
        { applicationId, roleId: secondRoleId },
      ],
    });

    expect(invite).toHaveBeenCalledExactlyOnceWith({
      organizationId,
      email: 'person@example.test',
      roles: [
        { applicationId, roleId },
        { applicationId, roleId: secondRoleId },
      ],
    });
  });

  it('omits an empty role selection instead of sending an empty array', async () => {
    const invite = vi.fn().mockResolvedValue(accepted());
    const operations = createAdminUserOperations(() => domain({ invite }));

    await operations.invite(organizationId, { email: 'person@example.test', roles: [] });

    expect(invite).toHaveBeenCalledExactlyOnceWith({
      organizationId,
      email: 'person@example.test',
    });
  });

  it.each([
    [
      'duplicate pairs',
      [
        { applicationId, roleId },
        { applicationId, roleId },
      ],
    ],
    ['non-UUID application', [{ applicationId: 'app', roleId }]],
    ['non-UUID role', [{ applicationId, roleId: 'admin' }]],
    ['missing role', [{ applicationId }]],
    ['extra field', [{ applicationId, roleId, name: 'Escalation' }]],
    ['null entry', [null]],
  ])('rejects %s before dispatch', async (_label, roles) => {
    const invite = vi.fn();
    const operations = createAdminUserOperations(() => domain({ invite }));

    const result = await operations.invite(
      organizationId,
      runtimeInvite({ email: 'person@example.test', roles }),
    );

    expect(result).toEqual({ kind: 'failure', failure: 'validation' });
    expect(invite).not.toHaveBeenCalled();
  });

  it('forwards roles to the invitation preview as well as the mutation', async () => {
    const invitePreview = vi
      .fn()
      .mockResolvedValue({ subject: 'Welcome', text: 'Hello', html: '<b>Hello</b>' });
    const operations = createAdminUserOperations(() => domain({ invitePreview }));

    await operations.previewInvitation(organizationId, {
      email: 'person@example.test',
      roles: [{ applicationId, roleId }],
    });

    expect(invitePreview).toHaveBeenCalledExactlyOnceWith({
      organizationId,
      email: 'person@example.test',
      roles: [{ applicationId, roleId }],
    });
  });
});
