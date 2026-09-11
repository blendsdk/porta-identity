import type Router from '@koa/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { deployment } = vi.hoisted(() => ({
  deployment: { nodeEnv: 'test' },
}));

vi.mock('../../../src/config/index.js', () => ({
  config: deployment,
}));

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../../src/organizations/service.js', () => ({
  createOrganization: vi.fn(),
  getOrganizationById: vi.fn(),
  getOrganizationBySlug: vi.fn(),
  updateOrganization: vi.fn(),
  updateOrganizationBranding: vi.fn(),
  suspendOrganization: vi.fn(),
  activateOrganization: vi.fn(),
  deleteOrganization: vi.fn(),
  listOrganizations: vi.fn(),
  listOrganizationsCursor: vi.fn(),
  validateSlugAvailability: vi.fn(),
}));

import { getPool } from '../../../src/lib/database.js';
import * as organizationService from '../../../src/organizations/service.js';
import { createBrandingRouter } from '../../../src/routes/branding.js';
import { createOrganizationRouter } from '../../../src/routes/organizations.js';

const ROUTE_ORG_ID = '10000000-0000-4000-a000-000000000001';
const OTHER_ORG_ID = '20000000-0000-4000-a000-000000000002';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface TestContext {
  params: Record<string, string>;
  query: Record<string, string>;
  request: { body: unknown };
  state: {
    adminUser?: {
      id: string;
      organizationId: string;
      roles: string[];
      permissions: readonly string[];
    };
  };
  status: number;
  body: unknown;
  throw(status: number, message: string): never;
}

interface HttpFailure extends Error {
  status: number;
}

type RouteLayer = ReturnType<typeof createBrandingRouter>['stack'][number];

/** Create a Koa-shaped request context with an authenticated administrator by default. */
function createContext(
  body: unknown = {},
  permissions: readonly string[] = ['admin:org:read', 'admin:org:update'],
): TestContext {
  let status = 200;
  let responseBody: unknown;

  return {
    params: { orgId: ROUTE_ORG_ID },
    query: {},
    request: { body },
    state: {
      adminUser: {
        id: '30000000-0000-4000-a000-000000000003',
        organizationId: '40000000-0000-4000-a000-000000000004',
        roles: [],
        permissions,
      },
    },
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
    throw(code: number, message: string): never {
      status = code;
      responseBody = { error: message };
      const error = new Error(message) as HttpFailure;
      error.status = code;
      throw error;
    },
  };
}

/** Locate one exact route declaration. */
function findRoute(router: Router, method: string, path: string): RouteLayer {
  const layer = router.stack.find(
    (candidate) => candidate.methods.includes(method) && candidate.path === path,
  );
  expect(layer).toBeDefined();
  return layer as RouteLayer;
}

/** Execute every route-local middleware in registration order. */
async function executeRoute(layer: RouteLayer, context: TestContext): Promise<void> {
  async function dispatch(index: number): Promise<void> {
    const middleware = layer.stack[index];
    if (!middleware) return;
    await middleware(context as never, () => dispatch(index + 1));
  }

  await dispatch(0);
}

/** Execute a route and retain an HTTP failure on the context for response assertions. */
async function executeRequest(layer: RouteLayer, context: TestContext): Promise<TestContext> {
  try {
    await executeRoute(layer, context);
  } catch (error) {
    if (!(error instanceof Error) || !('status' in error)) throw error;
  }
  return context;
}

/** Return a minimally complete stored-asset metadata row. */
function assetMetadata(overrides: Record<string, unknown> = {}) {
  return {
    id: '50000000-0000-4000-a000-000000000005',
    organizationId: ROUTE_ORG_ID,
    assetType: 'logo',
    contentType: 'image/png',
    fileSize: PNG_SIGNATURE.length,
    createdAt: new Date('2026-09-11T08:00:00.000Z'),
    updatedAt: new Date('2026-09-11T08:00:00.000Z'),
    ...overrides,
  };
}

