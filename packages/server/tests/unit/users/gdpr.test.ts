/** Unit tests for the retained user data export service. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../../../src/users/types.js';

const mockQuery = vi.fn();

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(() => ({ query: mockQuery })),
}));

import { exportUserData } from '../../../src/users/gdpr.js';

/** Create a representative user for export assertions. */
function createTestUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-123',
    organizationId: 'org-456',
    email: 'john@example.com',
    emailVerified: true,
    hasPassword: true,
    passwordChangedAt: null,
    givenName: 'John',
    familyName: 'Doe',
    middleName: null,
    nickname: null,
    preferredUsername: null,
    profileUrl: null,
    pictureUrl: null,
    websiteUrl: null,
    gender: null,
    birthdate: null,
    zoneinfo: null,
    locale: 'en',
    phoneNumber: '+1234567890',
    phoneNumberVerified: false,
    addressStreet: null,
    addressLocality: null,
    addressRegion: null,
    addressPostalCode: null,
    addressCountry: null,
    status: 'active',
    loginCount: 5,
    lastLoginAt: new Date('2026-04-20T10:00:00Z'),
    failedLoginCount: 0,
    lastFailedLoginAt: null,
    twoFactorEnabled: false,
    twoFactorMethod: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-04-20T10:00:00Z'),
    ...overrides,
  };
}

/** Install the five query results consumed by exportUserData. */
function mockExportQueries(populated = false): void {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ id: 'org-456', name: 'Acme', slug: 'acme' }] })
    .mockResolvedValueOnce({
      rows: populated
        ? [
            {
              role_id: 'role-1',
              name: 'Admin',
              slug: 'admin',
              application_id: 'app-1',
              created_at: '2026-01-15',
            },
          ]
        : [],
    })
    .mockResolvedValueOnce({
      rows: populated
        ? [{ claim_name: 'department', value: 'Engineering', application_id: 'app-1' }]
        : [],
    })
    .mockResolvedValueOnce({
      rows: populated
        ? [
            {
              id: 'audit-1',
              event_type: 'user.login',
              event_category: 'auth',
              description: 'Login',
              created_at: '2026-04-20',
            },
          ]
        : [],
    })
    .mockResolvedValueOnce({ rows: [{ count: populated ? '2' : '0' }] });
}

describe('user data export', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes related role, claim, audit, and session summaries', async () => {
    mockExportQueries(true);
    const result = await exportUserData(createTestUser());
    expect(result.organization).toEqual({ id: 'org-456', name: 'Acme', slug: 'acme' });
    expect(result.roles).toHaveLength(1);
    expect(result.customClaims).toHaveLength(1);
    expect(result.auditLog).toHaveLength(1);
    expect(result.oidcSessions).toBe(2);
  });

  it('exposes enrollment state without two-factor secrets', async () => {
    mockExportQueries();
    const result = await exportUserData(
      createTestUser({ twoFactorEnabled: true, twoFactorMethod: 'totp' }),
    );
    expect(result.twoFactor).toEqual({ enabled: true, method: 'totp' });
    expect(JSON.stringify(result)).not.toMatch(/encrypted_secret|recovery_code|totp_secret/);
  });

  it('returns empty related collections when the user has none', async () => {
    mockExportQueries();
    const result = await exportUserData(createTestUser());
    expect(result.roles).toEqual([]);
    expect(result.customClaims).toEqual([]);
    expect(result.auditLog).toEqual([]);
    expect(result.oidcSessions).toBe(0);
  });

  it('serializes user dates as ISO strings', async () => {
    mockExportQueries();
    const result = await exportUserData(createTestUser());
    expect(result.user.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(result.user.lastLoginAt).toBe('2026-04-20T10:00:00.000Z');
  });
});
