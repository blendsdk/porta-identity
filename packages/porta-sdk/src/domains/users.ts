/**
 * Users domain — CRUD, status lifecycle, invite, password.
 *
 * @module domains/users
 */

import type { HttpTransport } from '../transport/types.js';
import type {
  User,
  CreateUserInput,
  UpdateUserInput,
  InviteUserInput,
  SetPasswordInput,
  UserListParams,
  PaginatedResponse,
  ETagResponse,
  HistoryEntry,
  ListParams,
} from '../types/index.js';
import { listAll } from '../pagination/index.js';
import { unwrapData, unwrapWithEtag, etagHeaders, toQueryParams } from './helpers.js';

export interface UsersDomain {
  list(orgId: string, params?: UserListParams): Promise<PaginatedResponse<User>>;
  listAll(orgId: string, params?: Omit<UserListParams, 'page' | 'cursor'>): Promise<User[]>;
  get(orgId: string, userId: string): Promise<ETagResponse<User>>;
  create(input: CreateUserInput): Promise<User>;
  update(orgId: string, userId: string, input: UpdateUserInput, etag?: string): Promise<User>;
  invite(input: InviteUserInput): Promise<User>;
  setPassword(orgId: string, userId: string, input: SetPasswordInput): Promise<void>;
  suspend(orgId: string, userId: string): Promise<void>;
  activate(orgId: string, userId: string): Promise<void>;
  lock(orgId: string, userId: string): Promise<void>;
  unlock(orgId: string, userId: string): Promise<void>;
  deactivate(orgId: string, userId: string): Promise<void>;
  reactivate(orgId: string, userId: string): Promise<void>;
  getHistory(orgId: string, userId: string, params?: ListParams): Promise<HistoryEntry[]>;
}

export function createUsersDomain(transport: HttpTransport): UsersDomain {
  function userBase(orgId: string) {
    return `/organizations/${orgId}/users`;
  }

  return {
    async list(orgId, params?) {
      const res = await transport.request({ method: 'GET', path: userBase(orgId), params: toQueryParams(params) });
      return res.body as PaginatedResponse<User>;
    },

    listAll(orgId, params?) {
      return listAll((p) => this.list(orgId, { ...params, ...p }), params);
    },

    async get(orgId, userId) {
      const res = await transport.request({ method: 'GET', path: `${userBase(orgId)}/${userId}` });
      return unwrapWithEtag<User>(res);
    },

    async create(input) {
      const res = await transport.request({ method: 'POST', path: userBase(input.organizationId), body: input });
      return unwrapData<User>(res.body);
    },

    async update(orgId, userId, input, etag?) {
      const res = await transport.request({
        method: 'PUT', path: `${userBase(orgId)}/${userId}`, body: input, headers: etagHeaders(etag),
      });
      return unwrapData<User>(res.body);
    },

    async invite(input) {
      const res = await transport.request({ method: 'POST', path: `${userBase(input.organizationId)}/invite`, body: input });
      return unwrapData<User>(res.body);
    },

    async setPassword(orgId, userId, input) {
      await transport.request({ method: 'POST', path: `${userBase(orgId)}/${userId}/password`, body: input });
    },

    async suspend(orgId, userId) {
      await transport.request({ method: 'POST', path: `${userBase(orgId)}/${userId}/suspend` });
    },

    async activate(orgId, userId) {
      await transport.request({ method: 'POST', path: `${userBase(orgId)}/${userId}/activate` });
    },

    async lock(orgId, userId) {
      await transport.request({ method: 'POST', path: `${userBase(orgId)}/${userId}/lock` });
    },

    async unlock(orgId, userId) {
      await transport.request({ method: 'POST', path: `${userBase(orgId)}/${userId}/unlock` });
    },

    async deactivate(orgId, userId) {
      await transport.request({ method: 'POST', path: `${userBase(orgId)}/${userId}/deactivate` });
    },

    async reactivate(orgId, userId) {
      await transport.request({ method: 'POST', path: `${userBase(orgId)}/${userId}/reactivate` });
    },

    async getHistory(orgId, userId, params?) {
      const res = await transport.request({
        method: 'GET', path: `${userBase(orgId)}/${userId}/history`, params: toQueryParams(params),
      });
      return unwrapData<HistoryEntry[]>(res.body);
    },
  };
}
