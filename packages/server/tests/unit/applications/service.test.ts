import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Application, ApplicationModule } from '../../../src/applications/types.js';

// Mock all dependencies the service uses
vi.mock('../../../src/applications/repository.js', () => ({
  insertApplication: vi.fn(),
  findApplicationById: vi.fn(),
  findApplicationBySlug: vi.fn(),
  updateApplication: vi.fn(),
  listApplications: vi.fn(),
  slugExists: vi.fn(),
  insertModule: vi.fn(),
  findModuleById: vi.fn(),
  updateModule: vi.fn(),
  listModules: vi.fn(),
  moduleSlugExists: vi.fn(),
}));

vi.mock('../../../src/applications/cache.js', () => ({
  getCachedApplicationById: vi.fn(),
  getCachedApplicationBySlug: vi.fn(),
  cacheApplication: vi.fn(),
  invalidateApplicationCache: vi.fn(),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
}));

import {
  insertApplication,
  findApplicationById,
  findApplicationBySlug,
  updateApplication as repoUpdateApp,
  listApplications as repoListApps,
  slugExists,
  insertModule,
  findModuleById,
  updateModule as repoUpdateModule,
  listModules as repoListModules,
  moduleSlugExists,
} from '../../../src/applications/repository.js';
import {
  getCachedApplicationById,
  getCachedApplicationBySlug,
  cacheApplication,
  invalidateApplicationCache,
} from '../../../src/applications/cache.js';
import { writeAuditLog } from '../../../src/lib/audit-log.js';
import {
  createApplication,
  getApplicationById,
  getApplicationBySlug,
  updateApplication,
  listApplications,
  deactivateApplication,
  activateApplication,
  archiveApplication,
  createModule,
  updateModule,
  deactivateModule,
  listModules,
} from '../../../src/applications/service.js';
import { ApplicationNotFoundError, ApplicationValidationError } from '../../../src/applications/errors.js';

/** Standard test application */
function createTestApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-uuid-1',
    name: 'Business Suite',
    slug: 'business-suite',
    description: null,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Standard test module */
