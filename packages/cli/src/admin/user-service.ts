/** Validated SDK boundary for user administration. */

import { PortaHttpError } from '@portaidentity/sdk';
import type {
  AddressInput,
  CreateUserInput,
  InviteUserInput,
  UpdateUserInput,
  UsersDomain,
  UserStatus,
} from '@portaidentity/sdk';
import type {
  AdminUserDetail,
  AdminUserHistory,
  AdminUserListItem,
  AdminUserPage,
} from './user-state.js';
import type {
  AdminCreateUserInput,
  AdminInviteUserInput,
  AdminInvitedUser,
  AdminUserMutationResult,
  AdminUserOperations,
  AdminUserReadResult,
} from './user-service-types.js';

export type * from './user-service-types.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BIRTHDATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const USER_STATUSES = new Set<UserStatus>(['active', 'inactive', 'suspended', 'locked']);
const PAGE_SIZE = 20;

/** Returns true when text contains a terminal control character. */
function containsTerminalControl(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return true;
  }
  return false;
}

/** Validates a bounded control-free string. */
function isText(value: unknown, maximum: number, minimum = 0): value is string {
  return (
    typeof value === 'string' &&
    value.length >= minimum &&
    value.length <= maximum &&
    !containsTerminalControl(value)
  );
}

/** Validates an optional or nullable bounded string. */
function isNullableText(value: unknown, maximum: number): value is string | null {
  return value === null || isText(value, maximum);
}

/** Validates a parseable ISO timestamp string. */
function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = ISO_TIMESTAMP.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  return (
    calendarDate.getUTCFullYear() === year &&
    calendarDate.getUTCMonth() === month - 1 &&
    calendarDate.getUTCDate() === day
  );
}

/** Validates a nullable timestamp. */
function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}

