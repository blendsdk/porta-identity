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
  it('should retain both organization and user providers lazily', () => {
    const organizations = vi.fn();
    const users = vi.fn();
    const prepared = prepareAdminSession(server, interaction, organizations, users);

    expect(prepared.session.organizations).toBeDefined();
    expect(prepared.session.users).toBeDefined();
    expect(organizations).not.toHaveBeenCalled();
    expect(users).not.toHaveBeenCalled();
  });
});
