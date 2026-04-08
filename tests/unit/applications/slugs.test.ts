import { describe, it, expect } from 'vitest';
import {
  generateSlug,
  validateSlug,
  RESERVED_SLUGS,
} from '../../../src/applications/slugs.js';

describe('slugs', () => {
  // -------------------------------------------------------------------------
  // generateSlug
  // -------------------------------------------------------------------------

  describe('generateSlug', () => {
    it('should convert a normal name to a slug', () => {
      expect(generateSlug('Business Suite')).toBe('business-suite');
    });

    it('should strip special characters and replace with hyphens', () => {
      // Non-alphanumeric chars become hyphens, then collapsed + trimmed
      expect(generateSlug('Café & Bar!!')).toBe('caf-bar');
    });

    it('should collapse consecutive hyphens into a single hyphen', () => {
      expect(generateSlug('hello---world')).toBe('hello-world');
    });

    it('should trim leading and trailing hyphens', () => {
      // Leading/trailing special chars become hyphens, then trimmed
      expect(generateSlug('--hello-world--')).toBe('hello-world');
    });

    it('should strip unicode/non-ASCII characters', () => {
      // Unicode characters are not a-z/0-9, so they become hyphens
      expect(generateSlug('Ünïcödë App')).toBe('n-c-d-app');
    });

    it('should truncate very long names to 100 characters', () => {
      // Create a name that produces a slug longer than 100 chars
      const longName = 'a'.repeat(150);
      const slug = generateSlug(longName);
      expect(slug.length).toBeLessThanOrEqual(100);
      expect(slug).toBe('a'.repeat(100));
    });

    it('should trim trailing hyphen after truncation', () => {
      // Build a name where truncation at 100 chars would end on a hyphen
      // 99 'a' chars + '-' + 'b' = slug "aaa...a-b" (101 chars)
      // Truncating to 100 leaves "aaa...a-", trailing hyphen trimmed
      const name = 'a'.repeat(99) + '-b';
      const slug = generateSlug(name);
      expect(slug).toBe('a'.repeat(99));
      expect(slug.endsWith('-')).toBe(false);
    });

    it('should return empty string for empty input', () => {
      expect(generateSlug('')).toBe('');
    });

    it('should return empty string for whitespace-only input', () => {
      expect(generateSlug('   ')).toBe('');
    });

    it('should handle names with numbers', () => {
      expect(generateSlug('App Version 2')).toBe('app-version-2');
    });
  });

  // -------------------------------------------------------------------------
  // validateSlug
  // -------------------------------------------------------------------------

  describe('validateSlug', () => {
    it('should accept a valid slug', () => {
      const result = validateSlug('business-suite');
      expect(result).toEqual({ isValid: true });
    });

    it('should accept a slug with numbers', () => {
      const result = validateSlug('app-123');
      expect(result).toEqual({ isValid: true });
    });

    it('should reject slugs shorter than 3 characters', () => {
      const result = validateSlug('ab');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('at least 3 characters');
    });

    it('should reject slugs longer than 100 characters', () => {
      const result = validateSlug('a'.repeat(101));
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('at most 100 characters');
    });

    it('should reject reserved word "admin"', () => {
      const result = validateSlug('admin');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('reserved');
    });

    it('should reject reserved word "system"', () => {
      const result = validateSlug('system');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('reserved');
    });

    it('should reject reserved word "default"', () => {
      const result = validateSlug('default');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('reserved');
    });

    it('should reject slugs with uppercase letters', () => {
      const result = validateSlug('Business-Suite');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('lowercase');
    });

    it('should reject slugs with leading hyphen', () => {
      const result = validateSlug('-business-suite');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('cannot start or end with a hyphen');
    });

    it('should reject slugs with trailing hyphen', () => {
      const result = validateSlug('business-suite-');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('cannot start or end with a hyphen');
    });

    it('should reject slugs with invalid characters (spaces)', () => {
      const result = validateSlug('business suite');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('lowercase');
    });

    it('should accept exactly 3-character slug', () => {
      const result = validateSlug('abc');
      expect(result).toEqual({ isValid: true });
    });

    it('should accept exactly 100-character slug', () => {
      const result = validateSlug('a'.repeat(100));
      expect(result).toEqual({ isValid: true });
    });
  });

  // -------------------------------------------------------------------------
  // RESERVED_SLUGS
  // -------------------------------------------------------------------------

  describe('RESERVED_SLUGS', () => {
    it('should contain all expected application-specific reserved words', () => {
      const expected = [
        'admin',
        'api',
        'system',
        'internal',
        'default',
        'health',
        'status',
      ];
      for (const word of expected) {
        expect(RESERVED_SLUGS.has(word)).toBe(true);
      }
    });

    it('should have the correct number of reserved words', () => {
      // 7 reserved words for application slugs
      expect(RESERVED_SLUGS.size).toBe(7);
    });

    it('should not contain organization-specific reserved words', () => {
      // Application reserved words are a different set from organization reserved words.
      // These are org-specific words that should NOT be in app reserved slugs.
      const orgOnly = ['login', 'logout', 'callback', 'register', 'oidc', 'portal'];
      for (const word of orgOnly) {
        expect(RESERVED_SLUGS.has(word)).toBe(false);
      }
    });
  });
});
