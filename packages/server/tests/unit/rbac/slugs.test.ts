import { describe, it, expect } from 'vitest';
import {
  generateRoleSlug,
  validateRoleSlug,
  validatePermissionSlug,
  parsePermissionSlug,
} from '../../../src/rbac/slugs.js';

describe('slugs', () => {
  // -------------------------------------------------------------------------
  // generateRoleSlug
  // -------------------------------------------------------------------------

  describe('generateRoleSlug', () => {
    it('should convert a normal name to a slug', () => {
      expect(generateRoleSlug('CRM Editor')).toBe('crm-editor');
    });

    it('should handle multi-word names', () => {
      expect(generateRoleSlug('Invoice Approver')).toBe('invoice-approver');
    });

    it('should strip special characters and replace with hyphens', () => {
      expect(generateRoleSlug('Café & Bar!!')).toBe('caf-bar');
    });

    it('should collapse consecutive hyphens into a single hyphen', () => {
      expect(generateRoleSlug('hello---world')).toBe('hello-world');
    });

    it('should trim leading and trailing hyphens', () => {
      expect(generateRoleSlug('--hello-world--')).toBe('hello-world');
    });

    it('should strip unicode/non-ASCII characters', () => {
      // Unicode characters are not a-z/0-9, so they become hyphens
      expect(generateRoleSlug('Ünïcödë Rölë')).toBe('n-c-d-r-l');
    });

    it('should truncate very long names to 100 characters', () => {
      const longName = 'a'.repeat(150);
      const slug = generateRoleSlug(longName);
      expect(slug.length).toBeLessThanOrEqual(100);
      expect(slug).toBe('a'.repeat(100));
    });

    it('should trim trailing hyphen after truncation', () => {
      // 99 'a' chars + '-' + 'b' = slug "aaa...a-b" (101 chars)
      // Truncating to 100 leaves "aaa...a-", trailing hyphen trimmed
      const name = 'a'.repeat(99) + '-b';
      const slug = generateRoleSlug(name);
      expect(slug).toBe('a'.repeat(99));
      expect(slug.endsWith('-')).toBe(false);
    });

    it('should return empty string for empty input', () => {
      expect(generateRoleSlug('')).toBe('');
    });

    it('should return empty string for whitespace-only input', () => {
      expect(generateRoleSlug('   ')).toBe('');
    });

    it('should handle names with numbers', () => {
      expect(generateRoleSlug('Level 3 Admin')).toBe('level-3-admin');
    });

    it('should handle already-slugified input', () => {
      expect(generateRoleSlug('crm-editor')).toBe('crm-editor');
    });

    it('should handle single word names', () => {
      expect(generateRoleSlug('Admin')).toBe('admin');
    });
  });

  // -------------------------------------------------------------------------
  // validateRoleSlug
  // -------------------------------------------------------------------------

  describe('validateRoleSlug', () => {
    it('should accept a valid kebab-case slug', () => {
      expect(validateRoleSlug('crm-editor')).toBe(true);
    });

    it('should accept a single character slug', () => {
      expect(validateRoleSlug('a')).toBe(true);
    });

    it('should accept a slug with numbers', () => {
      expect(validateRoleSlug('level-3-admin')).toBe(true);
    });

    it('should accept a slug of exactly 100 characters', () => {
      expect(validateRoleSlug('a'.repeat(100))).toBe(true);
    });

    it('should accept a two-character slug', () => {
      expect(validateRoleSlug('ab')).toBe(true);
    });

    it('should accept a numeric-only slug', () => {
      expect(validateRoleSlug('123')).toBe(true);
    });

    it('should reject an empty string', () => {
      expect(validateRoleSlug('')).toBe(false);
    });

    it('should reject a slug longer than 100 characters', () => {
      expect(validateRoleSlug('a'.repeat(101))).toBe(false);
    });

    it('should reject slugs with uppercase letters', () => {
      expect(validateRoleSlug('CRM-Editor')).toBe(false);
    });

    it('should reject slugs with spaces', () => {
      expect(validateRoleSlug('crm editor')).toBe(false);
    });

    it('should reject slugs with leading hyphen', () => {
      expect(validateRoleSlug('-crm-editor')).toBe(false);
    });

    it('should reject slugs with trailing hyphen', () => {
      expect(validateRoleSlug('crm-editor-')).toBe(false);
    });

    it('should reject slugs with special characters', () => {
      expect(validateRoleSlug('crm_editor')).toBe(false);
    });

    it('should reject slugs with colons', () => {
      // Colons are for permission slugs, not role slugs
      expect(validateRoleSlug('crm:editor')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // validatePermissionSlug
  // -------------------------------------------------------------------------

  describe('validatePermissionSlug', () => {
    it('should accept a valid 3-segment slug', () => {
      expect(validatePermissionSlug('crm:contacts:read')).toBe(true);
    });

    it('should accept a valid slug with different actions', () => {
      expect(validatePermissionSlug('crm:contacts:write')).toBe(true);
      expect(validatePermissionSlug('admin:system:manage')).toBe(true);
      expect(validatePermissionSlug('billing:invoices:delete')).toBe(true);
    });

    it('should accept slugs with 4 or more segments', () => {
      expect(validatePermissionSlug('crm:sub-module:items:write')).toBe(true);
      expect(validatePermissionSlug('a:b:c:d:e')).toBe(true);
    });

    it('should accept segments with hyphens', () => {
      expect(validatePermissionSlug('crm:contact-list:read-all')).toBe(true);
    });

    it('should accept segments with numbers', () => {
      expect(validatePermissionSlug('app1:resource2:action3')).toBe(true);
    });

    it('should reject an empty string', () => {
      expect(validatePermissionSlug('')).toBe(false);
    });

    it('should reject a slug with only 1 segment (no colons)', () => {
      expect(validatePermissionSlug('contacts-read')).toBe(false);
    });

    it('should reject a slug with only 2 segments', () => {
      expect(validatePermissionSlug('crm:contacts')).toBe(false);
    });

    it('should reject a slug with empty segments', () => {
      expect(validatePermissionSlug('crm::read')).toBe(false);
      expect(validatePermissionSlug(':contacts:read')).toBe(false);
      expect(validatePermissionSlug('crm:contacts:')).toBe(false);
    });

    it('should reject segments with uppercase letters', () => {
      expect(validatePermissionSlug('CRM:contacts:read')).toBe(false);
    });

    it('should reject segments with spaces', () => {
      expect(validatePermissionSlug('crm:contact list:read')).toBe(false);
    });

    it('should reject segments starting with a hyphen', () => {
      expect(validatePermissionSlug('crm:-contacts:read')).toBe(false);
    });

    it('should reject segments ending with a hyphen', () => {
      expect(validatePermissionSlug('crm:contacts-:read')).toBe(false);
    });

    it('should reject slugs exceeding 150 characters', () => {
      // Create a slug that exceeds 150 chars total
      const longSlug = 'a'.repeat(50) + ':' + 'b'.repeat(50) + ':' + 'c'.repeat(50);
      expect(longSlug.length).toBe(152);
      expect(validatePermissionSlug(longSlug)).toBe(false);
    });

    it('should accept slugs at exactly 150 characters', () => {
      // Create a slug that is exactly 150 chars
      const slug = 'a'.repeat(48) + ':' + 'b'.repeat(50) + ':' + 'c'.repeat(50);
      expect(slug.length).toBe(150);
      expect(validatePermissionSlug(slug)).toBe(true);
    });

    it('should reject segments with underscores', () => {
      expect(validatePermissionSlug('crm:contact_list:read')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // parsePermissionSlug
  // -------------------------------------------------------------------------

  describe('parsePermissionSlug', () => {
    it('should parse a valid 3-segment slug', () => {
      const result = parsePermissionSlug('crm:contacts:read');
      expect(result).toEqual({
        module: 'crm',
        resource: 'contacts',
        action: 'read',
      });
    });

    it('should parse a slug with different segments', () => {
      const result = parsePermissionSlug('admin:system:manage');
      expect(result).toEqual({
        module: 'admin',
        resource: 'system',
        action: 'manage',
      });
    });

    it('should handle 4+ segments by joining middle segments as resource', () => {
      const result = parsePermissionSlug('crm:sub:items:write');
      expect(result).toEqual({
        module: 'crm',
        resource: 'sub:items',
        action: 'write',
      });
    });

    it('should handle 5 segments correctly', () => {
      const result = parsePermissionSlug('app:mod:sub:res:delete');
      expect(result).toEqual({
        module: 'app',
        resource: 'mod:sub:res',
        action: 'delete',
      });
    });

    it('should parse segments with hyphens', () => {
      const result = parsePermissionSlug('crm:contact-list:read-all');
      expect(result).toEqual({
        module: 'crm',
        resource: 'contact-list',
        action: 'read-all',
      });
    });

    it('should return null for an empty string', () => {
      expect(parsePermissionSlug('')).toBeNull();
    });

    it('should return null for a slug with only 2 segments', () => {
      expect(parsePermissionSlug('crm:contacts')).toBeNull();
    });

    it('should return null for a slug with no colons', () => {
      expect(parsePermissionSlug('contacts-read')).toBeNull();
    });

    it('should return null for a slug with empty segments', () => {
      expect(parsePermissionSlug('crm::read')).toBeNull();
    });

    it('should return null for a slug with uppercase segments', () => {
      expect(parsePermissionSlug('CRM:contacts:read')).toBeNull();
    });
  });
});
