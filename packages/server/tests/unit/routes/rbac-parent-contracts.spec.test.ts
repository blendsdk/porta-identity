import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission, Role } from '../../../src/rbac/types.js';
import { ADMIN_PERMISSIONS, ALL_ADMIN_PERMISSIONS } from '../../../src/lib/admin-permissions.js';
import {
  PermissionNotFoundError,
  RbacValidationError,
  RoleNotFoundError,
} from '../../../src/rbac/errors.js';

const mocks = vi.hoisted(() => ({
  roleCreate: vi.fn(),
  roleFind: vi.fn(),
  roleList: vi.fn(),
  roleUpdate: vi.fn(),
  roleDelete: vi.fn(),
  rolePermissions: vi.fn(),
  rolePermissionAdd: vi.fn(),
  rolePermissionRemove: vi.fn(),
  permissionCreate: vi.fn(),
  permissionFind: vi.fn(),
  permissionList: vi.fn(),
  permissionUpdate: vi.fn(),
  permissionDelete: vi.fn(),
  permissionRoles: vi.fn(),
  userRoleList: vi.fn(),
  userRoleAssign: vi.fn(),
  userRoleRemove: vi.fn(),
  userPermissions: vi.fn(),
  usersWithRole: vi.fn(),
  getApplicationBySlug: vi.fn(),
  guardSuperAdmin: vi.fn(),
}));

vi.mock('../../../src/rbac/role-service.js', () => ({
  createRole: mocks.roleCreate,
  findRoleById: mocks.roleFind,
  findRoleBySlug: vi.fn(),
  listRolesByApplication: mocks.roleList,
  updateRole: mocks.roleUpdate,
  deleteRole: mocks.roleDelete,
  assignPermissionsToRole: mocks.rolePermissionAdd,
  removePermissionsFromRole: mocks.rolePermissionRemove,
  getPermissionsForRole: mocks.rolePermissions,
}));

vi.mock('../../../src/rbac/permission-service.js', () => ({
  createPermission: mocks.permissionCreate,
  findPermissionById: mocks.permissionFind,
  findPermissionBySlug: vi.fn(),
  listPermissionsByApplication: mocks.permissionList,
  updatePermission: mocks.permissionUpdate,
  deletePermission: mocks.permissionDelete,
  getRolesWithPermission: mocks.permissionRoles,
}));

vi.mock('../../../src/rbac/user-role-service.js', () => ({
  getUserRoles: mocks.userRoleList,
  assignRolesToUser: mocks.userRoleAssign,
  removeRolesFromUser: mocks.userRoleRemove,
  getUserPermissions: mocks.userPermissions,
  getUsersWithRole: mocks.usersWithRole,
}));

vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../../src/middleware/require-user-organization.js', () => ({
  requireUserOrganization: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../../src/applications/service.js', () => ({
  getApplicationBySlug: mocks.getApplicationBySlug,
}));

vi.mock('../../../src/lib/super-admin-protection.js', () => ({
  guardSuperAdmin: mocks.guardSuperAdmin,
}));

import { createPermissionRouter } from '../../../src/routes/permissions.js';
import { createRoleRouter } from '../../../src/routes/roles.js';
import { createUserRoleRouter } from '../../../src/routes/user-roles.js';

const APP_ID = '10000000-0000-4000-8000-000000000001';
const FOREIGN_APP_ID = '10000000-0000-4000-8000-000000000002';
const ADMIN_APP_ID = '10000000-0000-4000-8000-000000000003';
const MODULE_ID = '10000000-0000-4000-8000-000000000004';
const ROLE_ID = '10000000-0000-4000-8000-000000000005';
const PERMISSION_ID = '10000000-0000-4000-8000-000000000006';
const FOREIGN_PERMISSION_ID = '10000000-0000-4000-8000-000000000007';
const ORG_ID = '10000000-0000-4000-8000-000000000008';
const USER_ID = '10000000-0000-4000-8000-000000000009';
const ACTOR_ID = '10000000-0000-4000-8000-000000000010';

