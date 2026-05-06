/**
 * Tests for the CLI argument parsers module.
 *
 * Verifies login method parsing, comma-separated parsing,
 * and key=value parsing.
 */

import { describe, it, expect } from 'vitest';
import { parseLoginMethods, parseCommaSeparated, parseKeyValue } from '../src/parsers.js';

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
});
