/**
 * Applications domain — CRUD, status, modules.
 *
 * @module domains/applications
 */

import type { HttpTransport } from '../transport/types.js';
import type {
  Application,
  CreateApplicationInput,
  UpdateApplicationInput,
  ApplicationModule,
  CreateModuleInput,
  UpdateModuleInput,
  ListParams,
  PaginatedResponse,
  ETagResponse,
  HistoryEntry,
} from '../types/index.js';
import { listAll } from '../pagination/index.js';
import {
  etagHeaders,
  isRecord,
  requireData,
  requireDataWithEtag,
  requirePaginatedData,
  toQueryParams,
} from './helpers.js';

/** Validate one application returned by the Admin API. */
function isApplication(value: unknown): value is Application {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.slug === 'string' &&
    (typeof value.description === 'string' || value.description === null) &&
    (value.status === 'active' || value.status === 'inactive' || value.status === 'archived') &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

/** Validate one application module returned by the Admin API. */
function isApplicationModule(value: unknown): value is ApplicationModule {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.applicationId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.slug === 'string' &&
    (typeof value.description === 'string' || value.description === null) &&
    (value.status === 'active' || value.status === 'inactive') &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

/** Validate one application history entry. */
function isHistoryEntry(value: unknown): value is HistoryEntry {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.eventType === 'string' &&
    (typeof value.actorId === 'string' || value.actorId === null) &&
    (isRecord(value.metadata) || value.metadata === null) &&
    typeof value.createdAt === 'string'
  );
}

export interface ApplicationsDomain {
  /** List one page of global applications. */
  list(params?: ListParams): Promise<PaginatedResponse<Application>>;
  /** Load every global application page or reject without returning a partial collection. */
  listAll(params?: Omit<ListParams, 'page' | 'cursor'>): Promise<Application[]>;
  /** Get one application by internal UUID or slug. */
  get(idOrSlug: string): Promise<ETagResponse<Application>>;
  /** Create a global application definition. */
  create(input: CreateApplicationInput): Promise<Application>;
  /** Update mutable application fields. */
  update(idOrSlug: string, input: UpdateApplicationInput, etag?: string): Promise<Application>;
  /** Activate an inactive application. */
  activate(id: string): Promise<void>;
  /** Deactivate an active application. */
  deactivate(id: string): Promise<void>;
  /** Permanently archive an application. */
  archive(idOrSlug: string): Promise<void>;
  /** Read application audit history. */
  getHistory(idOrSlug: string, params?: ListParams): Promise<HistoryEntry[]>;
  /** List modules owned by an application. */
  listModules(appId: string): Promise<ApplicationModule[]>;
  /** Add a module under an application. */
  addModule(appId: string, input: CreateModuleInput): Promise<ApplicationModule>;
  /** Update a module through its parent-qualified route. */
  updateModule(
    appId: string,
    moduleId: string,
    input: UpdateModuleInput,
  ): Promise<ApplicationModule>;
  /** Deactivate a module through its parent-qualified route. */
  deactivateModule(appId: string, moduleId: string): Promise<void>;
}

/** Create the application operations backed by one HTTP transport. */
export function createApplicationsDomain(transport: HttpTransport): ApplicationsDomain {
  const base = '/applications';

  return {
    async list(params) {
      const res = await transport.request({
        method: 'GET',
        path: base,
        params: toQueryParams(params),
      });
      return requirePaginatedData(res.body, isApplication);
    },

    listAll(params) {
      return listAll((p) => this.list({ ...params, ...p }), params);
    },

    async get(idOrSlug) {
      const res = await transport.request({ method: 'GET', path: `${base}/${idOrSlug}` });
      return requireDataWithEtag(res, isApplication);
    },

    async create(input) {
      const res = await transport.request({ method: 'POST', path: base, body: input });
      return requireData(res.body, isApplication);
    },

    async update(idOrSlug, input, etag?) {
      const res = await transport.request({
        method: 'PUT',
        path: `${base}/${idOrSlug}`,
        body: input,
        headers: etagHeaders(etag),
      });
      return requireData(res.body, isApplication);
    },

    async archive(idOrSlug) {
      await transport.request({ method: 'POST', path: `${base}/${idOrSlug}/archive` });
    },

    async activate(id) {
      await transport.request({ method: 'POST', path: `${base}/${id}/activate` });
    },

    async deactivate(id) {
      await transport.request({ method: 'POST', path: `${base}/${id}/deactivate` });
    },

    async getHistory(idOrSlug, params?) {
      const res = await transport.request({
        method: 'GET',
        path: `${base}/${idOrSlug}/history`,
        params: toQueryParams(params),
      });
      return requireData(
        res.body,
        (value): value is HistoryEntry[] => Array.isArray(value) && value.every(isHistoryEntry),
      );
    },

    async listModules(appId) {
      const res = await transport.request({ method: 'GET', path: `${base}/${appId}/modules` });
      return requireData(
        res.body,
        (value): value is ApplicationModule[] =>
          Array.isArray(value) && value.every(isApplicationModule),
      );
    },

    async addModule(appId, input) {
      const res = await transport.request({
        method: 'POST',
        path: `${base}/${appId}/modules`,
        body: input,
      });
      return requireData(res.body, isApplicationModule);
    },

    async updateModule(appId, moduleId, input) {
      const res = await transport.request({
        method: 'PUT',
        path: `${base}/${appId}/modules/${moduleId}`,
        body: input,
      });
      return requireData(res.body, isApplicationModule);
    },

    async deactivateModule(appId, moduleId) {
      await transport.request({
        method: 'POST',
        path: `${base}/${appId}/modules/${moduleId}/deactivate`,
      });
    },
  };
}