function role(overrides: Partial<Role> = {}): Role {
  return {
    id: ROLE_ID,
    applicationId: APP_ID,
    name: 'Editor',
    slug: 'editor',
    description: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function permission(overrides: Partial<Permission> = {}): Permission {
  return {
    id: PERMISSION_ID,
    applicationId: APP_ID,
    moduleId: MODULE_ID,
    name: 'Read records',
    slug: 'records:items:read',
    description: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function context(
  options: {
    params?: Record<string, string>;
    body?: unknown;
    permissions?: readonly string[];
  } = {},
) {
  let status = 200;
  let responseBody: unknown;
  return {
    params: options.params ?? {},
    query: {},
    request: { body: options.body ?? {} },
    state: {
      adminUser: {
        id: ACTOR_ID,
        email: 'actor@example.test',
        organizationId: ORG_ID,
        roles: ['porta-super-admin'],
        permissions: options.permissions ?? ALL_ADMIN_PERMISSIONS,
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
      const error = new Error(message) as Error & { status: number };
      error.status = code;
      throw error;
    },
  };
}

type RouterFactory =
  typeof createRoleRouter | typeof createPermissionRouter | typeof createUserRoleRouter;

function layerFor(factory: RouterFactory, method: string, suffix: string) {
  const router = factory();
  const layer = router.stack.find(
    (candidate) => candidate.methods.includes(method) && candidate.path.endsWith(suffix),
  );
  if (!layer) throw new Error(`Missing ${method} route ending in ${suffix}`);
  return layer;
}

async function executeLayer(
  layer: ReturnType<typeof layerFor>,
  ctx: ReturnType<typeof context>,
): Promise<void> {
  const dispatch = async (index: number): Promise<void> => {
    const middleware = layer.stack[index];
    if (!middleware) return;
    await middleware(ctx as never, () => dispatch(index + 1));
  };
  await dispatch(0);
}

async function captureError(run: () => Promise<void>): Promise<unknown> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return error;
  }
}

function expectSanitized(error: unknown, status: number, resource: 'Role' | 'Permission'): void {
  expect(error).toMatchObject({ status, message: `${resource} not found` });
  expect(String((error as Error | undefined)?.message)).not.toContain(ROLE_ID);
  expect(String((error as Error | undefined)?.message)).not.toContain(PERMISSION_ID);
  expect(String((error as Error | undefined)?.message)).not.toContain(FOREIGN_APP_ID);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getApplicationBySlug.mockResolvedValue({ id: ADMIN_APP_ID, slug: 'porta-admin' });
  mocks.roleFind.mockResolvedValue(role());
  mocks.guardSuperAdmin.mockResolvedValue(undefined);
});

describe('parent-qualified RBAC route contracts', () => {
  // Nested records are resolved through their route parent and foreign records stay untouched.
  it.each([
    {
      name: 'role read',
      factory: createRoleRouter as RouterFactory,
      method: 'GET',
      suffix: '/:roleId',
      ctx: () => context({ params: { appId: FOREIGN_APP_ID, roleId: ROLE_ID } }),
      service: mocks.roleFind,
      expected: [FOREIGN_APP_ID, ROLE_ID],
      error: () => new RoleNotFoundError(ROLE_ID),
      resource: 'Role' as const,
    },
    {
      name: 'role update',
      factory: createRoleRouter as RouterFactory,
      method: 'PUT',
      suffix: '/:roleId',
      ctx: () =>
        context({
          params: { appId: FOREIGN_APP_ID, roleId: ROLE_ID },
          body: { name: 'Changed' },
        }),
      service: mocks.roleUpdate,
      expected: [FOREIGN_APP_ID, ROLE_ID, { name: 'Changed' }, ACTOR_ID],
      error: () => new RoleNotFoundError(ROLE_ID),
      resource: 'Role' as const,
    },
    {
      name: 'role deletion',
      factory: createRoleRouter as RouterFactory,
      method: 'DELETE',
      suffix: '/:roleId',
      ctx: () => context({ params: { appId: FOREIGN_APP_ID, roleId: ROLE_ID } }),
      service: mocks.roleDelete,
      expected: [FOREIGN_APP_ID, ROLE_ID, ACTOR_ID],
      error: () => new RoleNotFoundError(ROLE_ID),
      resource: 'Role' as const,
    },
    {
      name: 'permission read',
      factory: createPermissionRouter as RouterFactory,
      method: 'GET',
      suffix: '/:permId',
      ctx: () => context({ params: { appId: FOREIGN_APP_ID, permId: PERMISSION_ID } }),
      service: mocks.permissionFind,
      expected: [FOREIGN_APP_ID, PERMISSION_ID],
      error: () => new PermissionNotFoundError(PERMISSION_ID),
      resource: 'Permission' as const,
    },
    {
      name: 'permission update',
      factory: createPermissionRouter as RouterFactory,
      method: 'PUT',
      suffix: '/:permId',
      ctx: () =>
        context({
          params: { appId: FOREIGN_APP_ID, permId: PERMISSION_ID },
          body: { name: 'Changed' },
        }),
      service: mocks.permissionUpdate,
      expected: [FOREIGN_APP_ID, PERMISSION_ID, { name: 'Changed' }, ACTOR_ID],
      error: () => new PermissionNotFoundError(PERMISSION_ID),
      resource: 'Permission' as const,
    },
    {
      name: 'permission deletion',
      factory: createPermissionRouter as RouterFactory,
      method: 'DELETE',
      suffix: '/:permissionId',
      ctx: () => context({ params: { appId: FOREIGN_APP_ID, permissionId: PERMISSION_ID } }),
      service: mocks.permissionDelete,
      expected: [FOREIGN_APP_ID, PERMISSION_ID, ACTOR_ID],
      error: () => new PermissionNotFoundError(PERMISSION_ID),
      resource: 'Permission' as const,
    },
  ])(
    'returns sanitized 404 for foreign-parent $name without committing a mutation',
    async (testCase) => {
      if (testCase.method === 'GET') {
        testCase.service.mockResolvedValue(null);
      } else {
        testCase.service.mockRejectedValue(testCase.error());
      }
      const ctx = testCase.ctx();
      const error = await captureError(() =>
        executeLayer(layerFor(testCase.factory, testCase.method, testCase.suffix), ctx),
      );

      expectSanitized(error, 404, testCase.resource);
      expect(testCase.service).toHaveBeenCalledWith(...testCase.expected);
      expect(ctx.body).toBeUndefined();
    },
  );

  // A module owned by another application cannot be used to create a permission.
  it('returns sanitized 400 and no created resource for a foreign module', async () => {
    mocks.permissionCreate.mockRejectedValue(new RbacValidationError('foreign module details'));
    const ctx = context({
      params: { appId: APP_ID },
      body: {
        name: 'Read records',
        slug: 'records:items:read',
        moduleId: MODULE_ID,
      },
    });

    const error = await captureError(() =>
      executeLayer(layerFor(createPermissionRouter, 'POST', '/permissions'), ctx),
    );

    expect(error).toMatchObject({ status: 400, message: 'Permission request is invalid' });
    expect(ctx.body).toBeUndefined();
    expect(mocks.permissionCreate).toHaveBeenCalledWith(
      {
        applicationId: APP_ID,
        name: 'Read records',
        slug: 'records:items:read',
        moduleId: MODULE_ID,
      },
      ACTOR_ID,
    );
  });

  // One foreign permission rejects the complete role-permission request without a success result.
  it('returns sanitized 400 for a mixed-application permission batch', async () => {
    mocks.rolePermissionAdd.mockRejectedValue(
      new RbacValidationError('foreign permission details'),
    );
    const ctx = context({
      params: { appId: APP_ID, roleId: ROLE_ID },
      body: { permissionIds: [PERMISSION_ID, FOREIGN_PERMISSION_ID] },
    });

    const error = await captureError(() =>
      executeLayer(layerFor(createRoleRouter, 'PUT', '/:roleId/permissions'), ctx),
    );

    expect(error).toMatchObject({ status: 400, message: 'Role request is invalid' });
    expect(ctx.body).toBeUndefined();
    expect(mocks.rolePermissionAdd).toHaveBeenCalledWith(
      APP_ID,
      ROLE_ID,
      [PERMISSION_ID, FOREIGN_PERMISSION_ID],
      ACTOR_ID,
    );
  });

  // Historical cross-application links are absent from the parent-qualified mapping response.
  it('returns only same-application permissions from a mapping read', async () => {
    const included = permission();
    mocks.rolePermissions.mockResolvedValue([included]);
    const ctx = context({ params: { appId: APP_ID, roleId: ROLE_ID } });

    await executeLayer(layerFor(createRoleRouter, 'GET', '/:roleId/permissions'), ctx);

    expect(ctx.body).toEqual({ data: [included] });
    expect(mocks.rolePermissions).toHaveBeenCalledWith(APP_ID, ROLE_ID);
  });
});

describe('committed RBAC mutation results', () => {
  // Removing an absent mapping commits successfully without requesting reauthentication.
  it.each([
    {
      name: 'role-permission removal',
      factory: createRoleRouter as RouterFactory,
      suffix: '/:roleId/permissions',
      ctx: () =>
        context({
          params: { appId: APP_ID, roleId: ROLE_ID },
          body: { permissionIds: [PERMISSION_ID] },
        }),
      service: mocks.rolePermissionRemove,
      expected: [APP_ID, ROLE_ID, [PERMISSION_ID], ACTOR_ID],
    },
    {
      name: 'user-role removal',
      factory: createUserRoleRouter as RouterFactory,
      suffix: '/roles',
      ctx: () =>
        context({
          params: { orgId: ORG_ID, userId: USER_ID },
          body: { roleIds: [ROLE_ID] },
        }),
      service: mocks.userRoleRemove,
      expected: [ORG_ID, USER_ID, [ROLE_ID], ACTOR_ID],
    },
  ])('returns false and no revocation signal for idempotent $name', async (testCase) => {
    testCase.service.mockResolvedValue({ reauthenticationRequired: false });
    const ctx = testCase.ctx();

    await executeLayer(layerFor(testCase.factory, 'DELETE', testCase.suffix), ctx);

    expect(ctx.status).toBe(200);
    expect(ctx.body).toEqual({ data: { reauthenticationRequired: false } });
    expect(testCase.service).toHaveBeenCalledWith(...testCase.expected);
  });

  // A committed reduction reports when the authenticated actor lost effective authority.
  it('returns true when user-role removal affects the authenticated actor', async () => {
    mocks.userRoleRemove.mockResolvedValue({ reauthenticationRequired: true });
    const ctx = context({
      params: { orgId: ORG_ID, userId: ACTOR_ID },
      body: { roleIds: [ROLE_ID] },
    });

    await executeLayer(layerFor(createUserRoleRouter, 'DELETE', '/roles'), ctx);

    expect(ctx.status).toBe(200);
    expect(ctx.body).toEqual({ data: { reauthenticationRequired: true } });
    expect(mocks.userRoleRemove).toHaveBeenCalledWith(ORG_ID, ACTOR_ID, [ROLE_ID], ACTOR_ID);
  });
});

type MutationCase = {
  name: string;
  factory: RouterFactory;
  method: string;
  suffix: string;
  required: string;
  ctx: () => ReturnType<typeof context>;
  service: ReturnType<typeof vi.fn>;
  result: unknown;
  expected: unknown[];
};

const mutationCases: MutationCase[] = [
  {
    name: 'role creation',
    factory: createRoleRouter,
    method: 'POST',
    suffix: '/roles',
    required: ADMIN_PERMISSIONS.ROLE_CREATE,
    ctx: () => context({ params: { appId: APP_ID }, body: { name: 'Editor', slug: 'editor' } }),
    service: mocks.roleCreate,
    result: role(),
    expected: [{ applicationId: APP_ID, name: 'Editor', slug: 'editor' }, ACTOR_ID],
  },
  {
    name: 'role update',
    factory: createRoleRouter,
    method: 'PUT',
    suffix: '/:roleId',
    required: ADMIN_PERMISSIONS.ROLE_UPDATE,
    ctx: () => context({ params: { appId: APP_ID, roleId: ROLE_ID }, body: { name: 'Changed' } }),
    service: mocks.roleUpdate,
    result: { role: role({ name: 'Changed' }), reauthenticationRequired: false },
    expected: [APP_ID, ROLE_ID, { name: 'Changed' }, ACTOR_ID],
  },
  {
    name: 'role deletion',
    factory: createRoleRouter,
    method: 'DELETE',
    suffix: '/:roleId',
    required: ADMIN_PERMISSIONS.ROLE_DELETE,
    ctx: () => context({ params: { appId: APP_ID, roleId: ROLE_ID } }),
    service: mocks.roleDelete,
    result: { reauthenticationRequired: false },
    expected: [APP_ID, ROLE_ID, ACTOR_ID],
  },
  {
    name: 'role-permission addition',
    factory: createRoleRouter,
    method: 'PUT',
    suffix: '/:roleId/permissions',
    required: ADMIN_PERMISSIONS.ROLE_UPDATE,
    ctx: () =>
      context({
        params: { appId: APP_ID, roleId: ROLE_ID },
        body: { permissionIds: [PERMISSION_ID] },
      }),
    service: mocks.rolePermissionAdd,
    result: undefined,
    expected: [APP_ID, ROLE_ID, [PERMISSION_ID], ACTOR_ID],
  },
  {
    name: 'role-permission removal',
    factory: createRoleRouter,
    method: 'DELETE',
    suffix: '/:roleId/permissions',
    required: ADMIN_PERMISSIONS.ROLE_UPDATE,
    ctx: () =>
      context({
        params: { appId: APP_ID, roleId: ROLE_ID },
        body: { permissionIds: [PERMISSION_ID] },
      }),
    service: mocks.rolePermissionRemove,
    result: { reauthenticationRequired: false },
    expected: [APP_ID, ROLE_ID, [PERMISSION_ID], ACTOR_ID],
  },
  {
    name: 'permission creation',
    factory: createPermissionRouter,
    method: 'POST',
    suffix: '/permissions',
    required: ADMIN_PERMISSIONS.PERMISSION_CREATE,
    ctx: () =>
      context({
        params: { appId: APP_ID },
        body: { name: 'Read records', slug: 'records:items:read', moduleId: MODULE_ID },
      }),
    service: mocks.permissionCreate,
    result: permission(),
    expected: [
      {
        applicationId: APP_ID,
        name: 'Read records',
        slug: 'records:items:read',
        moduleId: MODULE_ID,
      },
      ACTOR_ID,
    ],
  },
  {
    name: 'permission update',
    factory: createPermissionRouter,
    method: 'PUT',
    suffix: '/:permId',
    required: ADMIN_PERMISSIONS.PERMISSION_UPDATE,
    ctx: () =>
      context({ params: { appId: APP_ID, permId: PERMISSION_ID }, body: { name: 'Changed' } }),
    service: mocks.permissionUpdate,
    result: permission({ name: 'Changed' }),
    expected: [APP_ID, PERMISSION_ID, { name: 'Changed' }, ACTOR_ID],
  },
  {
    name: 'permission deletion',
    factory: createPermissionRouter,
    method: 'DELETE',
    suffix: '/:permissionId',
    required: ADMIN_PERMISSIONS.PERMISSION_DELETE,
    ctx: () => context({ params: { appId: APP_ID, permissionId: PERMISSION_ID } }),
    service: mocks.permissionDelete,
    result: { reauthenticationRequired: false },
    expected: [APP_ID, PERMISSION_ID, ACTOR_ID],
  },
  {
    name: 'user-role assignment',
    factory: createUserRoleRouter,
    method: 'PUT',
    suffix: '/roles',
    required: ADMIN_PERMISSIONS.ROLE_ASSIGN,
    ctx: () =>
      context({ params: { orgId: ORG_ID, userId: USER_ID }, body: { roleIds: [ROLE_ID] } }),
    service: mocks.userRoleAssign,
    result: undefined,
    expected: [ORG_ID, USER_ID, [ROLE_ID], ACTOR_ID],
  },
  {
    name: 'user-role removal',
    factory: createUserRoleRouter,
    method: 'DELETE',
    suffix: '/roles',
    required: ADMIN_PERMISSIONS.ROLE_ASSIGN,
    ctx: () =>
      context({ params: { orgId: ORG_ID, userId: USER_ID }, body: { roleIds: [ROLE_ID] } }),
    service: mocks.userRoleRemove,
    result: { reauthenticationRequired: false },
    expected: [ORG_ID, USER_ID, [ROLE_ID], ACTOR_ID],
  },
];

describe('RBAC mutation authorization and actor provenance', () => {
  // Every successful mutation carries the authenticated actor to its service and audit boundary.
  it.each(mutationCases)('passes the actor for successful $name', async (testCase) => {
    testCase.service.mockResolvedValue(testCase.result);
    const ctx = testCase.ctx();

    await executeLayer(layerFor(testCase.factory, testCase.method, testCase.suffix), ctx);

    expect(testCase.service).toHaveBeenCalledWith(...testCase.expected);
  });

  // Each mutation requires its exact static capability before any service work begins.
  it.each(mutationCases)(
    'rejects $name without its exact capability before service work',
    async (testCase) => {
      const permissions = ALL_ADMIN_PERMISSIONS.filter((item) => item !== testCase.required);
      const ctx = testCase.ctx();
      ctx.state.adminUser.permissions = permissions;

      await executeLayer(layerFor(testCase.factory, testCase.method, testCase.suffix), ctx);

      expect(ctx.status).toBe(403);
      expect(ctx.body).toEqual({
        error: 'Forbidden',
        message: 'The requested operation is not permitted',
      });
      expect(testCase.service).not.toHaveBeenCalled();
    },
  );
});
