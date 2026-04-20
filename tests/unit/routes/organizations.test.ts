import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Organization } from '../../../src/organizations/types.js';
import { OrganizationNotFoundError, OrganizationValidationError } from '../../../src/organizations/errors.js';

// Mock all dependencies before importing the module under test
vi.mock('../../../src/organizations/service.js', () => ({
  createOrganization: vi.fn(),
  getOrganizationById: vi.fn(),
  getOrganizationBySlug: vi.fn(),
  updateOrganization: vi.fn(),
  updateOrganizationBranding: vi.fn(),
  suspendOrganization: vi.fn(),
  activateOrganization: vi.fn(),
  archiveOrganization: vi.fn(),
  restoreOrganization: vi.fn(),
  listOrganizations: vi.fn(),
  validateSlugAvailability: vi.fn(),
}));

// Mock super-admin middleware to always pass through
vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

import * as organizationService from '../../../src/organizations/service.js';
import { createOrganizationRouter } from '../../../src/routes/organizations.js';

/** Standard test organization */
function createTestOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-uuid-1',
    name: 'Acme Corporation',
    slug: 'acme-corporation',
    status: 'active',
    isSuperAdmin: false,
    brandingLogoUrl: null,
    brandingFaviconUrl: null,
    brandingPrimaryColor: null,
    brandingCompanyName: null,
    brandingCustomCss: null,
    defaultLocale: 'en',
    defaultLoginMethods: ['password', 'magic_link'],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Create a minimal mock Koa context for route testing.
 * Simulates what Koa provides to route handlers.
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

