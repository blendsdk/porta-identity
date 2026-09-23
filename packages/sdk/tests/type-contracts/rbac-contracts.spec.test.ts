import { describe, expectTypeOf, it } from 'vitest';
import type { PermissionsDomain, RolesDomain, UserRolesDomain } from '../../src/domains/index.js';
import type {
  CreatePermissionInput,
  CreateRoleInput,
  Permission,
  Role,
  UpdatePermissionInput,
  UpdateRoleInput,
} from '../../src/types/index.js';

type ReductionResult = { reauthenticationRequired: boolean };
type RoleUpdateResult = { role: Role; reauthenticationRequired: boolean };

type ExpectedCreateRoleInput = {
  name: string;
  slug?: string;
  description?: string;
};

type ExpectedUpdateRoleInput = {
  name?: string;
  slug?: string;
  description?: string | null;
};

type ExpectedCreatePermissionInput = {
  name: string;
  slug: string;
  moduleId?: string;
  description?: string;
};

type ExpectedUpdatePermissionInput = {
  name?: string;
  description?: string | null;
};

type ExpectedRolesDomain = {
  list(appId: string): Promise<Role[]>;
  get(appId: string, roleId: string): Promise<Role>;
  create(appId: string, input: CreateRoleInput): Promise<Role>;
  update(appId: string, roleId: string, input: UpdateRoleInput): Promise<RoleUpdateResult>;
  delete(appId: string, roleId: string): Promise<ReductionResult>;
  listPermissions(appId: string, roleId: string): Promise<Permission[]>;
  assignPermissions(appId: string, roleId: string, permissionIds: string[]): Promise<void>;
  removePermissions(
    appId: string,
    roleId: string,
    permissionIds: string[],
  ): Promise<ReductionResult>;
};

type ExpectedPermissionsDomain = {
  list(appId: string, params?: { moduleId?: string }): Promise<Permission[]>;
  get(appId: string, permissionId: string): Promise<Permission>;
  create(appId: string, input: CreatePermissionInput): Promise<Permission>;
  update(appId: string, permissionId: string, input: UpdatePermissionInput): Promise<Permission>;
  delete(appId: string, permissionId: string): Promise<ReductionResult>;
};

type ExpectedUserRolesDomain = {
  list(orgId: string, userId: string): Promise<Role[]>;
  assign(orgId: string, userId: string, roleIds: string[]): Promise<void>;
  remove(orgId: string, userId: string, roleIds: string[]): Promise<ReductionResult>;
};

describe('RBAC SDK type contracts', () => {
  it('exposes exact path-independent mutation inputs', () => {
    expectTypeOf<CreateRoleInput>().toEqualTypeOf<ExpectedCreateRoleInput>();
    expectTypeOf<UpdateRoleInput>().toEqualTypeOf<ExpectedUpdateRoleInput>();
    expectTypeOf<CreatePermissionInput>().toEqualTypeOf<ExpectedCreatePermissionInput>();
    expectTypeOf<UpdatePermissionInput>().toEqualTypeOf<ExpectedUpdatePermissionInput>();
  });

  it('exposes complete collections and fixed reduction results', () => {
    expectTypeOf<RolesDomain>().toEqualTypeOf<ExpectedRolesDomain>();
    expectTypeOf<PermissionsDomain>().toEqualTypeOf<ExpectedPermissionsDomain>();
    expectTypeOf<UserRolesDomain>().toEqualTypeOf<ExpectedUserRolesDomain>();
  });
});
