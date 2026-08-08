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
// Phase 2: Client — post_logout_redirect_uris, allowed_origins, require_pkce
// ============================================================================

describe('importManifestSchema — Phase 2 client fields', () => {
  const baseClient = {
    client_name: 'Test Client',
    application_slug: 'app',
    organization_slug: 'org',
    client_type: 'confidential' as const,
    scope: 'openid',
  };

  it('should accept client with post_logout_redirect_uris', () => {
    const input = {
      version: '1.0',
      organizations: [],
      clients: [{ ...baseClient, post_logout_redirect_uris: ['https://example.com/logout'] }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clients[0].post_logout_redirect_uris).toEqual(['https://example.com/logout']);
    }
  });

  it('should accept client with allowed_origins', () => {
    const input = {
      version: '1.0',
      organizations: [],
      clients: [{ ...baseClient, allowed_origins: ['https://example.com', 'https://app.example.com'] }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clients[0].allowed_origins).toEqual(['https://example.com', 'https://app.example.com']);
    }
  });

  it('should accept client with require_pkce: true', () => {
    const input = {
      version: '1.0',
      organizations: [],
      clients: [{ ...baseClient, require_pkce: true }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clients[0].require_pkce).toBe(true);
    }
  });

  it('should accept client with require_pkce: false', () => {
    const input = {
      version: '1.0',
      organizations: [],
      clients: [{ ...baseClient, require_pkce: false }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clients[0].require_pkce).toBe(false);
    }
  });

  it('should accept client without Phase 2 fields (all optional)', () => {
    const input = {
      version: '1.0',
      organizations: [],
      clients: [{ ...baseClient }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clients[0].post_logout_redirect_uris).toBeUndefined();
      expect(result.data.clients[0].allowed_origins).toBeUndefined();
      expect(result.data.clients[0].require_pkce).toBeUndefined();
    }
  });

  it('should reject require_pkce as non-boolean', () => {
    const input = {
      version: '1.0',
      organizations: [],
      clients: [{ ...baseClient, require_pkce: 'yes' }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should accept client with all Phase 2 fields together', () => {
    const input = {
      version: '1.0',
      organizations: [],
      clients: [{
        ...baseClient,
        post_logout_redirect_uris: ['https://example.com/logout'],
        allowed_origins: ['https://example.com'],
        require_pkce: true,
        secret_label: 'my-secret',
        secret_expires_at: '2027-01-01T00:00:00Z',
      }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const c = result.data.clients[0];
      expect(c.post_logout_redirect_uris).toEqual(['https://example.com/logout']);
      expect(c.allowed_origins).toEqual(['https://example.com']);
      expect(c.require_pkce).toBe(true);
      expect(c.secret_label).toBe('my-secret');
      expect(c.secret_expires_at).toBe('2027-01-01T00:00:00Z');
    }
  });
});

// ============================================================================
// Phase 2: Client — secret_label + secret_expires_at schema tests
// ============================================================================

describe('importManifestSchema — secret config (flat manifest)', () => {
  const baseClient = {
    client_name: 'Test Client',
    application_slug: 'app',
    organization_slug: 'org',
    client_type: 'confidential' as const,
    scope: 'openid',
  };

  it('should accept client with secret_label', () => {
    const input = {
      version: '1.0',
      organizations: [],
      clients: [{ ...baseClient, secret_label: 'production-key' }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clients[0].secret_label).toBe('production-key');
    }
  });

  it('should accept client with secret_expires_at (ISO date)', () => {
    const input = {
      version: '1.0',
      organizations: [],
      clients: [{ ...baseClient, secret_expires_at: '2027-06-15T00:00:00.000Z' }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clients[0].secret_expires_at).toBe('2027-06-15T00:00:00.000Z');
    }
  });

  it('should accept client with both secret_label and secret_expires_at', () => {
    const input = {
      version: '1.0',
      organizations: [],
      clients: [{
        ...baseClient,
        secret_label: 'staging-key',
        secret_expires_at: '2027-12-31T23:59:59Z',
      }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept null secret_label and secret_expires_at', () => {
    const input = {
      version: '1.0',
      organizations: [],
      clients: [{ ...baseClient, secret_label: null, secret_expires_at: null }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clients[0].secret_label).toBeNull();
      expect(result.data.clients[0].secret_expires_at).toBeNull();
    }
  });

  it('should reject secret_label longer than 255 characters', () => {
    const input = {
      version: '1.0',
      organizations: [],
      clients: [{ ...baseClient, secret_label: 'x'.repeat(256) }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should accept client without secret config (backward compatible)', () => {
    const input = {
      version: '1.0',
      organizations: [],
      clients: [{ ...baseClient }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clients[0].secret_label).toBeUndefined();
      expect(result.data.clients[0].secret_expires_at).toBeUndefined();
    }
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

// ============================================================================
// Phase 3: importManifestSchema — user, module, assignment schemas
// ============================================================================

describe('importManifestSchema — Phase 3 users', () => {
  it('accepts manifest with users array', () => {
    const input = {
      version: '1.0',
      users: [{
        email: 'alice@test.local',
        organization_slug: 'test-org',
        given_name: 'Alice',
        family_name: 'Test',
        status: 'active',
        email_verified: true,
      }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts user with password_hash', () => {
    const input = {
      version: '1.0',
      users: [{
        email: 'alice@test.local',
        organization_slug: 'test-org',
        password_hash: '$argon2id$v=19$m=65536,t=3,p=4$abc$def',
      }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts user without optional fields', () => {
    const input = {
      version: '1.0',
      users: [{
        email: 'minimal@test.local',
        organization_slug: 'test-org',
      }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects user without email', () => {
    const input = {
      version: '1.0',
      users: [{ organization_slug: 'test-org' }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects user without organization_slug', () => {
    const input = {
      version: '1.0',
      users: [{ email: 'alice@test.local' }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects invalid email format', () => {
    const input = {
      version: '1.0',
      users: [{ email: 'not-an-email', organization_slug: 'test' }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects invalid user status', () => {
    const input = {
      version: '1.0',
      users: [{ email: 'a@b.com', organization_slug: 'test', status: 'deleted' }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('defaults users to empty array when omitted', () => {
    const input = { version: '1.0' };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.users).toEqual([]);
    }
  });
});

describe('importManifestSchema — Phase 3 application modules', () => {
  it('accepts manifest with application_modules', () => {
    const input = {
      version: '1.0',
      application_modules: [{
        name: 'Dashboard',
        slug: 'dashboard',
        application_slug: 'app',
        organization_slug: 'org',
        description: 'Main dashboard',
        status: 'active',
      }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts module without optional fields', () => {
    const input = {
      version: '1.0',
      application_modules: [{
        name: 'Reports',
        slug: 'reports',
        application_slug: 'app',
        organization_slug: 'org',
      }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects module with invalid status', () => {
    const input = {
      version: '1.0',
      application_modules: [{
        name: 'Bad',
        slug: 'bad',
        application_slug: 'app',
        organization_slug: 'org',
        status: 'deleted',
      }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('defaults application_modules to empty array', () => {
    const input = { version: '1.0' };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.application_modules).toEqual([]);
    }
  });
});

describe('importManifestSchema — Phase 3 user-role assignments', () => {
  it('accepts manifest with user_role_assignments', () => {
    const input = {
      version: '1.0',
      user_role_assignments: [{
        email: 'alice@test.local',
        organization_slug: 'org',
        application_slug: 'app',
        role_slug: 'admin',
      }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects assignment without email', () => {
    const input = {
      version: '1.0',
      user_role_assignments: [{
        organization_slug: 'org',
        application_slug: 'app',
        role_slug: 'admin',
      }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('defaults user_role_assignments to empty array', () => {
    const input = { version: '1.0' };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.user_role_assignments).toEqual([]);
    }
  });
});

describe('importManifestSchema — Phase 3 user claim values', () => {
  it('accepts manifest with user_claim_values', () => {
    const input = {
      version: '1.0',
      user_claim_values: [{
        email: 'alice@test.local',
        organization_slug: 'org',
        application_slug: 'app',
        claim_slug: 'department',
        value: 'Engineering',
      }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts claim value with different types', () => {
    for (const value of ['string-val', 42, true, { nested: 'json' }]) {
      const input = {
        version: '1.0',
        user_claim_values: [{
          email: 'a@b.com',
          organization_slug: 'org',
          application_slug: 'app',
          claim_slug: 'test',
          value,
        }],
      };
      const result = importManifestSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });

  it('defaults user_claim_values to empty array', () => {
    const input = { version: '1.0' };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.user_claim_values).toEqual([]);
    }
  });
});

describe('importManifestSchema — Phase 3 organization branding + 2FA fields', () => {
  it('accepts organization with branding fields', () => {
    const input = {
      version: '1.0',
      organizations: [{
        name: 'Branded Org',
        slug: 'branded',
        branding_primary_color: '#ff6600',
        branding_company_name: 'Branded Corp',
        branding_custom_css: 'body { color: red; }',
      }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts organization with two_factor_policy', () => {
    const input = {
      version: '1.0',
      organizations: [{
        name: 'Secure Org',
        slug: 'secure',
        two_factor_policy: 'required_totp',
      }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts all valid 2FA policy values', () => {
    for (const policy of ['optional', 'required_email', 'required_totp', 'required_any']) {
      const input = {
        version: '1.0',
        organizations: [{ name: 'Test', slug: 'test', two_factor_policy: policy }],
      };
      const result = importManifestSchema.safeParse(input);
      expect(result.success, `Policy '${policy}' should be valid`).toBe(true);
    }
  });

  it('rejects invalid two_factor_policy', () => {
    const input = {
      version: '1.0',
      organizations: [{ name: 'Test', slug: 'test', two_factor_policy: 'always_on' }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('accepts org without branding fields (backward compatible)', () => {
    const input = {
      version: '1.0',
      organizations: [{ name: 'Plain Org', slug: 'plain' }],
    };
    const result = importManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});
