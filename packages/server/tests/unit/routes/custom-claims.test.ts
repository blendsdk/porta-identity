import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CustomClaimDefinition, CustomClaimValue, CustomClaimWithValue } from '../../../src/custom-claims/types.js';
import { ClaimNotFoundError, ClaimValidationError } from '../../../src/custom-claims/errors.js';

// Mock all dependencies before importing the module under test.
// vi.mock factories are hoisted — must use inline objects, not const references.
vi.mock('../../../src/custom-claims/service.js', () => ({
  createDefinition: vi.fn(),
  findDefinitionById: vi.fn(),
  listDefinitions: vi.fn(),
  updateDefinition: vi.fn(),
  deleteDefinition: vi.fn(),
  setValue: vi.fn(),
  getValue: vi.fn(),
  deleteValue: vi.fn(),
  getValuesForUser: vi.fn(),
}));

// Mock super-admin middleware to always pass through
vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

import * as claimService from '../../../src/custom-claims/service.js';
import { createCustomClaimRouter } from '../../../src/routes/custom-claims.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Standard test claim definition */
function createTestDefinition(overrides: Partial<CustomClaimDefinition> = {}): CustomClaimDefinition {
  return {
    id: 'claim-uuid-1',
    applicationId: 'app-uuid-1',
    claimName: 'department',
    claimType: 'string',
    description: 'User department',
    includeInIdToken: false,
    includeInAccessToken: true,
    includeInUserinfo: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Standard test claim value */
function createTestValue(overrides: Partial<CustomClaimValue> = {}): CustomClaimValue {
  return {
    id: 'value-uuid-1',
    userId: 'user-uuid-1',
    claimId: 'claim-uuid-1',
    value: 'Engineering',
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

/** Find a route layer by method and path suffix */
function findLayer(router: ReturnType<typeof createCustomClaimRouter>, method: string, pathSuffix: string) {
  const prefix = '/api/admin/applications/:appId/claims';
  return router.stack.find(
    (l) => l.methods.includes(method) && l.path === `${prefix}${pathSuffix}`,
  );
}

/** Execute the last middleware in a layer's stack (the actual handler) */
async function execHandler(layer: NonNullable<ReturnType<typeof findLayer>>, ctx: ReturnType<typeof createMockCtx>) {
  const next = vi.fn();
  await layer.stack[layer.stack.length - 1](ctx as never, next);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('custom claims routes', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // POST / — Create definition
  // -------------------------------------------------------------------------

  describe('POST / — Create definition', () => {
    it('should return 201 with created definition', async () => {
      const definition = createTestDefinition();
      vi.mocked(claimService.createDefinition).mockResolvedValue(definition);

      const layer = findLayer(createCustomClaimRouter(), 'POST', '');
      expect(layer).toBeDefined();

      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1' },
        body: { claimName: 'department', claimType: 'string' },
      });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(201);
      expect(ctx.body).toEqual({ data: definition });
      expect(claimService.createDefinition).toHaveBeenCalledWith({
        applicationId: 'app-uuid-1',
        claimName: 'department',
        claimType: 'string',
      });
    });

    it('should return 400 for missing required fields', async () => {
      const layer = findLayer(createCustomClaimRouter(), 'POST', '');
      const ctx = createMockCtx({ params: { appId: 'app-uuid-1' }, body: {} });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(400);
      expect((ctx.body as { error: string }).error).toBe('Validation failed');
    });

    it('should return 400 for invalid claimType', async () => {
      const layer = findLayer(createCustomClaimRouter(), 'POST', '');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1' },
        body: { claimName: 'test', claimType: 'invalid' },
      });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(400);
    });

    it('should throw 400 when claim name is reserved', async () => {
      vi.mocked(claimService.createDefinition).mockRejectedValue(
        new ClaimValidationError('Claim name "sub" is reserved'),
      );

      const layer = findLayer(createCustomClaimRouter(), 'POST', '');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1' },
        body: { claimName: 'sub', claimType: 'string' },
      });

      await expect(execHandler(layer!, ctx)).rejects.toThrow('Claim name "sub" is reserved');
    });

    it('should throw 400 when claim name already exists', async () => {
      vi.mocked(claimService.createDefinition).mockRejectedValue(
        new ClaimValidationError('Claim name "department" already exists'),
      );

      const layer = findLayer(createCustomClaimRouter(), 'POST', '');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1' },
        body: { claimName: 'department', claimType: 'string' },
      });

      await expect(execHandler(layer!, ctx)).rejects.toThrow('already exists');
    });
  });

  // -------------------------------------------------------------------------
  // GET / — List definitions
  // -------------------------------------------------------------------------

  describe('GET / — List definitions', () => {
    it('should return list of definitions for application', async () => {
      const definitions = [createTestDefinition()];
      vi.mocked(claimService.listDefinitions).mockResolvedValue(definitions);

      const layer = findLayer(createCustomClaimRouter(), 'GET', '');
      const ctx = createMockCtx({ params: { appId: 'app-uuid-1' } });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: definitions });
      expect(claimService.listDefinitions).toHaveBeenCalledWith('app-uuid-1');
    });

    it('should return empty array when no definitions exist', async () => {
      vi.mocked(claimService.listDefinitions).mockResolvedValue([]);

      const layer = findLayer(createCustomClaimRouter(), 'GET', '');
      const ctx = createMockCtx({ params: { appId: 'app-uuid-1' } });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: [] });
    });
  });

  // -------------------------------------------------------------------------
  // GET /:claimId — Get definition by ID
  // -------------------------------------------------------------------------

  describe('GET /:claimId — Get definition by ID', () => {
    it('should return definition when found', async () => {
      const definition = createTestDefinition();
      vi.mocked(claimService.findDefinitionById).mockResolvedValue(definition);

      const layer = findLayer(createCustomClaimRouter(), 'GET', '/:claimId');
      const ctx = createMockCtx({ params: { appId: 'app-uuid-1', claimId: 'claim-uuid-1' } });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: definition });
    });

    it('should throw 404 when definition not found', async () => {
      vi.mocked(claimService.findDefinitionById).mockResolvedValue(null);

      const layer = findLayer(createCustomClaimRouter(), 'GET', '/:claimId');
      const ctx = createMockCtx({ params: { appId: 'app-uuid-1', claimId: 'nonexistent' } });

      await expect(execHandler(layer!, ctx)).rejects.toThrow('Claim definition not found');
    });
  });

  // -------------------------------------------------------------------------
  // PUT /:claimId — Update definition
  // -------------------------------------------------------------------------

  describe('PUT /:claimId — Update definition', () => {
    it('should return updated definition', async () => {
      const definition = createTestDefinition({ description: 'Updated' });
      vi.mocked(claimService.updateDefinition).mockResolvedValue(definition);

      const layer = findLayer(createCustomClaimRouter(), 'PUT', '/:claimId');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', claimId: 'claim-uuid-1' },
        body: { description: 'Updated' },
      });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: definition });
    });

    it('should throw 404 when definition not found', async () => {
      vi.mocked(claimService.updateDefinition).mockRejectedValue(
        new ClaimNotFoundError('nonexistent'),
      );

      const layer = findLayer(createCustomClaimRouter(), 'PUT', '/:claimId');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', claimId: 'nonexistent' },
        body: { description: 'Test' },
      });

      await expect(execHandler(layer!, ctx)).rejects.toThrow('not found');
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /:claimId — Delete definition
  // -------------------------------------------------------------------------

  describe('DELETE /:claimId — Delete definition', () => {
    it('should return 204 on successful delete', async () => {
      vi.mocked(claimService.deleteDefinition).mockResolvedValue(undefined);

      const layer = findLayer(createCustomClaimRouter(), 'DELETE', '/:claimId');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', claimId: 'claim-uuid-1' },
      });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(204);
    });

    it('should throw 404 when definition not found', async () => {
      vi.mocked(claimService.deleteDefinition).mockRejectedValue(
        new ClaimNotFoundError('nonexistent'),
      );

      const layer = findLayer(createCustomClaimRouter(), 'DELETE', '/:claimId');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', claimId: 'nonexistent' },
      });

      await expect(execHandler(layer!, ctx)).rejects.toThrow('not found');
    });
  });

  // -------------------------------------------------------------------------
  // PUT /:claimId/users/:userId — Set claim value
  // -------------------------------------------------------------------------

  describe('PUT /:claimId/users/:userId — Set claim value', () => {
    it('should return claim value on success', async () => {
      const value = createTestValue();
      vi.mocked(claimService.setValue).mockResolvedValue(value);

      const layer = findLayer(createCustomClaimRouter(), 'PUT', '/:claimId/users/:userId');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', claimId: 'claim-uuid-1', userId: 'user-uuid-1' },
        body: { value: 'Engineering' },
      });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: value });
      expect(claimService.setValue).toHaveBeenCalledWith('user-uuid-1', 'claim-uuid-1', 'Engineering');
    });

    it('should throw 400 when value type does not match definition', async () => {
      vi.mocked(claimService.setValue).mockRejectedValue(
        new ClaimValidationError('Expected number but got string'),
      );

      const layer = findLayer(createCustomClaimRouter(), 'PUT', '/:claimId/users/:userId');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', claimId: 'claim-uuid-1', userId: 'user-uuid-1' },
        body: { value: 'not-a-number' },
      });

      await expect(execHandler(layer!, ctx)).rejects.toThrow('Expected number');
    });

    it('should throw 404 when claim definition not found', async () => {
      vi.mocked(claimService.setValue).mockRejectedValue(
        new ClaimNotFoundError('nonexistent'),
      );

      const layer = findLayer(createCustomClaimRouter(), 'PUT', '/:claimId/users/:userId');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', claimId: 'nonexistent', userId: 'user-uuid-1' },
        body: { value: 'test' },
      });

      await expect(execHandler(layer!, ctx)).rejects.toThrow('not found');
    });
  });

  // -------------------------------------------------------------------------
  // GET /:claimId/users/:userId — Get claim value
  // -------------------------------------------------------------------------

  describe('GET /:claimId/users/:userId — Get claim value', () => {
    it('should return claim value when found', async () => {
      const value = createTestValue();
      vi.mocked(claimService.getValue).mockResolvedValue(value);

      const layer = findLayer(createCustomClaimRouter(), 'GET', '/:claimId/users/:userId');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', claimId: 'claim-uuid-1', userId: 'user-uuid-1' },
      });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: value });
    });

    it('should throw 404 when claim value not found', async () => {
      vi.mocked(claimService.getValue).mockResolvedValue(null);

      const layer = findLayer(createCustomClaimRouter(), 'GET', '/:claimId/users/:userId');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', claimId: 'claim-uuid-1', userId: 'user-uuid-1' },
      });

      await expect(execHandler(layer!, ctx)).rejects.toThrow('Claim value not found');
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /:claimId/users/:userId — Delete claim value
  // -------------------------------------------------------------------------

  describe('DELETE /:claimId/users/:userId — Delete claim value', () => {
    it('should return 204 on successful delete', async () => {
      vi.mocked(claimService.deleteValue).mockResolvedValue(undefined);

      const layer = findLayer(createCustomClaimRouter(), 'DELETE', '/:claimId/users/:userId');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', claimId: 'claim-uuid-1', userId: 'user-uuid-1' },
      });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(204);
    });
  });

  // -------------------------------------------------------------------------
  // GET /users/:userId — Get all claim values for a user
  // -------------------------------------------------------------------------

  describe('GET /users/:userId — Get all claim values for user', () => {
    it('should return all claim values for user', async () => {
      const values: CustomClaimWithValue[] = [
        {
          id: 'value-uuid-1',
          userId: 'user-uuid-1',
          claimId: 'claim-uuid-1',
          value: 'Engineering',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          claimName: 'department',
          claimType: 'string',
        },
      ];
      vi.mocked(claimService.getValuesForUser).mockResolvedValue(values);

      const layer = findLayer(createCustomClaimRouter(), 'GET', '/users/:userId');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', userId: 'user-uuid-1' },
      });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: values });
      expect(claimService.getValuesForUser).toHaveBeenCalledWith('user-uuid-1');
    });

    it('should return empty array when user has no claim values', async () => {
      vi.mocked(claimService.getValuesForUser).mockResolvedValue([]);

      const layer = findLayer(createCustomClaimRouter(), 'GET', '/users/:userId');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', userId: 'user-uuid-1' },
      });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: [] });
    });
  });

  // -------------------------------------------------------------------------
  // Router structure
  // -------------------------------------------------------------------------

  describe('router structure', () => {
    it('should have the correct prefix', () => {
      const router = createCustomClaimRouter();
      expect(router.opts.prefix).toBe('/api/admin/applications/:appId/claims');
    });

    it('should register all expected routes', () => {
      const router = createCustomClaimRouter();
      const prefix = '/api/admin/applications/:appId/claims';
      const paths = router.stack.map((l) => `${l.methods.filter((m) => m !== 'HEAD').join(',')} ${l.path}`);

      expect(paths).toContain(`POST ${prefix}`);
      expect(paths).toContain(`GET ${prefix}`);
      expect(paths).toContain(`GET ${prefix}/users/:userId`);
      expect(paths).toContain(`GET ${prefix}/:claimId`);
      expect(paths).toContain(`PUT ${prefix}/:claimId`);
      expect(paths).toContain(`DELETE ${prefix}/:claimId`);
      expect(paths).toContain(`PUT ${prefix}/:claimId/users/:userId`);
      expect(paths).toContain(`GET ${prefix}/:claimId/users/:userId`);
      expect(paths).toContain(`DELETE ${prefix}/:claimId/users/:userId`);
    });
  });
});
