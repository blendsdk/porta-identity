import { describe, expect, it } from 'vitest';
import {
  parseServiceAccountInput,
  parseServiceAccountTargets,
} from '../../../src/service-accounts/index.js';

const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const applicationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const roleId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const claimDefinitionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const rolePair = { applicationId, roleId };
const claimPair = { applicationId, claimDefinitionId };

/** Builds a fresh target that grants no role or claim assignments. */
function emptyTarget() {
  return { organizationId, allowedRoles: [], allowedClaimDefinitions: [] };
}

/** Captures public error details without choosing an internal error class or message. */
function errorDetails(operation: () => unknown) {
  try {
    operation();
  } catch (error) {
    if (error instanceof Error) return { name: error.name, message: error.message };
    throw new Error('Expected a domain Error for rejected policy input.', { cause: error });
  }
  throw new Error('Expected policy input to be rejected.');
}

/** Both entry points must apply the same strict validation to nested targets. */
const policyParsers = [
  { name: 'target-list parser', parse: parseServiceAccountTargets },
  {
    name: 'set-input parser',
    parse: (targets: unknown) => parseServiceAccountInput({ targets }).targets,
  },
];

// A policy requires explicit targets; omitting an account email is syntactically valid.
describe('parseServiceAccountInput', () => {
  it('should preserve an email-free policy when targets are explicitly supplied', () => {
    expect(parseServiceAccountInput({ targets: [emptyTarget()] })).toStrictEqual({
      targets: [emptyTarget()],
    });
  });

  it('should normalize the account email when its identity has spaces and uppercase letters', () => {
    expect(
      parseServiceAccountInput({
        accountEmail: '  Operator@Example.test  ',
        targets: [emptyTarget()],
      }),
    ).toStrictEqual({ accountEmail: 'operator@example.test', targets: [emptyTarget()] });
  });

  it.each(
    [
      undefined,
      null,
      false,
      1,
      'policy',
      [],
      new Date('2026-01-01T00:00:00Z'),
      new Map(),
      new Set(),
      {},
      { accountEmail: 'operator@example.test' },
      { targets: [emptyTarget()], unexpected: true },
    ].map((input) => ({ input })),
  )(
    'should reject the set input when its outer shape is $input',
    ({ input }) => {
      expect(() => parseServiceAccountInput(input)).toThrow();
    },
  );

  it.each(
    ['', '   ', 'not-an-email', '*', 'Operator <operator@example.test>', null, 1, {}, []].map(
      (accountEmail) => ({ accountEmail }),
    ),
  )(
    'should reject the set input when the account email is $accountEmail',
    ({ accountEmail }) => {
      expect(() => parseServiceAccountInput({ accountEmail, targets: [emptyTarget()] })).toThrow();
    },
  );

  it('should expose a fixed safe error when outer shape or account email validation fails', () => {
    const marker = 'untrusted-policy-marker';
    const failures = [
      errorDetails(() => parseServiceAccountInput({})),
      errorDetails(() => parseServiceAccountInput({ accountEmail: marker, targets: [emptyTarget()] })),
      errorDetails(() => parseServiceAccountInput({ targets: [emptyTarget()], [marker]: true })),
    ];
    for (const failure of failures) {
      expect(failure).toEqual(failures[0]);
      expect(failure.message).not.toContain(marker);
    }
  });
});

