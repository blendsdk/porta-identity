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
  HistoryEntry,
  InviteUserInput,
  ListParams,
  PaginatedResponse,
  SetPasswordInput,
  UpdateUserInput,
  User,
  UserListParams,
} from '../types/index.js';
import { etagHeaders, toQueryParams, unwrapData, unwrapWithEtag } from './helpers.js';

export interface UsersDomain {
  list(orgId: string, params?: UserListParams): Promise<PaginatedResponse<User>>;
  listAll(orgId: string, params?: Omit<UserListParams, 'page' | 'cursor'>): Promise<User[]>;
  get(orgId: string, userId: string): Promise<ETagResponse<User>>;
  create(input: CreateUserInput): Promise<User>;
  update(orgId: string, userId: string, input: UpdateUserInput, etag?: string): Promise<User>;
  invite(input: InviteUserInput): Promise<User>;
  /** Preview the invitation email without sending — POST .../invite/preview */
  invitePreview(input: InviteUserInput): Promise<InvitePreviewResult>;
  setPassword(orgId: string, userId: string, input: SetPasswordInput): Promise<void>;
  /** Clear a user's password (make passwordless) — DELETE .../:userId/password */
  clearPassword(orgId: string, userId: string): Promise<void>;
  /** Mark a user's email as verified — POST .../:userId/verify-email */
  verifyEmail(orgId: string, userId: string): Promise<void>;
  /** GDPR data export (Article 20) — GET .../:userId/export */
  exportData(orgId: string, userId: string): Promise<UserExportData>;
  /** GDPR data purge (Article 17) — POST .../:userId/purge (X-Confirm-Purge) */
  purge(orgId: string, userId: string): Promise<UserPurgeResult>;
  suspend(orgId: string, userId: string): Promise<void>;
  /** Unsuspend a user (suspended → active) — POST .../:userId/unsuspend */
  unsuspend(orgId: string, userId: string): Promise<void>;
  lock(orgId: string, userId: string): Promise<void>;
  unlock(orgId: string, userId: string): Promise<void>;
  deactivate(orgId: string, userId: string): Promise<void>;
  reactivate(orgId: string, userId: string): Promise<void>;
  getHistory(orgId: string, userId: string, params?: ListParams): Promise<HistoryEntry[]>;
}

/** Rendered invitation email returned by `invitePreview()`. */
export interface InvitePreviewResult {
  html: string;
  text: string;
  subject: string;
}

/** GDPR export payload returned by `exportData()` (shape determined by the server). */
export type UserExportData = Record<string, unknown>;

/** Result of a GDPR purge returned by `purge()`. */
export type UserPurgeResult = Record<string, unknown>;

export function createUsersDomain(transport: HttpTransport): UsersDomain {
  function userBase(orgId: string) {
    return `/organizations/${orgId}/users`;
  }

  return {
    async list(orgId, params?) {
      const res = await transport.request({
        method: 'GET',
        path: userBase(orgId),
        params: toQueryParams(params),
      });
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
      return unwrapData<User>(res.body);
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

    async purge(orgId, userId) {
      // The server requires an explicit confirmation header to perform the
      // irreversible GDPR purge (X-Confirm-Purge: true).
      const res = await transport.request({
        method: 'POST',
        path: `${userBase(orgId)}/${userId}/purge`,
        headers: { 'X-Confirm-Purge': 'true' },
      });
      return unwrapData<UserPurgeResult>(res.body);
    },

    async suspend(orgId, userId) {
      await transport.request({ method: 'POST', path: `${userBase(orgId)}/${userId}/suspend` });
    },

    async unsuspend(orgId, userId) {
      await transport.request({ method: 'POST', path: `${userBase(orgId)}/${userId}/unsuspend` });
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
        method: 'GET',
        path: `${userBase(orgId)}/${userId}/history`,
        params: toQueryParams(params),
      });
      return unwrapData<HistoryEntry[]>(res.body);
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
 * `UsersDomain` remains the primary surface for listing/creating users (AR-12d).
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
  /** Reactivate a user — POST /users/:userId/reactivate */
  reactivate(userId: string): Promise<void>;
  /** Activate a user (SPA alias for reactivate) — POST /users/:userId/activate */
  activate(userId: string): Promise<void>;
  /** Suspend a user — POST /users/:userId/suspend */
  suspend(userId: string): Promise<void>;
  /** Unsuspend a user — POST /users/:userId/unsuspend */
  unsuspend(userId: string): Promise<void>;
  /** Lock a user — POST /users/:userId/lock */
  lock(userId: string): Promise<void>;
  /** Unlock a user — POST /users/:userId/unlock */
  unlock(userId: string): Promise<void>;
  /** User change history — GET /users/:userId/history */
  getHistory(userId: string, params?: ListParams): Promise<HistoryEntry[]>;
}

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

    async reactivate(userId) {
      await transport.request({ method: 'POST', path: `${base}/${userId}/reactivate` });
    },

    async activate(userId) {
      await transport.request({ method: 'POST', path: `${base}/${userId}/activate` });
    },

    async suspend(userId) {
      await transport.request({ method: 'POST', path: `${base}/${userId}/suspend` });
    },

    async unsuspend(userId) {
      await transport.request({ method: 'POST', path: `${base}/${userId}/unsuspend` });
    },

    async lock(userId) {
      await transport.request({ method: 'POST', path: `${base}/${userId}/lock` });
    },

    async unlock(userId) {
      await transport.request({ method: 'POST', path: `${base}/${userId}/unlock` });
    },

    async getHistory(userId, params?) {
      const res = await transport.request({
        method: 'GET',
        path: `${base}/${userId}/history`,
        params: toQueryParams(params),
      });
      return unwrapData<HistoryEntry[]>(res.body);
    },
  };
}
