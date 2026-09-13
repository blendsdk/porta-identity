import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  authentication: 'authorized' as 'authorized' | 'unauthenticated',
  roles: ['porta-super-admin'] as string[],
  permissions: new Set<string>(),
  exportManifest: vi.fn(),
  buildPlan: vi.fn(),
  applyManifest: vi.fn(),
}));

vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth:
    () =>
    async (
      context: {
        state: Record<string, unknown>;
        status: number;
        body: unknown;
      },
      next: () => Promise<void>,
    ) => {
      if (testState.authentication === 'unauthenticated') {
        context.status = 401;
        context.body = { error: 'Authentication required' };
        return;
      }

      context.state.adminUser = {
        id: 'admin-user',
        email: 'admin@example.test',
        organizationId: 'control-plane',
        roles: testState.roles,
        permissions: [...testState.permissions],
      };
      await next();
    },
}));

vi.mock('../../../src/middleware/require-permission.js', () => ({
  requirePermission:
    (...permissions: readonly string[]) =>
    async (context: { status: number; body: unknown }, next: () => Promise<void>) => {
      if (!permissions.every((permission) => testState.permissions.has(permission))) {
        context.status = 403;
        context.body = { error: 'Forbidden' };
        return;
      }
      await next();
    },
}));

vi.mock('../../../src/portability/export.js', () => ({
  exportPortabilityManifest: testState.exportManifest,
}));

vi.mock('../../../src/portability/plan.js', () => ({
  buildPortabilityPlan: testState.buildPlan,
}));

vi.mock('../../../src/portability/apply.js', () => ({
  applyPortabilityManifest: testState.applyManifest,
}));

import {
  PortabilityError,
  requiredPortabilityPermissions,
  type PortabilityManifest,
} from '../../../src/portability/index.js';
import { createApp } from '../../../src/server.js';

const MEBIBYTE = 1024 * 1024;
const IMPORT_PATHS = ['/api/admin/import', '/api/admin/import/', '/API/ADMIN/IMPORT'] as const;
const ALL_PERMISSIONS = [
  'admin:export:read',
  'admin:import:write',
  'admin:org:read',
  'admin:org:create',
  'admin:org:update',
  'admin:org:suspend',
  'admin:app:read',
  'admin:app:create',
  'admin:app:update',
  'admin:role:read',
  'admin:role:create',
  'admin:role:update',
  'admin:role:assign',
  'admin:permission:read',
  'admin:permission:create',
  'admin:permission:update',
  'admin:claim:read',
  'admin:claim:create',
  'admin:claim:update',
  'admin:user:read',
  'admin:user:create',
  'admin:user:update',
  'admin:user:lifecycle',
  'admin:client:read',
  'admin:client:create',
  'admin:client:update',
] as const;

const EMPTY_MANIFEST = {
  version: '1.0',
  exported_at: '2026-09-13T12:34:56.789Z',
  scope: { kind: 'organization', organization_slug: 'acme' },
  categories: ['organizations'],
  application_selection: { all_applications: false, application_slugs: [] },
  organizations: [],
  applications: [],
  application_modules: [],
  roles: [],
  permissions: [],
  claim_definitions: [],
  role_permission_mappings: [],
  users: [],
  user_role_assignments: [],
  user_claim_values: [],
  clients: [],
} as const satisfies PortabilityManifest;

const EMPTY_RESULT = {
  summary: { created: 0, updated: 0, skipped: 0, rejected: 0 },
  items: [],
};

/** Start the assembled server so parser ordering is exercised as an HTTP boundary. */
async function startApplication(): Promise<{ baseUrl: string; server: Server }> {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Missing test server port');
  return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

/** Stop the ephemeral HTTP server and surface shutdown failures. */
async function stopApplication(server: Server | undefined): Promise<void> {
  if (server === undefined) return;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

/** Send JSON to one portability endpoint with the test administrator identity. */
async function postJson(baseUrl: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
    body: JSON.stringify(body),
  });
}

/** Create a large JSON body without putting protected manifest values in the fixture. */
function oversizedJson(mebibytes: number): string {
  return JSON.stringify({ padding: 'x'.repeat(mebibytes * MEBIBYTE) });
}

/** Create a typed portability failure without coupling tests to its constructor signature. */
function portabilityError(
  status: number,
  code: string,
  message: string,
): Error & { readonly status: number; readonly code: string } {
  const error = new Error(message);
  Object.setPrototypeOf(error, PortabilityError.prototype);
  return Object.assign(error, { status, code });
}

