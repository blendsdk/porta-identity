import { describe, it, expect } from 'vitest';
import type {
  RoleRow,
  PermissionRow,
  UserRoleRow,
} from '../../../src/rbac/types.js';
import {
  mapRowToRole,
  mapRowToPermission,
  mapRowToUserRole,
} from '../../../src/rbac/types.js';

// ---------------------------------------------------------------------------
// Test helpers — create complete row objects with sensible defaults
// ---------------------------------------------------------------------------

/**
 * Helper to create a complete RoleRow with sensible defaults.
 * Override individual fields as needed in each test.
 */
function createRoleRow(overrides: Partial<RoleRow> = {}): RoleRow {
  return {
    id: 'role-uuid-1',
    application_id: 'app-uuid-1',
    name: 'CRM Editor',
    slug: 'crm-editor',
    description: 'Can edit CRM contacts and deals',
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-15T12:00:00Z'),
    ...overrides,
  };
}

/**
 * Helper to create a complete PermissionRow with sensible defaults.
 * Override individual fields as needed in each test.
 */
function createPermissionRow(overrides: Partial<PermissionRow> = {}): PermissionRow {
  return {
    id: 'perm-uuid-1',
    application_id: 'app-uuid-1',
    module_id: 'mod-uuid-1',
    name: 'Read CRM Contacts',
    slug: 'crm:contacts:read',
    description: 'Allows reading CRM contact records',
    created_at: new Date('2026-02-01T10:00:00Z'),
    ...overrides,
  };
}

/**
 * Helper to create a complete UserRoleRow with sensible defaults.
 * Override individual fields as needed in each test.
 */
function createUserRoleRow(overrides: Partial<UserRoleRow> = {}): UserRoleRow {
  return {
    user_id: 'user-uuid-1',
    role_id: 'role-uuid-1',
    assigned_by: 'admin-uuid-1',
    created_at: new Date('2026-03-01T08:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('types', () => {
  // -------------------------------------------------------------------------
  // mapRowToRole
  // -------------------------------------------------------------------------

  describe('mapRowToRole', () => {
    it('should correctly map all fields from a full row', () => {
      const row = createRoleRow();
      const role = mapRowToRole(row);

      expect(role).toEqual({
        id: 'role-uuid-1',
        applicationId: 'app-uuid-1',
        name: 'CRM Editor',
        slug: 'crm-editor',
        description: 'Can edit CRM contacts and deals',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-15T12:00:00Z'),
      });
    });

    it('should preserve null for description field', () => {
      const row = createRoleRow({ description: null });
      const role = mapRowToRole(row);

      expect(role.description).toBeNull();
    });

    it('should preserve Date objects for timestamp fields', () => {
      const createdAt = new Date('2026-06-15T10:30:00Z');
      const updatedAt = new Date('2026-07-01T14:45:00Z');
      const row = createRoleRow({ created_at: createdAt, updated_at: updatedAt });
      const role = mapRowToRole(row);

      // Verify they are Date instances, not strings
      expect(role.createdAt).toBeInstanceOf(Date);
      expect(role.updatedAt).toBeInstanceOf(Date);
      expect(role.createdAt.toISOString()).toBe('2026-06-15T10:30:00.000Z');
      expect(role.updatedAt.toISOString()).toBe('2026-07-01T14:45:00.000Z');
    });

    it('should map application_id to applicationId', () => {
      const row = createRoleRow({ application_id: 'custom-app-id' });
      const role = mapRowToRole(row);

      expect(role.applicationId).toBe('custom-app-id');
    });

    it('should handle a role with description set', () => {
      const row = createRoleRow({ description: 'A detailed role description' });
      const role = mapRowToRole(row);

      expect(role.description).toBe('A detailed role description');
    });
  });

  // -------------------------------------------------------------------------
  // mapRowToPermission
  // -------------------------------------------------------------------------

  describe('mapRowToPermission', () => {
    it('should correctly map all fields from a full row', () => {
      const row = createPermissionRow();
      const perm = mapRowToPermission(row);

      expect(perm).toEqual({
        id: 'perm-uuid-1',
        applicationId: 'app-uuid-1',
        moduleId: 'mod-uuid-1',
        name: 'Read CRM Contacts',
        slug: 'crm:contacts:read',
        description: 'Allows reading CRM contact records',
        createdAt: new Date('2026-02-01T10:00:00Z'),
      });
    });

    it('should preserve null for module_id field', () => {
      const row = createPermissionRow({ module_id: null });
      const perm = mapRowToPermission(row);

      expect(perm.moduleId).toBeNull();
    });

    it('should preserve null for description field', () => {
      const row = createPermissionRow({ description: null });
      const perm = mapRowToPermission(row);

      expect(perm.description).toBeNull();
    });

    it('should preserve Date objects for created_at', () => {
      const createdAt = new Date('2026-08-20T16:00:00Z');
      const row = createPermissionRow({ created_at: createdAt });
      const perm = mapRowToPermission(row);

      expect(perm.createdAt).toBeInstanceOf(Date);
      expect(perm.createdAt.toISOString()).toBe('2026-08-20T16:00:00.000Z');
    });

    it('should map application_id and module_id to camelCase', () => {
      const row = createPermissionRow({
        application_id: 'custom-app-id',
        module_id: 'custom-mod-id',
      });
      const perm = mapRowToPermission(row);

      expect(perm.applicationId).toBe('custom-app-id');
      expect(perm.moduleId).toBe('custom-mod-id');
    });

    it('should not include updated_at field (permissions table has no updated_at)', () => {
      const row = createPermissionRow();
      const perm = mapRowToPermission(row);

      // Permission interface has createdAt but no updatedAt
      expect(perm).not.toHaveProperty('updatedAt');
    });
  });

  // -------------------------------------------------------------------------
  // mapRowToUserRole
  // -------------------------------------------------------------------------

  describe('mapRowToUserRole', () => {
    it('should correctly map all fields from a full row', () => {
      const row = createUserRoleRow();
      const userRole = mapRowToUserRole(row);

      expect(userRole).toEqual({
        userId: 'user-uuid-1',
        roleId: 'role-uuid-1',
        assignedBy: 'admin-uuid-1',
        createdAt: new Date('2026-03-01T08:00:00Z'),
      });
    });

    it('should preserve null for assigned_by (system-assigned role)', () => {
      const row = createUserRoleRow({ assigned_by: null });
      const userRole = mapRowToUserRole(row);

      expect(userRole.assignedBy).toBeNull();
    });

    it('should preserve Date objects for created_at', () => {
      const createdAt = new Date('2026-09-10T09:15:00Z');
      const row = createUserRoleRow({ created_at: createdAt });
      const userRole = mapRowToUserRole(row);

      expect(userRole.createdAt).toBeInstanceOf(Date);
      expect(userRole.createdAt.toISOString()).toBe('2026-09-10T09:15:00.000Z');
    });

    it('should map user_id and role_id to camelCase', () => {
      const row = createUserRoleRow({
        user_id: 'custom-user-id',
        role_id: 'custom-role-id',
      });
      const userRole = mapRowToUserRole(row);

      expect(userRole.userId).toBe('custom-user-id');
      expect(userRole.roleId).toBe('custom-role-id');
    });
  });
});
