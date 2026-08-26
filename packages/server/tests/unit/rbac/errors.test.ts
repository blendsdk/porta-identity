import { describe, it, expect } from 'vitest';
import {
  RoleNotFoundError,
  PermissionNotFoundError,
  RbacValidationError,
} from '../../../src/rbac/errors.js';

describe('errors', () => {
  // -------------------------------------------------------------------------
  // RoleNotFoundError
  // -------------------------------------------------------------------------

  describe('RoleNotFoundError', () => {
    it('should set the correct error name', () => {
      const error = new RoleNotFoundError('role-uuid-1');
      expect(error.name).toBe('RoleNotFoundError');
    });

    it('should include the identifier in the message', () => {
      const error = new RoleNotFoundError('role-uuid-1');
      expect(error.message).toBe('Role not found: role-uuid-1');
    });

    it('should be an instance of Error', () => {
      const error = new RoleNotFoundError('role-uuid-1');
      expect(error).toBeInstanceOf(Error);
    });

    it('should work with slug identifiers', () => {
      const error = new RoleNotFoundError('crm-editor');
      expect(error.message).toBe('Role not found: crm-editor');
    });
  });

  // -------------------------------------------------------------------------
  // PermissionNotFoundError
  // -------------------------------------------------------------------------

  describe('PermissionNotFoundError', () => {
    it('should set the correct error name', () => {
      const error = new PermissionNotFoundError('perm-uuid-1');
      expect(error.name).toBe('PermissionNotFoundError');
    });

    it('should include the identifier in the message', () => {
      const error = new PermissionNotFoundError('perm-uuid-1');
      expect(error.message).toBe('Permission not found: perm-uuid-1');
    });

    it('should be an instance of Error', () => {
      const error = new PermissionNotFoundError('perm-uuid-1');
      expect(error).toBeInstanceOf(Error);
    });

    it('should work with slug identifiers', () => {
      const error = new PermissionNotFoundError('crm:contacts:read');
      expect(error.message).toBe('Permission not found: crm:contacts:read');
    });
  });

  // -------------------------------------------------------------------------
  // RbacValidationError
  // -------------------------------------------------------------------------

  describe('RbacValidationError', () => {
    it('should set the correct error name', () => {
      const error = new RbacValidationError('Slug already taken');
      expect(error.name).toBe('RbacValidationError');
    });

    it('should use the provided message directly', () => {
      const error = new RbacValidationError('Invalid permission slug format');
      expect(error.message).toBe('Invalid permission slug format');
    });

    it('should be an instance of Error', () => {
      const error = new RbacValidationError('Some validation error');
      expect(error).toBeInstanceOf(Error);
    });

    it('should support various validation messages', () => {
      // Duplicate slug
      const dupError = new RbacValidationError('Role slug "admin" already exists in this application');
      expect(dupError.message).toContain('already exists');

      // Deletion guard
      const guardError = new RbacValidationError('Cannot delete role: 3 users still assigned');
      expect(guardError.message).toContain('Cannot delete');

      // Invalid format
      const formatError = new RbacValidationError('Permission slug must follow module:resource:action format');
      expect(formatError.message).toContain('module:resource:action');
    });
  });
});