/** Assert that a permission collection contains exactly the closed expected union. */
function expectExactPermissions(actual: readonly string[], expected: readonly string[]): void {
  expect(new Set(actual)).toStrictEqual(new Set(expected));
  expect(actual).toHaveLength(expected.length);
}

describe('portability Admin API specification', () => {
  let server: Server | undefined;
  let baseUrl = '';

  beforeAll(async () => {
    ({ baseUrl, server } = await startApplication());
  });

  afterAll(async () => {
    await stopApplication(server);
    server = undefined;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    testState.authentication = 'authorized';
    testState.roles = ['porta-super-admin'];
    testState.permissions = new Set(ALL_PERMISSIONS);
    testState.exportManifest.mockResolvedValue({
      manifest: EMPTY_MANIFEST,
      filename: 'porta-manifest-2026-09-13T12-34-56-789Z.json',
    });
    testState.buildPlan.mockResolvedValue(EMPTY_RESULT);
    testState.applyManifest.mockResolvedValue(EMPTY_RESULT);
  });

  it.each(IMPORT_PATHS)(
    'should authenticate before parsing protected content at %s',
    async (path) => {
      testState.authentication = 'unauthenticated';

      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: oversizedJson(1),
      });

      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(testState.buildPlan).not.toHaveBeenCalled();
      expect(testState.applyManifest).not.toHaveBeenCalled();
    },
  );

  it.each(IMPORT_PATHS)(
    'should check the base import permission before parsing protected content at %s',
    async (path) => {
      testState.permissions.delete('admin:import:write');

      const response = await postJson(baseUrl, path, { padding: 'x'.repeat(101 * 1024) });

      expect(response.status).toBe(403);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(testState.buildPlan).not.toHaveBeenCalled();
      expect(testState.applyManifest).not.toHaveBeenCalled();
    },
  );

  it.each(IMPORT_PATHS)(
    'should reject an authorized import larger than 64 MiB at %s without planning or mutation',
    async (path) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer test-token',
        },
        body: oversizedJson(64),
      });

      expect(response.status).toBe(413);
      expect(await response.json()).toStrictEqual({
        error: 'Import manifest is too large',
        code: 'import_manifest_too_large',
      });
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(testState.buildPlan).not.toHaveBeenCalled();
      expect(testState.applyManifest).not.toHaveBeenCalled();
    },
    30_000,
  );

  it('should reject an oversized serialized export without a partial attachment', async () => {
    testState.exportManifest.mockRejectedValue(
      portabilityError(413, 'export_manifest_too_large', 'Export manifest is too large'),
    );

    const response = await postJson(baseUrl, '/api/admin/export/manifest', {
      scope: { kind: 'organization', organization_slug: 'acme' },
      categories: ['organizations'],
      application_selection: { all_applications: false, application_slugs: [] },
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toStrictEqual({
      error: 'Export manifest is too large',
      code: 'export_manifest_too_large',
    });
    expect(response.headers.get('content-disposition')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('should return a timestamped JSON attachment for a successful export', async () => {
    const response = await postJson(baseUrl, '/api/admin/export/manifest', {
      scope: { kind: 'organization', organization_slug: 'acme' },
      categories: ['organizations'],
      application_selection: { all_applications: false, application_slugs: [] },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="porta-manifest-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d{3})?Z\.json"$/,
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toStrictEqual(EMPTY_MANIFEST);
  });

  it.each([
    ['preview', 'dry-run'],
    ['keep-existing apply', 'keep-existing'],
    ['update-existing apply', 'update-existing'],
  ] as const)('should prevent caching after a successful %s', async (_caseName, mode) => {
    const response = await postJson(baseUrl, '/api/admin/import', {
      manifest: EMPTY_MANIFEST,
      mode,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    if (mode === 'dry-run') {
      expect(testState.buildPlan).toHaveBeenCalledOnce();
      expect(testState.applyManifest).not.toHaveBeenCalled();
    } else {
      expect(testState.applyManifest).toHaveBeenCalledOnce();
      expect(testState.buildPlan).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['/api/admin/export/manifest', { unexpected: true }, 'export_request_invalid'],
    ['/api/admin/import', { unexpected: true }, 'import_manifest_invalid'],
  ] as const)(
    'should return a non-cacheable fixed validation error from %s',
    async (path, body, code) => {
      const response = await postJson(baseUrl, path, body);
      const responseBody: unknown = await response.json();

      expect(response.status).toBe(400);
      expect(responseBody).toMatchObject({ code });
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(JSON.stringify(responseBody)).not.toContain('unexpected');
    },
  );

  it.each([
    ['export', '/api/admin/export/manifest', 'export_failed', 'Export failed'],
    ['import', '/api/admin/import', 'import_execution_failed', 'Import failed'],
  ] as const)(
    'should correlate an unexpected %s failure with the existing request ID',
    async (operation, path, code, message) => {
      const request =
        operation === 'export'
          ? {
              scope: { kind: 'organization', organization_slug: 'acme' },
              categories: ['organizations'],
              application_selection: { all_applications: false, application_slugs: [] },
            }
          : { manifest: EMPTY_MANIFEST, mode: 'dry-run' };
      if (operation === 'export') testState.exportManifest.mockRejectedValue(new Error('private'));
      else testState.buildPlan.mockRejectedValue(new Error('private'));

      const response = await postJson(baseUrl, path, request);
      const requestId = response.headers.get('x-request-id');

      expect(requestId).toBeTruthy();
      expect(response.status).toBe(503);
      expect(await response.json()).toStrictEqual({
        error: message,
        code,
        request_id: requestId,
      });
      expect(response.headers.get('cache-control')).toBe('no-store');
    },
  );

  it.each([
    {
      category: 'organizations',
      export: ['admin:export:read', 'admin:org:read'],
      import: ['admin:import:write', 'admin:org:create', 'admin:org:update', 'admin:org:suspend'],
    },
    {
      category: 'applications_authorization',
      export: [
        'admin:export:read',
        'admin:app:read',
        'admin:role:read',
        'admin:permission:read',
        'admin:claim:read',
      ],
      import: [
        'admin:import:write',
        'admin:app:create',
        'admin:app:update',
        'admin:role:create',
        'admin:role:update',
        'admin:permission:create',
        'admin:permission:update',
        'admin:claim:create',
        'admin:claim:update',
      ],
    },
    {
      category: 'users_assignments',
      export: ['admin:export:read', 'admin:user:read', 'admin:role:read', 'admin:claim:read'],
      import: [
        'admin:import:write',
        'admin:user:create',
        'admin:user:update',
        'admin:user:lifecycle',
        'admin:role:assign',
        'admin:claim:update',
      ],
    },
    {
      category: 'oidc_clients',
      export: ['admin:export:read', 'admin:client:read', 'admin:app:read'],
      import: ['admin:import:write', 'admin:client:create', 'admin:client:update'],
    },
  ] as const)(
    'should require the exact closed permission union for $category',
    ({ category, export: exportPermissions, import: importPermissions }) => {
      expectExactPermissions(
        requiredPortabilityPermissions('export', [category]),
        exportPermissions,
      );
      expectExactPermissions(
        requiredPortabilityPermissions('import', [category]),
        importPermissions,
      );
    },
  );

  it('should de-duplicate the closed permission union across selected categories', () => {
    const actual = requiredPortabilityPermissions('export', [
      'applications_authorization',
      'users_assignments',
      'oidc_clients',
    ]);

    expectExactPermissions(actual, [
      'admin:export:read',
      'admin:app:read',
      'admin:role:read',
      'admin:permission:read',
      'admin:claim:read',
      'admin:user:read',
      'admin:client:read',
    ]);
  });

  it('should deny an environment export without the exact super-admin role before execution', async () => {
    testState.roles = ['porta-admin'];

    const response = await postJson(baseUrl, '/api/admin/export/manifest', {
      scope: { kind: 'environment' },
      categories: ['organizations'],
      application_selection: { all_applications: false, application_slugs: [] },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(testState.exportManifest).not.toHaveBeenCalled();
  });

  it('should deny a missing category permission before export content or import planning', async () => {
    testState.permissions.delete('admin:org:read');
    const exportResponse = await postJson(baseUrl, '/api/admin/export/manifest', {
      scope: { kind: 'organization', organization_slug: 'acme' },
      categories: ['organizations'],
      application_selection: { all_applications: false, application_slugs: [] },
    });

    testState.permissions = new Set(ALL_PERMISSIONS);
    testState.permissions.delete('admin:org:create');
    const importResponse = await postJson(baseUrl, '/api/admin/import', {
      manifest: EMPTY_MANIFEST,
      mode: 'dry-run',
    });

    expect(exportResponse.status).toBe(403);
    expect(importResponse.status).toBe(403);
    expect(testState.exportManifest).not.toHaveBeenCalled();
    expect(testState.buildPlan).not.toHaveBeenCalled();
    expect(testState.applyManifest).not.toHaveBeenCalled();
  });
});
