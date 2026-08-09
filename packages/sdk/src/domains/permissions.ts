/**
 * Permissions domain — CRUD for application permissions.
 *
 * @module domains/permissions
 */

import type { HttpTransport } from '../transport/types.js';
import type { Permission, CreatePermissionInput, ListParams, PaginatedResponse } from '../types/index.js';
import { listAll } from '../pagination/index.js';
import { unwrapData, toQueryParams } from './helpers.js';

export interface PermissionsDomain {
  list(appId: string, params?: ListParams): Promise<PaginatedResponse<Permission>>;
  listAll(appId: string, params?: Omit<ListParams, 'page' | 'cursor'>): Promise<Permission[]>;
  get(appId: string, permissionId: string): Promise<Permission>;
  create(appId: string, input: CreatePermissionInput): Promise<Permission>;
  archive(appId: string, permissionId: string): Promise<void>;
}

export function createPermissionsDomain(transport: HttpTransport): PermissionsDomain {
  function base(appId: string) { return `/applications/${appId}/permissions`; }

  return {
    async list(appId, params?) {
      const res = await transport.request({ method: 'GET', path: base(appId), params: toQueryParams(params) });
      return res.body as PaginatedResponse<Permission>;
    },
    listAll(appId, params?) {
      return listAll((p) => this.list(appId, { ...params, ...p }), params);
    },
    async get(appId, permissionId) {
      const res = await transport.request({ method: 'GET', path: `${base(appId)}/${permissionId}` });
      return unwrapData<Permission>(res.body);
    },
    async create(appId, input) {
      const res = await transport.request({ method: 'POST', path: base(appId), body: input });
      return unwrapData<Permission>(res.body);
    },
    async archive(appId, permissionId) {
      await transport.request({ method: 'POST', path: `${base(appId)}/${permissionId}/archive` });
    },
  };
}
