import type Router from '@koa/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_context: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../../src/middleware/require-permission.js', () => ({
  requirePermission: () => async (_context: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../../src/lib/branding-assets.js', () => ({
  listAssets: vi.fn(),
  getAsset: vi.fn(),
  uploadAsset: vi.fn(),
  deleteAsset: vi.fn(),
}));

import * as brandingAssets from '../../../src/lib/branding-assets.js';
import { createBrandingRouter } from '../../../src/routes/branding.js';

type RouteLayer = ReturnType<typeof createBrandingRouter>['stack'][number];

interface TestContext {
  params: Record<string, string>;
  request: { body: unknown };
  status: number;
  body: unknown;
  type?: string;
  set(name: string, value: string): void;
  throw(status: number, message: string): never;
}

/** Create the minimum Koa-shaped context needed by branding route handlers. */
function createContext(body: unknown = {}): TestContext {
  let status = 200;
  let responseBody: unknown;

  return {
    params: { orgId: 'org-1', type: 'logo' },
    request: { body },
    get status() {
      return status;
    },
    set status(value: number) {
      status = value;
    },
    get body() {
      return responseBody;
    },
    set body(value: unknown) {
      responseBody = value;
    },
    set: vi.fn(),
    throw(code: number, message: string): never {
      const error = new Error(message) as Error & { status: number };
      error.status = code;
      throw error;
    },
  };
}

/** Find one route and return its final business handler. */
function handler(router: Router, method: string, path: string) {
  const layer = router.stack.find(
    (candidate) => candidate.methods.includes(method) && candidate.path === path,
  ) as RouteLayer | undefined;
  expect(layer).toBeDefined();
  return layer!.stack[layer!.stack.length - 1]!;
}

describe('branding routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return asset metadata from the organization collection', async () => {
    const assets = [{ id: 'asset-1', assetType: 'logo' }];
    vi.mocked(brandingAssets.listAssets).mockResolvedValue(assets as never);
    const context = createContext();

    await handler(
      createBrandingRouter(),
      'GET',
      '/api/admin/organizations/:orgId/branding',
    )(context as never, vi.fn());

    expect(brandingAssets.listAssets).toHaveBeenCalledWith('org-1');
    expect(context.body).toEqual({ data: assets });
  });

  it('should serve stored bytes with their media type and cache header', async () => {
    const data = Buffer.from('image bytes');
    vi.mocked(brandingAssets.getAsset).mockResolvedValue({
      contentType: 'image/png',
      data,
    } as never);
    const context = createContext();

    await handler(
      createBrandingRouter(),
      'GET',
      '/api/admin/organizations/:orgId/branding/:type',
    )(context as never, vi.fn());

    expect(brandingAssets.getAsset).toHaveBeenCalledWith('org-1', 'logo');
    expect(context.type).toBe('image/png');
    expect(context.set).toHaveBeenCalledWith('Cache-Control', 'public, max-age=3600');
    expect(context.body).toBe(data);
  });

  it('should return not found when a requested asset is absent', async () => {
    vi.mocked(brandingAssets.getAsset).mockResolvedValue(null);
    const context = createContext();

    await expect(
      handler(
        createBrandingRouter(),
        'GET',
        '/api/admin/organizations/:orgId/branding/:type',
      )(context as never, vi.fn()),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('should return uploaded metadata from the service', async () => {
    const data = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const asset = { id: 'asset-1', assetType: 'logo', contentType: 'image/png' };
    vi.mocked(brandingAssets.uploadAsset).mockResolvedValue(asset as never);
    const context = createContext({ data: data.toString('base64'), contentType: 'image/png' });

    await handler(
      createBrandingRouter(),
      'PUT',
      '/api/admin/organizations/:orgId/branding/:type',
    )(context as never, vi.fn());

    expect(brandingAssets.uploadAsset).toHaveBeenCalledWith('org-1', 'logo', 'image/png', data);
    expect(context.body).toEqual({ data: asset });
  });

  it('should hide service validation details behind one upload error', async () => {
    vi.mocked(brandingAssets.uploadAsset).mockRejectedValue(
      new Error('internal validation detail'),
    );
    const context = createContext({ data: 'aGVsbG8=', contentType: 'image/png' });

    await expect(
      handler(
        createBrandingRouter(),
        'PUT',
        '/api/admin/organizations/:orgId/branding/:type',
      )(context as never, vi.fn()),
    ).rejects.toMatchObject({ status: 400, message: 'Branding upload is invalid' });
  });

  it('should return no content after deleting an existing asset', async () => {
    vi.mocked(brandingAssets.deleteAsset).mockResolvedValue(true);
    const context = createContext();

    await handler(
      createBrandingRouter(),
      'DELETE',
      '/api/admin/organizations/:orgId/branding/:type',
    )(context as never, vi.fn());

    expect(brandingAssets.deleteAsset).toHaveBeenCalledWith('org-1', 'logo');
    expect(context.status).toBe(204);
  });

  it('should reject unknown asset slots before calling the service', async () => {
    const context = createContext();
    context.params.type = 'banner';

    await expect(
      handler(
        createBrandingRouter(),
        'DELETE',
        '/api/admin/organizations/:orgId/branding/:type',
      )(context as never, vi.fn()),
    ).rejects.toMatchObject({ status: 400 });
    expect(brandingAssets.deleteAsset).not.toHaveBeenCalled();
  });
});
