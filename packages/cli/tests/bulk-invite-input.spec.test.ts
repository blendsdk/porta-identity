/** Recipient normalization and complete shared requests must validate before any dispatch. */
import type { InviteUserInput } from '@portaidentity/sdk';
import { describe, expect, it } from 'vitest';
import { parseBulkRecipients, prepareBulkInvitations } from '../src/bulk-invite-input.js';

const org = '11111111-1111-4111-8111-111111111111';
const applicationId = 'abcdefab-1234-4123-8123-abcdefabcdef';
const claimDefinitionId = 'fedcbafe-4321-4321-8321-fedcbafedcba';
const marker = 'SENSITIVE_MARKER';

/** Qualify normal runtime encoding rather than assume a portable recursion-depth limit. */
function encodingBoundary(): { failing: string; accepted: string } {
  let accepted = '0';
  for (let depth = 1000; depth <= 32_000; depth *= 2) {
    const raw = `${'['.repeat(depth)}0${']'.repeat(depth)}`;
    const value: unknown = JSON.parse(raw);
    const input: InviteUserInput = {
      organizationId: org, email: 'alice@example.com',
      claims: [{ applicationId, claimDefinitionId, value }],
    };
    try {
      JSON.stringify(input);
      accepted = raw;
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return { failing: raw, accepted };
    }
  }
  throw new Error('Runtime did not qualify a complete-request encoding counterexample');
}

describe('physical lines and duplicate identity', () => {
  it.each(['\n', '\r\n'])('should retain first spelling and physical lines with %j separators', (eol) => {
    expect(parseBulkRecipients(`\uFEFF Alice@EXAMPLE.com ${eol}${eol}alice@example.com${eol} bob@example.com ${eol}`))
      .toStrictEqual({
        inputRecords: 3, duplicates: 1,
        recipients: [{ line: 1, email: 'Alice@EXAMPLE.com' }, { line: 4, email: 'bob@example.com' }],
      });
  });

  it('should preserve plus tags and distinct addresses while ignoring only case for duplicates', () => {
    expect(parseBulkRecipients('a+tag@example.com\nA+TAG@EXAMPLE.COM\na@example.com\na+other@example.com'))
      .toStrictEqual({
        inputRecords: 4, duplicates: 1,
        recipients: [
          { line: 1, email: 'a+tag@example.com' }, { line: 3, email: 'a@example.com' },
          { line: 4, email: 'a+other@example.com' },
        ],
      });
  });

  it.each([
    '', ' \n\t\r\n', 'alice@example.com\nbad',
    'alice@example.com\nbob\uFEFF@example.com', 'alice@example.com\nbob@example.com\rc@example.com',
    'alice@example.com\nü@example.com', 'alice@example.com\n"bob"@example.com',
    'alice@example.com\na..b@example.com', 'alice@example.com\na@example.c',
    'alice@example.com\na@-example.com', 'alice@example.com\na\u0000@example.com',
  ])('should reject the entire input when a lexical or empty-input rule fails: %j', (text) => {
    expect(() => parseBulkRecipients(text)).toThrow();
  });

  it.each(["a'b@example.com", 'a_b@example.com', 'a+b@example.co.uk', '-a@example.com'])
    ('should accept the approved ASCII spelling %s', (email) => {
      expect(parseBulkRecipients(email).recipients).toStrictEqual([{ line: 1, email }]);
    });

  it('should accept one thousand unique addresses without charging duplicates against the limit', () => {
    const emails = Array.from({ length: 1000 }, (_, index) => `person${index}@example.com`);
    const parsed = parseBulkRecipients([...emails, emails[0]!, emails[999]!.toUpperCase()].join('\n'));
    expect(parsed.inputRecords).toBe(1002);
    expect(parsed.duplicates).toBe(2);
    expect(parsed.recipients).toHaveLength(1000);
    expect(parsed.recipients[999]).toStrictEqual({ line: 1000, email: emails[999] });
    expect(() => parseBulkRecipients([...emails, 'extra@example.com'].join('\n'))).toThrow();
  });
});

describe('complete invitation preparation', () => {
  it('should build each plain request with the same ordered shared roles and JSON claims', () => {
    const raw = `{"__proto__":{"${marker}":true},"url":"https://example.test:a"}`;
    const parsed = parseBulkRecipients('Alice@example.com\n\nbob@example.com\nALICE@EXAMPLE.COM');
    const snapshot = structuredClone(parsed);
    const prepared = prepareBulkInvitations(parsed, {
      org, role: [`${applicationId}:${org}`, `${org}:${claimDefinitionId}`],
      claim: [`${applicationId}:${claimDefinitionId}:${raw}`, `${org}:${claimDefinitionId}:false`],
      locale: ' nl ', 'personal-message': 'Welcome',
    });
    expect(prepared).toStrictEqual({
      inputRecords: 3, duplicates: 1,
      recipients: parsed.recipients.map((recipient) => ({
        ...recipient,
        input: {
          organizationId: org, email: recipient.email,
          roles: [{ applicationId, roleId: org }, { applicationId: org, roleId: claimDefinitionId }],
          claims: [
            { applicationId, claimDefinitionId, value: JSON.parse(raw) },
            { applicationId: org, claimDefinitionId, value: false },
          ],
          locale: 'nl', personalMessage: 'Welcome',
        },
      })),
    });
    expect(parsed).toStrictEqual(snapshot);
    expect(Object.getOwnPropertyDescriptor(Object.prototype, marker)).toBeUndefined();
    for (const recipient of prepared.recipients) {
      expect(Object.getPrototypeOf(recipient.input)).toBe(Object.prototype);
      expect(typeof JSON.stringify(recipient.input)).toBe('string');
    }
  });

  it('should omit absent claims, roles and an empty trimmed locale', () => {
    const parsed = parseBulkRecipients('alice@example.com');
    for (const options of [{ org }, { org, role: [], claim: [], locale: '  ' }]) {
      expect(prepareBulkInvitations(parsed, options)).toStrictEqual({
        inputRecords: 1, duplicates: 0,
        recipients: [{ line: 1, email: 'alice@example.com', input: { organizationId: org, email: 'alice@example.com' } }],
      });
    }
  });

  it('should accept exact locale and personal-message length limits', () => {
    const prepared = prepareBulkInvitations(parseBulkRecipients('alice@example.com'), {
      org, locale: 'a'.repeat(10), 'personal-message': 'a'.repeat(500),
    });
    expect(prepared.recipients[0]?.input.locale).toHaveLength(10);
    expect(prepared.recipients[0]?.input.personalMessage).toHaveLength(500);
  });

  it('should accept runtime-qualified encodable nesting without storing encoded text', () => {
    const { accepted } = encodingBoundary();
    const prepared = prepareBulkInvitations(parseBulkRecipients('alice@example.com'), {
      org, claim: [`${applicationId}:${claimDefinitionId}:${accepted}`],
    });
    expect(Object.keys(prepared).sort()).toStrictEqual(['duplicates', 'inputRecords', 'recipients']);
    expect(Object.keys(prepared.recipients[0]!).sort()).toStrictEqual(['email', 'input', 'line']);
    expect(prepared.recipients[0]?.input.claims?.[0]?.value).toStrictEqual(JSON.parse(accepted));
  });

  it('should reject finite parsed JSON when the complete request cannot be encoded', () => {
    const { failing } = encodingBoundary();
    expect(() => prepareBulkInvitations(parseBulkRecipients('alice@example.com\nbob@example.com'), {
      org, claim: [`${applicationId}:${claimDefinitionId}:${failing}`],
    })).toThrow();
  });
});