describe('organization routes', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // POST / — Create
  // -------------------------------------------------------------------------

  describe('POST / — Create organization', () => {
    it('should return 201 with created organization', async () => {
      const org = createTestOrg();
      (organizationService.createOrganization as ReturnType<typeof vi.fn>).mockResolvedValue(org);

      const router = createOrganizationRouter();
      const layer = router.stack.find(
        (l) => l.methods.includes('POST') && l.path === '/api/admin/organizations',
      );
      expect(layer).toBeDefined();

      const ctx = createMockCtx({ body: { name: 'Acme Corporation' } });
      const next = vi.fn();

      // Execute the route's middleware stack (skip router.use middleware)
      await layer!.stack[layer!.stack.length - 1](ctx as never, next);

      expect(ctx.status).toBe(201);
      expect(ctx.body).toEqual({ data: org });
    });

    it('should return 400 for invalid input (missing name)', async () => {
      const router = createOrganizationRouter();
      const layer = router.stack.find(
        (l) => l.methods.includes('POST') && l.path === '/api/admin/organizations',
      );

      const ctx = createMockCtx({ body: {} }); // missing required 'name'
      const next = vi.fn();

      await layer!.stack[layer!.stack.length - 1](ctx as never, next);

      expect(ctx.status).toBe(400);
      expect((ctx.body as { error: string }).error).toBe('Validation failed');
    });

    it('should return 400 when slug is taken', async () => {
      (organizationService.createOrganization as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new OrganizationValidationError('Slug already in use'));

      const router = createOrganizationRouter();
      const layer = router.stack.find(
        (l) => l.methods.includes('POST') && l.path === '/api/admin/organizations',
      );

      const ctx = createMockCtx({ body: { name: 'Acme' } });
      const next = vi.fn();

      await expect(
        layer!.stack[layer!.stack.length - 1](ctx as never, next),
      ).rejects.toThrow('Slug already in use');
    });

    // -----------------------------------------------------------------------
    // defaultLoginMethods — Zod validation at the HTTP boundary
    // -----------------------------------------------------------------------
    describe('defaultLoginMethods', () => {
      it('should accept a valid array and pass it to the service', async () => {
        const org = createTestOrg({ defaultLoginMethods: ['password'] });
        (organizationService.createOrganization as ReturnType<typeof vi.fn>).mockResolvedValue(org);

        const router = createOrganizationRouter();
        const layer = router.stack.find(
          (l) => l.methods.includes('POST') && l.path === '/api/admin/organizations',
        );

        const ctx = createMockCtx({
          body: { name: 'Password Only Corp', defaultLoginMethods: ['password'] },
        });

        await layer!.stack[layer!.stack.length - 1](ctx as never, vi.fn());

        expect(ctx.status).toBe(201);
        expect(ctx.body).toEqual({ data: org });
        expect(organizationService.createOrganization).toHaveBeenCalledWith(
          expect.objectContaining({ defaultLoginMethods: ['password'] }),
        );
      });

      it('should return 400 for an empty defaultLoginMethods array', async () => {
        const router = createOrganizationRouter();
        const layer = router.stack.find(
          (l) => l.methods.includes('POST') && l.path === '/api/admin/organizations',
        );

        const ctx = createMockCtx({
          body: { name: 'Acme', defaultLoginMethods: [] },
        });

        await layer!.stack[layer!.stack.length - 1](ctx as never, vi.fn());

        expect(ctx.status).toBe(400);
        expect((ctx.body as { error: string }).error).toBe('Validation failed');
        expect(organizationService.createOrganization).not.toHaveBeenCalled();
      });

      it('should return 400 for an unknown login method', async () => {
        const router = createOrganizationRouter();
        const layer = router.stack.find(
          (l) => l.methods.includes('POST') && l.path === '/api/admin/organizations',
        );

        const ctx = createMockCtx({
          body: { name: 'Acme', defaultLoginMethods: ['sms'] },
        });

        await layer!.stack[layer!.stack.length - 1](ctx as never, vi.fn());

        expect(ctx.status).toBe(400);
        expect((ctx.body as { error: string }).error).toBe('Validation failed');
        expect(organizationService.createOrganization).not.toHaveBeenCalled();
      });

      it('should omit defaultLoginMethods when not provided (DB DEFAULT applies)', async () => {
        const org = createTestOrg();
        (organizationService.createOrganization as ReturnType<typeof vi.fn>).mockResolvedValue(org);

        const router = createOrganizationRouter();
        const layer = router.stack.find(
          (l) => l.methods.includes('POST') && l.path === '/api/admin/organizations',
        );

        const ctx = createMockCtx({ body: { name: 'Acme' } });

        await layer!.stack[layer!.stack.length - 1](ctx as never, vi.fn());

        expect(ctx.status).toBe(201);
        const calledWith = (organizationService.createOrganization as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(calledWith.defaultLoginMethods).toBeUndefined();
      });
    });
  });

  // -------------------------------------------------------------------------
  // GET / — List
  // -------------------------------------------------------------------------

  describe('GET / — List organizations', () => {
    it('should return paginated list with defaults', async () => {
      const result = { data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
      (organizationService.listOrganizations as ReturnType<typeof vi.fn>).mockResolvedValue(result);

      const router = createOrganizationRouter();
      const layer = router.stack.find(
        (l) => l.methods.includes('GET') && l.path === '/api/admin/organizations',
      );

      const ctx = createMockCtx({ query: {} });
      const next = vi.fn();

      await layer!.stack[layer!.stack.length - 1](ctx as never, next);

      expect(ctx.body).toEqual(result);
      expect(organizationService.listOrganizations).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // GET /:id — Get by ID
  // -------------------------------------------------------------------------

  describe('GET /:id — Get organization by ID', () => {
    it('should return organization when found', async () => {
      const org = createTestOrg();
      (organizationService.getOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(org);

      const router = createOrganizationRouter();
      const layer = router.stack.find(
        (l) => l.methods.includes('GET') && l.path === '/api/admin/organizations/:id',
      );

      const ctx = createMockCtx({ params: { id: '00000000-0000-0000-0000-000000000001' } });
      const next = vi.fn();

      await layer!.stack[layer!.stack.length - 1](ctx as never, next);

      expect(ctx.body).toEqual({ data: org });
    });

    it('should throw 404 when not found', async () => {
      (organizationService.getOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const router = createOrganizationRouter();
      const layer = router.stack.find(
        (l) => l.methods.includes('GET') && l.path === '/api/admin/organizations/:id',
      );

      const ctx = createMockCtx({ params: { id: 'nonexistent' } });
      const next = vi.fn();

      await expect(
        layer!.stack[layer!.stack.length - 1](ctx as never, next),
      ).rejects.toThrow('Organization not found');
    });
  });

  // -------------------------------------------------------------------------
  // PUT /:id — Update
  // -------------------------------------------------------------------------

  describe('PUT /:id — Update organization', () => {
    it('should return updated organization', async () => {
      const org = createTestOrg({ name: 'Updated' });
      (organizationService.updateOrganization as ReturnType<typeof vi.fn>).mockResolvedValue(org);

      const router = createOrganizationRouter();
      const layer = router.stack.find(
        (l) => l.methods.includes('PUT') && l.path === '/api/admin/organizations/:id',
      );

      const ctx = createMockCtx({ params: { id: 'org-uuid-1' }, body: { name: 'Updated' } });
      const next = vi.fn();

      await layer!.stack[layer!.stack.length - 1](ctx as never, next);

      expect(ctx.body).toEqual({ data: org });
    });

    it('should throw 404 when organization not found', async () => {
      (organizationService.updateOrganization as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new OrganizationNotFoundError('nonexistent'));

      const router = createOrganizationRouter();
      const layer = router.stack.find(
        (l) => l.methods.includes('PUT') && l.path === '/api/admin/organizations/:id',
      );

      const ctx = createMockCtx({ params: { id: 'nonexistent' }, body: { name: 'Test' } });
      const next = vi.fn();

      await expect(
        layer!.stack[layer!.stack.length - 1](ctx as never, next),
      ).rejects.toThrow('Organization not found');
    });

    it('should accept defaultLoginMethods on update and return the updated org', async () => {
      const org = createTestOrg({ defaultLoginMethods: ['magic_link'] });
      (organizationService.updateOrganization as ReturnType<typeof vi.fn>).mockResolvedValue(org);

      const router = createOrganizationRouter();
      const layer = router.stack.find(
        (l) => l.methods.includes('PUT') && l.path === '/api/admin/organizations/:id',
      );

      const ctx = createMockCtx({
        params: { id: 'org-uuid-1' },
        body: { defaultLoginMethods: ['magic_link'] },
      });

      await layer!.stack[layer!.stack.length - 1](ctx as never, vi.fn());

      expect(ctx.body).toEqual({ data: org });
      expect(organizationService.updateOrganization).toHaveBeenCalledWith(
        'org-uuid-1',
        expect.objectContaining({ defaultLoginMethods: ['magic_link'] }),
      );
    });

    it('should return 400 when update payload has empty defaultLoginMethods', async () => {
      const router = createOrganizationRouter();
      const layer = router.stack.find(
        (l) => l.methods.includes('PUT') && l.path === '/api/admin/organizations/:id',
      );

      const ctx = createMockCtx({
        params: { id: 'org-uuid-1' },
        body: { defaultLoginMethods: [] },
      });

      await layer!.stack[layer!.stack.length - 1](ctx as never, vi.fn());

      expect(ctx.status).toBe(400);
      expect((ctx.body as { error: string }).error).toBe('Validation failed');
      expect(organizationService.updateOrganization).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // PUT /:id/branding — Update branding
  // -------------------------------------------------------------------------

  describe('PUT /:id/branding — Update branding', () => {
    it('should return updated organization with branding', async () => {
      const org = createTestOrg({ brandingPrimaryColor: '#FF0000' });
      (organizationService.updateOrganizationBranding as ReturnType<typeof vi.fn>).mockResolvedValue(org);

      const router = createOrganizationRouter();
      const layer = router.stack.find(
        (l) => l.methods.includes('PUT') && l.path === '/api/admin/organizations/:id/branding',
      );

      const ctx = createMockCtx({ params: { id: 'org-uuid-1' }, body: { primaryColor: '#FF0000' } });
      const next = vi.fn();

      await layer!.stack[layer!.stack.length - 1](ctx as never, next);

      expect(ctx.body).toEqual({ data: org });
    });
  });

  // -------------------------------------------------------------------------
  // Status action routes
  // -------------------------------------------------------------------------

  describe('POST /:id/suspend', () => {
    it('should return 204 on success', async () => {
      (organizationService.suspendOrganization as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const router = createOrganizationRouter();
      const layer = router.stack.find(
        (l) => l.methods.includes('POST') && l.path === '/api/admin/organizations/:id/suspend',
      );

      const ctx = createMockCtx({ params: { id: 'org-uuid-1' }, body: { reason: 'Violation' } });
      const next = vi.fn();

      await layer!.stack[layer!.stack.length - 1](ctx as never, next);

      expect(ctx.status).toBe(204);
    });

    it('should throw 400 when org is super-admin', async () => {
      (organizationService.suspendOrganization as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new OrganizationValidationError('Super-admin organization cannot be suspended'));

      const router = createOrganizationRouter();
      const layer = router.stack.find(
        (l) => l.methods.includes('POST') && l.path === '/api/admin/organizations/:id/suspend',
      );

      const ctx = createMockCtx({ params: { id: 'org-uuid-1' } });
      const next = vi.fn();

      await expect(
        layer!.stack[layer!.stack.length - 1](ctx as never, next),
      ).rejects.toThrow('Super-admin organization cannot be suspended');
    });
  });

  describe('POST /:id/activate', () => {
    it('should return 204 on success', async () => {
      (organizationService.activateOrganization as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const router = createOrganizationRouter();
      const layer = router.stack.find(
        (l) => l.methods.includes('POST') && l.path === '/api/admin/organizations/:id/activate',
      );

      const ctx = createMockCtx({ params: { id: 'org-uuid-1' } });
      const next = vi.fn();

      await layer!.stack[layer!.stack.length - 1](ctx as never, next);

      expect(ctx.status).toBe(204);
    });
  });

  describe('POST /:id/archive', () => {
    it('should return 204 on success', async () => {
      (organizationService.archiveOrganization as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const router = createOrganizationRouter();
      const layer = router.stack.find(
        (l) => l.methods.includes('POST') && l.path === '/api/admin/organizations/:id/archive',
      );

      const ctx = createMockCtx({ params: { id: 'org-uuid-1' } });
      const next = vi.fn();

      await layer!.stack[layer!.stack.length - 1](ctx as never, next);

      expect(ctx.status).toBe(204);
    });
  });

  describe('POST /:id/restore', () => {
    it('should return 204 on success', async () => {
      (organizationService.restoreOrganization as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const router = createOrganizationRouter();
      const layer = router.stack.find(
        (l) => l.methods.includes('POST') && l.path === '/api/admin/organizations/:id/restore',
      );

      const ctx = createMockCtx({ params: { id: 'org-uuid-1' } });
      const next = vi.fn();

      await layer!.stack[layer!.stack.length - 1](ctx as never, next);

      expect(ctx.status).toBe(204);
    });
  });

  // -------------------------------------------------------------------------
  // GET /validate-slug
  // -------------------------------------------------------------------------

  describe('GET /validate-slug', () => {
    it('should return valid result', async () => {
      (organizationService.validateSlugAvailability as ReturnType<typeof vi.fn>)
        .mockResolvedValue({ isValid: true });

      const router = createOrganizationRouter();
      const layer = router.stack.find(
        (l) => l.methods.includes('GET') && l.path === '/api/admin/organizations/validate-slug',
      );

      const ctx = createMockCtx({ query: { slug: 'acme-corp' } });
      const next = vi.fn();

      await layer!.stack[layer!.stack.length - 1](ctx as never, next);

      expect(ctx.body).toEqual({ isValid: true });
    });

    it('should return invalid result with error', async () => {
      (organizationService.validateSlugAvailability as ReturnType<typeof vi.fn>)
        .mockResolvedValue({ isValid: false, error: 'Slug already in use' });

      const router = createOrganizationRouter();
      const layer = router.stack.find(
        (l) => l.methods.includes('GET') && l.path === '/api/admin/organizations/validate-slug',
      );

      const ctx = createMockCtx({ query: { slug: 'taken-slug' } });
      const next = vi.fn();

      await layer!.stack[layer!.stack.length - 1](ctx as never, next);

      expect(ctx.body).toEqual({ isValid: false, error: 'Slug already in use' });
    });
  });

  // -------------------------------------------------------------------------
  // Router structure
  // -------------------------------------------------------------------------

  describe('router structure', () => {
    it('should have the correct prefix', () => {
      const router = createOrganizationRouter();
      expect(router.opts.prefix).toBe('/api/admin/organizations');
    });

    it('should register all expected routes', () => {
      const router = createOrganizationRouter();
      const paths = router.stack.map((l) => `${l.methods.filter((m) => m !== 'HEAD').join(',')} ${l.path}`);

      expect(paths).toContain('POST /api/admin/organizations');
      expect(paths).toContain('GET /api/admin/organizations');
      expect(paths).toContain('GET /api/admin/organizations/validate-slug');
      expect(paths).toContain('GET /api/admin/organizations/:id');
      expect(paths).toContain('PUT /api/admin/organizations/:id');
      expect(paths).toContain('PUT /api/admin/organizations/:id/branding');
      expect(paths).toContain('POST /api/admin/organizations/:id/suspend');
      expect(paths).toContain('POST /api/admin/organizations/:id/activate');
      expect(paths).toContain('POST /api/admin/organizations/:id/archive');
      expect(paths).toContain('POST /api/admin/organizations/:id/restore');
    });
  });
});