// Unknown fields and native values must not become policy authority through object merging.
describe.each(policyParsers)('$name strict policy shape', ({ parse }) => {
  it('should preserve empty assignment lists when one valid organization is targeted', () => {
    expect(parse([emptyTarget()])).toStrictEqual([emptyTarget()]);
  });

  /** Each malformed value isolates one required object or collection boundary. */
  const malformedPolicies: Array<[string, unknown]> = [
    ['the target list is absent', undefined],
    ['the target list is null', null],
    ['the target list is a boolean', false],
    ['the target list is a number', 1],
    ['the target list is a string', '[]'],
    ['the target list is wrapped in an object', { targets: [emptyTarget()] }],
    ['the target list is a date', new Date('2026-01-01T00:00:00Z')],
    ['the target list is a map', new Map()],
    ['the target list is a set', new Set()],
    ['a target is null', [null]],
    ['a target is an array', [[]]],
    ['a target is a string', ['*']],
    ['a target is a date', [new Date('2026-01-01T00:00:00Z')]],
    ['a target has an unknown field', [{ ...emptyTarget(), allowAll: true }]],
    ['a target has no organization', [{ allowedRoles: [], allowedClaimDefinitions: [] }]],
    ['the role list is missing', [{ organizationId, allowedClaimDefinitions: [] }]],
    ['the claim list is missing', [{ organizationId, allowedRoles: [] }]],
    ['the role list is null', [{ ...emptyTarget(), allowedRoles: null }]],
    ['the role list is an object', [{ ...emptyTarget(), allowedRoles: {} }]],
    ['the role list is a wildcard', [{ ...emptyTarget(), allowedRoles: '*' }]],
    ['the claim list is null', [{ ...emptyTarget(), allowedClaimDefinitions: null }]],
    ['the claim list is an object', [{ ...emptyTarget(), allowedClaimDefinitions: {} }]],
    ['the claim list is a wildcard', [{ ...emptyTarget(), allowedClaimDefinitions: '*' }]],
    ['a role pair is null', [{ ...emptyTarget(), allowedRoles: [null] }]],
    ['a role pair is an array', [{ ...emptyTarget(), allowedRoles: [[]] }]],
    ['a role pair is a string', [{ ...emptyTarget(), allowedRoles: ['*'] }]],
    ['a claim pair is null', [{ ...emptyTarget(), allowedClaimDefinitions: [null] }]],
    ['a claim pair is an array', [{ ...emptyTarget(), allowedClaimDefinitions: [[]] }]],
    ['a claim pair is a string', [{ ...emptyTarget(), allowedClaimDefinitions: ['*'] }]],
    ['a role pair has an unknown field', [{
      ...emptyTarget(), allowedRoles: [{ ...rolePair, unexpected: true }],
    }]],
    ['a claim pair has an unknown field', [{
      ...emptyTarget(), allowedClaimDefinitions: [{ ...claimPair, unexpected: true }],
    }]],
    ['a claim policy entry contains a value', [{
      ...emptyTarget(), allowedClaimDefinitions: [{ ...claimPair, value: 'not policy data' }],
    }]],
  ];

  it.each(malformedPolicies)('should reject the policy when %s', (_reason, input) => {
    expect(() => parse(input)).toThrow();
  });

  /** Every identity field requires a UUID, including the application part of each pair. */
  const identifierPolicies: Array<[string, (value: unknown) => unknown]> = [
    ['organization', (value) => [{ ...emptyTarget(), organizationId: value }]],
    ['role application', (value) => [{
      ...emptyTarget(), allowedRoles: [{ ...rolePair, applicationId: value }],
    }]],
    ['role', (value) => [{ ...emptyTarget(), allowedRoles: [{ ...rolePair, roleId: value }] }]],
    ['claim application', (value) => [{
      ...emptyTarget(), allowedClaimDefinitions: [{ ...claimPair, applicationId: value }],
    }]],
    ['claim definition', (value) => [{
      ...emptyTarget(), allowedClaimDefinitions: [{ ...claimPair, claimDefinitionId: value }],
    }]],
  ];

  describe.each(identifierPolicies)('%s identity', (_field, makePolicy) => {
    it.each(
      ['not-a-uuid', '*', '', undefined, null, 1, false, {}, []].map((value) => ({ value })),
    )(
      'should reject the policy when the identifier is $value',
      ({ value }) => {
        expect(() => parse(makePolicy(value))).toThrow();
      },
    );
  });

  it('should expose a fixed safe error when invalid shapes and bounds contain different data', () => {
    const marker = 'untrusted-policy-marker';
    const failures = [
      errorDetails(() => parse([])),
      errorDetails(() => parse([{ ...emptyTarget(), organizationId: marker }])),
      errorDetails(() => parse([{ ...emptyTarget(), [marker]: true }])),
    ];
    for (const failure of failures) {
      expect(failure).toEqual(failures[0]);
      expect(failure.message).not.toContain(marker);
      expect(failure.message).not.toContain(organizationId);
    }
  });
});
