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
import { unwrapData, unwrapWithEtag, etagHeaders, toQueryParams } from './helpers.js';

export interface ApplicationsDomain {
  list(params?: ListParams): Promise<PaginatedResponse<Application>>;
  listAll(params?: Omit<ListParams, 'page' | 'cursor'>): Promise<Application[]>;
  get(idOrSlug: string): Promise<ETagResponse<Application>>;
  create(input: CreateApplicationInput): Promise<Application>;
  update(idOrSlug: string, input: UpdateApplicationInput, etag?: string): Promise<Application>;
  archive(idOrSlug: string): Promise<void>;
  restore(idOrSlug: string): Promise<void>;
  getHistory(idOrSlug: string, params?: ListParams): Promise<HistoryEntry[]>;
  listModules(appId: string): Promise<ApplicationModule[]>;
  addModule(appId: string, input: CreateModuleInput): Promise<ApplicationModule>;
  updateModule(appId: string, moduleId: string, input: UpdateModuleInput): Promise<ApplicationModule>;
  removeModule(appId: string, moduleId: string): Promise<void>;
}

export function createApplicationsDomain(transport: HttpTransport): ApplicationsDomain {
  const base = '/applications';

  return {
    async list(params) {
      const res = await transport.request({ method: 'GET', path: base, params: toQueryParams(params) });
      return res.body as PaginatedResponse<Application>;
    },

    listAll(params) {
      return listAll((p) => this.list({ ...params, ...p }), params);
    },

    async get(idOrSlug) {
      const res = await transport.request({ method: 'GET', path: `${base}/${idOrSlug}` });
      return unwrapWithEtag<Application>(res);
    },

    async create(input) {
      const res = await transport.request({ method: 'POST', path: base, body: input });
      return unwrapData<Application>(res.body);
    },

    async update(idOrSlug, input, etag?) {
      const res = await transport.request({
        method: 'PUT', path: `${base}/${idOrSlug}`, body: input, headers: etagHeaders(etag),
      });
      return unwrapData<Application>(res.body);
    },

    async archive(idOrSlug) {
      await transport.request({ method: 'POST', path: `${base}/${idOrSlug}/archive` });
    },

    async restore(idOrSlug) {
      await transport.request({ method: 'POST', path: `${base}/${idOrSlug}/restore` });
    },

    async getHistory(idOrSlug, params?) {
      const res = await transport.request({ method: 'GET', path: `${base}/${idOrSlug}/history`, params: toQueryParams(params) });
      return unwrapData<HistoryEntry[]>(res.body);
    },

    async listModules(appId) {
      const res = await transport.request({ method: 'GET', path: `${base}/${appId}/modules` });
      return unwrapData<ApplicationModule[]>(res.body);
    },

    async addModule(appId, input) {
      const res = await transport.request({ method: 'POST', path: `${base}/${appId}/modules`, body: input });
      return unwrapData<ApplicationModule>(res.body);
    },

    async updateModule(appId, moduleId, input) {
      const res = await transport.request({ method: 'PUT', path: `${base}/${appId}/modules/${moduleId}`, body: input });
      return unwrapData<ApplicationModule>(res.body);
    },

    async removeModule(appId, moduleId) {
      await transport.request({ method: 'DELETE', path: `${base}/${appId}/modules/${moduleId}` });
    },
  };
}
