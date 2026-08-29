import { describe, expectTypeOf, it } from 'vitest';
import type { StandaloneUsersDomain, UsersDomain } from '../../src/domains/index.js';
import type {
  AddressInput,
  CreateUserInput,
  HistoryEntry,
  HistoryResult,
  InviteUserInput,
  InviteUserResult,
  PaginatedResponse,
  UpdateUserInput,
  User,
  UserListParams,
  UserStatus,
} from '../../src/types/index.js';

type ExpectedAddressInput = {
  street?: string | null;
  locality?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

type ExpectedCreateUserInput = {
  organizationId: string;
  email: string;
  password?: string;
  givenName?: string;
  familyName?: string;
  middleName?: string;
  nickname?: string;
  preferredUsername?: string;
  profileUrl?: string;
  pictureUrl?: string;
  websiteUrl?: string;
  gender?: string;
  birthdate?: string;
  zoneinfo?: string;
  locale?: string;
  phoneNumber?: string;
  address?: AddressInput;
};

type ExpectedUpdateUserInput = {
  givenName?: string | null;
  familyName?: string | null;
  middleName?: string | null;
  nickname?: string | null;
  preferredUsername?: string | null;
  profileUrl?: string | null;
  pictureUrl?: string | null;
  websiteUrl?: string | null;
  gender?: string | null;
  birthdate?: string | null;
  zoneinfo?: string | null;
  locale?: string | null;
  phoneNumber?: string | null;
  phoneNumberVerified?: boolean;
  address?: AddressInput;
};

type ExpectedInviteUserResult = {
  userId: string;
  email: string;
  created: boolean;
  invitationSent: boolean;
  expiresAt: string;
};

type ExpectedHistoryResult = {
  data: HistoryEntry[];
  hasMore: boolean;
  nextCursor: string | null;
};

type ExpectedUserListParams = {
  page?: number;
  pageSize?: number;
  cursor?: string;
  search?: string;
  status?: UserStatus;
  sortBy?: 'email' | 'given_name' | 'family_name' | 'created_at' | 'last_login_at';
  sortOrder?: 'asc' | 'desc';
};

describe('user type contracts', () => {
  it('exposes the exact address and user input shapes', () => {
    expectTypeOf<AddressInput>().toEqualTypeOf<ExpectedAddressInput>();
    expectTypeOf<CreateUserInput>().toEqualTypeOf<ExpectedCreateUserInput>();
    expectTypeOf<UpdateUserInput>().toEqualTypeOf<ExpectedUpdateUserInput>();

    const address: AddressInput = {
      street: null,
      locality: 'Amsterdam',
      region: null,
      postalCode: '1012 AB',
      country: 'NL',
    };
    const createInput: CreateUserInput = {
      organizationId: 'org-1',
      email: 'person@example.com',
      password: 'correct horse battery staple',
      givenName: 'Ada',
      familyName: 'Lovelace',
      middleName: 'Byron',
      nickname: 'Enchantress of Numbers',
      preferredUsername: 'ada',
      profileUrl: 'https://example.com/ada',
      pictureUrl: 'https://example.com/ada.png',
      websiteUrl: 'https://example.com',
      gender: 'female',
      birthdate: '1815-12-10',
      zoneinfo: 'Europe/London',
      locale: 'en-GB',
      phoneNumber: '+442000000000',
      address,
    };
    const updateInput: UpdateUserInput = {
      givenName: null,
      familyName: null,
      middleName: null,
      nickname: null,
      preferredUsername: null,
      profileUrl: null,
      pictureUrl: null,
      websiteUrl: null,
      gender: null,
      birthdate: null,
      zoneinfo: null,
      locale: null,
      phoneNumber: null,
      phoneNumberVerified: false,
      address,
    };

    expectTypeOf(address).toMatchTypeOf<AddressInput>();
    expectTypeOf(createInput).toMatchTypeOf<CreateUserInput>();
    expectTypeOf(updateInput).toMatchTypeOf<UpdateUserInput>();

    // @ts-expect-error Address input is closed to the supported OIDC address fields.
    const addressWithArbitraryKey: AddressInput = { formatted: 'Amsterdam, NL' };
    // @ts-expect-error Organization scope is required when creating a user.
    const createWithoutOrganization: CreateUserInput = { email: 'person@example.com' };
    // @ts-expect-error Email is required when creating a user.
    const createWithoutEmail: CreateUserInput = { organizationId: 'org-1' };
    // @ts-expect-error Creation profile fields cannot be cleared with null.
    const createWithNullProfile: CreateUserInput = { organizationId: 'org-1', email: 'person@example.com', locale: null };
    // @ts-expect-error Verification state is not accepted during creation.
    const createWithVerification: CreateUserInput = { organizationId: 'org-1', email: 'person@example.com', phoneNumberVerified: true };
    // @ts-expect-error Email is immutable through the profile update input.
    const updateWithEmail: UpdateUserInput = { email: 'other@example.com' };
    // @ts-expect-error Email verification uses its dedicated operation.
    const updateWithEmailVerification: UpdateUserInput = { emailVerified: true };
    // @ts-expect-error Password changes use the dedicated password operation.
    const updateWithPassword: UpdateUserInput = { password: 'replacement password' };
    // @ts-expect-error Lifecycle status changes use dedicated transition operations.
    const updateWithStatus: UpdateUserInput = { status: 'suspended' };
    // @ts-expect-error Organization scope is not mutable through profile updates.
    const updateWithOrganization: UpdateUserInput = { organizationId: 'org-2' };
    // @ts-expect-error Address can be omitted but cannot be null.
    const updateWithNullAddress: UpdateUserInput = { address: null };
    // @ts-expect-error Update input is closed to supported profile fields.
    const updateWithArbitraryKey: UpdateUserInput = { favoriteColor: 'blue' };

    expectTypeOf(addressWithArbitraryKey).toBeObject();
    expectTypeOf(createWithoutOrganization).toBeObject();
    expectTypeOf(createWithoutEmail).toBeObject();
    expectTypeOf(createWithNullProfile).toBeObject();
    expectTypeOf(createWithVerification).toBeObject();
    expectTypeOf(updateWithEmail).toBeObject();
    expectTypeOf(updateWithEmailVerification).toBeObject();
    expectTypeOf(updateWithPassword).toBeObject();
    expectTypeOf(updateWithStatus).toBeObject();
    expectTypeOf(updateWithOrganization).toBeObject();
    expectTypeOf(updateWithNullAddress).toBeObject();
    expectTypeOf(updateWithArbitraryKey).toBeObject();
  });

  it('exposes exact invitation, history, and list result shapes', () => {
    expectTypeOf<InviteUserResult>().toEqualTypeOf<ExpectedInviteUserResult>();
    expectTypeOf<HistoryResult>().toEqualTypeOf<ExpectedHistoryResult>();
    expectTypeOf<UserListParams>().toEqualTypeOf<ExpectedUserListParams>();

    const listParams: UserListParams = {
      page: 2,
      pageSize: 50,
      cursor: 'cursor-2',
      search: 'ada',
      status: 'active',
      sortBy: 'last_login_at',
      sortOrder: 'desc',
    };

    expectTypeOf(listParams).toMatchTypeOf<UserListParams>();

    // @ts-expect-error Sort fields are restricted to documented API column names.
    const invalidSort: UserListParams = { sortBy: 'display_name' };
    // @ts-expect-error Sort direction accepts only ascending or descending order.
    const invalidOrder: UserListParams = { sortOrder: 'random' };
    // @ts-expect-error Legacy sort query names are not part of the public input.
    const legacySortKey: UserListParams = { sort: 'email' };
    // @ts-expect-error List parameters are closed to supported query keys.
    const arbitraryListKey: UserListParams = { includeDeleted: true };

    expectTypeOf(invalidSort).toBeObject();
    expectTypeOf(invalidOrder).toBeObject();
    expectTypeOf(legacySortKey).toBeObject();
    expectTypeOf(arbitraryListKey).toBeObject();
  });

  it('exposes domain method signatures that preserve user contracts', () => {
    expectTypeOf<UsersDomain['list']>().toEqualTypeOf<
      (organizationId: string, params?: UserListParams) => Promise<PaginatedResponse<User>>
    >();
    expectTypeOf<UsersDomain['invite']>().toEqualTypeOf<
      (input: InviteUserInput) => Promise<InviteUserResult>
    >();
    expectTypeOf<UsersDomain['suspend']>().toEqualTypeOf<
      (organizationId: string, userId: string, reason?: string) => Promise<void>
    >();
    expectTypeOf<UsersDomain['lock']>().toEqualTypeOf<
      (organizationId: string, userId: string, reason: string) => Promise<void>
    >();
    expectTypeOf<UsersDomain['getHistory']>().toEqualTypeOf<
      (organizationId: string, userId: string) => Promise<HistoryResult>
    >();
    expectTypeOf<StandaloneUsersDomain['suspend']>().toEqualTypeOf<
      (userId: string, reason?: string) => Promise<void>
    >();
    expectTypeOf<StandaloneUsersDomain['lock']>().toEqualTypeOf<
      (userId: string, reason: string) => Promise<void>
    >();
    expectTypeOf<StandaloneUsersDomain['getHistory']>().toEqualTypeOf<
      (userId: string) => Promise<HistoryResult>
    >();
  });
});
