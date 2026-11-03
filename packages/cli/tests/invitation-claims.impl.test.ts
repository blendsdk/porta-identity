/** Parser edge cases keep new local diagnostics bounded and preserve ordinary JSON semantics. */
import type { InviteUserInput } from '@portaidentity/sdk';
import { describe, expect, it } from 'vitest';
import { LocalInputError } from '../src/error-format.js';
import { parseClaimAssignments, validateInvitationEncoding } from '../src/parsers.js';

const applicationId = '11111111-1111-4111-8111-111111111111';
const claimDefinitionId = '22222222-2222-4222-8222-222222222222';

/** Prepare a single plain request without bypassing SDK input typing. */
function request(value: unknown): InviteUserInput {
  return {
    organizationId: applicationId,
    email: 'person@example.test',
    claims: [{ applicationId, claimDefinitionId, value }],
  };
}

describe('claim parser internal guards', () => {
  it.each([false, null, {}, 'not-an-array'])(
    'should classify invalid runtime collections as local input errors: %j',
    (value) => {
      expect(() => Reflect.apply(parseClaimAssignments, undefined, [value])).toThrow(
        LocalInputError,
      );
    },
  );

  it.each([false, null, 0, {}, undefined])(
    'should reject non-string runtime elements without attempting string operations: %j',
    (value) => {
      expect(() => Reflect.apply(parseClaimAssignments, undefined, [[value]])).toThrow('--claim 1');
    },
  );

  it('should keep signed zero in parsed data and leave its wire normalization to ordinary JSON', () => {
    const claims = parseClaimAssignments([`${applicationId}:${claimDefinitionId}:-0`]);
    expect(Object.is(claims?.[0]?.value, -0)).toBe(true);
    const input = request(claims?.[0]?.value);
    expect(validateInvitationEncoding(input)).toBeUndefined();
    expect(Object.is(input.claims?.[0]?.value, -0)).toBe(true);
    expect(JSON.stringify(input)).toContain('"value":0');
  });

  it('should reject a later duplicate without modifying the submitted flag array', () => {
    const flags = [
      `${applicationId}:${claimDefinitionId}:null`,
      `${applicationId}:${claimDefinitionId}:false`,
    ];
    const before = [...flags];
    expect(() => parseClaimAssignments(flags)).toThrow('--claim 2');
    expect(flags).toStrictEqual(before);
  });

  it('should retain large finite numbers using normal JavaScript JSON semantics', () => {
    const raw = '9007199254740993';
    const claims = parseClaimAssignments([`${applicationId}:${claimDefinitionId}:${raw}`]);
    expect(claims?.[0]?.value).toBe(JSON.parse(raw));
  });
});

describe('complete request encoding guard', () => {
  it('should convert cyclic encoding errors to a value-free local discriminator', () => {
    const cyclic: { next?: object } = {};
    cyclic.next = cyclic;
    expect(() => validateInvitationEncoding(request(cyclic))).toThrow(LocalInputError);
    expect(() => validateInvitationEncoding(request(cyclic))).toThrow(
      'The invitation input cannot be encoded as JSON.',
    );
  });

  it('should discard serialization text without mutating the prepared plain request', () => {
    const input = request({ nested: [null, false, 'a:b', 0] });
    const before = JSON.stringify(input);
    expect(validateInvitationEncoding(input)).toBeUndefined();
    expect(JSON.stringify(input)).toBe(before);
  });
});
