/** Focused implementation edges for sanitized organization operations. */

import { PortaAuthenticationError, PortaForbiddenError } from '@portaidentity/sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  createAdminOrganizationOperations,
  validateOrganizationContext,
} from '../../src/admin/organization-service.js';

/** Creates a complete SDK-shaped organization for implementation diagnostics. */
function organization(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'München Organization',
    slug: 'munchen-organization',
    status: 'active',
    isSuperAdmin: false,
    defaultLocale: 'de',
    ...overrides,
  };
}

describe('organization context validation', () => {
  it.each([
    null,
    [],
    organization({ id: '11111111111141118111111111111111' }),
    organization({ slug: 'ab' }),
    organization({ slug: `a${'b'.repeat(99)}z` }),
    organization({ name: 'x'.repeat(256) }),
  ])('rejects a malformed context without throwing', (value) => {
    expect(validateOrganizationContext(value)).toBeUndefined();
  });

  it('retains valid Unicode while removing every unneeded SDK field', () => {
    expect(validateOrganizationContext(organization())).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'München Organization',
      slug: 'munchen-organization',
      status: 'active',
    });
  });
});

describe('organization operation diagnostics', () => {
  it('maps an invalid list container and a factory failure to fixed outcomes', async () => {
    const invalidList = createAdminOrganizationOperations(() => ({
      listAll: vi.fn().mockResolvedValue({ data: [] }),
      create: vi.fn(),
    }));
    const failedFactory = createAdminOrganizationOperations(() => {
      throw new Error('private client setup detail');
    });

    await expect(invalidList.listAll()).resolves.toEqual({
      kind: 'failure',
      failure: 'invalid-response',
    });
    await expect(failedFactory.listAll()).resolves.toEqual({
      kind: 'failure',
      failure: 'unavailable',
    });
  });

  it('forwards non-empty supported create fields and rejects a malformed response', async () => {
    const create = vi.fn().mockResolvedValue(organization({ status: 'unknown' }));
    const operations = createAdminOrganizationOperations(() => ({ listAll: vi.fn(), create }));

    await expect(
      operations.create({ name: 'New Organization', slug: 'new-org', defaultLocale: 'nl' }),
    ).resolves.toEqual({ kind: 'failure', failure: 'invalid-response' });
    expect(create).toHaveBeenCalledWith({
      name: 'New Organization',
      slug: 'new-org',
      defaultLocale: 'nl',
    });
  });

  it.each([
    [new PortaAuthenticationError(), { kind: 'session-invalid' }],
    [new PortaForbiddenError(), { kind: 'failure', failure: 'unauthorized' }],
  ])('maps reconciliation failures without exposing the thrown error', async (error, expected) => {
    const listAll = vi.fn().mockRejectedValue(error);
    const operations = createAdminOrganizationOperations(() => ({ listAll, create: vi.fn() }));

    await expect(operations.reconcile('11111111-1111-4111-8111-111111111111')).resolves.toEqual(
      expected,
    );
    expect(listAll).toHaveBeenCalledOnce();
  });

  it('prefers generic invalid-response when matching and unrelated rows are malformed', async () => {
    const selectedId = '11111111-1111-4111-8111-111111111111';
    const operations = createAdminOrganizationOperations(() => ({
      listAll: vi
        .fn()
        .mockResolvedValue([
          organization({ id: selectedId, name: 'bad\u0000name' }),
          organization({ id: 'not-a-uuid' }),
        ]),
      create: vi.fn(),
    }));

    await expect(operations.reconcile(selectedId)).resolves.toEqual({
      kind: 'failure',
      failure: 'invalid-response',
    });
  });
});