function createTestModule(overrides: Partial<ApplicationModule> = {}): ApplicationModule {
  return {
    id: 'mod-uuid-1',
    applicationId: 'app-uuid-1',
    name: 'CRM Module',
    slug: 'crm-module',
    description: null,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('application service', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // createApplication
  // -------------------------------------------------------------------------

  describe('createApplication', () => {
    it('should auto-generate slug from name', async () => {
      const app = createTestApp();
      (slugExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      (insertApplication as ReturnType<typeof vi.fn>).mockResolvedValue(app);

      const result = await createApplication({ name: 'Business Suite' });

      expect(result.slug).toBe('business-suite');
      expect(insertApplication).toHaveBeenCalled();
    });

    it('should use provided custom slug', async () => {
      const app = createTestApp({ slug: 'custom-slug' });
      (slugExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      (insertApplication as ReturnType<typeof vi.fn>).mockResolvedValue(app);

      await createApplication({ name: 'Suite', slug: 'custom-slug' });

      const insertCall = (insertApplication as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(insertCall.slug).toBe('custom-slug');
    });

    it('should throw validation error for invalid slug', async () => {
      await expect(
        createApplication({ name: 'Suite', slug: 'ab' }), // too short
      ).rejects.toThrow(ApplicationValidationError);
    });

    it('should throw validation error when slug is taken', async () => {
      (slugExists as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await expect(
        createApplication({ name: 'Business Suite' }),
      ).rejects.toThrow('Slug already in use');
    });

    it('should cache the created application', async () => {
      const app = createTestApp();
      (slugExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      (insertApplication as ReturnType<typeof vi.fn>).mockResolvedValue(app);

      await createApplication({ name: 'Business Suite' });

      expect(cacheApplication).toHaveBeenCalledWith(app);
    });

    it('should write audit log on creation', async () => {
      const app = createTestApp();
      (slugExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      (insertApplication as ReturnType<typeof vi.fn>).mockResolvedValue(app);

      await createApplication({ name: 'Business Suite' }, 'actor-1');

      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'app.created',
          actorId: 'actor-1',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // getApplicationById
  // -------------------------------------------------------------------------

  describe('getApplicationById', () => {
    it('should return cached app on cache hit (no DB query)', async () => {
      const app = createTestApp();
      (getCachedApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(app);

      const result = await getApplicationById('app-uuid-1');

      expect(result).toEqual(app);
      expect(findApplicationById).not.toHaveBeenCalled();
    });

    it('should query DB on cache miss and cache the result', async () => {
      const app = createTestApp();
      (getCachedApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (findApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(app);

      const result = await getApplicationById('app-uuid-1');

      expect(result).toEqual(app);
      expect(cacheApplication).toHaveBeenCalledWith(app);
    });

    it('should return null when not found', async () => {
      (getCachedApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (findApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await getApplicationById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getApplicationBySlug
  // -------------------------------------------------------------------------

  describe('getApplicationBySlug', () => {
    it('should return cached app on cache hit', async () => {
      const app = createTestApp();
      (getCachedApplicationBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(app);

      const result = await getApplicationBySlug('business-suite');

      expect(result).toEqual(app);
      expect(findApplicationBySlug).not.toHaveBeenCalled();
    });

    it('should query DB on cache miss and cache the result', async () => {
      const app = createTestApp();
      (getCachedApplicationBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (findApplicationBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(app);

      const result = await getApplicationBySlug('business-suite');

      expect(result).toEqual(app);
      expect(cacheApplication).toHaveBeenCalledWith(app);
    });
  });

  // -------------------------------------------------------------------------
  // updateApplication
  // -------------------------------------------------------------------------

  describe('updateApplication', () => {
    it('should update via repo and invalidate + re-cache', async () => {
      const app = createTestApp({ name: 'Updated Suite' });
      (repoUpdateApp as ReturnType<typeof vi.fn>).mockResolvedValue(app);

      const result = await updateApplication('app-uuid-1', { name: 'Updated Suite' });

      expect(result.name).toBe('Updated Suite');
      expect(invalidateApplicationCache).toHaveBeenCalledWith(app.slug, app.id);
      expect(cacheApplication).toHaveBeenCalledWith(app);
    });

    it('should throw ApplicationNotFoundError when not found', async () => {
      (repoUpdateApp as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Application not found'),
      );

      await expect(
        updateApplication('nonexistent', { name: 'Test' }),
      ).rejects.toThrow(ApplicationNotFoundError);
    });

    it('should write audit log on update', async () => {
      const app = createTestApp();
      (repoUpdateApp as ReturnType<typeof vi.fn>).mockResolvedValue(app);

      await updateApplication('app-uuid-1', { name: 'Updated' }, 'actor-1');

      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'app.updated' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // listApplications
  // -------------------------------------------------------------------------

  describe('listApplications', () => {
    it('should delegate to repository', async () => {
      const mockResult = { data: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
      (repoListApps as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const result = await listApplications({ page: 1, pageSize: 10 });

      expect(repoListApps).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
      expect(result).toEqual(mockResult);
    });
  });

  // -------------------------------------------------------------------------
  // deactivateApplication
  // -------------------------------------------------------------------------

  describe('deactivateApplication', () => {
    it('should deactivate an active application', async () => {
      const app = createTestApp({ status: 'active' });
      (findApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(app);
      (repoUpdateApp as ReturnType<typeof vi.fn>).mockResolvedValue({ ...app, status: 'inactive' });

      await deactivateApplication('app-uuid-1', 'actor-1');

      expect(repoUpdateApp).toHaveBeenCalledWith('app-uuid-1', { status: 'inactive' });
      expect(invalidateApplicationCache).toHaveBeenCalled();
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'app.deactivated' }),
      );
    });

    it('should reject deactivation of non-active application', async () => {
      const app = createTestApp({ status: 'inactive' });
      (findApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(app);

      await expect(
        deactivateApplication('app-uuid-1'),
      ).rejects.toThrow('Cannot deactivate');
    });

    it('should throw not found error when app does not exist', async () => {
      (findApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        deactivateApplication('nonexistent'),
      ).rejects.toThrow(ApplicationNotFoundError);
    });
  });

  // -------------------------------------------------------------------------
  // activateApplication
  // -------------------------------------------------------------------------

  describe('activateApplication', () => {
    it('should activate an inactive application', async () => {
      const app = createTestApp({ status: 'inactive' });
      (findApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(app);
      (repoUpdateApp as ReturnType<typeof vi.fn>).mockResolvedValue({ ...app, status: 'active' });

      await activateApplication('app-uuid-1');

      expect(repoUpdateApp).toHaveBeenCalledWith('app-uuid-1', { status: 'active' });
    });

    it('should reject activation of non-inactive application', async () => {
      const app = createTestApp({ status: 'active' });
      (findApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(app);

      await expect(
        activateApplication('app-uuid-1'),
      ).rejects.toThrow('Cannot activate');
    });

    it('should reject activation of archived application', async () => {
      const app = createTestApp({ status: 'archived' });
      (findApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(app);

      await expect(
        activateApplication('app-uuid-1'),
      ).rejects.toThrow('Cannot activate');
    });
  });

  // -------------------------------------------------------------------------
  // archiveApplication
  // -------------------------------------------------------------------------

  describe('archiveApplication', () => {
    it('should archive an active application', async () => {
      const app = createTestApp({ status: 'active' });
      (findApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(app);
      (repoUpdateApp as ReturnType<typeof vi.fn>).mockResolvedValue({ ...app, status: 'archived' });

      await archiveApplication('app-uuid-1');

      expect(repoUpdateApp).toHaveBeenCalledWith('app-uuid-1', { status: 'archived' });
    });

    it('should archive an inactive application', async () => {
      const app = createTestApp({ status: 'inactive' });
      (findApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(app);
      (repoUpdateApp as ReturnType<typeof vi.fn>).mockResolvedValue({ ...app, status: 'archived' });

      await archiveApplication('app-uuid-1');

      expect(repoUpdateApp).toHaveBeenCalledWith('app-uuid-1', { status: 'archived' });
    });

    it('should reject archiving already archived application', async () => {
      const app = createTestApp({ status: 'archived' });
      (findApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(app);

      await expect(
        archiveApplication('app-uuid-1'),
      ).rejects.toThrow('already archived');
    });
  });

  // -------------------------------------------------------------------------
  // createModule
  // -------------------------------------------------------------------------

  describe('createModule', () => {
    it('should create module with auto-generated slug', async () => {
      const app = createTestApp();
      const mod = createTestModule();
      (findApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(app);
      (moduleSlugExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      (insertModule as ReturnType<typeof vi.fn>).mockResolvedValue(mod);

      const result = await createModule('app-uuid-1', { name: 'CRM Module' });

      expect(result.slug).toBe('crm-module');
      expect(insertModule).toHaveBeenCalled();
    });

    it('should throw not found if parent application does not exist', async () => {
      (findApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        createModule('nonexistent', { name: 'Test' }),
      ).rejects.toThrow(ApplicationNotFoundError);
    });

    it('should throw validation error if module slug is taken within app', async () => {
      const app = createTestApp();
      (findApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(app);
      (moduleSlugExists as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await expect(
        createModule('app-uuid-1', { name: 'CRM Module' }),
      ).rejects.toThrow('Module slug already in use');
    });

    it('should write audit log on module creation', async () => {
      const app = createTestApp();
      const mod = createTestModule();
      (findApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(app);
      (moduleSlugExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      (insertModule as ReturnType<typeof vi.fn>).mockResolvedValue(mod);

      await createModule('app-uuid-1', { name: 'CRM Module' }, 'actor-1');

      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'app.module.created' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // updateModule
  // -------------------------------------------------------------------------

  describe('updateModule', () => {
    it('should update module via repo and write audit log', async () => {
      const mod = createTestModule({ name: 'Updated CRM' });
      (repoUpdateModule as ReturnType<typeof vi.fn>).mockResolvedValue(mod);

      const result = await updateModule('mod-uuid-1', { name: 'Updated CRM' }, 'actor-1');

      expect(result.name).toBe('Updated CRM');
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'app.module.updated' }),
      );
    });

    it('should throw ApplicationNotFoundError when module not found', async () => {
      (repoUpdateModule as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Module not found'),
      );

      await expect(
        updateModule('nonexistent', { name: 'Test' }),
      ).rejects.toThrow(ApplicationNotFoundError);
    });
  });

  // -------------------------------------------------------------------------
  // deactivateModule
  // -------------------------------------------------------------------------

  describe('deactivateModule', () => {
    it('should deactivate an active module', async () => {
      const mod = createTestModule({ status: 'active' });
      (findModuleById as ReturnType<typeof vi.fn>).mockResolvedValue(mod);
      (repoUpdateModule as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mod, status: 'inactive' });

      await deactivateModule('mod-uuid-1', 'actor-1');

      expect(repoUpdateModule).toHaveBeenCalledWith('mod-uuid-1', { status: 'inactive' });
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'app.module.deactivated' }),
      );
    });

    it('should throw not found if module does not exist', async () => {
      (findModuleById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        deactivateModule('nonexistent'),
      ).rejects.toThrow(ApplicationNotFoundError);
    });

    it('should reject deactivation of non-active module', async () => {
      const mod = createTestModule({ status: 'inactive' });
      (findModuleById as ReturnType<typeof vi.fn>).mockResolvedValue(mod);

      await expect(
        deactivateModule('mod-uuid-1'),
      ).rejects.toThrow('Cannot deactivate module');
    });
  });

  // -------------------------------------------------------------------------
  // listModules
  // -------------------------------------------------------------------------

  describe('listModules', () => {
    it('should delegate to repository', async () => {
      const modules = [createTestModule()];
      (repoListModules as ReturnType<typeof vi.fn>).mockResolvedValue(modules);

      const result = await listModules('app-uuid-1');

      expect(repoListModules).toHaveBeenCalledWith('app-uuid-1');
      expect(result).toEqual(modules);
    });
  });
});
