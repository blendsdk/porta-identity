import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Application, ApplicationModule } from '../../../src/applications/types.js';
import { ApplicationNotFoundError, ApplicationValidationError } from '../../../src/applications/errors.js';

// Mock all dependencies before importing the module under test
vi.mock('../../../src/applications/service.js', () => ({
  createApplication: vi.fn(),
  getApplicationById: vi.fn(),
  getApplicationBySlug: vi.fn(),
  updateApplication: vi.fn(),
  listApplications: vi.fn(),
  deactivateApplication: vi.fn(),
  activateApplication: vi.fn(),
  archiveApplication: vi.fn(),
  createModule: vi.fn(),
  updateModule: vi.fn(),
  deactivateModule: vi.fn(),
  listModules: vi.fn(),
}));

// Mock super-admin middleware to always pass through
vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

// Mock ETag helpers (route tests don't exercise HTTP headers)
vi.mock('../../../src/lib/etag.js', () => ({
  setETagHeader: vi.fn(),
  checkIfMatch: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../src/lib/entity-history.js', () => ({
  getEntityHistory: vi.fn().mockResolvedValue({ data: [], hasMore: false, nextCursor: null }),
}));

import * as applicationService from '../../../src/applications/service.js';
import { createApplicationRouter } from '../../../src/routes/applications.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Standard test application */
function createTestApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-uuid-1',
    name: 'BusinessSuite',
    slug: 'businesssuite',
    description: 'Enterprise business suite',
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
    name: 'CRM',
    slug: 'crm',
    description: 'Customer relationship management',
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Create a minimal mock Koa context for route testing.
 * Follows the same pattern as the organization route tests.
 */
function createMockCtx(overrides: {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
} = {}) {
  let statusCode = 200;
  let responseBody: unknown = undefined;

  const ctx = {
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    request: { body: overrides.body ?? {} },
    get status() { return statusCode; },
    set status(v: number) { statusCode = v; },
    get body() { return responseBody; },
    set body(v: unknown) { responseBody = v; },
    state: { organization: { isSuperAdmin: true } },
    throw: vi.fn((status: number, message: string) => {
      const err = new Error(message) as Error & { status: number };
      err.status = status;
      throw err;
    }),
  };
  return ctx;
}

/**
 * Helper to find a route handler by method and path.
 * Extracts the last middleware in the stack (the actual handler),
 * skipping any router-level middleware (like requireSuperAdmin).
 */
function findHandler(router: ReturnType<typeof createApplicationRouter>, method: string, path: string) {
  const layer = router.stack.find(
    (l) => l.methods.includes(method) && l.path === path,
  );
  expect(layer).toBeDefined();
  return layer!.stack[layer!.stack.length - 1];
}

