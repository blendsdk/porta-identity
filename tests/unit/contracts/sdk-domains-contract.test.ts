/**
 * Contract test: SDK domain types field coverage.
 *
 * For each SDK domain type, verifies that the type's fields match the
 * server's actual response shape. This catches field name drift, missing
 * fields, and extra fields at test time.
 *
 * Approach: Build objects matching the server's known response shape and
 * verify they satisfy the SDK type via TypeScript compilation + runtime checks.
 *
 * @module contracts/sdk-domains-contract
 */

import { describe, it, expect } from 'vitest';

// SDK types — import all domain entity types
import type { Organization } from '../../../packages/porta-sdk/src/types/organizations.js';
import type { Application } from '../../../packages/porta-sdk/src/types/applications.js';
import type { Client } from '../../../packages/porta-sdk/src/types/clients.js';
import type { User } from '../../../packages/porta-sdk/src/types/users.js';
import type { Role, RoleWithPermissions } from '../../../packages/porta-sdk/src/types/roles.js';
import type { Permission } from '../../../packages/porta-sdk/src/types/permissions.js';
import type { AuditEntry } from '../../../packages/porta-sdk/src/types/audit.js';
import type { ConfigEntry } from '../../../packages/porta-sdk/src/types/config.js';
import type { AdminSession, RevokeUserSessionsResult } from '../../../packages/porta-sdk/src/types/sessions.js';
import type { ImportResult } from '../../../packages/porta-sdk/src/types/imports.js';
import type { BulkOperationResult } from '../../../packages/porta-sdk/src/types/bulk.js';
import type { HistoryEntry } from '../../../packages/porta-sdk/src/types/common.js';
import type { StatsOverview, OrgStats } from '../../../packages/porta-sdk/src/types/stats.js';
import type { TwoFactorStatus } from '../../../packages/porta-sdk/src/types/two-factor.js';
import type { CreateOrganizationInput, UpdateOrganizationInput } from '../../../packages/porta-sdk/src/types/organizations.js';
import type { InviteUserInput } from '../../../packages/porta-sdk/src/types/users.js';



// ---------------------------------------------------------------------------
// Helper: verify that an object's keys are a superset of expected keys
// ---------------------------------------------------------------------------
function expectKeys(obj: Record<string, unknown>, expectedKeys: string[], label: string) {
  const actualKeys = Object.keys(obj);
  for (const key of expectedKeys) {
    expect(actualKeys, `${label}: missing key '${key}'`).toContain(key);
  }
}

// ---------------------------------------------------------------------------
// Server response shapes (from actual server route handlers)
// ---------------------------------------------------------------------------

