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
  HistoryParams,
  HistoryResult,
  PaginatedResponse,
  ETagResponse,
  SlugValidationResult,
} from '../types/index.js';
import { listAll } from '../pagination/index.js';
import { unwrapData, unwrapWithEtag, etagHeaders, toQueryParams } from './helpers.js';

export interface OrganizationsDomain {
  list(params?: ListParams): Promise<PaginatedResponse<Organization>>;
  listAll(params?: Omit<ListParams, 'page' | 'cursor'>): Promise<Organization[]>;
  get(idOrSlug: string): Promise<ETagResponse<Organization>>;
  create(input: CreateOrganizationInput): Promise<Organization>;
  update(
    idOrSlug: string,
    input: UpdateOrganizationInput,
    etag?: string,
  ): Promise<ETagResponse<Organization>>;
  suspend(idOrSlug: string): Promise<void>;
  activate(idOrSlug: string): Promise<void>;
  /** Permanently delete an organization and its owned data. */
  delete(idOrSlug: string): Promise<void>;
  /** Check whether a slug is available, mirroring the server's validation rules. */
  validateSlug(slug: string): Promise<SlugValidationResult>;
  /** Read one page of the organization's change history. */
  getHistory(idOrSlug: string, params?: HistoryParams): Promise<HistoryResult>;
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
      return unwrapWithEtag<Organization>(res);
    },

    async suspend(idOrSlug) {
      await transport.request({ method: 'POST', path: `${base}/${idOrSlug}/suspend` });
    },

    async activate(idOrSlug) {
      await transport.request({ method: 'POST', path: `${base}/${idOrSlug}/activate` });
    },

    async delete(idOrSlug) {
      await transport.request({ method: 'DELETE', path: `${base}/${idOrSlug}` });
    },

    async validateSlug(slug) {
      const res = await transport.request({ method: 'GET', path: `${base}/validate-slug`, params: { slug } });
      return res.body as SlugValidationResult;
    },

    async getHistory(idOrSlug, params?) {
      const query: Record<string, string | number> = {};
      if (params?.limit !== undefined) query.limit = params.limit;
      if (params?.after !== undefined) query.after = params.after;
      if (params?.eventType !== undefined) query.event_type = params.eventType;
      const res = await transport.request({
        method: 'GET',
        path: `${base}/${idOrSlug}/history`,
        params: Object.keys(query).length > 0 ? query : undefined,
      });
      return res.body as HistoryResult;
    },
  };
}
