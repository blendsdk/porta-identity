/**
 * Observable specifications for the CLI's user administration boundary.
 */

import {
  PortaAuthenticationError,
  PortaConflictError,
  PortaForbiddenError,
  PortaHttpError,
  PortaNotFoundError,
  PortaServerError,
  PortaValidationError,
} from '@portaidentity/sdk';
import { describe, expect, it, vi } from 'vitest';

const organizationId = '11111111-1111-4111-8111-111111111111';
const otherOrganizationId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const actorId = '44444444-4444-4444-8444-444444444444';

/** Builds a complete SDK-shaped user while allowing one test-specific variation. */
function user(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: userId,
    organizationId,
    email: 'person@example.test',
    emailVerified: true,
    hasPassword: true,
    passwordChangedAt: '2026-08-20T10:00:00.000Z',
    givenName: 'Ada',
    familyName: 'Lovelace',
    middleName: null,
    nickname: 'Enchantress of Numbers',
    preferredUsername: 'ada',
    profileUrl: 'https://example.test/ada',
    pictureUrl: 'https://example.test/ada.png',
    websiteUrl: 'https://ada.example.test',
    gender: null,
    birthdate: '1815-12-10',
    zoneinfo: 'Europe/London',
    locale: 'en',
    phoneNumber: '+441234567890',
    phoneNumberVerified: true,
    addressStreet: '1 Example Street',
    addressLocality: 'London',
    addressRegion: 'London',
    addressPostalCode: 'N1 1AA',
    addressCountry: 'GB',
    twoFactorEnabled: true,
    twoFactorMethod: 'totp',
    status: 'active',
    lockedAt: null,
    lockedReason: null,
    lastLoginAt: '2026-08-29T10:00:00.000Z',
    loginCount: 12,
    failedLoginCount: 2,
    lastFailedLoginAt: '2026-08-25T10:00:00.000Z',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-29T10:00:00.000Z',
    internalSecret: 'must-not-cross-the-boundary',
    ...overrides,
  };
}

/** Supplies every SDK operation used by the user administration boundary. */
function domain(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    list: vi.fn(),
    get: vi.fn(),
    getHistory: vi.fn(),
    invitePreview: vi.fn(),
    create: vi.fn(),
    invite: vi.fn(),
    update: vi.fn(),
    setPassword: vi.fn(),
    clearPassword: vi.fn(),
    verifyEmail: vi.fn(),
    suspend: vi.fn(),
    unsuspend: vi.fn(),
    lock: vi.fn(),
    unlock: vi.fn(),
    deactivate: vi.fn(),
    reactivate: vi.fn(),
    purge: vi.fn(),
    ...overrides,
  };
}

describe('user operation construction', () => {
  it('should obtain the current SDK domain lazily for each invoked operation', async () => {
    // Construction has no session side effects, and invocation uses the current authenticated SDK domain.
    const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
    const firstList = vi
      .fn()
      .mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
    const secondGet = vi.fn().mockResolvedValue({ data: user(), etag: '"user-v1"' });
    const provider = vi
      .fn()
      .mockReturnValueOnce(domain({ list: firstList }))
      .mockReturnValueOnce(domain({ get: secondGet }));
    const operations = createAdminUserOperations(provider);

    expect(provider).not.toHaveBeenCalled();
    await operations.list(organizationId, { page: 1 });
    await operations.get(organizationId, userId);

    expect(provider).toHaveBeenCalledTimes(2);
    expect(firstList).toHaveBeenCalledWith(organizationId, { page: 1, pageSize: 20 });
    expect(secondGet).toHaveBeenCalledWith(organizationId, userId);
  });
});

