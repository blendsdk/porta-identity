/**
 * Organizations domain — CRUD, status lifecycle, branding, slug validation.
 *
 * @module domains/organizations
 */

import type { HttpTransport } from '../transport/types.js';
import type {
  Organization,
  CreateOrganizationInput,
  UpdateOrganizationInput,
  ListParams,
  PaginatedResponse,
  ETagResponse,
  HistoryEntry,
} from '../types/index.js';
import { listAll } from '../pagination/index.js';
import { unwrapData, unwrapWithEtag, etagHeaders, toQueryParams } from './helpers.js';

export interface SlugValidation {
  available: boolean;
  slug: string;
}

export interface DestroyResult {
  deleted: boolean;
  counts?: Record<string, number>;
}

export interface OrganizationsDomain {
  list(params?: ListParams): Promise<PaginatedResponse<Organization>>;
  listAll(params?: Omit<ListParams, 'page' | 'cursor'>): Promise<Organization[]>;
  get(idOrSlug: string): Promise<ETagResponse<Organization>>;
  create(input: CreateOrganizationInput): Promise<Organization>;
  update(idOrSlug: string, input: UpdateOrganizationInput, etag?: string): Promise<Organization>;
  suspend(idOrSlug: string): Promise<void>;
  activate(idOrSlug: string): Promise<void>;
  archive(idOrSlug: string): Promise<void>;
  restore(idOrSlug: string): Promise<void>;
  destroy(idOrSlug: string, params?: { dryRun?: boolean }): Promise<DestroyResult>;
  validateSlug(slug: string): Promise<SlugValidation>;
  getHistory(idOrSlug: string, params?: ListParams): Promise<HistoryEntry[]>;
}

export function createOrganizationsDomain(transport: HttpTransport): OrganizationsDomain {
  const base = '/organizations';

  return {
    async list(params) {
      const res = await transport.request({ method: 'GET', path: base, params: toQueryParams(params) });
      return res.body as PaginatedResponse<Organization>;
    },

    listAll(params) {
      return listAll((p) => this.list({ ...params, ...p }), params);
    },

    async get(idOrSlug) {
      const res = await transport.request({ method: 'GET', path: `${base}/${idOrSlug}` });
      return unwrapWithEtag<Organization>(res);
    },

    async create(input) {
      const res = await transport.request({ method: 'POST', path: base, body: input });
      return unwrapData<Organization>(res.body);
    },

    async update(idOrSlug, input, etag?) {
      const res = await transport.request({
        method: 'PUT',
        path: `${base}/${idOrSlug}`,
        body: input,
        headers: etagHeaders(etag),
      });
      return unwrapData<Organization>(res.body);
    },

    async suspend(idOrSlug) {
      await transport.request({ method: 'POST', path: `${base}/${idOrSlug}/suspend` });
    },

    async activate(idOrSlug) {
      await transport.request({ method: 'POST', path: `${base}/${idOrSlug}/activate` });
    },

    async archive(idOrSlug) {
      await transport.request({ method: 'POST', path: `${base}/${idOrSlug}/archive` });
    },

    async restore(idOrSlug) {
      await transport.request({ method: 'POST', path: `${base}/${idOrSlug}/restore` });
    },

    async destroy(idOrSlug, params?) {
      const res = await transport.request({
        method: 'DELETE',
        path: `${base}/${idOrSlug}`,
        params: params?.dryRun ? { dryRun: true } : undefined,
      });
      return res.body as DestroyResult;
    },

    async validateSlug(slug) {
      const res = await transport.request({ method: 'GET', path: `${base}/validate-slug`, params: { slug } });
      return res.body as SlugValidation;
    },

    async getHistory(idOrSlug, params?) {
      const res = await transport.request({
        method: 'GET',
        path: `${base}/${idOrSlug}/history`,
        params: toQueryParams(params),
      });
      return unwrapData<HistoryEntry[]>(res.body);
    },
  };
}
