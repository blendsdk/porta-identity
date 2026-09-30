/**
 * Custom Claims domain — claim definitions and user claim values per application.
 *
 * @module domains/custom-claims
 */

import type { HttpTransport } from '../transport/types.js';
import type {
  CustomClaimDefinition,
  CreateCustomClaimInput,
  UpdateCustomClaimInput,
  ListParams,
  PaginatedResponse,
  UserClaimValue,
  UserClaimWithDefinition,
} from '../types/index.js';
import { listAll } from '../pagination/index.js';
import { unwrapData, toQueryParams } from './helpers.js';

export interface CustomClaimsDomain {
  list(appId: string, params?: ListParams): Promise<PaginatedResponse<CustomClaimDefinition>>;
  listAll(
    appId: string,
    params?: Omit<ListParams, 'page' | 'cursor'>,
  ): Promise<CustomClaimDefinition[]>;
  get(appId: string, claimId: string): Promise<CustomClaimDefinition>;
  create(appId: string, input: CreateCustomClaimInput): Promise<CustomClaimDefinition>;
  update(
    appId: string,
    claimId: string,
    input: UpdateCustomClaimInput,
  ): Promise<CustomClaimDefinition>;
  /** Permanently delete a claim definition through its parent-qualified route. */
  delete(appId: string, claimId: string): Promise<void>;
  /**
   * List every claim value stored for a user.
   *
   * The server addresses the values through the application path but does not
   * filter them by `appId`: the result can contain values whose definition
   * belongs to another application.
   */
  getValuesForUser(appId: string, userId: string): Promise<UserClaimWithDefinition[]>;
  /** Read one stored claim value for a user. */
  getValue(appId: string, claimId: string, userId: string): Promise<UserClaimValue>;
  /** Create or replace one claim value for a user. */
  setValue(
    appId: string,
    claimId: string,
    userId: string,
    value: unknown,
  ): Promise<UserClaimValue>;
  /** Delete one stored claim value for a user. */
  deleteValue(appId: string, claimId: string, userId: string): Promise<void>;
}

export function createCustomClaimsDomain(transport: HttpTransport): CustomClaimsDomain {
  function base(appId: string) {
    return `/applications/${appId}/claims`;
  }

  return {
    async list(appId, params?) {
      const res = await transport.request({ method: 'GET', path: base(appId), params: toQueryParams(params) });
      return res.body as PaginatedResponse<CustomClaimDefinition>;
    },
    listAll(appId, params?) {
      return listAll((p) => this.list(appId, { ...params, ...p }), params);
    },
    async get(appId, claimId) {
      const res = await transport.request({ method: 'GET', path: `${base(appId)}/${claimId}` });
      return unwrapData<CustomClaimDefinition>(res.body);
    },
    async create(appId, input) {
      const res = await transport.request({ method: 'POST', path: base(appId), body: input });
      return unwrapData<CustomClaimDefinition>(res.body);
    },
    async update(appId, claimId, input) {
      const res = await transport.request({ method: 'PUT', path: `${base(appId)}/${claimId}`, body: input });
      return unwrapData<CustomClaimDefinition>(res.body);
    },
    async delete(appId, claimId) {
      await transport.request({ method: 'DELETE', path: `${base(appId)}/${claimId}` });
    },
    async getValuesForUser(appId, userId) {
      const res = await transport.request({ method: 'GET', path: `${base(appId)}/users/${userId}` });
      return unwrapData<UserClaimWithDefinition[]>(res.body);
    },
    async getValue(appId, claimId, userId) {
      const res = await transport.request({
        method: 'GET',
        path: `${base(appId)}/${claimId}/users/${userId}`,
      });
      return unwrapData<UserClaimValue>(res.body);
    },
    async setValue(appId, claimId, userId, value) {
      const res = await transport.request({
        method: 'PUT',
        path: `${base(appId)}/${claimId}/users/${userId}`,
        body: { value },
      });
      return unwrapData<UserClaimValue>(res.body);
    },
    async deleteValue(appId, claimId, userId) {
      await transport.request({ method: 'DELETE', path: `${base(appId)}/${claimId}/users/${userId}` });
    },
  };
}
