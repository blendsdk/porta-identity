import { describe, it, expect } from 'vitest';
import { parseLoginMethodsFlag } from '../../../src/cli/parsers.js';

describe('parseLoginMethodsFlag', () => {
  describe('undefined / omitted flag', () => {
    it('returns undefined when the flag was not provided (org)', () => {
      expect(parseLoginMethodsFlag(undefined, false)).toBeUndefined();
    });

    it('returns undefined when the flag was not provided (client)', () => {
      expect(parseLoginMethodsFlag(undefined, true)).toBeUndefined();
    });
  });

  describe('inherit sentinel', () => {
    it('returns null for "inherit" when allowInherit is true', () => {
      expect(parseLoginMethodsFlag('inherit', true)).toBeNull();
    });

    it('returns null for "INHERIT" (case-insensitive) when allowInherit is true', () => {
      expect(parseLoginMethodsFlag('INHERIT', true)).toBeNull();
    });

    it('returns null for "  inherit  " (trimmed) when allowInherit is true', () => {
      expect(parseLoginMethodsFlag('  inherit  ', true)).toBeNull();
    });

    it('throws when "inherit" is passed and allowInherit is false (org command)', () => {
      expect(() => parseLoginMethodsFlag('inherit', false)).toThrow(
        /only valid on client commands/,
      );
    });
  });

  describe('valid method lists', () => {
    it('parses a single method', () => {
      expect(parseLoginMethodsFlag('password', false)).toEqual(['password']);
    });

    it('parses a single method (client command)', () => {
      expect(parseLoginMethodsFlag('magic_link', true)).toEqual(['magic_link']);
    });

    it('parses a comma-separated list', () => {
      expect(parseLoginMethodsFlag('password,magic_link', false)).toEqual([
        'password',
        'magic_link',
      ]);
    });

    it('trims whitespace around commas', () => {
      expect(parseLoginMethodsFlag('password , magic_link', false)).toEqual([
        'password',
        'magic_link',
      ]);
    });

    it('preserves user-supplied order', () => {
      expect(parseLoginMethodsFlag('magic_link,password', false)).toEqual([
        'magic_link',
        'password',
      ]);
    });

    it('filters empty segments from trailing commas', () => {
      expect(parseLoginMethodsFlag('password,,magic_link', false)).toEqual([
        'password',
        'magic_link',
      ]);
    });

    it('keeps duplicates as-is (service layer deduplicates)', () => {
      // The CLI is a "dumb" parser — duplicate normalization happens in the service
      // via normalizeLoginMethods(). This keeps the CLI transparent.
      expect(parseLoginMethodsFlag('password,password', false)).toEqual([
        'password',
        'password',
      ]);
    });
  });

  describe('invalid input', () => {
    it('throws on empty string', () => {
      expect(() => parseLoginMethodsFlag('', false)).toThrow(/must not be empty/);
    });

    it('throws on whitespace-only string', () => {
      expect(() => parseLoginMethodsFlag('   ', false)).toThrow(/must not be empty/);
    });

    it('throws on commas-only string', () => {
      expect(() => parseLoginMethodsFlag(',,,', false)).toThrow(/must not be empty/);
    });

    it('throws on unknown method', () => {
      expect(() => parseLoginMethodsFlag('abc', false)).toThrow(/unknown method "abc"/);
    });

    it('throws on unknown method within a valid list', () => {
      expect(() => parseLoginMethodsFlag('password,abc', false)).toThrow(
        /unknown method "abc"/,
      );
    });

    it('throws on typo (case-sensitive method names)', () => {
      expect(() => parseLoginMethodsFlag('Password', false)).toThrow(
        /unknown method "Password"/,
      );
    });

    it('empty-string error message mentions "inherit" on client commands', () => {
      expect(() => parseLoginMethodsFlag('', true)).toThrow(/inherit/);
    });

    it('empty-string error message does NOT mention "inherit" on org commands', () => {
      expect(() => parseLoginMethodsFlag('', false)).toThrow(/must not be empty/);
      expect(() => parseLoginMethodsFlag('', false)).not.toThrow(/inherit/);
    });
  });
});