/** Validates a nullable absolute URL retained from a remote response. */
function isNullableUrl(value: unknown): value is string | null {
  if (value === null) return true;
  if (!isText(value, 2_048, 1)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** Validates a user lifecycle value. */
function isUserStatus(value: unknown): value is UserStatus {
  return typeof value === 'string' && USER_STATUSES.has(value as UserStatus);
}

/** Returns an object-shaped untrusted value. */
function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

/** Validates and freezes one list row. */
function userListItem(value: unknown, organizationId: string): AdminUserListItem | undefined {
  const candidate = objectValue(value);
  if (
    !candidate ||
    typeof candidate.id !== 'string' ||
    !UUID.test(candidate.id) ||
    candidate.organizationId !== organizationId ||
    !isText(candidate.email, 255, 1) ||
    !EMAIL.test(candidate.email) ||
    !isNullableText(candidate.givenName, 255) ||
    !isNullableText(candidate.familyName, 255) ||
    !isUserStatus(candidate.status)
  ) {
    return undefined;
  }
  return Object.freeze({
    id: candidate.id,
    organizationId,
    email: candidate.email,
    givenName: candidate.givenName,
    familyName: candidate.familyName,
    status: candidate.status,
  });
}

/** Validates and freezes the approved detail projection. */
function userDetail(value: unknown, organizationId: string): AdminUserDetail | undefined {
  const candidate = objectValue(value);
  const row = userListItem(value, organizationId);
  if (
    !candidate ||
    !row ||
    typeof candidate.emailVerified !== 'boolean' ||
    typeof candidate.hasPassword !== 'boolean' ||
    !isNullableText(candidate.middleName, 255) ||
    !isNullableText(candidate.nickname, 255) ||
    !isNullableText(candidate.preferredUsername, 255) ||
    !isNullableUrl(candidate.profileUrl) ||
    !isNullableUrl(candidate.pictureUrl) ||
    !isNullableUrl(candidate.websiteUrl) ||
    !isNullableText(candidate.gender, 50) ||
    !(
      candidate.birthdate === null ||
      (isText(candidate.birthdate, 10, 10) && BIRTHDATE.test(candidate.birthdate))
    ) ||
    !isNullableText(candidate.zoneinfo, 50) ||
    !isNullableText(candidate.locale, 10) ||
    !isNullableText(candidate.phoneNumber, 50) ||
    typeof candidate.phoneNumberVerified !== 'boolean' ||
    !isNullableText(candidate.addressStreet, 500) ||
    !isNullableText(candidate.addressLocality, 255) ||
    !isNullableText(candidate.addressRegion, 255) ||
    !isNullableText(candidate.addressPostalCode, 20) ||
    !(candidate.addressCountry === null || isText(candidate.addressCountry, 2, 2)) ||
    typeof candidate.twoFactorEnabled !== 'boolean' ||
    !isNullableTimestamp(candidate.lastLoginAt) ||
    !Number.isSafeInteger(candidate.loginCount) ||
    Number(candidate.loginCount) < 0 ||
    !isTimestamp(candidate.createdAt) ||
    !isTimestamp(candidate.updatedAt)
  ) {
    return undefined;
  }
  return Object.freeze({
    ...row,
    emailVerified: candidate.emailVerified,
    hasPassword: candidate.hasPassword,
    middleName: candidate.middleName,
    nickname: candidate.nickname,
    preferredUsername: candidate.preferredUsername,
    profileUrl: candidate.profileUrl,
    pictureUrl: candidate.pictureUrl,
    websiteUrl: candidate.websiteUrl,
    gender: candidate.gender,
    birthdate: candidate.birthdate,
    zoneinfo: candidate.zoneinfo,
    locale: candidate.locale,
    phoneNumber: candidate.phoneNumber,
    phoneNumberVerified: candidate.phoneNumberVerified,
    addressStreet: candidate.addressStreet,
    addressLocality: candidate.addressLocality,
    addressRegion: candidate.addressRegion,
    addressPostalCode: candidate.addressPostalCode,
    addressCountry: candidate.addressCountry,
    twoFactorEnabled: candidate.twoFactorEnabled,
    status: row.status,
    lastLoginAt: candidate.lastLoginAt,
    loginCount: Number(candidate.loginCount),
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  });
}

/** Validates and freezes one complete pagination envelope. */
function userPage(
  value: unknown,
  organizationId: string,
  requestedPage: number,
): AdminUserPage | undefined {
  const candidate = objectValue(value);
  if (
    !candidate ||
    !Array.isArray(candidate.data) ||
    !Number.isSafeInteger(candidate.total) ||
    Number(candidate.total) < 0 ||
    candidate.page !== requestedPage ||
    candidate.pageSize !== PAGE_SIZE ||
    !Number.isSafeInteger(candidate.totalPages) ||
    Number(candidate.totalPages) < 0 ||
    candidate.totalPages !==
      (candidate.total === 0 ? 0 : Math.ceil(Number(candidate.total) / PAGE_SIZE)) ||
    candidate.data.length > PAGE_SIZE ||
    (requestedPage > Number(candidate.totalPages) && candidate.data.length !== 0)
  ) {
    return undefined;
  }
  const available = Math.max(0, Number(candidate.total) - (requestedPage - 1) * PAGE_SIZE);
  if (candidate.data.length > available) return undefined;
  const rows: AdminUserListItem[] = [];
  const ids = new Set<string>();
  for (const valueRow of candidate.data) {
    const row = userListItem(valueRow, organizationId);
    if (!row || ids.has(row.id)) return undefined;
    ids.add(row.id);
    rows.push(row);
  }
  return Object.freeze({
    data: Object.freeze(rows),
    total: Number(candidate.total),
    page: requestedPage,
    pageSize: PAGE_SIZE,
    totalPages: Number(candidate.totalPages),
  });
}

/** Validates and freezes one history result. */
function userHistory(value: unknown): AdminUserHistory | undefined {
  const candidate = objectValue(value);
  if (
    !candidate ||
    !Array.isArray(candidate.data) ||
    candidate.data.length > 20 ||
    typeof candidate.hasMore !== 'boolean'
  ) {
    return undefined;
  }
  const entries = [];
  let previousTime = Number.POSITIVE_INFINITY;
  for (const valueEntry of candidate.data) {
    const entry = objectValue(valueEntry);
    if (
      !entry ||
      !isText(entry.eventType, 255, 1) ||
      !(
        entry.actorId === null ||
        (typeof entry.actorId === 'string' && UUID.test(entry.actorId))
      ) ||
      !isTimestamp(entry.createdAt)
    ) {
      return undefined;
    }
    const timestamp = Date.parse(entry.createdAt);
    if (timestamp > previousTime) return undefined;
    previousTime = timestamp;
    entries.push(
      Object.freeze({
        eventType: entry.eventType,
        actor: entry.actorId ?? 'System',
        createdAt: entry.createdAt,
      }),
    );
  }
  return Object.freeze({ entries: Object.freeze(entries), hasMore: candidate.hasMore });
}

/** Maps an SDK read error to a fixed safe result. */
function readError(error: unknown): AdminUserReadResult<never> {
  if (!(error instanceof PortaHttpError)) return { kind: 'failure', failure: 'unavailable' };
  if (error.status === 401) return { kind: 'session-invalid' };
  if (error.status === 400) return { kind: 'failure', failure: 'validation' };
  if (error.status === 403) return { kind: 'failure', failure: 'unauthorized' };
  if (error.status === 404) return { kind: 'failure', failure: 'not-found' };
  if (error.status === 409 || error.status === 412) return { kind: 'failure', failure: 'conflict' };
  return { kind: 'failure', failure: 'unavailable' };
}

/** Fixed mutation failures without a success variant. */
type AdminUserMutationError = Exclude<AdminUserMutationResult, { readonly kind: 'success' }>;

/** Maps an SDK mutation error to a fixed safe result. */
function mutationError(error: unknown): AdminUserMutationError {
  if (!(error instanceof PortaHttpError) || error.status >= 500) return { kind: 'outcome-unknown' };
  if (error.status === 401) return { kind: 'session-invalid' };
  if (error.status === 400) return { kind: 'failure', failure: 'validation' };
  if (error.status === 403) return { kind: 'failure', failure: 'unauthorized' };
  if (error.status === 404) return { kind: 'failure', failure: 'not-found' };
  if (error.status === 409 || error.status === 412) return { kind: 'failure', failure: 'conflict' };
  return { kind: 'failure', failure: 'unavailable' };
}

/** Validates a URL-shaped optional local field. */
function isOptionalUrl(value: unknown): value is string | undefined {
  if (value === undefined) return true;
  if (!isText(value, 2_048, 1)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** Validates optional create or update profile text. */
function isOptionalText(value: unknown, maximum: number, nullable: boolean): boolean {
  return value === undefined || (nullable && value === null) || isText(value, maximum);
}

/** Validates structured address input. */
function isAddress(value: unknown): value is AddressInput | undefined {
  if (value === undefined) return true;
  const address = objectValue(value);
  return (
    !!address &&
    isOptionalText(address.street, 500, true) &&
    isOptionalText(address.locality, 255, true) &&
    isOptionalText(address.region, 255, true) &&
    isOptionalText(address.postalCode, 20, true) &&
    (address.country === undefined || address.country === null || isText(address.country, 2, 2))
  );
}

/** Validates the profile fields shared by create and update. */
function hasValidProfile(value: Record<string, unknown>, nullable: boolean): boolean {
  return (
    ['givenName', 'familyName', 'middleName', 'nickname', 'preferredUsername'].every((key) =>
      isOptionalText(value[key], 255, nullable),
    ) &&
    ['profileUrl', 'pictureUrl', 'websiteUrl'].every(
      (key) =>
        value[key] === undefined || (nullable && value[key] === null) || isOptionalUrl(value[key]),
    ) &&
    isOptionalText(value.gender, 50, nullable) &&
    (value.birthdate === undefined ||
      (nullable && value.birthdate === null) ||
      (isText(value.birthdate, 10, 10) && BIRTHDATE.test(value.birthdate))) &&
    isOptionalText(value.zoneinfo, 50, nullable) &&
    isOptionalText(value.locale, 10, nullable) &&
    isOptionalText(value.phoneNumber, 50, nullable) &&
    (value.phoneNumberVerified === undefined || typeof value.phoneNumberVerified === 'boolean') &&
    isAddress(value.address)
  );
}

/** Copies only supported address fields from a validated input object. */
function projectAddress(value: AddressInput | undefined): AddressInput | undefined {
  if (!value) return undefined;
  const projected: AddressInput = {};
  if (value.street !== undefined) projected.street = value.street;
  if (value.locality !== undefined) projected.locality = value.locality;
  if (value.region !== undefined) projected.region = value.region;
  if (value.postalCode !== undefined) projected.postalCode = value.postalCode;
  if (value.country !== undefined) projected.country = value.country;
  return projected;
}

/** Builds an exact validated create payload. */
function createInput(
  organizationId: string,
  input: AdminCreateUserInput,
): CreateUserInput | undefined {
  const value = objectValue(input);
  if (
    !UUID.test(organizationId) ||
    !value ||
    !isText(value.email, 255, 1) ||
    !EMAIL.test(value.email) ||
    !hasValidProfile(value, false) ||
    value.phoneNumberVerified !== undefined ||
    (value.password !== undefined && !isText(value.password, 128, 8)) ||
    value.password !== value.passwordConfirmation
  ) {
    return undefined;
  }
  const payload: CreateUserInput = { organizationId, email: input.email };
  if (input.password !== undefined) payload.password = input.password;
  if (input.givenName !== undefined) payload.givenName = input.givenName;
  if (input.familyName !== undefined) payload.familyName = input.familyName;
  if (input.middleName !== undefined) payload.middleName = input.middleName;
  if (input.nickname !== undefined) payload.nickname = input.nickname;
  if (input.preferredUsername !== undefined) payload.preferredUsername = input.preferredUsername;
  if (input.profileUrl !== undefined) payload.profileUrl = input.profileUrl;
  if (input.pictureUrl !== undefined) payload.pictureUrl = input.pictureUrl;
  if (input.websiteUrl !== undefined) payload.websiteUrl = input.websiteUrl;
  if (input.gender !== undefined) payload.gender = input.gender;
  if (input.birthdate !== undefined) payload.birthdate = input.birthdate;
  if (input.zoneinfo !== undefined) payload.zoneinfo = input.zoneinfo;
  if (input.locale !== undefined) payload.locale = input.locale;
  if (input.phoneNumber !== undefined) payload.phoneNumber = input.phoneNumber;
  const address = projectAddress(input.address);
  if (address !== undefined) payload.address = address;
  return payload;
}

/** Builds an exact validated invitation payload. */
function inviteInput(
  organizationId: string,
  input: AdminInviteUserInput,
): InviteUserInput | undefined {
  const value = objectValue(input);
  if (
    !UUID.test(organizationId) ||
    !value ||
    !isText(value.email, 255, 1) ||
    !EMAIL.test(value.email) ||
    !isOptionalText(value.givenName, 255, false) ||
    !isOptionalText(value.familyName, 255, false) ||
    (value.givenName !== undefined && !isText(value.givenName, 255, 1)) ||
    (value.familyName !== undefined && !isText(value.familyName, 255, 1)) ||
    !isOptionalText(value.locale, 10, false) ||
    !isOptionalText(value.personalMessage, 500, false)
  ) {
    return undefined;
  }
  const payload: InviteUserInput = { organizationId, email: input.email };
  if (input.givenName !== undefined) payload.givenName = input.givenName;
  if (input.familyName !== undefined) payload.familyName = input.familyName;
  if (input.locale !== undefined) payload.locale = input.locale;
  if (input.personalMessage !== undefined) payload.personalMessage = input.personalMessage;
  return payload;
}

/** Validates and copies only supported update fields. */
function updateInput(input: UpdateUserInput): UpdateUserInput | undefined {
  const value = objectValue(input);
  if (!value || !hasValidProfile(value, true)) return undefined;
  const payload: UpdateUserInput = {};
  if (input.givenName !== undefined) payload.givenName = input.givenName;
  if (input.familyName !== undefined) payload.familyName = input.familyName;
  if (input.middleName !== undefined) payload.middleName = input.middleName;
  if (input.nickname !== undefined) payload.nickname = input.nickname;
  if (input.preferredUsername !== undefined) payload.preferredUsername = input.preferredUsername;
  if (input.profileUrl !== undefined) payload.profileUrl = input.profileUrl;
  if (input.pictureUrl !== undefined) payload.pictureUrl = input.pictureUrl;
  if (input.websiteUrl !== undefined) payload.websiteUrl = input.websiteUrl;
  if (input.gender !== undefined) payload.gender = input.gender;
  if (input.birthdate !== undefined) payload.birthdate = input.birthdate;
  if (input.zoneinfo !== undefined) payload.zoneinfo = input.zoneinfo;
  if (input.locale !== undefined) payload.locale = input.locale;
  if (input.phoneNumber !== undefined) payload.phoneNumber = input.phoneNumber;
  if (input.phoneNumberVerified !== undefined)
    payload.phoneNumberVerified = input.phoneNumberVerified;
  const address = projectAddress(input.address);
  if (address !== undefined) payload.address = address;
  return payload;
}

/** Validates an invitation acceptance payload. */
function invitedUser(value: unknown): AdminInvitedUser | undefined {
  const candidate = objectValue(value);
  if (
    !candidate ||
    typeof candidate.userId !== 'string' ||
    !UUID.test(candidate.userId) ||
    !isText(candidate.email, 255, 1) ||
    !EMAIL.test(candidate.email) ||
    typeof candidate.created !== 'boolean' ||
    typeof candidate.invitationSent !== 'boolean' ||
    !isTimestamp(candidate.expiresAt)
  ) {
    return undefined;
  }
  return Object.freeze({
    userId: candidate.userId,
    email: candidate.email,
    created: candidate.created,
    invitationSent: candidate.invitationSent,
    expiresAt: candidate.expiresAt,
  });
}

/** Invokes a void mutation exactly once. */
async function voidMutation(invoke: () => Promise<unknown>): Promise<AdminUserMutationResult> {
  try {
    await invoke();
    return { kind: 'success' };
  } catch (error) {
    return mutationError(error);
  }
}

/**
 * Creates the narrow user boundary used by the terminal application.
 *
 * The SDK domain is obtained only when a validated operation is invoked.
 *
 * @param domain - Returns the user domain for the current verified session.
 * @returns Validated user operations with fixed safe outcomes.
 */
export function createAdminUserOperations(
  domain: () => Pick<
    UsersDomain,
    | 'list'
    | 'get'
    | 'getHistory'
    | 'invitePreview'
    | 'create'
    | 'invite'
    | 'update'
    | 'setPassword'
    | 'clearPassword'
    | 'verifyEmail'
    | 'suspend'
    | 'unsuspend'
    | 'lock'
    | 'unlock'
    | 'deactivate'
    | 'reactivate'
    | 'purge'
  >,
): AdminUserOperations {
  return {
    async list(organizationId, request) {
      if (
        !UUID.test(organizationId) ||
        !Number.isInteger(request.page) ||
        request.page < 1 ||
        (request.search !== undefined && !isText(request.search, 255)) ||
        (request.status !== undefined && !isUserStatus(request.status))
      ) {
        return { kind: 'failure', failure: 'validation' };
      }
      try {
        const value = userPage(
          await domain().list(organizationId, {
            page: request.page,
            pageSize: PAGE_SIZE,
            ...(request.search !== undefined ? { search: request.search } : {}),
            ...(request.status !== undefined ? { status: request.status } : {}),
          }),
          organizationId,
          request.page,
        );
        return value
          ? { kind: 'success', value }
          : { kind: 'failure', failure: 'invalid-response' };
      } catch (error) {
        return readError(error);
      }
    },

    async get(organizationId, userId) {
      if (!UUID.test(organizationId) || !UUID.test(userId))
        return { kind: 'failure', failure: 'validation' };
      try {
        const response: unknown = await domain().get(organizationId, userId);
        const wrapper = objectValue(response);
        const detail = wrapper ? userDetail(wrapper.data, organizationId) : undefined;
        if (
          !wrapper ||
          !detail ||
          detail.id !== userId ||
          !(wrapper.etag === null || isText(wrapper.etag, 1_024))
        )
          return { kind: 'failure', failure: 'invalid-response' };
        return { kind: 'success', value: Object.freeze({ detail, etag: wrapper.etag }) };
      } catch (error) {
        return readError(error);
      }
    },

    async getHistory(organizationId, userId) {
      if (!UUID.test(organizationId) || !UUID.test(userId))
        return { kind: 'failure', failure: 'validation' };
      try {
        const value = userHistory(await domain().getHistory(organizationId, userId));
        return value
          ? { kind: 'success', value }
          : { kind: 'failure', failure: 'invalid-response' };
      } catch (error) {
        return readError(error);
      }
    },

    async previewInvitation(organizationId, input) {
      const payload = inviteInput(organizationId, input);
      if (!payload) return { kind: 'failure', failure: 'validation' };
      try {
        const candidate = objectValue(await domain().invitePreview(payload));
        if (!candidate || !isText(candidate.subject, 255) || !isText(candidate.text, 10_000))
          return { kind: 'failure', failure: 'invalid-response' };
        return {
          kind: 'success',
          value: Object.freeze({ subject: candidate.subject, text: candidate.text }),
        };
      } catch (error) {
        return readError(error);
      }
    },

    async create(organizationId, input) {
      const payload = createInput(organizationId, input);
      if (!payload) return { kind: 'failure', failure: 'validation' };
      try {
        const value = userListItem(await domain().create(payload), organizationId);
        return value ? { kind: 'success', value } : { kind: 'outcome-unknown' };
      } catch (error) {
        return mutationError(error);
      }
    },

    async invite(organizationId, input) {
      const payload = inviteInput(organizationId, input);
      if (!payload) return { kind: 'failure', failure: 'validation' };
      try {
        const value = invitedUser(await domain().invite(payload));
        return value ? { kind: 'success', value } : { kind: 'outcome-unknown' };
      } catch (error) {
        return mutationError(error);
      }
    },

    async update(organizationId, userId, input, etag) {
      const payload = updateInput(input);
      if (!UUID.test(organizationId) || !UUID.test(userId) || !payload)
        return { kind: 'failure', failure: 'validation' };
      try {
        const value = userListItem(
          await domain().update(organizationId, userId, payload, etag),
          organizationId,
        );
        return value && value.id === userId
          ? { kind: 'success', value }
          : { kind: 'outcome-unknown' };
      } catch (error) {
        return mutationError(error);
      }
    },

    async setPassword(organizationId, userId, input) {
      if (
        !UUID.test(organizationId) ||
        !UUID.test(userId) ||
        !isText(input.password, 128, 8) ||
        input.password !== input.passwordConfirmation
      ) {
        return { kind: 'failure', failure: 'validation' };
      }
      return voidMutation(() =>
        domain().setPassword(organizationId, userId, { password: input.password }),
      );
    },

    clearPassword: (organizationId, userId) =>
      UUID.test(organizationId) && UUID.test(userId)
        ? voidMutation(() => domain().clearPassword(organizationId, userId))
        : Promise.resolve({ kind: 'failure', failure: 'validation' }),
    verifyEmail: (organizationId, userId) =>
      UUID.test(organizationId) && UUID.test(userId)
        ? voidMutation(() => domain().verifyEmail(organizationId, userId))
        : Promise.resolve({ kind: 'failure', failure: 'validation' }),
    suspend: (organizationId, userId, reason) =>
      UUID.test(organizationId) &&
      UUID.test(userId) &&
      (reason === undefined || isText(reason, 500))
        ? voidMutation(() => domain().suspend(organizationId, userId, reason))
        : Promise.resolve({ kind: 'failure', failure: 'validation' }),
    unsuspend: (organizationId, userId) =>
      UUID.test(organizationId) && UUID.test(userId)
        ? voidMutation(() => domain().unsuspend(organizationId, userId))
        : Promise.resolve({ kind: 'failure', failure: 'validation' }),
    lock: (organizationId, userId, reason) =>
      UUID.test(organizationId) && UUID.test(userId) && isText(reason, 500, 1)
        ? voidMutation(() => domain().lock(organizationId, userId, reason))
        : Promise.resolve({ kind: 'failure', failure: 'validation' }),
    unlock: (organizationId, userId) =>
      UUID.test(organizationId) && UUID.test(userId)
        ? voidMutation(() => domain().unlock(organizationId, userId))
        : Promise.resolve({ kind: 'failure', failure: 'validation' }),
    deactivate: (organizationId, userId) =>
      UUID.test(organizationId) && UUID.test(userId)
        ? voidMutation(() => domain().deactivate(organizationId, userId))
        : Promise.resolve({ kind: 'failure', failure: 'validation' }),
    reactivate: (organizationId, userId) =>
      UUID.test(organizationId) && UUID.test(userId)
        ? voidMutation(() => domain().reactivate(organizationId, userId))
        : Promise.resolve({ kind: 'failure', failure: 'validation' }),
    purge: (organizationId, userId) =>
      UUID.test(organizationId) && UUID.test(userId)
        ? voidMutation(() => domain().purge(organizationId, userId))
        : Promise.resolve({ kind: 'failure', failure: 'validation' }),
  };
}
