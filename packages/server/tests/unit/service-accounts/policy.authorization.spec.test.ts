import { describe, expect, it } from 'vitest';
import { assertInvitationAllowed } from '../../../src/service-accounts/index.js';

const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherOrganizationId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const applicationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const otherApplicationId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const roleId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const otherRoleId = '12345678-1234-4234-8234-123456789abc';
const claimDefinitionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const otherClaimDefinitionId = '87654321-4321-4321-8321-cba987654321';
const rolePair = { applicationId, roleId };
const claimPair = { applicationId, claimDefinitionId };
const recipientEmail = 'recipient@example.test';

/** Builds fresh assignment lists so authorization cannot depend on earlier test mutations. */
function allowedTarget() {
  return {
    organizationId,
    allowedRoles: [{ ...rolePair }],
    allowedClaimDefinitions: [{ ...claimPair }],
  };
}

/** Captures the fixed public failure without assuming its internal class or wording. */
function denialDetails(operation: () => void) {
  try {
    operation();
  } catch (error) {
    if (error instanceof Error) return { name: error.name, message: error.message };
    throw new Error('Expected a domain Error for a denied invitation.', { cause: error });
  }
  throw new Error('Expected the invitation to be denied.');
}

// Authorization requires the selected organization and every requested application-qualified pair.
describe('assertInvitationAllowed', () => {
  it.each([
    { email: recipientEmail },
    { email: recipientEmail, roles: [], claims: [] },
  ])(
    'should allow no assignments when an explicit target has empty allowlists and input is %j',
    (input) => {
      const targets = [{ organizationId, allowedRoles: [], allowedClaimDefinitions: [] }];
      expect(assertInvitationAllowed(targets, organizationId, input)).toBeUndefined();
    },
  );

  it('should allow every requested assignment when all exact pairs belong to the target', () => {
    const secondRole = { applicationId: otherApplicationId, roleId };
    const secondClaim = { applicationId: otherApplicationId, claimDefinitionId };
    const targets = [{
      organizationId,
      allowedRoles: [rolePair, secondRole],
      allowedClaimDefinitions: [claimPair, secondClaim],
    }];
    const input = {
      email: recipientEmail,
      roles: [secondRole, rolePair],
      claims: [{ ...secondClaim, value: ['reader'] }, { ...claimPair, value: true }],
    };
    const policyBefore = structuredClone(targets);
    expect(assertInvitationAllowed(targets, organizationId, input)).toBeUndefined();
    expect(targets).toStrictEqual(policyBefore);
  });

  it('should compare normalized UUID identities when requested identifiers use uppercase', () => {
    const input = {
      email: recipientEmail,
      roles: [{ applicationId: applicationId.toUpperCase(), roleId: roleId.toUpperCase() }],
      claims: [{
        applicationId: applicationId.toUpperCase(),
        claimDefinitionId: claimDefinitionId.toUpperCase(),
        value: 'unchanged',
      }],
    };
    expect(
      assertInvitationAllowed([allowedTarget()], organizationId.toUpperCase(), input),
    ).toBeUndefined();
  });

  it.each(
    [null, false, 0, '', '*', ['a', 1, null], { nested: { enabled: true }, values: [1, 2] }].map(
      (value) => ({ value }),
    ),
  )(
    'should preserve claim JSON and invitation fields when the allowlisted claim value is $value',
    ({ value }) => {
      const input = {
        email: recipientEmail,
        givenName: 'Example',
        familyName: 'Recipient',
        personalMessage: 'Welcome',
        locale: 'en',
        roles: [rolePair],
        claims: [{ ...claimPair, value }],
      };
      const before = structuredClone(input);
      expect(assertInvitationAllowed([allowedTarget()], organizationId, input)).toBeUndefined();
      expect(input).toStrictEqual(before);
      expect(input.claims[0]?.value).toBe(value);
    },
  );

  it('should deny the invitation when no policy targets exist', () => {
    expect(() => assertInvitationAllowed([], organizationId, { email: recipientEmail })).toThrow();
  });

  it('should deny the invitation when the organization is not targeted even without assignments', () => {
    expect(() => assertInvitationAllowed(
      [allowedTarget()], otherOrganizationId, { email: recipientEmail },
    )).toThrow();
  });

  it('should deny a role assignment when the target role allowlist is empty', () => {
    const target = { ...allowedTarget(), allowedRoles: [] };
    expect(() => assertInvitationAllowed([target], organizationId, {
      email: recipientEmail, roles: [rolePair],
    })).toThrow();
  });

  it('should deny a claim assignment when the target claim allowlist is empty', () => {
    const target = { ...allowedTarget(), allowedClaimDefinitions: [] };
    expect(() => assertInvitationAllowed([target], organizationId, {
      email: recipientEmail, claims: [{ ...claimPair, value: true }],
    })).toThrow();
  });

  it.each([
    { roles: [rolePair, { applicationId, roleId: otherRoleId }] },
    { roles: [{ applicationId, roleId: otherRoleId }, rolePair] },
  ])(
    'should deny the entire invitation when one role is unlisted among requested roles $roles',
    ({ roles }) => {
      const input = { email: recipientEmail, roles, claims: [{ ...claimPair, value: true }] };
      const before = structuredClone(input);
      expect(() => assertInvitationAllowed([allowedTarget()], organizationId, input)).toThrow();
      expect(input).toStrictEqual(before);
    },
  );

  it.each([
    { pairs: [claimPair, { applicationId, claimDefinitionId: otherClaimDefinitionId }] },
    { pairs: [{ applicationId, claimDefinitionId: otherClaimDefinitionId }, claimPair] },
  ])(
    'should deny the entire invitation when one claim is unlisted among requested pairs $pairs',
    ({ pairs }) => {
      const input = {
        email: recipientEmail,
        roles: [rolePair],
        claims: pairs.map((pair) => ({ ...pair, value: { unchanged: true } })),
      };
      const before = structuredClone(input);
      expect(() => assertInvitationAllowed([allowedTarget()], organizationId, input)).toThrow();
      expect(input).toStrictEqual(before);
    },
  );

  it('should deny the role when its identifier matches but its application is not allowlisted', () => {
    expect(() => assertInvitationAllowed([allowedTarget()], organizationId, {
      email: recipientEmail, roles: [{ applicationId: otherApplicationId, roleId }],
    })).toThrow();
  });

  it('should deny the claim when its identifier matches but its application is not allowlisted', () => {
    expect(() => assertInvitationAllowed([allowedTarget()], organizationId, {
      email: recipientEmail,
      claims: [{ applicationId: otherApplicationId, claimDefinitionId, value: true }],
    })).toThrow();
  });

  it('should deny the role when its pair belongs only to another targeted organization', () => {
    const targets = [
      { ...allowedTarget(), allowedRoles: [] },
      { ...allowedTarget(), organizationId: otherOrganizationId },
    ];
    expect(() => assertInvitationAllowed(targets, organizationId, {
      email: recipientEmail, roles: [rolePair],
    })).toThrow();
  });

  it('should deny the claim when its pair belongs only to another targeted organization', () => {
    const targets = [
      { ...allowedTarget(), allowedClaimDefinitions: [] },
      { ...allowedTarget(), organizationId: otherOrganizationId },
    ];
    expect(() => assertInvitationAllowed(targets, organizationId, {
      email: recipientEmail, claims: [{ ...claimPair, value: true }],
    })).toThrow();
  });

  it('should expose one fixed safe error when an organization, role, or claim is denied', () => {
    const value = 'untrusted-invitation-marker';
    const targets = [allowedTarget()];
    const failures = [
      denialDetails(() => assertInvitationAllowed(targets, otherOrganizationId, {
        email: recipientEmail,
      })),
      denialDetails(() => assertInvitationAllowed(targets, organizationId, {
        email: recipientEmail, roles: [{ applicationId, roleId: otherRoleId }],
      })),
      denialDetails(() => assertInvitationAllowed(targets, organizationId, {
        email: recipientEmail,
        claims: [{ applicationId, claimDefinitionId: otherClaimDefinitionId, value }],
      })),
    ];
    const privateValues = [
      recipientEmail,
      value,
      organizationId,
      otherOrganizationId,
      applicationId,
      otherRoleId,
      otherClaimDefinitionId,
    ];
    for (const failure of failures) {
      expect(failure).toEqual(failures[0]);
      for (const privateValue of privateValues) {
        expect(failure.message).not.toContain(privateValue);
      }
    }
  });
});
