/**
 * Custom Claims domain — claim definitions per application.
 *
 * @module domains/custom-claims
 */

import type { HttpTransport } from '../transport/types.js';
import type { ClaimDefinition, CreateClaimDefinitionInput, UpdateClaimDefinitionInput, ListParams, PaginatedResponse } from '../types/index.js';
import { listAll } from '../pagination/index.js';
import { unwrapData, toQueryParams } from './helpers.js';

export interface CustomClaimsDomain {
  list(appId: string, params?: ListParams): Promise<PaginatedResponse<ClaimDefinition>>;
  listAll(appId: string, params?: Omit<ListParams, 'page' | 'cursor'>): Promise<ClaimDefinition[]>;
  get(appId: string, claimId: string): Promise<ClaimDefinition>;
  create(appId: string, input: CreateClaimDefinitionInput): Promise<ClaimDefinition>;
  update(appId: string, claimId: string, input: UpdateClaimDefinitionInput): Promise<ClaimDefinition>;
  archive(appId: string, claimId: string): Promise<void>;
}

export function createCustomClaimsDomain(transport: HttpTransport): CustomClaimsDomain {
  function base(appId: string) { return `/applications/${appId}/claims`; }

  return {
    async list(appId, params?) {
      const res = await transport.request({ method: 'GET', path: base(appId), params: toQueryParams(params) });
      return res.body as PaginatedResponse<ClaimDefinition>;
    },
    listAll(appId, params?) {
      return listAll((p) => this.list(appId, { ...params, ...p }), params);
    },
    async get(appId, claimId) {
      const res = await transport.request({ method: 'GET', path: `${base(appId)}/${claimId}` });
      return unwrapData<ClaimDefinition>(res.body);
    },
    async create(appId, input) {
      const res = await transport.request({ method: 'POST', path: base(appId), body: input });
      return unwrapData<ClaimDefinition>(res.body);
    },
    async update(appId, claimId, input) {
      const res = await transport.request({ method: 'PUT', path: `${base(appId)}/${claimId}`, body: input });
      return unwrapData<ClaimDefinition>(res.body);
    },
    async archive(appId, claimId) {
      await transport.request({ method: 'POST', path: `${base(appId)}/${claimId}/archive` });
    },
  };
}
