import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Middleware } from 'koa';
import type { Permission, Role } from '../../../src/rbac/types.js';
import { ADMIN_PERMISSIONS, ADMIN_ROLE_DEFINITIONS } from '../../../src/lib/admin-permissions.js';

const mocks = vi.hoisted(() => ({
  findUserForOidc: vi.fn(),
  findSuperAdminOrganization: vi.fn(),
  getUserRoles: vi.fn(),
  getUserPermissions: vi.fn(),
  assignRolesToUser: vi.fn(),
  findApplicationBySlug: vi.fn(),
  getApplicationBySlug: vi.fn(),
  roleFindById: vi.fn(),
  roleUpdate: vi.fn(),
  roleDelete: vi.fn(),
  roleAssignPermissions: vi.fn(),
  roleRemovePermissions: vi.fn(),
  permissionFindById: vi.fn(),
  permissionUpdate: vi.fn(),
  permissionDelete: vi.fn(),
}));

vi.mock('../../../src/users/service.js', () => ({
  findUserForOidc: mocks.findUserForOidc,
}));

vi.mock('../../../src/organizations/repository.js', () => ({
  findSuperAdminOrganization: mocks.findSuperAdminOrganization,
}));

vi.mock('../../../src/applications/repository.js', () => ({
  findApplicationBySlug: mocks.findApplicationBySlug,
}));

vi.mock('../../../src/applications/service.js', () => ({
  getApplicationBySlug: mocks.getApplicationBySlug,
}));

vi.mock('../../../src/rbac/user-role-service.js', () => ({
  getUserRoles: mocks.getUserRoles,
  getUserPermissions: mocks.getUserPermissions,
  assignRolesToUser: mocks.assignRolesToUser,
  removeRolesFromUser: vi.fn(),
  getUsersWithRole: vi.fn(),
}));

vi.mock('../../../src/rbac/role-service.js', () => ({
  createRole: vi.fn(),
  findRoleById: mocks.roleFindById,
  findRoleBySlug: vi.fn(),
  listRolesByApplication: vi.fn(),
  updateRole: mocks.roleUpdate,
  deleteRole: mocks.roleDelete,
  assignPermissionsToRole: mocks.roleAssignPermissions,
  removePermissionsFromRole: mocks.roleRemovePermissions,
  getPermissionsForRole: vi.fn(),
}));

vi.mock('../../../src/rbac/permission-service.js', () => ({
  createPermission: vi.fn(),
  findPermissionById: mocks.permissionFindById,
  findPermissionBySlug: vi.fn(),
  listPermissionsByApplication: vi.fn(),
  updatePermission: mocks.permissionUpdate,
  deletePermission: mocks.permissionDelete,
  getRolesWithPermission: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../src/lib/super-admin-protection.js', () => ({
  guardSuperAdmin: vi.fn(),
}));

import {
  clearAdminAuthProvider,
  requireAdminAuth,
  setAdminAuthProvider,
} from '../../../src/middleware/admin-auth.js';
import { createPermissionRouter } from '../../../src/routes/permissions.js';
import { createRoleRouter } from '../../../src/routes/roles.js';
import { createUserRoleRouter } from '../../../src/routes/user-roles.js';

const ADMIN_ORG_ID = '10000000-0000-4000-8000-000000000001';
const ADMIN_APP_ID = '10000000-0000-4000-8000-000000000002';
const FOREIGN_APP_ID = '10000000-0000-4000-8000-000000000003';
const ACTOR_ID = '10000000-0000-4000-8000-000000000004';
const TARGET_USER_ID = '10000000-0000-4000-8000-000000000005';
const SUPER_ROLE_ID = '10000000-0000-4000-8000-000000000006';
const USER_ROLE_ID = '10000000-0000-4000-8000-000000000007';
const PERMISSION_ID = '10000000-0000-4000-8000-000000000008';

