/**
 * Permissions domain — CRUD for application permissions.
 *
 * @module domains/permissions
 */

import type { HttpTransport } from '../transport/types.js';
import type { Permission, CreatePermissionInput, UpdatePermissionInput } from '../types/index.js';
import { isRecord, requireData } from './helpers.js';

/** Optional filters supported by the complete permission collection. */
interface PermissionListParams {
  /** Return only permissions owned by this application module. */
  moduleId?: string;
}

/** Result returned after an operation can reduce a user's current authority. */
interface AuthorityReductionResult {
  /** Whether the current caller must authenticate again after the committed operation. */
  reauthenticationRequired: boolean;
}

/** Validate one permission returned by the Admin API. */
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

/** Permission operations scoped by their parent application. */
export interface PermissionsDomain {
  /** List the complete permission collection, optionally filtered by module. */
  list(appId: string, params?: PermissionListParams): Promise<Permission[]>;
  /** Get one permission through its parent-qualified route. */
  get(appId: string, permissionId: string): Promise<Permission>;
  /** Create a permission under the application identified by the route. */
  create(appId: string, input: CreatePermissionInput): Promise<Permission>;
  /** Update mutable permission metadata. */
  update(appId: string, permissionId: string, input: UpdatePermissionInput): Promise<Permission>;
  /** Permanently delete a permission through its parent-qualified route. */
  delete(appId: string, permissionId: string): Promise<AuthorityReductionResult>;
}

/** Create permission operations backed by one HTTP transport. */
export function createPermissionsDomain(transport: HttpTransport): PermissionsDomain {
  /** Build the parent-qualified permission collection path. */
  function base(appId: string): string {
    return `/applications/${appId}/permissions`;
  }

  return {
    async list(appId, params?) {
      const res = await transport.request({
        method: 'GET',
        path: base(appId),
        params: params?.moduleId === undefined ? undefined : { moduleId: params.moduleId },
      });
      return requireData(
        res.body,
        (value): value is Permission[] => Array.isArray(value) && value.every(isPermission),
      );
    },
    async get(appId, permissionId) {
      const res = await transport.request({
        method: 'GET',
        path: `${base(appId)}/${permissionId}`,
      });
      return requireData(res.body, isPermission);
    },
    async create(appId, input) {
      const res = await transport.request({ method: 'POST', path: base(appId), body: input });
      return requireData(res.body, isPermission);
    },
    async update(appId, permissionId, input) {
      const res = await transport.request({
        method: 'PUT',
        path: `${base(appId)}/${permissionId}`,
        body: input,
      });
      return requireData(res.body, isPermission);
    },
    async delete(appId, permissionId) {
      const res = await transport.request({
        method: 'DELETE',
        path: `${base(appId)}/${permissionId}`,
      });
      return requireData(res.body, isAuthorityReductionResult);
    },
  };
}
