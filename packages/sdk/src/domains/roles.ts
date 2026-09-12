/**
 * Roles domain — CRUD and permission assignment for application roles.
 *
 * Server endpoints:
 *   GET    /applications/:appId/roles              — List roles
 *   GET    /applications/:appId/roles/:roleId      — Get role (plain Role)
 *   POST   /applications/:appId/roles              — Create role
 *   PUT    /applications/:appId/roles/:roleId      — Update role
 *   DELETE /applications/:appId/roles/:roleId      — Delete role
 *   GET    /applications/:appId/roles/:roleId/permissions    — List permissions for role
 *   PUT    /applications/:appId/roles/:roleId/permissions    — Assign permissions (bulk)
 *   DELETE /applications/:appId/roles/:roleId/permissions    — Remove permissions (bulk)
 *
 * @module domains/roles
 */

import type { HttpTransport } from '../transport/types.js';
import type { Role, CreateRoleInput, UpdateRoleInput, Permission } from '../types/index.js';
import { isRecord, requireData } from './helpers.js';

/** Result returned after an operation can reduce a user's current authority. */
interface AuthorityReductionResult {
  /** Whether the current caller must authenticate again after the committed operation. */
  reauthenticationRequired: boolean;
}

/** Authoritative role and authentication effect returned after a role update. */
interface RoleUpdateResult extends AuthorityReductionResult {
  /** Role state committed by the server. */
  role: Role;
}

/** Validate one role returned by the Admin API. */
function isRole(value: unknown): value is Role {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.applicationId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.slug === 'string' &&
    (typeof value.description === 'string' || value.description === null) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

/** Validate one permission returned by a role-permission collection. */
function isPermission(value: unknown): value is Permission {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.applicationId === 'string' &&
    (typeof value.moduleId === 'string' || value.moduleId === null) &&
    typeof value.name === 'string' &&
    typeof value.slug === 'string' &&
    (typeof value.description === 'string' || value.description === null) &&
    typeof value.createdAt === 'string'
  );
}

/** Validate the explicit result of a committed authority reduction. */
function isAuthorityReductionResult(value: unknown): value is AuthorityReductionResult {
  return isRecord(value) && typeof value.reauthenticationRequired === 'boolean';
}

/** Validate a role update result and its authentication effect. */
function isRoleUpdateResult(value: unknown): value is RoleUpdateResult {
  return (
    isRecord(value) && isRole(value.role) && typeof value.reauthenticationRequired === 'boolean'
  );
}

export interface RolesDomain {
  /** List the complete role collection for one application. */
  list(appId: string): Promise<Role[]>;
  /** Get one role through its parent-qualified route. */
  get(appId: string, roleId: string): Promise<Role>;
  /** Create a role under the application identified by the route. */
  create(appId: string, input: CreateRoleInput): Promise<Role>;
  /** Update mutable role fields and report whether the caller must authenticate again. */
  update(appId: string, roleId: string, input: UpdateRoleInput): Promise<RoleUpdateResult>;
  /** Permanently delete a role through its parent-qualified route. */
  delete(appId: string, roleId: string): Promise<AuthorityReductionResult>;
  /** List full permission objects assigned to a role. */
  listPermissions(appId: string, roleId: string): Promise<Permission[]>;
  /** Assign permission UUIDs to a role. */
  assignPermissions(appId: string, roleId: string, permissionIds: string[]): Promise<void>;
  /** Remove permission UUIDs and report whether the caller must authenticate again. */
  removePermissions(
    appId: string,
    roleId: string,
    permissionIds: string[],
  ): Promise<AuthorityReductionResult>;
}

/** Create role operations backed by one HTTP transport. */
export function createRolesDomain(transport: HttpTransport): RolesDomain {
  /** Build the parent-qualified role collection path. */
  function base(appId: string): string {
    return `/applications/${appId}/roles`;
  }

  return {
    async list(appId) {
      const res = await transport.request({ method: 'GET', path: base(appId) });
      return requireData(
        res.body,
        (value): value is Role[] => Array.isArray(value) && value.every(isRole),
      );
    },
    async get(appId, roleId) {
      const res = await transport.request({ method: 'GET', path: `${base(appId)}/${roleId}` });
      return requireData(res.body, isRole);
    },
    async create(appId, input) {
      const res = await transport.request({ method: 'POST', path: base(appId), body: input });
      return requireData(res.body, isRole);
    },
    async update(appId, roleId, input) {
      const res = await transport.request({
        method: 'PUT',
        path: `${base(appId)}/${roleId}`,
        body: input,
      });
      return requireData(res.body, isRoleUpdateResult);
    },
    async delete(appId, roleId) {
      const res = await transport.request({
        method: 'DELETE',
        path: `${base(appId)}/${roleId}`,
      });
      return requireData(res.body, isAuthorityReductionResult);
    },
    async listPermissions(appId, roleId) {
      const res = await transport.request({
        method: 'GET',
        path: `${base(appId)}/${roleId}/permissions`,
      });
      return requireData(
        res.body,
        (value): value is Permission[] => Array.isArray(value) && value.every(isPermission),
      );
    },
    async assignPermissions(appId, roleId, permissionIds) {
      await transport.request({
        method: 'PUT',
        path: `${base(appId)}/${roleId}/permissions`,
        body: { permissionIds },
      });
    },
    async removePermissions(appId, roleId, permissionIds) {
      const res = await transport.request({
        method: 'DELETE',
        path: `${base(appId)}/${roleId}/permissions`,
        body: { permissionIds },
      });
      return requireData(res.body, isAuthorityReductionResult);
    },
  };
}