function role(
  id: string,
  applicationId: string,
  definition: keyof typeof ADMIN_ROLE_DEFINITIONS,
): Role {
  const source = ADMIN_ROLE_DEFINITIONS[definition];
  return {
    id,
    applicationId,
    name: source.name,
    slug: source.slug,
    description: source.description,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function permission(): Permission {
  return {
    id: PERMISSION_ID,
    applicationId: ADMIN_APP_ID,
    moduleId: null,
    name: 'Read roles',
    slug: ADMIN_PERMISSIONS.ROLE_READ,
    description: 'Read role definitions',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function context(
  overrides: {
    params?: Record<string, string>;
    body?: unknown;
    authorization?: string;
  } = {},
) {
  let status = 200;
  let responseBody: unknown;
  return {
    params: overrides.params ?? {},
    query: {},
    request: { body: overrides.body ?? {} },
    state: {
      adminUser: {
        id: ACTOR_ID,
        email: 'actor@example.test',
        organizationId: ADMIN_ORG_ID,
        roles: [ADMIN_ROLE_DEFINITIONS.USER_ADMIN.slug],
        permissions: ADMIN_ROLE_DEFINITIONS.USER_ADMIN.permissions,
      },
    },
    get: (name: string) =>
      name.toLowerCase() === 'authorization' ? (overrides.authorization ?? '') : '',
    set status(value: number) {
      status = value;
    },
    get status() {
      return status;
    },
    set body(value: unknown) {
      responseBody = value;
    },
    get body() {
      return responseBody;
    },
    throw(code: number, message: string): never {
      const error = new Error(message) as Error & { status: number };
      error.status = code;
      throw error;
    },
  };
}

function finalHandler(router: ReturnType<typeof createRoleRouter>, path: string, method: string) {
  const layer = router.stack.find(
    (candidate) =>
      candidate.methods.includes(method) &&
      (path === '/' ? candidate.path.endsWith('/roles') : candidate.path.endsWith(path)),
  );
  if (!layer) throw new Error(`Missing ${method} ${path} route`);
  const handler = layer.stack.at(-1);
  if (!handler) throw new Error(`Missing ${method} ${path} handler`);
  return handler;
}

async function capturedError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return error;
  }
}

describe('canonical Porta Admin authority boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAdminAuthProvider();
    setAdminAuthProvider({
      AccessToken: { find: vi.fn().mockResolvedValue({ accountId: ACTOR_ID }) },
    });
    mocks.findSuperAdminOrganization.mockResolvedValue({ id: ADMIN_ORG_ID });
    mocks.findUserForOidc.mockResolvedValue({
      id: ACTOR_ID,
      email: 'actor@example.test',
      organizationId: ADMIN_ORG_ID,
    });
    const adminApplication = { id: ADMIN_APP_ID, slug: 'porta-admin' };
    mocks.findApplicationBySlug.mockResolvedValue(adminApplication);
    mocks.getApplicationBySlug.mockResolvedValue(adminApplication);
  });

  // A role that merely copies a built-in slug outside porta-admin grants no Admin API access.
  it('denies a foreign-application porta-super-admin assignment', async () => {
    mocks.getUserRoles.mockResolvedValue([role(SUPER_ROLE_ID, FOREIGN_APP_ID, 'SUPER_ADMIN')]);
    const ctx = context({ authorization: 'Bearer valid-token' });
    delete (ctx.state as { adminUser?: unknown }).adminUser;
    const next = vi.fn();

    await requireAdminAuth()(ctx as Parameters<Middleware>[0], next);

    expect(ctx.status).toBe(403);
    expect(ctx.body).toEqual({
      error: 'Forbidden',
      message: 'Administrative access is not permitted',
    });
    expect(ctx.state.adminUser).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  // A canonical built-in assignment receives exactly the capabilities defined in code.
  it('derives canonical Admin capabilities only from the static role definition', async () => {
    mocks.getUserRoles.mockResolvedValue([role(USER_ROLE_ID, ADMIN_APP_ID, 'USER_ADMIN')]);
    mocks.getUserPermissions.mockResolvedValue([
      { ...permission(), slug: ADMIN_PERMISSIONS.KEY_ROTATE },
    ]);
    const ctx = context({ authorization: 'Bearer valid-token' });
    delete (ctx.state as { adminUser?: unknown }).adminUser;
    const next = vi.fn();

    await requireAdminAuth()(ctx as Parameters<Middleware>[0], next);

    expect(next).toHaveBeenCalledOnce();
    expect(ctx.state.adminUser?.roles).toEqual([ADMIN_ROLE_DEFINITIONS.USER_ADMIN.slug]);
    expect(ctx.state.adminUser?.permissions).toEqual(ADMIN_ROLE_DEFINITIONS.USER_ADMIN.permissions);
    expect(ctx.state.adminUser?.permissions).not.toContain(ADMIN_PERMISSIONS.KEY_ROTATE);
  });

  // An actor cannot delegate a canonical role containing capabilities they do not hold.
  it('returns a sanitized 403 and performs no write when User Admin assigns Super Admin', async () => {
    mocks.getUserRoles.mockResolvedValue([role(USER_ROLE_ID, ADMIN_APP_ID, 'USER_ADMIN')]);
    mocks.roleFindById.mockResolvedValue(role(SUPER_ROLE_ID, ADMIN_APP_ID, 'SUPER_ADMIN'));
    const router = createUserRoleRouter();
    const handler = finalHandler(router as ReturnType<typeof createRoleRouter>, '/', 'PUT');
    const ctx = context({
      params: { orgId: ADMIN_ORG_ID, userId: TARGET_USER_ID },
      body: { roleIds: [SUPER_ROLE_ID] },
    });

    const error = await capturedError(() => handler(ctx as never, vi.fn()));

    expect(error).toMatchObject({ status: 403 });
    expect(String((error as Error | undefined)?.message)).not.toContain(SUPER_ROLE_ID);
    expect(String((error as Error | undefined)?.message)).not.toContain('porta-super-admin');
    expect(mocks.assignRolesToUser).not.toHaveBeenCalled();
  });

  // A canonical role wholly within the actor's static capability set remains delegable.
  it('assigns a subset canonical role and records the acting administrator', async () => {
    mocks.getUserRoles.mockResolvedValue([role(SUPER_ROLE_ID, ADMIN_APP_ID, 'SUPER_ADMIN')]);
    mocks.roleFindById.mockResolvedValue(role(USER_ROLE_ID, ADMIN_APP_ID, 'USER_ADMIN'));
    const router = createUserRoleRouter();
    const handler = finalHandler(router as ReturnType<typeof createRoleRouter>, '/', 'PUT');
    const ctx = context({
      params: { orgId: ADMIN_ORG_ID, userId: TARGET_USER_ID },
      body: { roleIds: [USER_ROLE_ID] },
    });
    ctx.state.adminUser.roles = [ADMIN_ROLE_DEFINITIONS.SUPER_ADMIN.slug];
    ctx.state.adminUser.permissions = ADMIN_ROLE_DEFINITIONS.SUPER_ADMIN.permissions;

    await handler(ctx as never, vi.fn());

    expect(ctx.status).toBe(204);
    expect(mocks.assignRolesToUser).toHaveBeenCalledOnce();
    expect(mocks.assignRolesToUser).toHaveBeenCalledWith(TARGET_USER_ID, [USER_ROLE_ID], ACTOR_ID);
  });

  // Generic CRUD cannot alter built-in role, permission, or role-permission records.
  it.each([
    [
      'role metadata update',
      () => {
        const ctx = context({
          params: { appId: ADMIN_APP_ID, roleId: USER_ROLE_ID },
          body: { name: 'Renamed', slug: 'renamed', description: 'Changed' },
        });
        return finalHandler(createRoleRouter(), '/:roleId', 'PUT')(ctx as never, vi.fn());
      },
    ],
    [
      'role deletion',
      () => {
        const ctx = context({ params: { appId: ADMIN_APP_ID, roleId: USER_ROLE_ID } });
        return finalHandler(createRoleRouter(), '/:roleId', 'DELETE')(ctx as never, vi.fn());
      },
    ],
    [
      'role-permission assignment',
      () => {
        const ctx = context({
          params: { appId: ADMIN_APP_ID, roleId: USER_ROLE_ID },
          body: { permissionIds: [PERMISSION_ID] },
        });
        return finalHandler(
          createRoleRouter(),
          '/:roleId/permissions',
          'PUT',
        )(ctx as never, vi.fn());
      },
    ],
    [
      'role-permission removal',
      () => {
        const ctx = context({
          params: { appId: ADMIN_APP_ID, roleId: USER_ROLE_ID },
          body: { permissionIds: [PERMISSION_ID] },
        });
        return finalHandler(
          createRoleRouter(),
          '/:roleId/permissions',
          'DELETE',
        )(ctx as never, vi.fn());
      },
    ],
    [
      'permission metadata update',
      () => {
        const ctx = context({
          params: { appId: ADMIN_APP_ID, permId: PERMISSION_ID },
          body: { name: 'Renamed', description: 'Changed' },
        });
        return finalHandler(
          createPermissionRouter() as ReturnType<typeof createRoleRouter>,
          '/:permId',
          'PUT',
        )(ctx as never, vi.fn());
      },
    ],
    [
      'permission deletion',
      () => {
        const ctx = context({
          params: { appId: ADMIN_APP_ID, permissionId: PERMISSION_ID },
        });
        return finalHandler(
          createPermissionRouter() as ReturnType<typeof createRoleRouter>,
          '/:permissionId',
          'DELETE',
        )(ctx as never, vi.fn());
      },
    ],
  ])(
    'rejects canonical %s with a fixed conflict-style response and no mutation',
    async (_name, run) => {
      mocks.roleFindById.mockResolvedValue(role(USER_ROLE_ID, ADMIN_APP_ID, 'USER_ADMIN'));
      mocks.permissionFindById.mockResolvedValue(permission());

      const error = await capturedError(run);

      expect(error).toMatchObject({ status: 400 });
      expect(String((error as Error | undefined)?.message)).not.toContain(USER_ROLE_ID);
      expect(String((error as Error | undefined)?.message)).not.toContain(PERMISSION_ID);
      expect(String((error as Error | undefined)?.message)).not.toContain('porta-user-admin');
      expect(mocks.roleUpdate).not.toHaveBeenCalled();
      expect(mocks.roleDelete).not.toHaveBeenCalled();
      expect(mocks.roleAssignPermissions).not.toHaveBeenCalled();
      expect(mocks.roleRemovePermissions).not.toHaveBeenCalled();
      expect(mocks.permissionUpdate).not.toHaveBeenCalled();
      expect(mocks.permissionDelete).not.toHaveBeenCalled();
    },
  );
});
