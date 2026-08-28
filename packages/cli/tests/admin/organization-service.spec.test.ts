/**
 * Observable specifications for the CLI's organization administration boundary.
 */

import {
  PortaAuthenticationError,
  PortaConflictError,
  PortaForbiddenError,
  PortaHttpError,
  PortaRateLimitError,
  PortaServerError,
  PortaValidationError,
} from '@portaidentity/sdk';
import { describe, expect, it, vi } from 'vitest';

const organizations = [
  organization({
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Archived Organization',
    slug: 'archived-organization',
    status: 'archived',
  }),
  organization({
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Active Organization',
    slug: 'active-organization',
    status: 'active',
  }),
  organization({
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Suspended Organization',
    slug: 'suspended-organization',
    status: 'suspended',
  }),
];

/** Builds a complete SDK-shaped organization while allowing one test-specific variation. */
function organization(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Example Organization',
    slug: 'example-organization',
    status: 'active',
    isSuperAdmin: false,
    brandingLogoUrl: null,
    brandingFaviconUrl: null,
    brandingPrimaryColor: null,
    brandingCompanyName: null,
    brandingCustomCss: null,
    defaultLocale: 'en',
    twoFactorPolicy: 'optional',
    defaultLoginMethods: ['password'],
    createdAt: '2026-08-28T10:00:00.000Z',
    updatedAt: '2026-08-28T10:00:00.000Z',
    internalNote: 'must-not-cross-the-boundary',
    ...overrides,
  };
}

describe('organization listing', () => {
  it('should list every valid organization once in server order using only context fields', async () => {
    // Listing uses the SDK's all-items operation once and preserves the server's order without leaking extra fields.
    const { createAdminOrganizationOperations } =
      await import('../../src/admin/organization-service.js');
    const listAll = vi.fn().mockResolvedValue(organizations);
    const operations = createAdminOrganizationOperations(() => ({
      listAll,
      create: vi.fn(),
    }));

    await expect(operations.listAll()).resolves.toEqual({
      kind: 'success',
      value: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Archived Organization',
          slug: 'archived-organization',
          status: 'archived',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Active Organization',
          slug: 'active-organization',
          status: 'active',
        },
        {
          id: '33333333-3333-4333-8333-333333333333',
          name: 'Suspended Organization',
          slug: 'suspended-organization',
          status: 'suspended',
        },
      ],
    });
    expect(listAll).toHaveBeenCalledOnce();
    expect(listAll).toHaveBeenCalledWith();
  });

  it.each([
    ['invalid UUID', { id: 'not-a-uuid' }],
    ['invalid slug', { slug: 'Invalid_Slug' }],
    ['empty name', { name: '' }],
    ['invalid status', { status: 'deleted' }],
    ['overlong server-bound value', { name: 'x'.repeat(256) }],
    ['ASCII control', { name: 'Unsafe\u0000Name' }],
    ['C1 control', { name: 'Unsafe\u0085Name' }],
  ])('should reject the whole list for a row with an %s', async (_label, invalidField) => {
    // One malformed row invalidates the complete response, so no partial list or raw server value reaches the app.
    const { createAdminOrganizationOperations } =
      await import('../../src/admin/organization-service.js');
    const listAll = vi
      .fn()
      .mockResolvedValue([organizations[0], organization(invalidField), organizations[2]]);
    const operations = createAdminOrganizationOperations(() => ({
      listAll,
      create: vi.fn(),
    }));

    const result = await operations.listAll();

    expect(result).toEqual({ kind: 'failure', failure: 'invalid-response' });
    expect(JSON.stringify(result)).not.toContain('Unsafe');
    expect(JSON.stringify(result)).not.toContain('not-a-uuid');
    expect(listAll).toHaveBeenCalledOnce();
  });
});

