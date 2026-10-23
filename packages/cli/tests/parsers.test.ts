/**
 * Tests for the CLI argument parsers module.
 *
 * Verifies login method parsing, comma-separated parsing,
 * and key=value parsing.
 */

import { describe, it, expect } from 'vitest';
import {
  parseLoginMethods,
  parseLoginMethodsFlag,
  parseCommaSeparated,
  parseKeyValue,
  parseRoleAssignments,
} from '../src/parsers.js';

describe('parsers', () => {
  describe('parseLoginMethods', () => {
    it('parses a single method', () => {
      expect(parseLoginMethods('password')).toEqual(['password']);
    });

    it('parses multiple methods', () => {
      expect(parseLoginMethods('password,magic_link')).toEqual(['password', 'magic_link']);
    });

    it('trims whitespace', () => {
      expect(parseLoginMethods('password , magic_link')).toEqual(['password', 'magic_link']);
    });

    it('normalizes to lowercase', () => {
      expect(parseLoginMethods('Password,MAGIC_LINK')).toEqual(['password', 'magic_link']);
    });

    it('throws for invalid method', () => {
      expect(() => parseLoginMethods('invalid')).toThrow('Invalid login method: "invalid"');
    });

    it('throws for partially invalid input', () => {
      expect(() => parseLoginMethods('password,oauth')).toThrow('Invalid login method: "oauth"');
    });
  });

  describe('parseCommaSeparated', () => {
    it('splits by comma', () => {
      expect(parseCommaSeparated('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    it('trims whitespace', () => {
      expect(parseCommaSeparated(' a , b , c ')).toEqual(['a', 'b', 'c']);
    });

    it('filters empty strings', () => {
      expect(parseCommaSeparated('a,,b,')).toEqual(['a', 'b']);
    });

    it('handles single value', () => {
      expect(parseCommaSeparated('single')).toEqual(['single']);
    });

    it('returns empty array for empty string', () => {
      expect(parseCommaSeparated('')).toEqual([]);
    });
  });

  describe('parseKeyValue', () => {
    it('parses basic key=value', () => {
      expect(parseKeyValue('name=John')).toEqual(['name', 'John']);
    });

    it('handles value containing equals sign', () => {
      expect(parseKeyValue('url=https://example.com?a=1')).toEqual([
        'url',
        'https://example.com?a=1',
      ]);
    });

    it('trims key and value', () => {
      expect(parseKeyValue(' name = value ')).toEqual(['name', 'value']);
    });

    it('throws when no equals sign present', () => {
      expect(() => parseKeyValue('noequals')).toThrow('Invalid key=value format');
    });

    it('handles empty value', () => {
      expect(parseKeyValue('key=')).toEqual(['key', '']);
    });
  });

  describe('parseLoginMethodsFlag', () => {
    it('returns undefined when value is undefined', () => {
      expect(parseLoginMethodsFlag(undefined, true)).toBeUndefined();
      expect(parseLoginMethodsFlag(undefined, false)).toBeUndefined();
    });

    it('returns null for "inherit" when allowInherit is true', () => {
      expect(parseLoginMethodsFlag('inherit', true)).toBeNull();
      expect(parseLoginMethodsFlag('Inherit', true)).toBeNull();
      expect(parseLoginMethodsFlag(' inherit ', true)).toBeNull();
    });

    it('throws for "inherit" when allowInherit is false', () => {
      expect(() => parseLoginMethodsFlag('inherit', false)).toThrow('only valid on client');
    });

    it('parses single method', () => {
      expect(parseLoginMethodsFlag('password', true)).toEqual(['password']);
    });

    it('parses multiple methods', () => {
      expect(parseLoginMethodsFlag('password,magic_link', false)).toEqual([
        'password',
        'magic_link',
      ]);
    });

    it('throws on unknown method', () => {
      expect(() => parseLoginMethodsFlag('sms', true)).toThrow('unknown method "sms"');
    });

    it('throws on empty string', () => {
      expect(() => parseLoginMethodsFlag('', true)).toThrow('must not be empty');
      expect(() => parseLoginMethodsFlag('  ', false)).toThrow('must not be empty');
    });
  });

  describe('parseRoleAssignments', () => {
    const applicationId = '11111111-1111-4111-8111-111111111111';
    const secondApplicationId = '22222222-2222-4222-8222-222222222222';
    const roleId = '33333333-3333-4333-8333-333333333333';
    const secondRoleId = '44444444-4444-4444-8444-444444444444';

    it('returns undefined when the flag is absent or empty', () => {
      expect(parseRoleAssignments(undefined)).toBeUndefined();
      expect(parseRoleAssignments([])).toBeUndefined();
    });

    it('parses one pair', () => {
      expect(parseRoleAssignments([`${applicationId}:${roleId}`])).toEqual([
        { applicationId, roleId },
      ]);
    });

    it('parses repeated pairs in order', () => {
      expect(
        parseRoleAssignments([
          `${applicationId}:${roleId}`,
          `${secondApplicationId}:${secondRoleId}`,
        ]),
      ).toEqual([
        { applicationId, roleId },
        { applicationId: secondApplicationId, roleId: secondRoleId },
      ]);
    });

    it('trims surrounding whitespace', () => {
      expect(parseRoleAssignments([` ${applicationId} : ${roleId} `])).toEqual([
        { applicationId, roleId },
      ]);
    });

    it('accepts uppercase UUIDs without changing their case', () => {
      const upperApplicationId = applicationId.toUpperCase();
      const upperRoleId = roleId.toUpperCase();

      expect(parseRoleAssignments([`${upperApplicationId}:${upperRoleId}`])).toEqual([
        { applicationId: upperApplicationId, roleId: upperRoleId },
      ]);
    });

    it('rejects a value without the separator', () => {
      expect(() => parseRoleAssignments(['not-a-pair'])).toThrow(
        'must be "<application-id>:<role-id>"',
      );
    });

    it('rejects a value with more than one separator', () => {
      expect(() => parseRoleAssignments([`${applicationId}:${roleId}:extra`])).toThrow(
        'must be "<application-id>:<role-id>"',
      );
    });

    it.each([
      `:${roleId}`,
      `${applicationId}:`,
      `not-a-uuid:${roleId}`,
      `${applicationId}:not-a-uuid`,
    ])('rejects an invalid pair %s', (value) => {
      expect(() => parseRoleAssignments([value])).toThrow('two valid UUIDs');
    });
  });
});
