import { describe, expect, it } from 'vitest';
import {
  parseServiceAccountInput,
  parseServiceAccountTargets,
} from '../../../src/service-accounts/index.js';

const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const applicationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const otherApplicationId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const roleId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const claimDefinitionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const rolePair = { applicationId, roleId };
const claimPair = { applicationId, claimDefinitionId };

/** Produces distinct, RFC-valid version-four fixture UUIDs for bounded collections. */
function uuid(ordinal: number): string {
  return `10000000-0000-4000-8000-${ordinal.toString(16).padStart(12, '0')}`;
}

/** Builds a fresh target with no assignment authority. */
function emptyTarget(targetOrganizationId = organizationId) {
  return { organizationId: targetOrganizationId, allowedRoles: [], allowedClaimDefinitions: [] };
}

/** Exercises each public parser without depending on one parser's output as an oracle. */
const policyParsers = [
  { name: 'target-list parser', parse: parseServiceAccountTargets },
  {
    name: 'set-input parser',
    parse: (targets: unknown) => parseServiceAccountInput({ targets }).targets,
  },
];

// Assignment limits count every occurrence across all targets, not distinct global pairs.
describe.each(policyParsers)('$name bounds and identity', ({ parse }) => {
  it.each([0, 101])(
    'should reject the policy when it contains %i distinct target organizations',
    (count) => {
      const targets = Array.from({ length: count }, (_, index) => emptyTarget(uuid(index + 1)));
      expect(() => parse(targets)).toThrow();
    },
  );

  it('should accept all maximum counts when one hundred targets each contain one role and claim', () => {
    const targets = Array.from({ length: 100 }, (_, index) => ({
      ...emptyTarget(uuid(index + 1)),
      allowedRoles: [rolePair],
      allowedClaimDefinitions: [claimPair],
    }));
    expect(parse(targets)).toStrictEqual(targets);
  });

  it('should accept the assignment maxima when all one hundred pairs belong to one target', () => {
    const targets = [{
      ...emptyTarget(),
      allowedRoles: Array.from({ length: 100 }, (_, index) => ({
        applicationId, roleId: uuid(index + 1),
      })),
      allowedClaimDefinitions: Array.from({ length: 100 }, (_, index) => ({
        applicationId, claimDefinitionId: uuid(index + 1),
      })),
    }];
    expect(parse(targets)).toStrictEqual(targets);
  });

  it('should reject the whole policy when one hundred and one role occurrences span two targets', () => {
    const roles = Array.from({ length: 51 }, (_, index) => ({
      applicationId, roleId: uuid(index + 1),
    }));
    // Overlap is legal across organizations, but those occurrences still consume the total limit.
    const targets = [
      { ...emptyTarget(uuid(1)), allowedRoles: roles },
      { ...emptyTarget(uuid(2)), allowedRoles: roles.slice(0, 50) },
    ];
    expect(() => parse(targets)).toThrow();
  });

  it('should reject the whole policy when one hundred and one claim occurrences span two targets', () => {
    const claims = Array.from({ length: 51 }, (_, index) => ({
      applicationId, claimDefinitionId: uuid(index + 1),
    }));
    const targets = [
      { ...emptyTarget(uuid(1)), allowedClaimDefinitions: claims },
      { ...emptyTarget(uuid(2)), allowedClaimDefinitions: claims.slice(0, 50) },
    ];
    expect(() => parse(targets)).toThrow();
  });

  it('should normalize every UUID when targets and application-qualified pairs use uppercase', () => {
    const input = [{
      organizationId: organizationId.toUpperCase(),
      allowedRoles: [{ applicationId: applicationId.toUpperCase(), roleId: roleId.toUpperCase() }],
      allowedClaimDefinitions: [{
        applicationId: applicationId.toUpperCase(),
        claimDefinitionId: claimDefinitionId.toUpperCase(),
      }],
    }];
    expect(parse(input)).toStrictEqual([{
      organizationId, allowedRoles: [rolePair], allowedClaimDefinitions: [claimPair],
    }]);
  });

  it.each([organizationId, organizationId.toUpperCase()])(
    'should reject duplicate targets when the repeated organization is %s',
    (duplicateOrganizationId) => {
      expect(() => parse([emptyTarget(), emptyTarget(duplicateOrganizationId)])).toThrow();
    },
  );

  it.each([
    rolePair,
    { applicationId: applicationId.toUpperCase(), roleId: roleId.toUpperCase() },
  ])('should reject duplicate role pairs when the repeated pair is %j', (duplicateRole) => {
    expect(() => parse([{
      ...emptyTarget(), allowedRoles: [rolePair, duplicateRole],
    }])).toThrow();
  });

  it.each([
    claimPair,
    {
      applicationId: applicationId.toUpperCase(),
      claimDefinitionId: claimDefinitionId.toUpperCase(),
    },
  ])('should reject duplicate claim pairs when the repeated pair is %j', (duplicateClaim) => {
    expect(() => parse([{
      ...emptyTarget(), allowedClaimDefinitions: [claimPair, duplicateClaim],
    }])).toThrow();
  });

  it('should retain both occurrences when the same pairs belong to different organizations', () => {
    const targets = [organizationId, uuid(1)].map((targetOrganizationId) => ({
      ...emptyTarget(targetOrganizationId),
      allowedRoles: [rolePair],
      allowedClaimDefinitions: [claimPair],
    }));
    expect(parse(targets)).toStrictEqual(targets);
  });

  it('should retain distinct pairs when their identifiers match but their applications differ', () => {
    const targets = [{
      ...emptyTarget(),
      allowedRoles: [rolePair, { applicationId: otherApplicationId, roleId }],
      allowedClaimDefinitions: [
        claimPair, { applicationId: otherApplicationId, claimDefinitionId },
      ],
    }];
    expect(parse(targets)).toStrictEqual(targets);
  });
});
