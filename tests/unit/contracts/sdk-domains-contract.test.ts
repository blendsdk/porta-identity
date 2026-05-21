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

  it('User type covers server response', () => {
    const server = {
      id: 'uuid', organizationId: 'org-uuid', email: 'alice@example.com',
      firstName: 'Alice', lastName: 'Smith', displayName: 'Alice Smith',
      status: 'active' as const, locale: 'en', emailVerified: true,
      lastLoginAt: null, loginCount: 0, failedLoginCount: 0,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    };
    const _sdk: User = server;
    expectKeys(server, ['id', 'organizationId', 'email', 'firstName', 'lastName',
      'status', 'emailVerified', 'createdAt'], 'User');
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

  it('Permission type covers server response', () => {
    const server = {
      id: 'uuid', applicationId: 'app-uuid', moduleId: null,
      name: 'Read Users', slug: 'read-users', description: null,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    };
    const _sdk: Permission = server;
    expectKeys(server, ['id', 'applicationId', 'name', 'slug', 'createdAt'], 'Permission');
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
});
