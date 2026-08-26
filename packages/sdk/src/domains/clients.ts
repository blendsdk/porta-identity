/**
 * Clients domain — CRUD, status, secret management.
 *
 * @module domains/clients
 */

import type { HttpTransport } from '../transport/types.js';
import type {
  Client,
  CreateClientInput,
  UpdateClientInput,
  ClientSecret,
  GenerateSecretInput,
  GeneratedSecret,
  ListParams,
  PaginatedResponse,
  ETagResponse,
  HistoryEntry,
} from '../types/index.js';
import { listAll } from '../pagination/index.js';
import { unwrapData, unwrapWithEtag, etagHeaders, toQueryParams } from './helpers.js';

export interface ClientsDomain {
  list(params?: ListParams): Promise<PaginatedResponse<Client>>;
  listAll(params?: Omit<ListParams, 'page' | 'cursor'>): Promise<Client[]>;
  get(idOrClientId: string): Promise<ETagResponse<Client>>;
  create(input: CreateClientInput): Promise<Client>;
  update(idOrClientId: string, input: UpdateClientInput, etag?: string): Promise<Client>;
  revoke(idOrClientId: string): Promise<void>;
  restore(idOrClientId: string): Promise<void>;
  getHistory(idOrClientId: string, params?: ListParams): Promise<HistoryEntry[]>;
  listSecrets(clientId: string): Promise<ClientSecret[]>;
  generateSecret(clientId: string, input?: GenerateSecretInput): Promise<GeneratedSecret>;
  revokeSecret(clientId: string, secretId: string): Promise<void>;
}

export function createClientsDomain(transport: HttpTransport): ClientsDomain {
  const base = '/clients';

  return {
    async list(params) {
      const res = await transport.request({ method: 'GET', path: base, params: toQueryParams(params) });
      return res.body as PaginatedResponse<Client>;
    },

    listAll(params) {
      return listAll((p) => this.list({ ...params, ...p }), params);
    },

    async get(idOrClientId) {
      const res = await transport.request({ method: 'GET', path: `${base}/${idOrClientId}` });
      return unwrapWithEtag<Client>(res);
    },

    async create(input) {
      const res = await transport.request({ method: 'POST', path: base, body: input });
      return unwrapData<Client>(res.body);
    },

    async update(idOrClientId, input, etag?) {
      const res = await transport.request({
        method: 'PUT', path: `${base}/${idOrClientId}`, body: input, headers: etagHeaders(etag),
      });
      return unwrapData<Client>(res.body);
    },

    async revoke(idOrClientId) {
      await transport.request({ method: 'POST', path: `${base}/${idOrClientId}/revoke` });
    },

    async restore(idOrClientId) {
      await transport.request({ method: 'POST', path: `${base}/${idOrClientId}/restore` });
    },

    async getHistory(idOrClientId, params?) {
      const res = await transport.request({ method: 'GET', path: `${base}/${idOrClientId}/history`, params: toQueryParams(params) });
      return unwrapData<HistoryEntry[]>(res.body);
    },

    async listSecrets(clientId) {
      const res = await transport.request({ method: 'GET', path: `${base}/${clientId}/secrets` });
      return unwrapData<ClientSecret[]>(res.body);
    },

    async generateSecret(clientId, input?) {
      const res = await transport.request({ method: 'POST', path: `${base}/${clientId}/secrets`, body: input });
      return unwrapData<GeneratedSecret>(res.body);
    },

    async revokeSecret(clientId, secretId) {
      await transport.request({ method: 'DELETE', path: `${base}/${clientId}/secrets/${secretId}` });
    },
  };
}
