/** Public specifications for lazy administration domain wiring. */

import { describe, expect, it, vi } from 'vitest';

import { prepareAdminSession } from '../../src/admin/session-service.js';

const server = new URL('https://porta.example.test');
const interaction = {
  presentAuthorizationUrl: vi.fn(),
  requestManualCallback: vi.fn(),
  confirmCredentialReplacement: vi.fn(),
};

describe('admin session domain wiring', () => {
  it('should retain organization, user, and RBAC providers lazily', async () => {
    const organizations = vi.fn();
    const users = vi.fn();
    const roles = { list: vi.fn().mockResolvedValue([]) };
    const permissions = { list: vi.fn().mockResolvedValue([]) };
    const userRoles = { list: vi.fn().mockResolvedValue([]) };
    const rbac = vi.fn(() => ({ roles, permissions, userRoles }));
    const prepared = prepareAdminSession(
      server,
      interaction,
      organizations,
      users,
      undefined,
      undefined,
      rbac,
    );

    expect(prepared.session.organizations).toBeDefined();
    expect(prepared.session.users).toBeDefined();
    expect(prepared.session.rbac).toBeDefined();
    expect(organizations).not.toHaveBeenCalled();
    expect(users).not.toHaveBeenCalled();
    expect(rbac).not.toHaveBeenCalled();

    await prepared.session.rbac?.listRoles('11111111-1111-4111-8111-111111111111');
    expect(rbac).toHaveBeenCalledOnce();
    expect(roles.list).toHaveBeenCalledOnce();
  });
});