describe('branding Admin route specification', () => {
  const query = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPool).mockReturnValue({ query } as never);
    query.mockImplementation((_sql, parameters) => {
      const organizationId = parameters?.[0] as string | undefined;
      return Promise.resolve({
        rows: [assetMetadata({ organizationId: organizationId ?? ROUTE_ORG_ID })],
        rowCount: 1,
      });
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Successful uploads persist the decoded image, never the encoded request representation.
  it('should return metadata and store validated decoded PNG bytes for the route organization', async () => {
    const png = Buffer.concat([PNG_SIGNATURE, Buffer.from('valid-png-payload')]);
    const context = createContext({ data: png.toString('base64'), contentType: 'image/png' });
    const route = findRoute(
      createBrandingRouter(),
      'PUT',
      '/api/admin/organizations/:orgId/branding/:type',
    );
    context.params.type = 'logo';

    await executeRoute(route, context);

    expect(context.status).toBe(200);
    expect(context.body).toEqual({ data: assetMetadata() });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[1]).toEqual([ROUTE_ORG_ID, 'logo', 'image/png', png, png.length]);
  });

  // Rejected decoded sizes must not reach the persistence boundary, preserving any prior row.
  it('should return a fixed sanitized client error without replacing a logo over 2 MiB', async () => {
    const oversized = Buffer.concat([PNG_SIGNATURE, Buffer.alloc(2 * 1024 * 1024 + 1 - 8)]);
    const context = createContext({
      data: oversized.toString('base64'),
      contentType: 'image/png',
    });
    context.params.type = 'logo';
    const route = findRoute(
      createBrandingRouter(),
      'PUT',
      '/api/admin/organizations/:orgId/branding/:type',
    );

    await executeRequest(route, context);

    expect(context.status).toBe(400);
    expect(JSON.stringify(context.body)).not.toContain(oversized.toString('base64').slice(0, 64));
    expect(query).not.toHaveBeenCalled();
  });

  it('should return a fixed sanitized client error without persisting a favicon over 512 KiB', async () => {
    const oversized = Buffer.concat([PNG_SIGNATURE, Buffer.alloc(512 * 1024 + 1 - 8)]);
    const context = createContext({
      data: oversized.toString('base64'),
      contentType: 'image/png',
    });
    context.params.type = 'favicon';
    const route = findRoute(
      createBrandingRouter(),
      'PUT',
      '/api/admin/organizations/:orgId/branding/:type',
    );

    await executeRequest(route, context);

    expect(context.status).toBe(400);
    expect(JSON.stringify(context.body)).not.toContain(oversized.toString('base64').slice(0, 64));
    expect(query).not.toHaveBeenCalled();
  });

  // The strict JSON envelope rejects invalid base64 before any service persistence is attempted.
  it.each([
    ['empty base64', ''],
    ['malformed base64', 'YWJj==='],
    ['non-base64 text', 'not base64!'],
  ])(
    'should reject %s with the same sanitized response before persistence',
    async (_case, data) => {
      const context = createContext({ data, contentType: 'image/png' });
      context.params.type = 'logo';
      const route = findRoute(
        createBrandingRouter(),
        'PUT',
        '/api/admin/organizations/:orgId/branding/:type',
      );

      await executeRequest(route, context);

      expect(context.status).toBe(400);
      expect(context.body).toEqual({ error: 'Branding upload is invalid' });
      expect(JSON.stringify(context.body)).not.toContain(data || 'empty upload sentinel');
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('should reject an unsupported media type before persistence', async () => {
    const encoded = PNG_SIGNATURE.toString('base64');
    const context = createContext({ data: encoded, contentType: 'application/pdf' });
    context.params.type = 'logo';
    const route = findRoute(
      createBrandingRouter(),
      'PUT',
      '/api/admin/organizations/:orgId/branding/:type',
    );

    await executeRequest(route, context);

    expect(context.status).toBe(400);
    expect(context.body).toEqual({ error: 'Branding upload is invalid' });
    expect(query).not.toHaveBeenCalled();
  });

  // Declared media types are checked against complete format signatures before storage.
  it.each([
    ['JPEG containing PNG bytes', 'image/jpeg', PNG_SIGNATURE],
    [
      'WebP without its WEBP marker',
      'image/webp',
      Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x4e, 0x4f, 0x50, 0x45]),
    ],
  ])('should reject %s with a fixed mismatch response', async (_case, contentType, bytes) => {
    const context = createContext({ data: bytes.toString('base64'), contentType });
    context.params.type = 'logo';
    const route = findRoute(
      createBrandingRouter(),
      'PUT',
      '/api/admin/organizations/:orgId/branding/:type',
    );

    await executeRequest(route, context);

    expect(context.status).toBe(400);
    expect(context.body).toEqual({ error: 'Branding upload is invalid' });
    expect(query).not.toHaveBeenCalled();
  });

  // SVG validation preserves harmless bytes and removes executable markup before persistence.
  it('should store a clean SVG unchanged', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>');
    const context = createContext({ data: svg.toString('base64'), contentType: 'image/svg+xml' });
    context.params.type = 'logo';
    const route = findRoute(
      createBrandingRouter(),
      'PUT',
      '/api/admin/organizations/:orgId/branding/:type',
    );

    await executeRoute(route, context);

    expect(query.mock.calls[0]?.[1]?.[3]).toEqual(svg);
    expect(query.mock.calls[0]?.[1]?.[4]).toBe(svg.length);
  });

  it('should remove script elements and event attributes from SVG before storage', async () => {
    const unsafe = Buffer.from('<svg><script>alert(1)</script><rect onclick="alert(2)" /></svg>');
    const context = createContext({
      data: unsafe.toString('base64'),
      contentType: 'image/svg+xml',
    });
    context.params.type = 'logo';
    const route = findRoute(
      createBrandingRouter(),
      'PUT',
      '/api/admin/organizations/:orgId/branding/:type',
    );

    await executeRoute(route, context);

    const stored = query.mock.calls[0]?.[1]?.[3] as Buffer;
    expect(stored.toString('utf8')).toBe('<svg><rect /></svg>');
    expect(stored.toString('utf8')).not.toMatch(/<script|onclick/i);
  });

  // Route permissions remain authoritative and denied requests never reach storage.
  it.each([
    ['GET', '/api/admin/organizations/:orgId/branding', 'admin:org:update'],
    ['PUT', '/api/admin/organizations/:orgId/branding/:type', 'admin:org:read'],
    ['DELETE', '/api/admin/organizations/:orgId/branding/:type', 'admin:org:read'],
  ])(
    'should deny %s asset requests without the required permission',
    async (method, path, permission) => {
      const context = createContext(
        { data: PNG_SIGNATURE.toString('base64'), contentType: 'image/png' },
        [permission],
      );
      context.params.type = 'logo';
      const route = findRoute(createBrandingRouter(), method, path);

      await executeRoute(route, context);

      expect(context.status).toBe(403);
      expect(context.body).toEqual({
        error: 'Forbidden',
        message: 'The requested operation is not permitted',
      });
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('should scope list, upload, and delete persistence calls to the route organization', async () => {
    const router = createBrandingRouter();
    const list = createContext();
    const upload = createContext({
      data: PNG_SIGNATURE.toString('base64'),
      contentType: 'image/png',
    });
    const remove = createContext();
    list.params.orgId = OTHER_ORG_ID;
    upload.params.orgId = OTHER_ORG_ID;
    upload.params.type = 'logo';
    remove.params.orgId = OTHER_ORG_ID;
    remove.params.type = 'logo';

    await executeRoute(findRoute(router, 'GET', '/api/admin/organizations/:orgId/branding'), list);
    await executeRoute(
      findRoute(router, 'PUT', '/api/admin/organizations/:orgId/branding/:type'),
      upload,
    );
    await executeRoute(
      findRoute(router, 'DELETE', '/api/admin/organizations/:orgId/branding/:type'),
      remove,
    );

    expect(query).toHaveBeenCalledTimes(3);
    for (const call of query.mock.calls) expect(call[1]?.[0]).toBe(OTHER_ORG_ID);
    expect(JSON.stringify([list.body, upload.body, remove.body])).not.toContain(ROUTE_ORG_ID);
  });
});

describe('organization branding URL specification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deployment.nodeEnv = 'test';
    vi.mocked(organizationService.updateOrganizationBranding).mockResolvedValue(
      assetMetadata({ brandingLogoUrl: null, brandingFaviconUrl: null }) as never,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** Load the organization route after setting its deployment environment. */
  function loadOrganizationRoute(environment: 'production' | 'development') {
    vi.stubEnv('NODE_ENV', environment);
    deployment.nodeEnv = environment;
    const route = findRoute(
      createOrganizationRouter(),
      'PUT',
      '/api/admin/organizations/:id/branding',
    );
    return { route, update: vi.mocked(organizationService.updateOrganizationBranding) };
  }

  // Production permits only trimmed credential-free HTTPS fallback URLs.
  it('should trim and accept credential-free HTTPS branding URLs in production', async () => {
    const { route, update } = loadOrganizationRoute('production');
    const context = createContext({
      logoUrl: '  https://assets.example.test/logo.png  ',
      faviconUrl: 'https://assets.example.test/favicon.ico',
    });
    context.params = { id: ROUTE_ORG_ID };

    await executeRoute(route, context);

    expect(update).toHaveBeenCalledWith(ROUTE_ORG_ID, {
      logoUrl: 'https://assets.example.test/logo.png',
      faviconUrl: 'https://assets.example.test/favicon.ico',
    });
  });

  it.each([
    ['plain HTTP', 'http://assets.example.test/logo.png'],
    ['HTTPS credentials', 'https://user:secret@assets.example.test/logo.png'],
  ])('should reject %s branding URLs in production', async (_case, logoUrl) => {
    const { route, update } = loadOrganizationRoute('production');
    const context = createContext({ logoUrl });
    context.params = { id: ROUTE_ORG_ID };

    await executeRequest(route, context);

    expect(context.status).toBe(400);
    expect(JSON.stringify(context.body)).not.toContain(logoUrl);
    expect(update).not.toHaveBeenCalled();
  });

  // Development HTTP exceptions are restricted to exact loopback hostnames and addresses.
  it.each([
    'http://localhost:3000/logo.png',
    'http://127.0.0.1:3000/logo.png',
    'http://[::1]:3000/logo.png',
  ])('should accept exact HTTP loopback branding URL %s outside production', async (logoUrl) => {
    const { route, update } = loadOrganizationRoute('development');
    const context = createContext({ logoUrl });
    context.params = { id: ROUTE_ORG_ID };

    await executeRoute(route, context);

    expect(update).toHaveBeenCalledWith(ROUTE_ORG_ID, { logoUrl });
  });

  it.each([
    'http://localhost.example.test/logo.png',
    'http://127.0.0.2/logo.png',
    'http://192.168.1.20/logo.png',
    'ftp://localhost/logo.png',
  ])('should reject non-loopback or non-HTTP development branding URL %s', async (logoUrl) => {
    const { route, update } = loadOrganizationRoute('development');
    const context = createContext({ logoUrl });
    context.params = { id: ROUTE_ORG_ID };

    await executeRequest(route, context);

    expect(context.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