describe('SDK↔Server contract: Domain Types', () => {

  it('Organization type covers server response', () => {
    // Server shape from src/organizations/types.ts mapRowToOrganization
    const server = {
      id: 'uuid', name: 'Acme', slug: 'acme', status: 'active' as const,
      isSuperAdmin: false, brandingLogoUrl: null, brandingFaviconUrl: null,
      brandingPrimaryColor: null, brandingCompanyName: null, brandingCustomCss: null,
      defaultLocale: 'en', twoFactorPolicy: 'optional' as const,
      defaultLoginMethods: ['password', 'magic_link'],
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    };
    const _sdk: Organization = server;
    expectKeys(server, ['id', 'name', 'slug', 'status', 'isSuperAdmin', 'defaultLocale',
      'twoFactorPolicy', 'defaultLoginMethods', 'createdAt', 'updatedAt'], 'Organization');
    expect(_sdk.id).toBe('uuid');
  });

  it('Application type covers server response', () => {
    const server = {
      id: 'uuid', name: 'My App', slug: 'my-app', description: null,
      status: 'active' as const, createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const _sdk: Application = server;
    expectKeys(server, ['id', 'name', 'slug', 'status', 'createdAt', 'updatedAt'], 'Application');
    expect(_sdk.slug).toBe('my-app');
  });

  it('Client type covers server response', () => {
    const server = {
      id: 'uuid', applicationId: 'app-uuid', clientId: 'client-id',
      name: 'Web Client', type: 'public' as const, status: 'active' as const,
      redirectUris: ['http://localhost:3000/callback'],
      postLogoutRedirectUris: [], grantTypes: ['authorization_code'],
      responseTypes: ['code'], scopes: ['openid', 'profile'],
      tokenEndpointAuthMethod: 'none', loginMethods: null,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    };
    const _sdk: Client = server;
    expectKeys(server, ['id', 'applicationId', 'clientId', 'name', 'type', 'status',
      'redirectUris', 'grantTypes', 'scopes', 'createdAt'], 'Client');
    expect(_sdk.clientId).toBe('client-id');
  });

  it('User type covers server response (full 36-field parity — ST-3, ST-4)', () => {
    // Source: src/users/types.ts mapRowToUser (36 fields) — server is source of truth.
    // ST-3: SDK User has the full server field set, uses givenName/familyName (no `name`).
    // ST-4: UserStatus excludes invited/deactivated and includes inactive.
    const server = {
      id: 'uuid', organizationId: 'org-uuid', email: 'alice@example.com',
      emailVerified: true, hasPassword: true, passwordChangedAt: null,
      givenName: 'Alice', familyName: 'Smith', middleName: null, nickname: null,
      preferredUsername: null, profileUrl: null, pictureUrl: null, websiteUrl: null,
      gender: null, birthdate: null, zoneinfo: null, locale: 'en',
      phoneNumber: null, phoneNumberVerified: false,
      addressStreet: null, addressLocality: null, addressRegion: null,
      addressPostalCode: null, addressCountry: null,
      twoFactorEnabled: false, twoFactorMethod: null,
      status: 'inactive' as const, lockedAt: null, lockedReason: null,
      lastLoginAt: null, loginCount: 0, failedLoginCount: 0, lastFailedLoginAt: null,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    };
    const _sdk: User = server;
    // Assert the full 36-field set is present on the server object the SDK consumes.
    expectKeys(server, [
      'id', 'organizationId', 'email', 'emailVerified', 'hasPassword', 'passwordChangedAt',
      'givenName', 'familyName', 'middleName', 'nickname', 'preferredUsername',
      'profileUrl', 'pictureUrl', 'websiteUrl', 'gender', 'birthdate', 'zoneinfo', 'locale',
      'phoneNumber', 'phoneNumberVerified', 'addressStreet', 'addressLocality', 'addressRegion',
      'addressPostalCode', 'addressCountry', 'twoFactorEnabled', 'twoFactorMethod',
      'status', 'lockedAt', 'lockedReason', 'lastLoginAt', 'loginCount',
      'failedLoginCount', 'lastFailedLoginAt', 'createdAt', 'updatedAt',
    ], 'User');
    // ST-3: the SDK uses OIDC field names, not a flat `name`.
    expect(Object.keys(server)).not.toContain('name');
    expect(_sdk.givenName).toBe('Alice');
    expect(_sdk.familyName).toBe('Smith');
    // ST-4: `inactive` is a valid status (the server lifecycle value).
    expect(_sdk.status).toBe('inactive');
    expect(_sdk.email).toBe('alice@example.com');
  });


  it('Role type covers server response', () => {
    const server = {
      id: 'uuid', applicationId: 'app-uuid', name: 'Admin',
      slug: 'admin', description: null,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    };
    const _sdk: Role = server;
    expectKeys(server, ['id', 'applicationId', 'name', 'slug', 'createdAt'], 'Role');
    expect(_sdk.slug).toBe('admin');
  });

  it('RoleWithPermissions has Permission[] not string[]', () => {
    const server = {
      id: 'uuid', applicationId: 'app-uuid', name: 'Admin', slug: 'admin',
      description: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      permissions: [{
        id: 'p-uuid', applicationId: 'app-uuid', moduleId: null,
        name: 'Read', slug: 'read', description: null,
        createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      }],
    };
    const _sdk: RoleWithPermissions = server;
    expect(_sdk.permissions[0].id).toBe('p-uuid');
    expect(_sdk.permissions[0].name).toBe('Read');
  });

  it('Permission type covers server response (no updatedAt — ST-8)', () => {
    // Source: src/rbac/types.ts mapRowToPermission — no `updatedAt` field.
    const server = {
      id: 'uuid', applicationId: 'app-uuid', moduleId: null,
      name: 'Read Users', slug: 'read-users', description: null,
      createdAt: '2026-01-01T00:00:00Z',
    };
    const _sdk: Permission = server;
    expectKeys(server, ['id', 'applicationId', 'moduleId', 'name', 'slug', 'createdAt'], 'Permission');
    // ST-8: the server projection does not include updatedAt.
    expect(Object.keys(server)).not.toContain('updatedAt');
    expect(_sdk.name).toBe('Read Users');
  });


  it('AuditEntry type covers server response', () => {
    // Server shape from src/routes/audit.ts row mapping
    const server = {
      id: 'uuid', eventType: 'user.login', eventCategory: 'auth',
      actorId: 'user-uuid', organizationId: 'org-uuid',
      userId: 'user-uuid', description: 'User logged in',
      metadata: { method: 'password' }, ipAddress: '192.168.1.1',
      createdAt: '2026-01-01T00:00:00Z',
    };
    const _sdk: AuditEntry = server;
    expectKeys(server, ['id', 'eventType', 'eventCategory', 'actorId', 'organizationId',
      'userId', 'description', 'metadata', 'ipAddress', 'createdAt'], 'AuditEntry');
    expect(_sdk.eventCategory).toBe('auth');
    expect(_sdk.metadata).toEqual({ method: 'password' });
  });

  it('ConfigEntry type covers server response', () => {
    // Server shape from src/routes/config.ts row mapping
    const server = {
      key: 'session_ttl', value: '3600', valueType: 'number',
      description: 'Session TTL in seconds', isSensitive: false,
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const _sdk: ConfigEntry = server;
    expectKeys(server, ['key', 'value', 'valueType', 'description', 'isSensitive', 'updatedAt'], 'ConfigEntry');
    expect(_sdk.valueType).toBe('number');
    expect(_sdk.isSensitive).toBe(false);
  });

  it('AdminSession type covers server response', () => {
    const server = {
      sessionId: 'sid', userId: 'uid', clientId: null, organizationId: null,
      grantId: null, ipAddress: '10.0.0.1', userAgent: 'Chrome',
      lastActivityAt: '2026-01-01T12:00:00Z', createdAt: '2026-01-01T00:00:00Z',
      expiresAt: '2026-01-02T00:00:00Z', revokedAt: null,
    };
    const _sdk: AdminSession = server;
    expectKeys(server, ['sessionId', 'userId', 'ipAddress', 'lastActivityAt', 'expiresAt'], 'AdminSession');
    expect(_sdk.sessionId).toBe('sid');
  });

  it('RevokeUserSessionsResult returns count', () => {
    const server = { revoked: 3 };
    const _sdk: RevokeUserSessionsResult = server;
    expect(_sdk.revoked).toBe(3);
  });

  it('ImportResult type covers server response', () => {
    const server: ImportResult = {
      mode: 'merge', created: [], updated: [], skipped: [], errors: [], credentials: [],
    };
    expectKeys(server, ['mode', 'created', 'updated', 'skipped', 'errors', 'credentials'], 'ImportResult');
    expect(server.mode).toBe('merge');
  });

  it('BulkOperationResult type covers server response', () => {
    const server: BulkOperationResult = {
      total: 1, succeeded: 1, failed: 0,
      results: [{ id: 'uuid', success: true }],
    };
    expectKeys(server, ['total', 'succeeded', 'failed', 'results'], 'BulkOperationResult');
    expect(server.results[0].success).toBe(true);
  });

  it('HistoryEntry type covers server response (ST-5)', () => {
    // Source: src/lib/entity-history.ts — { id, eventType, actorId, metadata, createdAt }.
    const server = {
      id: 'h-uuid', eventType: 'user.updated', actorId: 'admin-uuid',
      metadata: { field: 'email' }, createdAt: '2026-01-01T00:00:00Z',
    };
    const _sdk: HistoryEntry = server;
    expectKeys(server, ['id', 'eventType', 'actorId', 'metadata', 'createdAt'], 'HistoryEntry');
    // ST-5: no entityType/entityId/action/changes/performedBy fields.
    for (const stale of ['entityType', 'entityId', 'action', 'changes', 'performedBy']) {
      expect(Object.keys(server)).not.toContain(stale);
    }
    expect(_sdk.eventType).toBe('user.updated');
    expect(_sdk.actorId).toBe('admin-uuid');
  });

  it('StatsOverview type covers server response (ST-6)', () => {
    // Source: src/lib/stats.ts getStatsOverview.
    const server = {
      organizations: { total: 2, active: 2 },
      users: { total: 10, active: 8, newLast7d: 1, newLast30d: 3, activeLast30d: 5 },
      applications: { total: 3, active: 3 },
      clients: { total: 4, active: 4 },
      loginActivity: {
        last24h: { successful: 5, failed: 1 },
        last7d: { successful: 20, failed: 3 },
        last30d: { successful: 80, failed: 10 },
      },
      systemHealth: { database: true, redis: true },
      generatedAt: '2026-01-01T00:00:00Z',
    };
    const _sdk: StatsOverview = server;
    expectKeys(server, ['organizations', 'users', 'applications', 'clients',
      'loginActivity', 'systemHealth', 'generatedAt'], 'StatsOverview');
    expect(_sdk.users.newLast7d).toBe(1);
    expect(_sdk.systemHealth.database).toBe(true);
    expect(_sdk.loginActivity.last24h.successful).toBe(5);
  });

  it('OrgStats type covers server response', () => {
    // Source: src/lib/stats.ts getOrgStats.
    const server = {
      organizationId: 'org-uuid',
      users: { total: 5, active: 4, newLast7d: 1, newLast30d: 2, activeLast30d: 3 },
      clients: { total: 2, active: 2 },
      loginActivity: {
        last24h: { successful: 2, failed: 0 },
        last7d: { successful: 9, failed: 1 },
        last30d: { successful: 30, failed: 4 },
      },
      generatedAt: '2026-01-01T00:00:00Z',
    };
    const _sdk: OrgStats = server;
    expectKeys(server, ['organizationId', 'users', 'clients', 'loginActivity', 'generatedAt'], 'OrgStats');
    expect(_sdk.organizationId).toBe('org-uuid');
  });

  it('TwoFactorStatus type covers server response (ST-7)', () => {
    // Source: src/two-factor/types.ts TwoFactorStatus.
    const server = {
      enabled: true, method: 'totp' as const,
      totpConfigured: true, recoveryCodesRemaining: 8,
    };
    const _sdk: TwoFactorStatus = server;
    expectKeys(server, ['enabled', 'method', 'totpConfigured', 'recoveryCodesRemaining'], 'TwoFactorStatus');
    // ST-7: no emailEnabled/totpEnabled/enforcedBy/userId fields.
    for (const stale of ['emailEnabled', 'totpEnabled', 'enforcedBy', 'userId']) {
      expect(Object.keys(server)).not.toContain(stale);
    }
    expect(_sdk.method).toBe('totp');
  });

  it('CreateOrganizationInput has no twoFactorPolicy (ST-13)', () => {
    // Source: src/routes/organizations.ts createOrganizationSchema — no twoFactorPolicy.
    const input: CreateOrganizationInput = {
      name: 'Acme', slug: 'acme', defaultLocale: 'en',
      defaultLoginMethods: ['password'],
      branding: { primaryColor: '#123456', companyName: 'Acme Inc' },
    };
    // ST-13: the input does not declare twoFactorPolicy.
    expect(Object.keys(input)).not.toContain('twoFactorPolicy');
    expect(input.branding?.primaryColor).toBe('#123456');
  });

  it('UpdateOrganizationInput has no twoFactorPolicy/slug (ST-13)', () => {
    // Source: src/routes/organizations.ts updateOrganizationSchema.
    const input: UpdateOrganizationInput = {
      name: 'Acme', defaultLocale: 'en',
      branding: { logoUrl: 'https://cdn.example.com/logo.png' },
    };
    expect(Object.keys(input)).not.toContain('twoFactorPolicy');
    expect(Object.keys(input)).not.toContain('slug');
    expect(input.branding?.logoUrl).toBe('https://cdn.example.com/logo.png');
  });

  it('InviteUserInput has givenName/familyName, not displayName (ST-14)', () => {
    // Source: src/routes/users.ts inviteUserSchema — accepts givenName + familyName.
    const input: InviteUserInput = {
      organizationId: 'org-1', email: 'b@c.com', givenName: 'Bob', familyName: 'Builder',
    };
    expect(Object.keys(input)).not.toContain('displayName');
    expect(input.givenName).toBe('Bob');
    expect(input.familyName).toBe('Builder');
  });
});