describe('organization creation', () => {
  it('should omit empty optional slug and locale before creating an organization', async () => {
    // Empty optional form values are omitted so the server receives only the required organization name.
    const { createAdminOrganizationOperations } =
      await import('../../src/admin/organization-service.js');
    const create = vi.fn().mockResolvedValue(organizations[1]);
    const operations = createAdminOrganizationOperations(() => ({
      listAll: vi.fn(),
      create,
    }));

    await expect(
      operations.create({ name: 'Active Organization', slug: '', defaultLocale: '' }),
    ).resolves.toEqual({
      kind: 'success',
      value: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Active Organization',
        slug: 'active-organization',
        status: 'active',
      },
    });
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith({ name: 'Active Organization' });
  });

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
      '409 conflict',
      new PortaConflictError({ secret: 'conflict-body' }),
      { kind: 'failure', failure: 'conflict' },
    ],
    [
      '429 rate limit',
      new PortaRateLimitError({ secret: 'rate-limit-body' }, 30),
      { kind: 'failure', failure: 'unavailable' },
    ],
    [
      'server failure',
      new PortaServerError(503, { secret: 'server-body' }),
      { kind: 'failure', failure: 'unavailable' },
    ],
    [
      'unclassified HTTP failure',
      new PortaHttpError(418, 'raw HTTP message', { secret: 'http-body' }),
      { kind: 'failure', failure: 'unavailable' },
    ],
    [
      'unclassified failure',
      Object.assign(new Error('raw stack message'), { path: '/private/path' }),
      { kind: 'failure', failure: 'unavailable' },
    ],
  ])('should map a %s without exposing raw SDK details', async (_label, error, expected) => {
    // SDK failures map to fixed application outcomes without retrying or exposing messages, bodies, headers, paths, or stacks.
    const { createAdminOrganizationOperations } =
      await import('../../src/admin/organization-service.js');
    const create = vi.fn().mockRejectedValue(error);
    const operations = createAdminOrganizationOperations(() => ({
      listAll: vi.fn(),
      create,
    }));

    const result = await operations.create({ name: 'New Organization' });

    expect(result).toEqual(expected);
    expect(JSON.stringify(result)).not.toMatch(/secret|raw|private|stack|header/i);
    expect(create).toHaveBeenCalledOnce();
  });
});

describe('selected organization reconciliation', () => {
  it('should atomically replace the selection with a changed valid matching organization', async () => {
    // A valid matching row replaces the selected projection as one sanitized value.
    const { createAdminOrganizationOperations } =
      await import('../../src/admin/organization-service.js');
    const changed = organization({
      id: organizations[1].id,
      name: 'Renamed Organization',
      slug: 'renamed-organization',
      status: 'suspended',
    });
    const operations = createAdminOrganizationOperations(() => ({
      listAll: vi.fn().mockResolvedValue([changed]),
      create: vi.fn(),
    }));

    await expect(operations.reconcile(String(organizations[1].id))).resolves.toEqual({
      kind: 'match',
      organization: {
        id: organizations[1].id,
        name: 'Renamed Organization',
        slug: 'renamed-organization',
        status: 'suspended',
      },
    });
  });

  it('should distinguish proven absence from a malformed matching row', async () => {
    // Reconciliation reports absence separately from a selected row whose server data is malformed.
    const { createAdminOrganizationOperations } =
      await import('../../src/admin/organization-service.js');
    const selectedId = '55555555-5555-4555-8555-555555555555';
    const absentOperations = createAdminOrganizationOperations(() => ({
      listAll: vi.fn().mockResolvedValue(organizations),
      create: vi.fn(),
    }));
    const invalidOperations = createAdminOrganizationOperations(() => ({
      listAll: vi.fn().mockResolvedValue([organization({ id: selectedId, name: 'Bad\u0000Name' })]),
      create: vi.fn(),
    }));

    await expect(absentOperations.reconcile(selectedId)).resolves.toEqual({ kind: 'absent' });
    await expect(invalidOperations.reconcile(selectedId)).resolves.toEqual({
      kind: 'matching-invalid',
    });
  });

  it.each([
    [
      'duplicate matching UUID rows',
      [
        organization({ id: '66666666-6666-4666-8666-666666666666' }),
        organization({ id: '66666666-6666-4666-8666-666666666666', name: 'Duplicate' }),
      ],
      '66666666-6666-4666-8666-666666666666',
    ],
    [
      'a malformed unrelated row',
      [organizations[0], organization({ id: 'not-a-uuid' })],
      String(organizations[0].id),
    ],
  ])('should preserve selection with invalid-response for %s', async (_label, rows, selectedId) => {
    // Ambiguous or unrelated malformed list data produces one generic failure and no replacement selection.
    const { createAdminOrganizationOperations } =
      await import('../../src/admin/organization-service.js');
    const listAll = vi.fn().mockResolvedValue(rows);
    const operations = createAdminOrganizationOperations(() => ({ listAll, create: vi.fn() }));

    const result = await operations.reconcile(selectedId);

    expect(result).toEqual({ kind: 'failure', failure: 'invalid-response' });
    expect(JSON.stringify(result)).not.toContain('not-a-uuid');
    expect(listAll).toHaveBeenCalledOnce();
  });

  it('should map a failure before listAll returns to unavailable without retrying', async () => {
    // The unchanged SDK cannot distinguish an invalid envelope from an early list failure, so reconciliation reports unavailable.
    const { createAdminOrganizationOperations } =
      await import('../../src/admin/organization-service.js');
    const listAll = vi.fn().mockRejectedValue(new Error('raw list failure'));
    const operations = createAdminOrganizationOperations(() => ({ listAll, create: vi.fn() }));

    const result = await operations.reconcile('77777777-7777-4777-8777-777777777777');

    expect(result).toEqual({ kind: 'failure', failure: 'unavailable' });
    expect(JSON.stringify(result)).not.toContain('raw list failure');
    expect(listAll).toHaveBeenCalledOnce();
  });
});
