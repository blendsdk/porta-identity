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
import {
  etagHeaders,
  isRecord,
  isStringArray,
  requireData,
  requireDataWithEtag,
  requirePaginatedData,
  toQueryParams,
} from './helpers.js';

/** Return whether a value is one supported login-method collection. */
function isLoginMethods(value: unknown): value is Array<'password' | 'magic_link'> {
  return (
    isStringArray(value) &&
    value.every((method) => method === 'password' || method === 'magic_link')
  );
}

/** Validate one complete client returned by the Admin API. */
function isClient(value: unknown): value is Client {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.organizationId === 'string' &&
    typeof value.applicationId === 'string' &&
    typeof value.clientId === 'string' &&
    typeof value.clientName === 'string' &&
    (value.clientType === 'public' || value.clientType === 'confidential') &&
    (value.applicationType === 'web' ||
      value.applicationType === 'native' ||
      value.applicationType === 'spa') &&
    isStringArray(value.redirectUris) &&
    isStringArray(value.postLogoutRedirectUris) &&
    isStringArray(value.grantTypes) &&
    value.grantTypes.every(
      (grant) =>
        grant === 'authorization_code' ||
        grant === 'client_credentials' ||
        grant === 'refresh_token',
    ) &&
    isStringArray(value.responseTypes) &&
    value.responseTypes.every((responseType) => responseType === 'code') &&
    typeof value.scope === 'string' &&
    (value.tokenEndpointAuthMethod === 'client_secret_basic' ||
      value.tokenEndpointAuthMethod === 'client_secret_post' ||
      value.tokenEndpointAuthMethod === 'none') &&
    isStringArray(value.allowedOrigins) &&
    typeof value.requirePkce === 'boolean' &&
    (value.loginMethods === null || isLoginMethods(value.loginMethods)) &&
    isLoginMethods(value.effectiveLoginMethods) &&
    (value.status === 'active' || value.status === 'inactive' || value.status === 'revoked') &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

/** Validate secret metadata that never contains plaintext. */
function isClientSecret(value: unknown): value is ClientSecret {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.clientId === 'string' &&
    (typeof value.label === 'string' || value.label === null) &&
    (value.status === 'active' || value.status === 'revoked') &&
    (typeof value.lastUsedAt === 'string' || value.lastUsedAt === null) &&
    (typeof value.expiresAt === 'string' || value.expiresAt === null) &&
    typeof value.createdAt === 'string'
  );
}

/** Validate a secret returned once by create or generate. */
function isGeneratedSecret(value: unknown): value is GeneratedSecret {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.clientId === 'string' &&
    (typeof value.label === 'string' || value.label === null) &&
    typeof value.plaintext === 'string' &&
    (typeof value.expiresAt === 'string' || value.expiresAt === null) &&
    typeof value.createdAt === 'string'
  );
}

/** Validate one client history entry. */
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

interface ClientCreateResult {
  /** Validated client projection. */
  client: Client;
  /** One-time secret, present only for a confidential client. */
  secret?: GeneratedSecret;
}

/** Validate the relationship between client type and its optional one-time secret. */
function isClientCreateResult(value: unknown): value is ClientCreateResult {
  if (!isRecord(value) || !isClient(value.client)) return false;
  if (value.client.clientType === 'confidential') return isGeneratedSecret(value.secret);
  return value.secret === undefined || value.secret === null;
}

export interface ClientsDomain {
  /** List one page of organization clients. */
  list(params?: ListParams): Promise<PaginatedResponse<Client>>;
  /** Load every client page or reject without returning a partial collection. */
  listAll(params?: Omit<ListParams, 'page' | 'cursor'>): Promise<Client[]>;
  /** Get one client by its internal UUID. */
  get(id: string): Promise<ETagResponse<Client>>;
  /** Create a client and return its optional one-time initial secret. */
  create(input: CreateClientInput): Promise<{ client: Client; secret?: GeneratedSecret }>;
  /** Update mutable client configuration. */
  update(id: string, input: UpdateClientInput, etag?: string): Promise<Client>;
  /** Activate an inactive client. */
  activate(id: string): Promise<void>;
  /** Deactivate an active client. */
  deactivate(id: string): Promise<void>;
  /** Permanently revoke a client. */
  revoke(id: string): Promise<void>;
  /** Read client audit history. */
  getHistory(id: string, params?: ListParams): Promise<HistoryEntry[]>;
  /** List secret metadata for one confidential client. */
  listSecrets(clientId: string): Promise<ClientSecret[]>;
  /** Generate a one-time plaintext secret for one confidential client. */
  generateSecret(clientId: string, input?: GenerateSecretInput): Promise<GeneratedSecret>;
  /** Permanently revoke one secret through its parent-qualified route. */
  revokeSecret(clientId: string, secretId: string): Promise<void>;
}

/** Create the client operations backed by one HTTP transport. */
export function createClientsDomain(transport: HttpTransport): ClientsDomain {
  const base = '/clients';

  return {
    async list(params) {
      const res = await transport.request({
        method: 'GET',
        path: base,
        params: toQueryParams(params),
      });
      return requirePaginatedData(res.body, isClient);
    },

    listAll(params) {
      return listAll((p) => this.list({ ...params, ...p }), params);
    },

    async get(id) {
      const res = await transport.request({ method: 'GET', path: `${base}/${id}` });
      return requireDataWithEtag(res, isClient);
    },

    async create(input) {
      const res = await transport.request({ method: 'POST', path: base, body: input });
      const result = requireData(res.body, isClientCreateResult);
      return result.secret
        ? { client: result.client, secret: result.secret }
        : { client: result.client };
    },

    async update(id, input, etag?) {
      const res = await transport.request({
        method: 'PUT',
        path: `${base}/${id}`,
        body: input,
        headers: etagHeaders(etag),
      });
      return requireData(res.body, isClient);
    },

    async revoke(id) {
      await transport.request({ method: 'POST', path: `${base}/${id}/revoke` });
    },

    async activate(id) {
      await transport.request({ method: 'POST', path: `${base}/${id}/activate` });
    },

    async deactivate(id) {
      await transport.request({ method: 'POST', path: `${base}/${id}/deactivate` });
    },

    async getHistory(id, params?) {
      const res = await transport.request({
        method: 'GET',
        path: `${base}/${id}/history`,
        params: toQueryParams(params),
      });
      return requireData(
        res.body,
        (value): value is HistoryEntry[] => Array.isArray(value) && value.every(isHistoryEntry),
      );
    },

    async listSecrets(clientId) {
      const res = await transport.request({ method: 'GET', path: `${base}/${clientId}/secrets` });
      return requireData(
        res.body,
        (value): value is ClientSecret[] => Array.isArray(value) && value.every(isClientSecret),
      );
    },

    async generateSecret(clientId, input?) {
      const res = await transport.request({
        method: 'POST',
        path: `${base}/${clientId}/secrets`,
        body: input,
      });
      return requireData(res.body, isGeneratedSecret);
    },

    async revokeSecret(clientId, secretId) {
      await transport.request({
        method: 'POST',
        path: `${base}/${clientId}/secrets/${secretId}/revoke`,
      });
    },
  };
}
