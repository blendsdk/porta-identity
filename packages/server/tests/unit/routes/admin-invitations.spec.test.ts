/** Specification tests for human role pre-assignment authority on invitations. */

import { describe, expect, it } from 'vitest';

import { canAssignRolesOnInvite } from '../../../src/routes/admin-invitations.js';

describe('invitation role pre-assignment authority', () => {
  it('allows a role-free invitation with only invitation authority', () => {
    expect(canAssignRolesOnInvite({}, ['admin:user:invite'])).toBe(true);
    expect(canAssignRolesOnInvite({ roles: [] }, ['admin:user:invite'])).toBe(true);
  });

  it('requires the direct role-assign permission when roles are present', () => {
    expect(
      canAssignRolesOnInvite(
        { roles: [{ applicationId: 'app', roleId: 'role' }] },
        ['admin:user:invite'],
      ),
    ).toBe(false);
    expect(
      canAssignRolesOnInvite(
        { roles: [{ applicationId: 'app', roleId: 'role' }] },
        ['admin:user:invite', 'admin:role:assign'],
      ),
    ).toBe(true);
  });
});