describe('user listing', () => {
  it('should return immutable allowlisted rows from a valid first page', async () => {
    // A valid page preserves server order while dropping authentication and internal detail fields.
    const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
    const source = [
      user(),
      user({ id: '55555555-5555-4555-8555-555555555555', email: 'two@example.test' }),
    ];
    const list = vi
      .fn()
      .mockResolvedValue({ data: source, total: 2, page: 1, pageSize: 20, totalPages: 1 });
    const operations = createAdminUserOperations(() => domain({ list }));

    const result = await operations.list(organizationId, { page: 1 });

    expect(result).toEqual({
      kind: 'success',
      value: {
        data: [
          {
            id: userId,
            organizationId,
            email: 'person@example.test',
            givenName: 'Ada',
            familyName: 'Lovelace',
            status: 'active',
          },
          {
            id: '55555555-5555-4555-8555-555555555555',
            organizationId,
            email: 'two@example.test',
            givenName: 'Ada',
            familyName: 'Lovelace',
            status: 'active',
          },
        ],
        total: 2,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      },
    });
    source[0].email = 'changed@example.test';
    expect(result).not.toEqual(expect.objectContaining({ email: 'changed@example.test' }));
    expect(Object.isFrozen(result.kind === 'success' ? result.value.data : [])).toBe(true);
    expect(
      result.kind === 'success' && result.value.data.every((row: unknown) => Object.isFrozen(row)),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(
      /password|internalSecret|emailVerified|lastLoginAt/i,
    );
  });

  it.each([
    ['invalid UUID', [user({ id: 'not-a-uuid' })], { total: 1, page: 1, pageSize: 20 }],
    ['duplicate UUID', [user(), user()], { total: 2, page: 1, pageSize: 20 }],
    [
      'cross-organization row',
      [user({ organizationId: otherOrganizationId })],
      { total: 1, page: 1, pageSize: 20 },
    ],
    ['unsupported status', [user({ status: 'deleted' })], { total: 1, page: 1, pageSize: 20 }],
    [
      'control-bearing text',
      [user({ email: 'bad\u0000@example.test' })],
      { total: 1, page: 1, pageSize: 20 },
    ],
    ['wrong page', [user()], { total: 1, page: 2, pageSize: 20 }],
    ['wrong page size', [user()], { total: 1, page: 1, pageSize: 100 }],
    ['wrong total-pages formula', [user()], { total: 1, page: 1, pageSize: 20, totalPages: 2 }],
    ['inconsistent total', [user()], { total: 0, page: 1, pageSize: 20 }],
    [
      'too many rows',
      Array.from({ length: 21 }, (_, index) =>
        user({ id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` }),
      ),
      { total: 21, page: 1, pageSize: 20 },
    ],
  ])('should reject the whole page for %s', async (_label, rows, envelope) => {
    // Any invalid row or pagination contradiction rejects the complete projection without leaking raw values.
    const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
    const list = vi.fn().mockResolvedValue({
      data: rows,
      totalPages: Math.ceil(Number(envelope.total) / Number(envelope.pageSize)),
      ...envelope,
    });
    const operations = createAdminUserOperations(() => domain({ list }));

    const result = await operations.list(organizationId, { page: 1 });

    expect(result).toEqual({ kind: 'failure', failure: 'invalid-response' });
    expect(JSON.stringify(result)).not.toMatch(/bad|deleted|otherOrganizationId/i);
    expect(list).toHaveBeenCalledOnce();
  });

  it.each([
    ['zero matching users', { data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }, 1],
    [
      'an empty page after a concurrent shrink',
      { data: [], total: 21, page: 3, pageSize: 20, totalPages: 2 },
      3,
    ],
  ])('should accept %s', async (_label, response, page) => {
    // Empty pages are truthful when the total is zero or the requested page became out of range after a shrink.
    const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
    const operations = createAdminUserOperations(() =>
      domain({ list: vi.fn().mockResolvedValue(response) }),
    );

    await expect(operations.list(organizationId, { page })).resolves.toEqual({
      kind: 'success',
      value: {
        data: [],
        total: response.total,
        page,
        pageSize: 20,
        totalPages: response.totalPages,
      },
    });
  });
});

describe('user detail and history projections', () => {
  it('should return the exact detail allowlist with the ETag only in its wrapper', async () => {
    // Detail exposes approved identity, profile, address, state, login-summary, and timestamp fields only.
    const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
    const get = vi.fn().mockResolvedValue({ data: user(), etag: '"user-v1"' });
    const operations = createAdminUserOperations(() => domain({ get }));

    const result = await operations.get(organizationId, userId);

    expect(result).toEqual({
      kind: 'success',
      value: {
        detail: {
          id: userId,
          organizationId,
          email: 'person@example.test',
          emailVerified: true,
          hasPassword: true,
          givenName: 'Ada',
          familyName: 'Lovelace',
          middleName: null,
          nickname: 'Enchantress of Numbers',
          preferredUsername: 'ada',
          profileUrl: 'https://example.test/ada',
          pictureUrl: 'https://example.test/ada.png',
          websiteUrl: 'https://ada.example.test',
          gender: null,
          birthdate: '1815-12-10',
          zoneinfo: 'Europe/London',
          locale: 'en',
          phoneNumber: '+441234567890',
          phoneNumberVerified: true,
          addressStreet: '1 Example Street',
          addressLocality: 'London',
          addressRegion: 'London',
          addressPostalCode: 'N1 1AA',
          addressCountry: 'GB',
          twoFactorEnabled: true,
          status: 'active',
          lastLoginAt: '2026-08-29T10:00:00.000Z',
          loginCount: 12,
          createdAt: '2026-08-01T10:00:00.000Z',
          updatedAt: '2026-08-29T10:00:00.000Z',
        },
        etag: '"user-v1"',
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /passwordChanged|twoFactorMethod|locked|failedLogin|internalSecret/,
    );
  });

  it.each([
    [
      'a cross-organization user',
      { data: user({ organizationId: otherOrganizationId }), etag: '"v1"' },
    ],
    ['an invalid ETag wrapper', { data: user(), etag: { raw: true } }],
    ['an overlong profile URL', { data: user({ profileUrl: 'x'.repeat(2_049) }), etag: '"v1"' }],
    ['an overlong street', { data: user({ addressStreet: 'x'.repeat(501) }), etag: '"v1"' }],
    ['control-bearing profile text', { data: user({ givenName: 'Bad\u0085Name' }), etag: '"v1"' }],
    ['an unsupported status', { data: user({ status: 'deleted' }), etag: '"v1"' }],
    ['a negative login count', { data: user({ loginCount: -1 }), etag: '"v1"' }],
    ['an invalid timestamp', { data: user({ updatedAt: 'not-a-date' }), etag: '"v1"' }],
  ])('should reject detail containing %s', async (_label, response) => {
    // A malformed wrapper or cross-organization entity cannot produce a partial detail view.
    const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
    const operations = createAdminUserOperations(() =>
      domain({ get: vi.fn().mockResolvedValue(response) }),
    );

    await expect(operations.get(organizationId, userId)).resolves.toEqual({
      kind: 'failure',
      failure: 'invalid-response',
    });
  });

  it('should return at most twenty newest-first sanitized history entries and only hasMore', async () => {
    // History drops metadata and cursors, and represents a null actor as System.
    const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
    const getHistory = vi.fn().mockResolvedValue({
      data: [
        {
          id: '66666666-6666-4666-8666-666666666666',
          eventType: 'user.updated',
          actorId,
          metadata: { password: 'hidden' },
          createdAt: '2026-08-29T12:00:00.000Z',
        },
        {
          id: '77777777-7777-4777-8777-777777777777',
          eventType: 'user.created',
          actorId: null,
          metadata: { internal: true },
          createdAt: '2026-08-29T11:00:00.000Z',
        },
      ],
      hasMore: false,
      nextCursor: 'opaque-secret',
    });
    const operations = createAdminUserOperations(() => domain({ getHistory }));

    await expect(operations.getHistory(organizationId, userId)).resolves.toEqual({
      kind: 'success',
      value: {
        entries: [
          { eventType: 'user.updated', actor: actorId, createdAt: '2026-08-29T12:00:00.000Z' },
          { eventType: 'user.created', actor: 'System', createdAt: '2026-08-29T11:00:00.000Z' },
        ],
        hasMore: false,
      },
    });
  });

  it.each([
    [
      'more than twenty entries',
      Array.from({ length: 21 }, (_, index) => ({
        id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        eventType: 'user.updated',
        actorId,
        metadata: null,
        createdAt: `2026-08-29T10:${String(59 - index).padStart(2, '0')}:00.000Z`,
      })),
    ],
    [
      'non-descending timestamps',
      [
        {
          id: '88888888-8888-4888-8888-888888888888',
          eventType: 'user.created',
          actorId,
          metadata: null,
          createdAt: '2026-08-29T10:00:00.000Z',
        },
        {
          id: '99999999-9999-4999-8999-999999999999',
          eventType: 'user.updated',
          actorId,
          metadata: null,
          createdAt: '2026-08-29T11:00:00.000Z',
        },
      ],
    ],
    [
      'an invalid actor',
      [
        {
          id: '88888888-8888-4888-8888-888888888888',
          eventType: 'user.created',
          actorId: 'not-a-uuid',
          metadata: null,
          createdAt: '2026-08-29T10:00:00.000Z',
        },
      ],
    ],
    [
      'an overlong event type',
      [
        {
          id: '88888888-8888-4888-8888-888888888888',
          eventType: 'x'.repeat(256),
          actorId,
          metadata: null,
          createdAt: '2026-08-29T10:00:00.000Z',
        },
      ],
    ],
    [
      'a control-bearing event type',
      [
        {
          id: '88888888-8888-4888-8888-888888888888',
          eventType: 'user.\u0085updated',
          actorId,
          metadata: null,
          createdAt: '2026-08-29T10:00:00.000Z',
        },
      ],
    ],
    [
      'an invalid timestamp',
      [
        {
          id: '88888888-8888-4888-8888-888888888888',
          eventType: 'user.created',
          actorId,
          metadata: null,
          createdAt: 'not-a-date',
        },
      ],
    ],
  ])('should reject all history for %s', async (_label, data) => {
    // Invalid ordering, identifiers, timestamps, or event labels reject the entire history projection.
    const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
    const operations = createAdminUserOperations(() =>
      domain({ getHistory: vi.fn().mockResolvedValue({ data, hasMore: false, nextCursor: null }) }),
    );

    await expect(operations.getHistory(organizationId, userId)).resolves.toEqual({
      kind: 'failure',
      failure: 'invalid-response',
    });
  });
});

describe('invitation preview', () => {
  it('should retain only bounded plain-text preview fields', async () => {
    // Rendered HTML is discarded before the preview reaches application state.
    const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
    const invitePreview = vi
      .fn()
      .mockResolvedValue({
        subject: 'Welcome',
        text: 'Join Porta',
        html: '<script>secret()</script>',
      });
    const operations = createAdminUserOperations(() => domain({ invitePreview }));

    await expect(
      operations.previewInvitation(organizationId, { email: 'person@example.test' }),
    ).resolves.toEqual({
      kind: 'success',
      value: { subject: 'Welcome', text: 'Join Porta' },
    });
    expect(invitePreview).toHaveBeenCalledWith({ organizationId, email: 'person@example.test' });
  });

  it('should accept preview text at the exact local maxima', async () => {
    // Exact bounds remain usable while the HTML field is still discarded.
    const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
    const response = { subject: 's'.repeat(255), text: 't'.repeat(10_000), html: '<b>ignored</b>' };
    const operations = createAdminUserOperations(() =>
      domain({ invitePreview: vi.fn().mockResolvedValue(response) }),
    );

    await expect(
      operations.previewInvitation(organizationId, { email: 'person@example.test' }),
    ).resolves.toEqual({
      kind: 'success',
      value: { subject: response.subject, text: response.text },
    });
  });

  it.each([
    ['overlong subject', { subject: 'x'.repeat(256), text: 'Safe', html: '' }],
    ['overlong text', { subject: 'Safe', text: 'x'.repeat(10_001), html: '' }],
    ['control-bearing subject', { subject: 'Bad\u0000Subject', text: 'Safe', html: '' }],
    ['control-bearing text', { subject: 'Safe', text: 'Bad\u0085Text', html: '' }],
  ])('should reject the whole preview for %s', async (_label, response) => {
    // Unsafe or over-bound plain text cannot produce a partial invitation preview.
    const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
    const operations = createAdminUserOperations(() =>
      domain({ invitePreview: vi.fn().mockResolvedValue(response) }),
    );

    await expect(
      operations.previewInvitation(organizationId, { email: 'person@example.test' }),
    ).resolves.toEqual({ kind: 'failure', failure: 'invalid-response' });
  });
});

describe('user administration input', () => {
  it('should forward only approved create fields and inject the selected organization once', async () => {
    // The boundary owns organization selection and never accepts role, claim, or verification assignment during creation.
    const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
    const create = vi.fn().mockResolvedValue(user());
    const operations = createAdminUserOperations(() => domain({ create }));
    const input = {
      email: 'person@example.test',
      password: 'correct horse',
      passwordConfirmation: 'correct horse',
      givenName: 'Ada',
      familyName: 'Lovelace',
      middleName: 'Byron',
      nickname: 'Ada',
      preferredUsername: 'ada',
      profileUrl: 'https://example.test/profile',
      pictureUrl: 'https://example.test/picture',
      websiteUrl: 'https://example.test',
      gender: 'female',
      birthdate: '1815-12-10',
      zoneinfo: 'Europe/London',
      locale: 'en',
      phoneNumber: '+441234567890',
      address: {
        street: '1 Example Street',
        locality: 'London',
        region: 'London',
        postalCode: 'N1 1AA',
        country: 'GB',
      },
    };

    await operations.create(organizationId, input);

    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith({
      organizationId,
      email: input.email,
      password: input.password,
      givenName: input.givenName,
      familyName: input.familyName,
      middleName: input.middleName,
      nickname: input.nickname,
      preferredUsername: input.preferredUsername,
      profileUrl: input.profileUrl,
      pictureUrl: input.pictureUrl,
      websiteUrl: input.websiteUrl,
      gender: input.gender,
      birthdate: input.birthdate,
      zoneinfo: input.zoneinfo,
      locale: input.locale,
      phoneNumber: input.phoneNumber,
      address: input.address,
    });
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('phoneNumberVerified');
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('roles');
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('claims');
  });

  it('should forward only approved invitation fields without role or claim assignment', async () => {
    // Invitations and previews share a narrow input that cannot pre-assign authorization data.
    const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
    const invite = vi
      .fn()
      .mockResolvedValue({
        userId,
        email: 'person@example.test',
        created: true,
        invitationSent: true,
        expiresAt: '2026-08-31T10:00:00.000Z',
      });
    const operations = createAdminUserOperations(() => domain({ invite }));
    const input = {
      email: 'person@example.test',
      givenName: 'Ada',
      familyName: 'Lovelace',
      locale: 'en',
      personalMessage: 'Welcome',
    };

    await operations.invite(organizationId, input);

    expect(invite).toHaveBeenCalledWith({ organizationId, ...input });
    expect(invite.mock.calls[0]?.[0]).not.toHaveProperty('roles');
    expect(invite.mock.calls[0]?.[0]).not.toHaveProperty('claims');
  });

  it('should accept create and invitation fields at their exact local maxima', async () => {
    // Exact server-aligned limits must not be rejected by local validation.
    const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
    const create = vi.fn().mockResolvedValue(user());
    const invite = vi.fn().mockResolvedValue({
      userId,
      email: 'person@example.test',
      created: true,
      invitationSent: true,
      expiresAt: '2026-08-31T10:00:00.000Z',
    });
    const operations = createAdminUserOperations(() => domain({ create, invite }));
    const urlPrefix = 'https://example.test/';

    await operations.create(organizationId, {
      email: 'person@example.test',
      profileUrl: `${urlPrefix}${'x'.repeat(2_048 - urlPrefix.length)}`,
      address: { street: 's'.repeat(500) },
    });
    await operations.invite(organizationId, {
      email: 'person@example.test',
      givenName: 'g'.repeat(255),
      familyName: 'f'.repeat(255),
      locale: 'l'.repeat(10),
      personalMessage: 'm'.repeat(500),
    });

    expect(create).toHaveBeenCalledOnce();
    expect(invite).toHaveBeenCalledOnce();
  });

  it('should forward the exact mutable update fields and optional ETag without email', async () => {
    // Updates cannot alter identity email and may change only approved mutable profile and address fields.
    const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
    const update = vi.fn().mockResolvedValue(user({ givenName: 'Augusta' }));
    const operations = createAdminUserOperations(() => domain({ update }));
    const input = {
      givenName: 'Augusta',
      familyName: null,
      phoneNumberVerified: true,
      address: { street: null, country: 'GB' },
    };

    await operations.update(organizationId, userId, input, '"user-v1"');

    expect(update).toHaveBeenCalledWith(organizationId, userId, input, '"user-v1"');
    expect(update.mock.calls[0]?.[2]).not.toHaveProperty('email');
    expect(update.mock.calls[0]?.[2]).toHaveProperty('phoneNumberVerified', true);
  });

  it.each([
    ['page below one', 'list', { page: 0 }],
    ['overlong search', 'list', { page: 1, search: 'x'.repeat(256) }],
    ['unsupported status', 'list', { page: 1, status: 'deleted' }],
    ['control-bearing search', 'list', { page: 1, search: 'bad\u0000search' }],
    ['invalid email', 'create', { email: 'not-an-email' }],
    [
      'seven-character password',
      'create',
      { email: 'person@example.test', password: '1234567', passwordConfirmation: '1234567' },
    ],
    [
      '129-character password',
      'create',
      {
        email: 'person@example.test',
        password: 'x'.repeat(129),
        passwordConfirmation: 'x'.repeat(129),
      },
    ],
    [
      'password mismatch',
      'create',
      { email: 'person@example.test', password: 'password1', passwordConfirmation: 'password2' },
    ],
    [
      'overlong URL',
      'create',
      { email: 'person@example.test', profileUrl: `https://example.test/${'x'.repeat(2049)}` },
    ],
    [
      'overlong street',
      'create',
      { email: 'person@example.test', address: { street: 'x'.repeat(501) } },
    ],
    ['empty invite name', 'invite', { email: 'person@example.test', givenName: '' }],
    [
      'overlong invite name',
      'invite',
      { email: 'person@example.test', familyName: 'x'.repeat(256) },
    ],
    ['overlong invite locale', 'invite', { email: 'person@example.test', locale: 'x'.repeat(11) }],
    [
      'overlong personal message',
      'invite',
      { email: 'person@example.test', personalMessage: 'x'.repeat(501) },
    ],
    ['control-bearing profile input', 'update', { givenName: 'Bad\u0085Name' }],
  ])(
    'should reject %s without obtaining or invoking the SDK domain',
    async (_label, operation, input) => {
      // Local validation is complete before provider lookup, so rejected input dispatches nothing.
      const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
      const provider = vi.fn(() => domain());
      const operations = createAdminUserOperations(provider);
      const result =
        operation === 'list'
          ? await operations.list(organizationId, input)
          : operation === 'create'
            ? await operations.create(organizationId, input)
            : operation === 'invite'
              ? await operations.invite(organizationId, input)
              : await operations.update(organizationId, userId, input);

      expect(result).toEqual({ kind: 'failure', failure: 'validation' });
      expect(provider).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['minimum password', '12345678'],
    ['maximum password', 'x'.repeat(128)],
  ])(
    'should accept a %s without retaining password material in the result',
    async (_label, password) => {
      // Password confirmation is local-only and neither password string may enter returned application state.
      const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
      const create = vi.fn().mockResolvedValue(user());
      const operations = createAdminUserOperations(() => domain({ create }));

      const result = await operations.create(organizationId, {
        email: 'person@example.test',
        password,
        passwordConfirmation: password,
      });

      expect(create).toHaveBeenCalledOnce();
      expect(JSON.stringify(result)).not.toContain(password);
      expect(JSON.stringify(result)).not.toMatch(/passwordConfirmation|passwordChangedAt/);
    },
  );
});

describe('fixed user operation outcomes', () => {
  it.each([
    [
      '400 validation',
      new PortaValidationError({ secret: 'validation-body' }),
      { kind: 'failure', failure: 'validation' },
    ],
    [
      '401 authentication',
      new PortaAuthenticationError({ secret: 'authentication-body' }),
      { kind: 'session-invalid' },
    ],
    [
      '403 authorization',
      new PortaForbiddenError({ secret: 'authorization-body' }),
      { kind: 'failure', failure: 'unauthorized' },
    ],
    [
      '404 absence',
      new PortaNotFoundError({ secret: 'not-found-body' }),
      { kind: 'failure', failure: 'not-found' },
    ],
    [
      '409 conflict',
      new PortaConflictError({ secret: 'conflict-body' }),
      { kind: 'failure', failure: 'conflict' },
    ],
    [
      '412 conflict',
      new PortaHttpError(412, 'precondition', { secret: 'etag-body' }),
      { kind: 'failure', failure: 'conflict' },
    ],
    [
      'other client failure',
      new PortaHttpError(429, 'rate limit', { secret: 'rate-body' }),
      { kind: 'failure', failure: 'unavailable' },
    ],
    [
      'server failure',
      new PortaServerError(503, { secret: 'server-body' }),
      { kind: 'failure', failure: 'unavailable' },
    ],
    [
      'transport failure',
      new TypeError('raw network detail'),
      { kind: 'failure', failure: 'unavailable' },
    ],
  ])(
    'should map read %s to a fixed result without raw details',
    async (_label, error, expected) => {
      // Reads distinguish definite HTTP outcomes while hiding bodies, messages, paths, and stacks.
      const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
      const get = vi.fn().mockRejectedValue(error);
      const operations = createAdminUserOperations(() => domain({ get }));

      const result = await operations.get(organizationId, userId);

      expect(result).toEqual(expected);
      expect(JSON.stringify(result)).not.toMatch(/secret|raw|precondition|stack|body/i);
      expect(get).toHaveBeenCalledOnce();
    },
  );

  it('should classify malformed read success as invalid-response', async () => {
    // A resolved SDK call is not success until its complete response projection validates.
    const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
    const operations = createAdminUserOperations(() =>
      domain({ get: vi.fn().mockResolvedValue({ data: { id: userId }, etag: null }) }),
    );

    await expect(operations.get(organizationId, userId)).resolves.toEqual({
      kind: 'failure',
      failure: 'invalid-response',
    });
  });

  it.each([
    [
      '400 validation',
      new PortaValidationError({ secret: true }),
      { kind: 'failure', failure: 'validation' },
    ],
    [
      '401 authentication',
      new PortaAuthenticationError({ secret: true }),
      { kind: 'session-invalid' },
    ],
    [
      '403 authorization',
      new PortaForbiddenError({ secret: true }),
      { kind: 'failure', failure: 'unauthorized' },
    ],
    [
      '404 absence',
      new PortaNotFoundError({ secret: true }),
      { kind: 'failure', failure: 'not-found' },
    ],
    [
      '409 conflict',
      new PortaConflictError({ secret: true }),
      { kind: 'failure', failure: 'conflict' },
    ],
    [
      '412 conflict',
      new PortaHttpError(412, 'precondition', { secret: true }),
      { kind: 'failure', failure: 'conflict' },
    ],
    [
      'other client failure',
      new PortaHttpError(422, 'unprocessable', { secret: true }),
      { kind: 'failure', failure: 'unavailable' },
    ],
    [
      'server failure after dispatch',
      new PortaServerError(500, { secret: true }),
      { kind: 'outcome-unknown' },
    ],
    ['transport failure after dispatch', new TypeError('network'), { kind: 'outcome-unknown' }],
  ])('should invoke a mutation at most once and map %s', async (_label, error, expected) => {
    // A mutation is never replayed; indeterminate post-dispatch failures report an unknown outcome.
    const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
    const suspend = vi.fn().mockRejectedValue(error);
    const operations = createAdminUserOperations(() => domain({ suspend }));

    const result = await operations.suspend(organizationId, userId, 'review');

    expect(result).toEqual(expected);
    expect(JSON.stringify(result)).not.toMatch(/secret|network|unprocessable|precondition/i);
    expect(suspend).toHaveBeenCalledOnce();
  });

  it('should map malformed typed mutation success to outcome-unknown', async () => {
    // A malformed success payload cannot be treated as definite success after the mutation was sent.
    const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
    const invite = vi.fn().mockResolvedValue({ userId: 'bad-id', email: 'person@example.test' });
    const operations = createAdminUserOperations(() => domain({ invite }));

    await expect(
      operations.invite(organizationId, { email: 'person@example.test' }),
    ).resolves.toEqual({ kind: 'outcome-unknown' });
    expect(invite).toHaveBeenCalledOnce();
  });

  it('should confirm a password locally and dispatch only the password once', async () => {
    // Password confirmation never crosses the SDK boundary or enters returned state.
    const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
    const setPassword = vi.fn().mockResolvedValue(undefined);
    const operations = createAdminUserOperations(() => domain({ setPassword }));

    const result = await operations.setPassword(organizationId, userId, {
      password: '12345678',
      passwordConfirmation: '12345678',
    });

    expect(result).toEqual({ kind: 'success' });
    expect(setPassword).toHaveBeenCalledOnce();
    expect(setPassword).toHaveBeenCalledWith(organizationId, userId, { password: '12345678' });
    expect(JSON.stringify(result)).not.toContain('12345678');
  });

  it.each([
    'clearPassword',
    'verifyEmail',
    'suspend',
    'unsuspend',
    'lock',
    'unlock',
    'deactivate',
    'reactivate',
    'purge',
  ])('should publish success for a successful void %s action', async (method) => {
    // Successful lifecycle and credential actions produce one fixed result and one organization-scoped SDK call.
    const { createAdminUserOperations } = await import('../../src/admin/user-service.js');
    const invocation = vi.fn().mockResolvedValue(method === 'purge' ? {} : undefined);
    const operations = createAdminUserOperations(() => domain({ [method]: invocation }));

    let result;
    switch (method) {
      case 'clearPassword':
        result = await operations.clearPassword(organizationId, userId);
        break;
      case 'verifyEmail':
        result = await operations.verifyEmail(organizationId, userId);
        break;
      case 'suspend':
        result = await operations.suspend(organizationId, userId, 'review');
        break;
      case 'unsuspend':
        result = await operations.unsuspend(organizationId, userId);
        break;
      case 'lock':
        result = await operations.lock(organizationId, userId, 'security review');
        break;
      case 'unlock':
        result = await operations.unlock(organizationId, userId);
        break;
      case 'deactivate':
        result = await operations.deactivate(organizationId, userId);
        break;
      case 'reactivate':
        result = await operations.reactivate(organizationId, userId);
        break;
      case 'purge':
        result = await operations.purge(organizationId, userId);
        break;
    }

    expect(result).toEqual({ kind: 'success' });
    expect(invocation).toHaveBeenCalledOnce();
    expect(invocation.mock.calls[0]?.[0]).toBe(organizationId);
  });
});
