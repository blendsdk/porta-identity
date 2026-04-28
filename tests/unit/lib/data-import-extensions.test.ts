/**
 * Unit tests for import engine extensions (Phase 7 & 8).
 *
 * Tests the role-permission mapping schema, system config schema,
 * and backward compatibility with old manifests that don't include
 * the new fields.
 */

import { describe, it, expect } from 'vitest';
import { importManifestSchema } from '../../../src/lib/data-import.js';

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
