/**
 * Users domain — CRUD, status lifecycle, invite, password.
 *
 * @module domains/users
 */

import { listAll } from '../pagination/index.js';
import type { HttpTransport } from '../transport/types.js';
import type {
  CreateUserInput,
  ETagResponse,
  HistoryResult,
  InviteUserInput,
  InviteUserResult,
  PaginatedResponse,
  SetPasswordInput,
  UpdateUserInput,
  User,
  UserListParams,
} from '../types/index.js';
import { etagHeaders, unwrapData, unwrapWithEtag } from './helpers.js';

/**
 * Convert the closed user-list input into the query names accepted by the
 * selected pagination strategy.
 */
function userListQuery(
  params?: UserListParams,
): Record<string, string | number | boolean> | undefined {
  if (!params) return undefined;

  const common = {
    ...(params.search !== undefined ? { search: params.search } : {}),
    ...(params.status !== undefined ? { status: params.status } : {}),
    ...(params.sortBy !== undefined ? { sortBy: params.sortBy } : {}),
    ...(params.sortOrder !== undefined ? { sortOrder: params.sortOrder } : {}),
  };

  if (params.cursor !== undefined) {
    return {
      cursor: params.cursor,
      ...(params.pageSize !== undefined ? { limit: params.pageSize } : {}),
      ...common,
    };
  }

  const query = {
    ...(params.page !== undefined ? { page: params.page } : {}),
    ...(params.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
    ...common,
  };
  return Object.keys(query).length > 0 ? query : undefined;
}

/** Organization-scoped user administration operations. */
export interface UsersDomain {
  /** List users with offset or cursor pagination. */
  list(orgId: string, params?: UserListParams): Promise<PaginatedResponse<User>>;
  /** Fetch every matching user across all available pages. */
  listAll(orgId: string, params?: Omit<UserListParams, 'page' | 'cursor'>): Promise<User[]>;
  /** Fetch one user and its current ETag. */
  get(orgId: string, userId: string): Promise<ETagResponse<User>>;
  /** Create a user in the organization named by the input. */
  create(input: CreateUserInput): Promise<User>;
  /** Update mutable profile fields, optionally using optimistic concurrency. */
  update(orgId: string, userId: string, input: UpdateUserInput, etag?: string): Promise<User>;
  /** Invite a user and return the invitation outcome. */
  invite(input: InviteUserInput): Promise<InviteUserResult>;
  /** Preview the invitation email without sending — POST .../invite/preview */
  invitePreview(input: InviteUserInput): Promise<InvitePreviewResult>;
  setPassword(orgId: string, userId: string, input: SetPasswordInput): Promise<void>;
  /** Clear a user's password (make passwordless) — DELETE .../:userId/password */
  clearPassword(orgId: string, userId: string): Promise<void>;
  /** Mark a user's email as verified — POST .../:userId/verify-email */
  verifyEmail(orgId: string, userId: string): Promise<void>;
  /** GDPR data export (Article 20) — GET .../:userId/export */
  exportData(orgId: string, userId: string): Promise<UserExportData>;
  /** Permanently delete a user and their owned identity data. */
  delete(orgId: string, userId: string): Promise<void>;
  /** Deactivate an active user. */
  deactivate(orgId: string, userId: string): Promise<void>;
  /** Activate an inactive user. */
  activate(orgId: string, userId: string): Promise<void>;
  /** Fetch the first page of user history. */
  getHistory(orgId: string, userId: string): Promise<HistoryResult>;
}

/** Rendered invitation email returned by `invitePreview()`. */
export interface InvitePreviewResult {
  html: string;
  text: string;
  subject: string;
}

/** GDPR export payload returned by `exportData()` (shape determined by the server). */
export type UserExportData = Record<string, unknown>;

/**
 * Create organization-scoped user operations over an authenticated transport.
 *
 * @param transport - HTTP transport used for every request.
 * @returns User operations bound to the supplied transport.
 */
export function createUsersDomain(transport: HttpTransport): UsersDomain {
  function userBase(orgId: string) {
    return `/organizations/${orgId}/users`;
  }

  return {
    async list(orgId, params?) {
      const res = await transport.request({
        method: 'GET',
        path: userBase(orgId),
        params: userListQuery(params),
      });
      return res.body as PaginatedResponse<User>;
    },

    listAll(orgId, params?) {
      return listAll(
        (page) =>
          this.list(orgId, {
            ...params,
            ...(page.page !== undefined ? { page: page.page } : {}),
            ...(page.cursor !== undefined ? { cursor: page.cursor } : {}),
            ...(page.limit !== undefined ? { pageSize: page.limit } : {}),
          }),
        params,
      );
    },

    async get(orgId, userId) {
      const res = await transport.request({ method: 'GET', path: `${userBase(orgId)}/${userId}` });
      return unwrapWithEtag<User>(res);
    },

    async create(input) {
      const res = await transport.request({
        method: 'POST',
        path: userBase(input.organizationId),
        body: input,
      });
      return unwrapData<User>(res.body);
    },

    async update(orgId, userId, input, etag?) {
      const res = await transport.request({
        method: 'PUT',
        path: `${userBase(orgId)}/${userId}`,
        body: input,
        headers: etagHeaders(etag),
      });
      return unwrapData<User>(res.body);
    },

    async invite(input) {
      const res = await transport.request({
        method: 'POST',
        path: `${userBase(input.organizationId)}/invite`,
        body: input,
      });
      return unwrapData<InviteUserResult>(res.body);
    },

    async invitePreview(input) {
      const res = await transport.request({
        method: 'POST',
        path: `${userBase(input.organizationId)}/invite/preview`,
        body: input,
      });
      return unwrapData<InvitePreviewResult>(res.body);
    },

    async setPassword(orgId, userId, input) {
      await transport.request({
        method: 'POST',
        path: `${userBase(orgId)}/${userId}/password`,
        body: input,
      });
    },

    async clearPassword(orgId, userId) {
      await transport.request({ method: 'DELETE', path: `${userBase(orgId)}/${userId}/password` });
    },

    async verifyEmail(orgId, userId) {
      await transport.request({
        method: 'POST',
        path: `${userBase(orgId)}/${userId}/verify-email`,
      });
    },

    async exportData(orgId, userId) {
      const res = await transport.request({
        method: 'GET',
        path: `${userBase(orgId)}/${userId}/export`,
      });
      return unwrapData<UserExportData>(res.body);
    },

    async delete(orgId, userId) {
      await transport.request({ method: 'DELETE', path: `${userBase(orgId)}/${userId}` });
    },

    async deactivate(orgId, userId) {
      await transport.request({ method: 'POST', path: `${userBase(orgId)}/${userId}/deactivate` });
    },

    async activate(orgId, userId) {
      await transport.request({ method: 'POST', path: `${userBase(orgId)}/${userId}/activate` });
    },

    async getHistory(orgId, userId) {
      const res = await transport.request({
        method: 'GET',
        path: `${userBase(orgId)}/${userId}/history`,
        params: undefined,
      });
      return res.body as HistoryResult;
    },
  };
}

// ---------------------------------------------------------------------------
// Standalone (org-less) users domain
// ---------------------------------------------------------------------------

/**
 * Org-less user operations — mirrors the server `createStandaloneUserRouter`
 * (prefix `/api/admin/users`). These are used by the Admin GUI SPA, where the
 * user detail page only knows the `userId` (not the org). The org-scoped
 * `UsersDomain` remains the primary surface for listing and creating users.
 */
export interface StandaloneUsersDomain {
  /** Get a user by ID — GET /users/:userId */
  get(userId: string): Promise<ETagResponse<User>>;
  /** Update a user profile — PUT /users/:userId */
  update(userId: string, input: UpdateUserInput, etag?: string): Promise<User>;
  /** Set a user's password — POST /users/:userId/password */
  setPassword(userId: string, input: SetPasswordInput): Promise<void>;
  /** Clear a user's password — DELETE /users/:userId/password */
  clearPassword(userId: string): Promise<void>;
  /** Mark a user's email as verified — POST /users/:userId/verify-email */
  verifyEmail(userId: string): Promise<void>;
  /** Deactivate a user — POST /users/:userId/deactivate */
  deactivate(userId: string): Promise<void>;
  /** Activate a user — POST /users/:userId/activate */
  activate(userId: string): Promise<void>;
  /** User change history — GET /users/:userId/history */
  getHistory(userId: string): Promise<HistoryResult>;
}

/**
 * Create standalone user operations over an authenticated transport.
 *
 * @param transport - HTTP transport used for every request.
 * @returns Standalone user operations bound to the supplied transport.
 */
export function createStandaloneUsersDomain(transport: HttpTransport): StandaloneUsersDomain {
  const base = '/users';

  return {
    async get(userId) {
      const res = await transport.request({ method: 'GET', path: `${base}/${userId}` });
      return unwrapWithEtag<User>(res);
    },

    async update(userId, input, etag?) {
      const res = await transport.request({
        method: 'PUT',
        path: `${base}/${userId}`,
        body: input,
        headers: etagHeaders(etag),
      });
      return unwrapData<User>(res.body);
    },

    async setPassword(userId, input) {
      await transport.request({ method: 'POST', path: `${base}/${userId}/password`, body: input });
    },

    async clearPassword(userId) {
      await transport.request({ method: 'DELETE', path: `${base}/${userId}/password` });
    },

    async verifyEmail(userId) {
      await transport.request({ method: 'POST', path: `${base}/${userId}/verify-email` });
    },

    async deactivate(userId) {
      await transport.request({ method: 'POST', path: `${base}/${userId}/deactivate` });
    },

    async activate(userId) {
      await transport.request({ method: 'POST', path: `${base}/${userId}/activate` });
    },

    async getHistory(userId) {
      const res = await transport.request({
        method: 'GET',
        path: `${base}/${userId}/history`,
        params: undefined,
      });
      return unwrapData<HistoryResult>(res.body);
    },
  };
}
