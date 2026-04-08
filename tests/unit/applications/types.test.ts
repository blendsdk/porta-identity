import { describe, it, expect } from 'vitest';
import type {
  ApplicationRow,
  ApplicationModuleRow,
} from '../../../src/applications/types.js';
import {
  mapRowToApplication,
  mapRowToModule,
} from '../../../src/applications/types.js';

/**
 * Helper to create a complete ApplicationRow with sensible defaults.
 * Override individual fields as needed in each test.
 */
function createTestRow(overrides: Partial<ApplicationRow> = {}): ApplicationRow {
  return {
    id: 'app-uuid-1',
    name: 'BusinessSuite',
    slug: 'business-suite',
    description: 'Enterprise business application',
    status: 'active',
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-15T12:00:00Z'),
    ...overrides,
  };
}

/**
 * Helper to create a complete ApplicationModuleRow with sensible defaults.
 * Override individual fields as needed in each test.
 */
function createTestModuleRow(
  overrides: Partial<ApplicationModuleRow> = {},
): ApplicationModuleRow {
  return {
    id: 'mod-uuid-1',
    application_id: 'app-uuid-1',
    name: 'CRM',
    slug: 'crm',
    description: 'Customer relationship management module',
    status: 'active',
    created_at: new Date('2026-02-01T00:00:00Z'),
    updated_at: new Date('2026-02-10T08:00:00Z'),
    ...overrides,
  };
}

describe('types', () => {
  // -------------------------------------------------------------------------
  // mapRowToApplication
  // -------------------------------------------------------------------------

  describe('mapRowToApplication', () => {
    it('should correctly map all fields from a full row', () => {
      const row = createTestRow();
      const app = mapRowToApplication(row);

      expect(app).toEqual({
        id: 'app-uuid-1',
        name: 'BusinessSuite',
        slug: 'business-suite',
        description: 'Enterprise business application',
        status: 'active',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-15T12:00:00Z'),
      });
    });

    it('should preserve null values for description', () => {
      const row = createTestRow({ description: null });
      const app = mapRowToApplication(row);

      expect(app.description).toBeNull();
    });

    it('should cast status string to ApplicationStatus type', () => {
      // The DB CHECK constraint ensures only valid values, but we verify
      // the cast works for all three valid statuses
      for (const status of ['active', 'inactive', 'archived'] as const) {
        const row = createTestRow({ status });
        const app = mapRowToApplication(row);
        expect(app.status).toBe(status);
      }
    });

    it('should preserve Date objects for timestamp fields', () => {
      const createdAt = new Date('2026-03-15T10:30:00Z');
      const updatedAt = new Date('2026-04-01T14:45:00Z');
      const row = createTestRow({ created_at: createdAt, updated_at: updatedAt });
      const app = mapRowToApplication(row);

      // Verify they are Date instances, not strings
      expect(app.createdAt).toBeInstanceOf(Date);
      expect(app.updatedAt).toBeInstanceOf(Date);
      expect(app.createdAt.toISOString()).toBe('2026-03-15T10:30:00.000Z');
      expect(app.updatedAt.toISOString()).toBe('2026-04-01T14:45:00.000Z');
    });
  });

  // -------------------------------------------------------------------------
  // mapRowToModule
  // -------------------------------------------------------------------------

  describe('mapRowToModule', () => {
    it('should correctly map all fields from a full module row', () => {
      const row = createTestModuleRow();
      const mod = mapRowToModule(row);

      expect(mod).toEqual({
        id: 'mod-uuid-1',
        applicationId: 'app-uuid-1',
        name: 'CRM',
        slug: 'crm',
        description: 'Customer relationship management module',
        status: 'active',
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-10T08:00:00Z'),
      });
    });

    it('should preserve null values for module description', () => {
      const row = createTestModuleRow({ description: null });
      const mod = mapRowToModule(row);

      expect(mod.description).toBeNull();
    });

    it('should cast module status string to ModuleStatus type', () => {
      // application_modules only allow 'active' and 'inactive'
      for (const status of ['active', 'inactive'] as const) {
        const row = createTestModuleRow({ status });
        const mod = mapRowToModule(row);
        expect(mod.status).toBe(status);
      }
    });

    it('should map application_id to applicationId (camelCase)', () => {
      const row = createTestModuleRow({ application_id: 'custom-app-id' });
      const mod = mapRowToModule(row);

      expect(mod.applicationId).toBe('custom-app-id');
    });

    it('should preserve Date objects for module timestamp fields', () => {
      const createdAt = new Date('2026-05-20T09:15:00Z');
      const updatedAt = new Date('2026-06-01T16:30:00Z');
      const row = createTestModuleRow({
        created_at: createdAt,
        updated_at: updatedAt,
      });
      const mod = mapRowToModule(row);

      expect(mod.createdAt).toBeInstanceOf(Date);
      expect(mod.updatedAt).toBeInstanceOf(Date);
      expect(mod.createdAt.toISOString()).toBe('2026-05-20T09:15:00.000Z');
      expect(mod.updatedAt.toISOString()).toBe('2026-06-01T16:30:00.000Z');
    });
  });
});
