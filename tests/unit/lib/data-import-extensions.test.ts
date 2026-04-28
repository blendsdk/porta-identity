/**
 * Unit tests for import engine extensions.
 *
 * Tests the role-permission mapping schema, system config schema,
 * backward compatibility with old manifests, and Phase 1 enhancements
 * (default_login_methods, login_methods, token_endpoint_auth_method,
 * client_id format, credentials types).
 */

import { describe, it, expect } from 'vitest';
import { importManifestSchema } from '../../../src/lib/data-import.js';
import type { ImportResult, ImportClientCredentials } from '../../../src/lib/data-import.js';
import { generateClientId } from '../../../src/clients/crypto.js';

// ============================================================================
// Role-permission mapping schema tests
// ============================================================================

describe('importManifestSchema — role_permission_mappings', () => {
  it('accepts a manifest with role-permission mappings', () => {
    const input = {
      version: '1.0',
      organizations: [],
      role_permission_mappings: [
        {
          role_slug: 'admin',
          permission_slugs: ['read', 'write', 'delete'],
          application_slug: 'crm',
          organization_slug: 'acme',
        },
      ],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role_permission_mappings).toHaveLength(1);
      expect(result.data.role_permission_mappings[0].role_slug).toBe('admin');
      expect(result.data.role_permission_mappings[0].permission_slugs).toEqual([
        'read', 'write', 'delete',
      ]);
    }
  });

  it('accepts a manifest with multiple role-permission mappings', () => {
    const input = {
      version: '1.0',
      organizations: [],
      role_permission_mappings: [
        {
          role_slug: 'admin',
          permission_slugs: ['read', 'write'],
          application_slug: 'app',
          organization_slug: 'org',
        },
        {
          role_slug: 'viewer',
          permission_slugs: ['read'],
          application_slug: 'app',
          organization_slug: 'org',
        },
      ],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role_permission_mappings).toHaveLength(2);
    }
  });

  it('rejects mapping with empty role_slug', () => {
    const input = {
      version: '1.0',
      organizations: [],
      role_permission_mappings: [
        {
          role_slug: '',
          permission_slugs: ['read'],
          application_slug: 'app',
          organization_slug: 'org',
        },
      ],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects mapping with empty permission_slugs array', () => {
    const input = {
      version: '1.0',
      organizations: [],
      role_permission_mappings: [
        {
          role_slug: 'admin',
          permission_slugs: [''],
          application_slug: 'app',
          organization_slug: 'org',
        },
      ],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects mapping with missing application_slug', () => {
    const input = {
      version: '1.0',
      organizations: [],
      role_permission_mappings: [
        {
          role_slug: 'admin',
          permission_slugs: ['read'],
          organization_slug: 'org',
        },
      ],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// System config schema tests
// ============================================================================

describe('importManifestSchema — config', () => {
  it('accepts a manifest with config overrides (string values)', () => {
    const input = {
      version: '1.0',
      organizations: [],
      config: {
        access_token_ttl: '7200',
        session_ttl: '43200',
      },
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.config).toEqual({
        access_token_ttl: '7200',
        session_ttl: '43200',
      });
    }
  });

  it('accepts config with number values', () => {
    const input = {
      version: '1.0',
      organizations: [],
      config: {
        max_retries: 5,
      },
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.config!.max_retries).toBe(5);
    }
  });

  it('accepts config with boolean values', () => {
    const input = {
      version: '1.0',
      organizations: [],
      config: {
        debug_mode: false,
      },
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.config!.debug_mode).toBe(false);
    }
  });
});

// ============================================================================
// Backward compatibility tests
// ============================================================================

describe('importManifestSchema — backward compatibility', () => {
  it('accepts old manifest without role_permission_mappings', () => {
    const input = {
      version: '1.0',
      organizations: [
        { name: 'Org', slug: 'org' },
      ],
      applications: [
        { name: 'App', slug: 'app', organization_slug: 'org' },
      ],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      // Should default to empty array
      expect(result.data.role_permission_mappings).toEqual([]);
    }
  });

  it('accepts old manifest without config', () => {
    const input = {
      version: '1.0',
      organizations: [],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.config).toBeUndefined();
    }
  });

  it('accepts old manifest with all original fields', () => {
    const input = {
      version: '1.0',
      organizations: [{ name: 'Org', slug: 'org' }],
      applications: [{ name: 'App', slug: 'app', organization_slug: 'org' }],
      clients: [],
      roles: [],
      permissions: [],
      claim_definitions: [],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      // All new fields should default gracefully
      expect(result.data.role_permission_mappings).toEqual([]);
      expect(result.data.config).toBeUndefined();
    }
  });

  it('accepts manifest with both old and new fields', () => {
    const input = {
      version: '1.0',
      organizations: [{ name: 'Org', slug: 'org' }],
      applications: [{ name: 'App', slug: 'app', organization_slug: 'org' }],
      roles: [{ name: 'Admin', slug: 'admin', application_slug: 'app', organization_slug: 'org' }],
      permissions: [{ name: 'Read', slug: 'read', application_slug: 'app', organization_slug: 'org' }],
      role_permission_mappings: [
        {
          role_slug: 'admin',
          permission_slugs: ['read'],
          application_slug: 'app',
          organization_slug: 'org',
        },
      ],
      config: { access_token_ttl: '3600' },
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Client schema — client_type validation tests
// ============================================================================

// ============================================================================
// Phase 1: Organization — default_login_methods schema tests
// ============================================================================

describe('importManifestSchema — organization default_login_methods', () => {
  it('should accept organization with default_login_methods array', () => {
    const input = {
      version: '1.0',
      organizations: [
        { name: 'Org', slug: 'org', default_login_methods: ['password', 'magic_link'] },
      ],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.organizations[0].default_login_methods).toEqual(['password', 'magic_link']);
    }
  });

  it('should accept organization with password-only login method', () => {
    const input = {
      version: '1.0',
      organizations: [
        { name: 'Org', slug: 'org', default_login_methods: ['password'] },
      ],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.organizations[0].default_login_methods).toEqual(['password']);
    }
  });

  it('should accept organization without default_login_methods (uses DB default)', () => {
    const input = {
      version: '1.0',
      organizations: [
        { name: 'Org', slug: 'org' },
      ],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      // Omitted = undefined, which maps to null in SQL → DB default {password, magic_link}
      expect(result.data.organizations[0].default_login_methods).toBeUndefined();
    }
  });

  it('should accept organization with both default_locale and default_login_methods', () => {
    const input = {
      version: '1.0',
      organizations: [
        { name: 'Org', slug: 'org', default_locale: 'en', default_login_methods: ['magic_link'] },
      ],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.organizations[0].default_locale).toBe('en');
      expect(result.data.organizations[0].default_login_methods).toEqual(['magic_link']);
    }
  });
});

// ============================================================================
// Phase 1: Client — login_methods + token_endpoint_auth_method schema tests
// ============================================================================

describe('importManifestSchema — client login_methods + token_endpoint_auth_method', () => {
  const baseClient = {
    client_name: 'Test Client',
    application_slug: 'app',
    organization_slug: 'org',
    client_type: 'public' as const,
    scope: 'openid',
  };

  it('should accept client with login_methods array', () => {
    const input = {
      version: '1.0',
      organizations: [],
      clients: [{ ...baseClient, login_methods: ['password'] }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clients[0].login_methods).toEqual(['password']);
    }
  });

  it('should accept client with null login_methods (inherit from org)', () => {
    const input = {
      version: '1.0',
      organizations: [],
      clients: [{ ...baseClient, login_methods: null }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clients[0].login_methods).toBeNull();
    }
  });

  it('should accept client without login_methods (omitted = undefined)', () => {
    const input = {
      version: '1.0',
      organizations: [],
      clients: [{ ...baseClient }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clients[0].login_methods).toBeUndefined();
    }
  });

  it('should accept client with token_endpoint_auth_method override', () => {
    const input = {
      version: '1.0',
      organizations: [],
      clients: [{ ...baseClient, client_type: 'confidential', token_endpoint_auth_method: 'client_secret_basic' }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clients[0].token_endpoint_auth_method).toBe('client_secret_basic');
    }
  });

  it('should accept client without token_endpoint_auth_method (auto-derived from type)', () => {
    const input = {
      version: '1.0',
      organizations: [],
      clients: [{ ...baseClient, client_type: 'public' }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      // Omitted = undefined; import engine derives 'none' for public, 'client_secret_post' for confidential
      expect(result.data.clients[0].token_endpoint_auth_method).toBeUndefined();
    }
  });
});

// ============================================================================
// Phase 1: Client ID format + credentials type tests
// ============================================================================

describe('generateClientId — format validation', () => {
  it('should generate a base64url-encoded string (~43 chars)', () => {
    const clientId = generateClientId();
    // 32 random bytes → base64url ≈ 43 characters
    expect(clientId.length).toBeGreaterThanOrEqual(42);
    expect(clientId.length).toBeLessThanOrEqual(44);
  });

  it('should use only base64url-safe characters', () => {
    const clientId = generateClientId();
    // base64url: A-Z, a-z, 0-9, -, _ (no +, /, or = padding)
    expect(clientId).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('should generate unique values on each call', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateClientId()));
    expect(ids.size).toBe(20);
  });
});

describe('ImportClientCredentials type — structural validation', () => {
  it('should represent a public client credential (no secret)', () => {
    const cred: ImportClientCredentials = {
      clientName: 'SPA Client',
      clientId: generateClientId(),
      clientType: 'public',
    };
    expect(cred.secretPlaintext).toBeUndefined();
    expect(cred.secretId).toBeUndefined();
    expect(cred.clientType).toBe('public');
  });

  it('should represent a confidential client credential with secret', () => {
    const cred: ImportClientCredentials = {
      clientName: 'Backend Client',
      clientId: generateClientId(),
      clientType: 'confidential',
      secretPlaintext: 'test-secret-value',
      secretId: 'some-uuid',
    };
    expect(cred.secretPlaintext).toBe('test-secret-value');
    expect(cred.secretId).toBe('some-uuid');
    expect(cred.clientType).toBe('confidential');
  });

  it('should represent a dry-run credential with indicator text', () => {
    const cred: ImportClientCredentials = {
      clientName: 'My Client',
      clientId: '(would be generated)',
      clientType: 'confidential',
      secretPlaintext: '(would be generated)',
    };
    expect(cred.clientId).toBe('(would be generated)');
    expect(cred.secretPlaintext).toBe('(would be generated)');
  });
});

describe('ImportResult — credentials array', () => {
  it('should include credentials array in result structure', () => {
    const result: ImportResult = {
      mode: 'merge',
      created: [],
      updated: [],
      skipped: [],
      errors: [],
      credentials: [],
    };
    expect(result.credentials).toBeDefined();
    expect(Array.isArray(result.credentials)).toBe(true);
  });

  it('should accumulate credentials from multiple clients', () => {
    const result: ImportResult = {
      mode: 'merge',
      created: [],
      updated: [],
      skipped: [],
      errors: [],
      credentials: [
        { clientName: 'Client A', clientId: 'id-a', clientType: 'public' },
        { clientName: 'Client B', clientId: 'id-b', clientType: 'confidential', secretPlaintext: 'secret-b' },
      ],
    };
    expect(result.credentials).toHaveLength(2);
    expect(result.credentials[0].clientType).toBe('public');
    expect(result.credentials[1].secretPlaintext).toBe('secret-b');
  });
});

// ============================================================================
// Client schema — client_type validation tests
// ============================================================================

describe('importManifestSchema — client_type', () => {
  const baseClient = {
    client_name: 'Test Client',
    application_slug: 'app',
    organization_slug: 'org',
    application_type: 'web',
    grant_types: ['authorization_code'],
    redirect_uris: ['https://example.com/callback'],
    response_types: ['code'],
    scope: 'openid',
  };

  it('accepts client with client_type "confidential"', () => {
    const input = {
      version: '1.0',
      organizations: [],
      clients: [{ ...baseClient, client_type: 'confidential' }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clients[0].client_type).toBe('confidential');
    }
  });

  it('accepts client with client_type "public"', () => {
    const input = {
      version: '1.0',
      organizations: [],
      clients: [{ ...baseClient, client_type: 'public' }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clients[0].client_type).toBe('public');
    }
  });

  it('rejects client without client_type', () => {
    const input = {
      version: '1.0',
      organizations: [],
      clients: [{ ...baseClient }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects client with invalid client_type', () => {
    const input = {
      version: '1.0',
      organizations: [],
      clients: [{ ...baseClient, client_type: 'hybrid' }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
