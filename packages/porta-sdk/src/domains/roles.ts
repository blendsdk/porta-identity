/**
 * Roles domain — CRUD and permission assignment for application roles.
 *
 * @module domains/roles
 */

import type { HttpTransport } from '../transport/types.js';
import type { Role, CreateRoleInput, UpdateRoleInput, RoleWithPermissions, ListParams, PaginatedResponse } from '../types/index.js';
import { listAll } from '../pagination/index.js';
import { unwrapData, toQueryParams } from './helpers.js';

export interface RolesDomain {
  list(appId: string, params?: ListParams): Promise<PaginatedResponse<Role>>;
  listAll(appId: string, params?: Omit<ListParams, 'page' | 'cursor'>): Promise<Role[]>;
  get(appId: string, roleId: string): Promise<RoleWithPermissions>;
  create(appId: string, input: CreateRoleInput): Promise<Role>;
  update(appId: string, roleId: string, input: UpdateRoleInput): Promise<Role>;
  archive(appId: string, roleId: string): Promise<void>;
  assignPermission(appId: string, roleId: string, permissionId: string): Promise<void>;
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
      return unwrapData<RoleWithPermissions>(res.body);
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
    async assignPermission(appId, roleId, permissionId) {
      await transport.request({ method: 'POST', path: `${base(appId)}/${roleId}/permissions`, body: { permissionId } });
    },
    async removePermission(appId, roleId, permissionId) {
      await transport.request({ method: 'DELETE', path: `${base(appId)}/${roleId}/permissions/${permissionId}` });
    },
  };
}