describe('application routes', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // POST / — Create application
  // -------------------------------------------------------------------------

  describe('POST / — Create application', () => {
    it('should return 201 with created application', async () => {
      const app = createTestApp();
      (applicationService.createApplication as ReturnType<typeof vi.fn>).mockResolvedValue(app);

      const router = createApplicationRouter();
      const handler = findHandler(router, 'POST', '/api/admin/applications');
      const ctx = createMockCtx({ body: { name: 'BusinessSuite' } });

      await handler(ctx as never, vi.fn());

      expect(ctx.status).toBe(201);
      expect(ctx.body).toEqual({ data: app });
    });

    it('should return 400 for invalid input (missing name)', async () => {
      const router = createApplicationRouter();
      const handler = findHandler(router, 'POST', '/api/admin/applications');
      const ctx = createMockCtx({ body: {} });

      await handler(ctx as never, vi.fn());

      expect(ctx.status).toBe(400);
      expect((ctx.body as { error: string }).error).toBe('Validation failed');
    });

    it('should return 400 when slug is taken', async () => {
      (applicationService.createApplication as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new ApplicationValidationError('Slug already in use'));

      const router = createApplicationRouter();
      const handler = findHandler(router, 'POST', '/api/admin/applications');
      const ctx = createMockCtx({ body: { name: 'BusinessSuite' } });

      await expect(handler(ctx as never, vi.fn())).rejects.toThrow('Slug already in use');
    });
  });

  // -------------------------------------------------------------------------
  // GET / — List applications
  // -------------------------------------------------------------------------

  describe('GET / — List applications', () => {
    it('should return paginated list with defaults', async () => {
      const result = { data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
      (applicationService.listApplications as ReturnType<typeof vi.fn>).mockResolvedValue(result);

      const router = createApplicationRouter();
      const handler = findHandler(router, 'GET', '/api/admin/applications');
      const ctx = createMockCtx({ query: {} });

      await handler(ctx as never, vi.fn());

      expect(ctx.body).toEqual(result);
      expect(applicationService.listApplications).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // GET /:id — Get by ID
  // -------------------------------------------------------------------------

  describe('GET /:id — Get application by ID', () => {
    it('should return application when found', async () => {
      const app = createTestApp();
      (applicationService.getApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(app);

      const router = createApplicationRouter();
      const handler = findHandler(router, 'GET', '/api/admin/applications/:id');
      const ctx = createMockCtx({ params: { id: '00000000-0000-0000-0000-000000000001' } });

      await handler(ctx as never, vi.fn());

      expect(ctx.body).toEqual({ data: app });
    });

    it('should throw 404 when not found', async () => {
      (applicationService.getApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const router = createApplicationRouter();
      const handler = findHandler(router, 'GET', '/api/admin/applications/:id');
      const ctx = createMockCtx({ params: { id: 'nonexistent' } });

      await expect(handler(ctx as never, vi.fn())).rejects.toThrow('Application not found');
    });
  });

  // -------------------------------------------------------------------------
  // PUT /:id — Update application
  // -------------------------------------------------------------------------

  describe('PUT /:id — Update application', () => {
    it('should return updated application', async () => {
      const app = createTestApp({ name: 'Updated' });
      (applicationService.updateApplication as ReturnType<typeof vi.fn>).mockResolvedValue(app);

      const router = createApplicationRouter();
      const handler = findHandler(router, 'PUT', '/api/admin/applications/:id');
      const ctx = createMockCtx({ params: { id: 'app-uuid-1' }, body: { name: 'Updated' } });

      await handler(ctx as never, vi.fn());

      expect(ctx.body).toEqual({ data: app });
    });

    it('should throw 404 when application not found', async () => {
      (applicationService.updateApplication as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new ApplicationNotFoundError('nonexistent'));

      const router = createApplicationRouter();
      const handler = findHandler(router, 'PUT', '/api/admin/applications/:id');
      const ctx = createMockCtx({ params: { id: 'nonexistent' }, body: { name: 'Test' } });

      await expect(handler(ctx as never, vi.fn())).rejects.toThrow('Application not found');
    });
  });

  // -------------------------------------------------------------------------
  // Status actions
  // -------------------------------------------------------------------------

  describe('POST /:id/archive', () => {
    it('should return 204 on success', async () => {
      (applicationService.archiveApplication as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const router = createApplicationRouter();
      const handler = findHandler(router, 'POST', '/api/admin/applications/:id/archive');
      const ctx = createMockCtx({ params: { id: 'app-uuid-1' } });

      await handler(ctx as never, vi.fn());

      expect(ctx.status).toBe(204);
    });

    it('should throw 400 when already archived', async () => {
      (applicationService.archiveApplication as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new ApplicationValidationError('Application is already archived'));

      const router = createApplicationRouter();
      const handler = findHandler(router, 'POST', '/api/admin/applications/:id/archive');
      const ctx = createMockCtx({ params: { id: 'app-uuid-1' } });

      await expect(handler(ctx as never, vi.fn())).rejects.toThrow('Application is already archived');
    });
  });

  describe('POST /:id/activate', () => {
    it('should return 204 on success', async () => {
      (applicationService.activateApplication as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const router = createApplicationRouter();
      const handler = findHandler(router, 'POST', '/api/admin/applications/:id/activate');
      const ctx = createMockCtx({ params: { id: 'app-uuid-1' } });

      await handler(ctx as never, vi.fn());

      expect(ctx.status).toBe(204);
    });
  });

  describe('POST /:id/deactivate', () => {
    it('should return 204 on success', async () => {
      (applicationService.deactivateApplication as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const router = createApplicationRouter();
      const handler = findHandler(router, 'POST', '/api/admin/applications/:id/deactivate');
      const ctx = createMockCtx({ params: { id: 'app-uuid-1' } });

      await handler(ctx as never, vi.fn());

      expect(ctx.status).toBe(204);
    });
  });

  // -------------------------------------------------------------------------
  // Module routes
  // -------------------------------------------------------------------------

  describe('POST /:id/modules — Create module', () => {
    it('should return 201 with created module', async () => {
      const mod = createTestModule();
      (applicationService.createModule as ReturnType<typeof vi.fn>).mockResolvedValue(mod);

      const router = createApplicationRouter();
      const handler = findHandler(router, 'POST', '/api/admin/applications/:id/modules');
      const ctx = createMockCtx({ params: { id: 'app-uuid-1' }, body: { name: 'CRM' } });

      await handler(ctx as never, vi.fn());

      expect(ctx.status).toBe(201);
      expect(ctx.body).toEqual({ data: mod });
      expect(applicationService.createModule).toHaveBeenCalledWith('app-uuid-1', { name: 'CRM' });
    });

    it('should return 400 for invalid module input', async () => {
      const router = createApplicationRouter();
      const handler = findHandler(router, 'POST', '/api/admin/applications/:id/modules');
      const ctx = createMockCtx({ params: { id: 'app-uuid-1' }, body: {} });

      await handler(ctx as never, vi.fn());

      expect(ctx.status).toBe(400);
      expect((ctx.body as { error: string }).error).toBe('Validation failed');
    });
  });

  describe('GET /:id/modules — List modules', () => {
    it('should return modules array', async () => {
      const modules = [createTestModule()];
      (applicationService.listModules as ReturnType<typeof vi.fn>).mockResolvedValue(modules);

      const router = createApplicationRouter();
      const handler = findHandler(router, 'GET', '/api/admin/applications/:id/modules');
      const ctx = createMockCtx({ params: { id: 'app-uuid-1' } });

      await handler(ctx as never, vi.fn());

      expect(ctx.body).toEqual({ data: modules });
    });
  });

  describe('PUT /:id/modules/:moduleId — Update module', () => {
    it('should return updated module', async () => {
      const mod = createTestModule({ name: 'Updated CRM' });
      (applicationService.updateModule as ReturnType<typeof vi.fn>).mockResolvedValue(mod);

      const router = createApplicationRouter();
      const handler = findHandler(router, 'PUT', '/api/admin/applications/:id/modules/:moduleId');
      const ctx = createMockCtx({
        params: { id: 'app-uuid-1', moduleId: 'mod-uuid-1' },
        body: { name: 'Updated CRM' },
      });

      await handler(ctx as never, vi.fn());

      expect(ctx.body).toEqual({ data: mod });
      // Verify moduleId is used (not the app id)
      expect(applicationService.updateModule).toHaveBeenCalledWith('mod-uuid-1', { name: 'Updated CRM' });
    });
  });

  describe('POST /:id/modules/:moduleId/deactivate — Deactivate module', () => {
    it('should return 204 on success', async () => {
      (applicationService.deactivateModule as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const router = createApplicationRouter();
      const handler = findHandler(router, 'POST', '/api/admin/applications/:id/modules/:moduleId/deactivate');
      const ctx = createMockCtx({ params: { id: 'app-uuid-1', moduleId: 'mod-uuid-1' } });

      await handler(ctx as never, vi.fn());

      expect(ctx.status).toBe(204);
      expect(applicationService.deactivateModule).toHaveBeenCalledWith('mod-uuid-1');
    });
  });

  // -------------------------------------------------------------------------
  // Router structure
  // -------------------------------------------------------------------------

  describe('router structure', () => {
    it('should have the correct prefix', () => {
      const router = createApplicationRouter();
      expect(router.opts.prefix).toBe('/api/admin/applications');
    });

    it('should register all expected routes', () => {
      const router = createApplicationRouter();
      const paths = router.stack.map(
        (l) => `${l.methods.filter((m) => m !== 'HEAD').join(',')} ${l.path}`,
      );

      expect(paths).toContain('POST /api/admin/applications');
      expect(paths).toContain('GET /api/admin/applications');
      expect(paths).toContain('GET /api/admin/applications/:id');
      expect(paths).toContain('PUT /api/admin/applications/:id');
      expect(paths).toContain('POST /api/admin/applications/:id/archive');
      expect(paths).toContain('POST /api/admin/applications/:id/activate');
      expect(paths).toContain('POST /api/admin/applications/:id/deactivate');
      expect(paths).toContain('POST /api/admin/applications/:id/modules');
      expect(paths).toContain('GET /api/admin/applications/:id/modules');
      expect(paths).toContain('PUT /api/admin/applications/:id/modules/:moduleId');
      expect(paths).toContain('POST /api/admin/applications/:id/modules/:moduleId/deactivate');
    });
  });
});
