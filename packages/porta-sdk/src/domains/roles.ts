/**
 * Roles domain — CRUD and permission assignment for application roles.
 *
 * Server endpoints:
 *   GET    /applications/:appId/roles              — List roles
 *   GET    /applications/:appId/roles/:roleId      — Get role (plain Role)
 *   POST   /applications/:appId/roles              — Create role
 *   PUT    /applications/:appId/roles/:roleId      — Update role
 *   POST   /applications/:appId/roles/:roleId/archive — Archive role
 *   DELETE /applications/:appId/roles/:roleId      — Delete role (?force=true)
 *   GET    /applications/:appId/roles/:roleId/permissions    — List permissions for role
 *   PUT    /applications/:appId/roles/:roleId/permissions    — Assign permissions (bulk)
 *   DELETE /applications/:appId/roles/:roleId/permissions    — Remove permissions (bulk)
 *
 * @module domains/roles
 */

import type { HttpTransport } from '../transport/types.js';
import type { Role, CreateRoleInput, UpdateRoleInput, Permission, ListParams, PaginatedResponse } from '../types/index.js';
import { listAll } from '../pagination/index.js';
import { unwrapData, toQueryParams } from './helpers.js';

export interface RolesDomain {
  list(appId: string, params?: ListParams): Promise<PaginatedResponse<Role>>;
  listAll(appId: string, params?: Omit<ListParams, 'page' | 'cursor'>): Promise<Role[]>;
  get(appId: string, roleId: string): Promise<Role>;
  create(appId: string, input: CreateRoleInput): Promise<Role>;
  update(appId: string, roleId: string, input: UpdateRoleInput): Promise<Role>;
  archive(appId: string, roleId: string): Promise<void>;
  remove(appId: string, roleId: string, force?: boolean): Promise<void>;
  /** List permissions assigned to a role (full Permission objects) */
  listPermissions(appId: string, roleId: string): Promise<Permission[]>;
  /** Bulk assign permissions to a role (array of permission UUIDs) */
  assignPermissions(appId: string, roleId: string, permissionIds: string[]): Promise<void>;
  /** Bulk remove permissions from a role (array of permission UUIDs) */
  removePermissions(appId: string, roleId: string, permissionIds: string[]): Promise<void>;
  /** @deprecated Use assignPermissions (plural) */
  assignPermission(appId: string, roleId: string, permissionId: string): Promise<void>;
  /** @deprecated Use removePermissions (plural) */
  removePermission(appId: string, roleId: string, permissionId: string): Promise<void>;
}

export function createRolesDomain(transport: HttpTransport): RolesDomain {
  function base(appId: string) { return `/applications/${appId}/roles`; }

  return {
    async list(appId, params?) {
      const res = await transport.request({ method: 'GET', path: base(appId), params: toQueryParams(params) });
      return res.body as PaginatedResponse<Role>;
    },
    listAll(appId, params?) {
      return listAll((p) => this.list(appId, { ...params, ...p }), params);
    },
    async get(appId, roleId) {
      const res = await transport.request({ method: 'GET', path: `${base(appId)}/${roleId}` });
      return unwrapData<Role>(res.body);
    },
    async create(appId, input) {
      const res = await transport.request({ method: 'POST', path: base(appId), body: input });
      return unwrapData<Role>(res.body);
    },
    async update(appId, roleId, input) {
      const res = await transport.request({ method: 'PUT', path: `${base(appId)}/${roleId}`, body: input });
      return unwrapData<Role>(res.body);
    },
    async archive(appId, roleId) {
      await transport.request({ method: 'POST', path: `${base(appId)}/${roleId}/archive` });
    },
    async remove(appId, roleId, force?) {
      const params = force ? { force: 'true' } : undefined;
      await transport.request({ method: 'DELETE', path: `${base(appId)}/${roleId}`, params });
    },
    async listPermissions(appId, roleId) {
      const res = await transport.request({ method: 'GET', path: `${base(appId)}/${roleId}/permissions` });
      return unwrapData<Permission[]>(res.body);
    },
    async assignPermissions(appId, roleId, permissionIds) {
      await transport.request({
        method: 'PUT',
        path: `${base(appId)}/${roleId}/permissions`,
        body: { permissionIds },
      });
    },
    async removePermissions(appId, roleId, permissionIds) {
      await transport.request({
        method: 'DELETE',
        path: `${base(appId)}/${roleId}/permissions`,
        body: { permissionIds },
      });
    },
    // Backward-compatible singular wrappers
    async assignPermission(appId, roleId, permissionId) {
      return this.assignPermissions(appId, roleId, [permissionId]);
    },
    async removePermission(appId, roleId, permissionId) {
      return this.removePermissions(appId, roleId, [permissionId]);
    },
  };
}
