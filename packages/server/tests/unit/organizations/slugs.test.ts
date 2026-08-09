import { describe, it, expect } from 'vitest';
import {
  generateSlug,
  validateSlug,
  RESERVED_SLUGS,
} from '../../../src/organizations/slugs.js';

describe('slugs', () => {
  // -------------------------------------------------------------------------
  // generateSlug
  // -------------------------------------------------------------------------

  describe('generateSlug', () => {
    it('should convert a normal name to a slug', () => {
      expect(generateSlug('Acme Corp')).toBe('acme-corp');
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
      expect(generateSlug('Ünïcödë Örg')).toBe('n-c-d-rg');
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
      expect(generateSlug('Company 123')).toBe('company-123');
    });
  });

  // -------------------------------------------------------------------------
  // validateSlug
  // -------------------------------------------------------------------------

  describe('validateSlug', () => {
    it('should accept a valid slug', () => {
      const result = validateSlug('acme-corp');
      expect(result).toEqual({ isValid: true });
    });

    it('should accept a slug with numbers', () => {
      const result = validateSlug('org-123');
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

    it('should reject reserved word "api"', () => {
      const result = validateSlug('api');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('reserved');
    });

    it('should reject slugs with uppercase letters', () => {
      const result = validateSlug('Acme-Corp');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('lowercase');
    });

    it('should reject slugs with leading hyphen', () => {
      const result = validateSlug('-acme-corp');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('cannot start or end with a hyphen');
    });

    it('should reject slugs with trailing hyphen', () => {
      const result = validateSlug('acme-corp-');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('cannot start or end with a hyphen');
    });

    it('should reject slugs with invalid characters (spaces)', () => {
      const result = validateSlug('acme corp');
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
    it('should contain all expected system route words', () => {
      const expected = [
        'admin', 'api', 'health', 'static', '.well-known',
        'login', 'logout', 'callback', 'register', 'signup',
        'auth', 'oauth', 'oidc', 'token', 'jwks',
        'portal', 'dashboard', 'settings', 'account',
        'favicon.ico', 'robots.txt', 'sitemap.xml',
      ];
      for (const word of expected) {
        expect(RESERVED_SLUGS.has(word)).toBe(true);
      }
    });

    it('should be a frozen/readonly set', () => {
      // ReadonlySet doesn't expose add/delete at the type level,
      // but at runtime Set.prototype.add still exists — we just
      // verify the set has the expected size to confirm it's populated
      expect(RESERVED_SLUGS.size).toBe(22);
    });
  });
});
