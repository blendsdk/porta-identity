/**
 * Unit tests for the provision command.
 *
 * Tests the provisioning YAML schema validation, nested-to-flat
 * transformer, and file parser — the three pure-logic components
 * that don't need HTTP or DB mocking.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  provisioningSchema,
  parseProvisioningFile,
  transformToManifest,
  type ProvisioningFile,
} from '../../../src/cli/commands/provision.js';

// ============================================================================
// Schema validation tests
// ============================================================================

describe('provisioningSchema', () => {
  it('accepts a minimal valid provisioning file', () => {
    const input = {
      version: '1.0',
      organizations: [
        { name: 'Test Org', slug: 'test-org' },
      ],
    };
    const result = provisioningSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts a full provisioning file with all fields', () => {
    const input = {
      version: '1.0',
      config: { access_token_ttl: '7200' },
      organizations: [
        {
          name: 'Acme Corp',
          slug: 'acme',
          default_locale: 'en',
          default_login_methods: ['password', 'magic_link'],
          applications: [
            {
              name: 'CRM',
              slug: 'crm',
              description: 'Customer management',
              clients: [
                {
                  client_name: 'Web App',
                  client_type: 'confidential',
                  application_type: 'web',
                  grant_types: ['authorization_code'],
                  redirect_uris: ['https://crm.acme.com/callback'],
                  response_types: ['code'],
                  scope: 'openid profile',
                },
              ],
              roles: [
                {
                  name: 'Admin',
                  slug: 'admin',
                  description: 'Full access',
                  permissions: ['read', 'write'],
                },
              ],
              permissions: [
                { name: 'Read', slug: 'read' },
                { name: 'Write', slug: 'write' },
              ],
              claim_definitions: [
                { name: 'Dept', slug: 'dept', claim_type: 'string' },
              ],
            },
          ],
        },
      ],
    };
    const result = provisioningSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects missing version', () => {
    const input = {
      organizations: [{ name: 'Test', slug: 'test' }],
    };
    const result = provisioningSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects empty organizations array', () => {
    const input = {
      version: '1.0',
      organizations: [],
    };
    const result = provisioningSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects missing organizations', () => {
    const input = { version: '1.0' };
    const result = provisioningSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects organization without name', () => {
    const input = {
      version: '1.0',
      organizations: [{ slug: 'test' }],
    };
    const result = provisioningSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects invalid claim_type', () => {
    const input = {
      version: '1.0',
      organizations: [
        {
          name: 'Test',
          slug: 'test',
          applications: [
            {
              name: 'App',
              slug: 'app',
              claim_definitions: [
                { name: 'Bad', slug: 'bad', claim_type: 'invalid' },
              ],
            },
          ],
        },
      ],
    };
    const result = provisioningSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('allows optional slug on organization (auto-generated)', () => {
    const input = {
      version: '1.0',
      organizations: [{ name: 'My Cool Org' }],
    };
    const result = provisioningSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Transformer tests
// ============================================================================

describe('transformToManifest', () => {
  it('transforms a single org with no applications', async () => {
    const input: ProvisioningFile = {
      version: '1.0',
      organizations: [
        { name: 'Test Org', slug: 'test-org', applications: [] },
      ],
    };
    const { manifest, mappingCount, hasConfig } = await transformToManifest(input);

    expect(manifest.version).toBe('1.0');
    expect(manifest.organizations).toHaveLength(1);
    expect(manifest.organizations[0].slug).toBe('test-org');
    expect(manifest.applications).toHaveLength(0);
    expect(mappingCount).toBe(0);
    expect(hasConfig).toBe(false);
  });

  it('flattens nested organizations → applications → clients', async () => {
    const input: ProvisioningFile = {
      version: '1.0',
      organizations: [
        {
          name: 'Acme',
          slug: 'acme',
          applications: [
            {
              name: 'CRM',
              slug: 'crm',
              clients: [
                {
                  client_name: 'Web App',
                  client_type: 'confidential',
                  application_type: 'web',
                  grant_types: ['authorization_code'],
                },
              ],
              roles: [],
              permissions: [],
              claim_definitions: [],
            },
          ],
        },
      ],
    };
    const { manifest } = await transformToManifest(input);

    expect(manifest.organizations).toHaveLength(1);
    expect(manifest.applications).toHaveLength(1);
    expect(manifest.applications[0].organization_slug).toBe('acme');
    expect(manifest.clients).toHaveLength(1);
    expect(manifest.clients[0].organization_slug).toBe('acme');
    expect(manifest.clients[0].application_slug).toBe('crm');
  });

  it('flattens roles and permissions with org/app references', async () => {
    const input: ProvisioningFile = {
      version: '1.0',
      organizations: [
        {
          name: 'Org',
          slug: 'org',
          applications: [
            {
              name: 'App',
              slug: 'app',
              clients: [],
              roles: [{ name: 'Admin', slug: 'admin' }],
              permissions: [{ name: 'Read', slug: 'read' }],
              claim_definitions: [],
            },
          ],
        },
      ],
    };
    const { manifest } = await transformToManifest(input);

    expect(manifest.roles).toHaveLength(1);
    expect(manifest.roles[0]).toMatchObject({
      name: 'Admin',
      slug: 'admin',
      organization_slug: 'org',
      application_slug: 'app',
    });
    expect(manifest.permissions).toHaveLength(1);
    expect(manifest.permissions[0]).toMatchObject({
      name: 'Read',
      slug: 'read',
      organization_slug: 'org',
      application_slug: 'app',
    });
  });

  it('extracts role-permission mappings from inline permissions', async () => {
    const input: ProvisioningFile = {
      version: '1.0',
      organizations: [
        {
          name: 'Org',
          slug: 'org',
          applications: [
            {
              name: 'App',
              slug: 'app',
              clients: [],
              roles: [
                {
                  name: 'Admin',
                  slug: 'admin',
                  permissions: ['read', 'write'],
                },
                {
                  name: 'Viewer',
                  slug: 'viewer',
                  permissions: ['read'],
                },
              ],
              permissions: [],
              claim_definitions: [],
            },
          ],
        },
      ],
    };
    const { manifest, mappingCount } = await transformToManifest(input);

    expect(mappingCount).toBe(2);
    expect(manifest.role_permission_mappings).toHaveLength(2);
    expect(manifest.role_permission_mappings![0]).toMatchObject({
      role_slug: 'admin',
      permission_slugs: ['read', 'write'],
      application_slug: 'app',
      organization_slug: 'org',
    });
    expect(manifest.role_permission_mappings![1]).toMatchObject({
      role_slug: 'viewer',
      permission_slugs: ['read'],
    });
  });

  it('passes through config overrides', async () => {
    const input: ProvisioningFile = {
      version: '1.0',
      config: { access_token_ttl: '7200', session_ttl: '43200' },
      organizations: [
        { name: 'Org', slug: 'org', applications: [] },
      ],
    };
    const { manifest, hasConfig } = await transformToManifest(input);

    expect(hasConfig).toBe(true);
    expect(manifest.config).toEqual({
      access_token_ttl: '7200',
      session_ttl: '43200',
    });
  });

  it('generates slugs from names when slug is omitted', async () => {
    const input: ProvisioningFile = {
      version: '1.0',
      organizations: [
        {
          name: 'My Cool Organization',
          applications: [
            {
              name: 'Customer Portal',
              clients: [],
              roles: [{ name: 'Power User' }],
              permissions: [],
              claim_definitions: [],
            },
          ],
        },
      ],
    };
    const { manifest } = await transformToManifest(input);

    // Slugs should be auto-generated from names (kebab-case)
    expect(manifest.organizations[0].slug).toBeTruthy();
    expect(manifest.organizations[0].slug).not.toBe('');
    expect(manifest.applications[0].slug).toBeTruthy();
    expect(manifest.roles[0].slug).toBeTruthy();
  });

  it('handles multi-org with multiple apps correctly', async () => {
    const input: ProvisioningFile = {
      version: '1.0',
      organizations: [
        {
          name: 'Org A',
          slug: 'org-a',
          applications: [
            {
              name: 'App 1',
              slug: 'app-1',
              clients: [],
              roles: [],
              permissions: [],
              claim_definitions: [],
            },
            {
              name: 'App 2',
              slug: 'app-2',
              clients: [],
              roles: [],
              permissions: [],
              claim_definitions: [],
            },
          ],
        },
        {
          name: 'Org B',
          slug: 'org-b',
          applications: [
            {
              name: 'App 3',
              slug: 'app-3',
              clients: [],
              roles: [],
              permissions: [],
              claim_definitions: [],
            },
          ],
        },
      ],
    };
    const { manifest } = await transformToManifest(input);

    expect(manifest.organizations).toHaveLength(2);
    expect(manifest.applications).toHaveLength(3);
    expect(manifest.applications[0].organization_slug).toBe('org-a');
    expect(manifest.applications[1].organization_slug).toBe('org-a');
    expect(manifest.applications[2].organization_slug).toBe('org-b');
  });

  it('flattens claim definitions with correct references', async () => {
    const input: ProvisioningFile = {
      version: '1.0',
      organizations: [
        {
          name: 'Org',
          slug: 'org',
          applications: [
            {
              name: 'App',
              slug: 'app',
              clients: [],
              roles: [],
              permissions: [],
              claim_definitions: [
                {
                  name: 'Department',
                  slug: 'department',
                  claim_type: 'string',
                  description: 'User department',
                },
              ],
            },
          ],
        },
      ],
    };
    const { manifest } = await transformToManifest(input);

    expect(manifest.claim_definitions).toHaveLength(1);
    expect(manifest.claim_definitions[0]).toMatchObject({
      name: 'Department',
      slug: 'department',
      claim_type: 'string',
      description: 'User department',
      organization_slug: 'org',
      application_slug: 'app',
    });
  });

  it('handles roles without permissions (no mappings generated)', async () => {
    const input: ProvisioningFile = {
      version: '1.0',
      organizations: [
        {
          name: 'Org',
          slug: 'org',
          applications: [
            {
              name: 'App',
              slug: 'app',
              clients: [],
              roles: [{ name: 'Basic', slug: 'basic' }],
              permissions: [],
              claim_definitions: [],
            },
          ],
        },
      ],
    };
    const { manifest, mappingCount } = await transformToManifest(input);

    expect(manifest.roles).toHaveLength(1);
    expect(mappingCount).toBe(0);
    expect(manifest.role_permission_mappings).toHaveLength(0);
  });
});

// ============================================================================
// File parser tests
// ============================================================================

describe('parseProvisioningFile', () => {
  const testDir = path.join(process.cwd(), 'tests', 'fixtures');

  it('parses a YAML file', () => {
    const result = parseProvisioningFile(
      path.join(testDir, 'provision-simple.yaml'),
    );
    expect(result).toBeDefined();
    expect((result as { version: string }).version).toBe('1.0');
    expect((result as { organizations: unknown[] }).organizations).toHaveLength(1);
  });

  it('parses a JSON file', () => {
    // Create a temporary JSON fixture
    const jsonPath = path.join(testDir, 'provision-test.json');
    const data = {
      version: '1.0',
      organizations: [{ name: 'JSON Org', slug: 'json-org' }],
    };
    fs.writeFileSync(jsonPath, JSON.stringify(data));

    try {
      const result = parseProvisioningFile(jsonPath);
      expect(result).toEqual(data);
    } finally {
      fs.unlinkSync(jsonPath);
    }
  });

  it('throws on non-existent file', () => {
    expect(() => parseProvisioningFile('/nonexistent/file.yaml')).toThrow(
      'File not found',
    );
  });

  it('throws on unsupported extension', () => {
    const txtPath = path.join(testDir, 'test.txt');
    fs.writeFileSync(txtPath, 'not yaml');
    try {
      expect(() => parseProvisioningFile(txtPath)).toThrow(
        'Unsupported file format',
      );
    } finally {
      fs.unlinkSync(txtPath);
    }
  });

  it('detects .yml extension as YAML', () => {
    const ymlPath = path.join(testDir, 'provision-test.yml');
    fs.writeFileSync(
      ymlPath,
      'version: "1.0"\norganizations:\n  - name: YML Test\n    slug: yml-test\n',
    );
    try {
      const result = parseProvisioningFile(ymlPath);
      expect((result as { version: string }).version).toBe('1.0');
    } finally {
      fs.unlinkSync(ymlPath);
    }
  });

  it('throws on malformed YAML content', () => {
    const badYamlPath = path.join(testDir, 'provision-bad.yaml');
    // Invalid YAML: tabs mixed with spaces, unclosed quotes
    fs.writeFileSync(badYamlPath, ':\n  - :\n    bad: [unclosed\n  "no end');
    try {
      expect(() => parseProvisioningFile(badYamlPath)).toThrow();
    } finally {
      fs.unlinkSync(badYamlPath);
    }
  });

  it('throws on malformed JSON content', () => {
    const badJsonPath = path.join(testDir, 'provision-bad.json');
    fs.writeFileSync(badJsonPath, '{ "version": "1.0", organizations: }');
    try {
      expect(() => parseProvisioningFile(badJsonPath)).toThrow();
    } finally {
      fs.unlinkSync(badJsonPath);
    }
  });

  it('handles empty YAML file (returns undefined/null)', () => {
    const emptyPath = path.join(testDir, 'provision-empty.yaml');
    fs.writeFileSync(emptyPath, '');
    try {
      const result = parseProvisioningFile(emptyPath);
      // Empty YAML parses to undefined — schema validation catches this downstream
      expect(result === undefined || result === null).toBe(true);
    } finally {
      fs.unlinkSync(emptyPath);
    }
  });

  it('handles empty JSON file (throws parse error)', () => {
    const emptyJsonPath = path.join(testDir, 'provision-empty.json');
    fs.writeFileSync(emptyJsonPath, '');
    try {
      expect(() => parseProvisioningFile(emptyJsonPath)).toThrow();
    } finally {
      fs.unlinkSync(emptyJsonPath);
    }
  });

  it('parses extensionless file as YAML (stdin support)', () => {
    // Simulate an extensionless file like /dev/stdin by creating a temp
    // file without an extension containing valid YAML content
    const noExtPath = path.join(testDir, 'provision-noext');
    fs.writeFileSync(
      noExtPath,
      'version: "1.0"\norganizations:\n  - name: Stdin Test\n    slug: stdin-test\n',
    );
    try {
      const result = parseProvisioningFile(noExtPath);
      expect((result as { version: string }).version).toBe('1.0');
      expect((result as { organizations: unknown[] }).organizations).toHaveLength(1);
    } finally {
      fs.unlinkSync(noExtPath);
    }
  });

  it('parses extensionless file containing JSON as YAML (JSON is valid YAML)', () => {
    // YAML is a superset of JSON, so JSON content parses correctly
    const noExtPath = path.join(testDir, 'provision-noext-json');
    const data = {
      version: '1.0',
      organizations: [{ name: 'JSON via stdin', slug: 'json-stdin' }],
    };
    fs.writeFileSync(noExtPath, JSON.stringify(data));
    try {
      const result = parseProvisioningFile(noExtPath);
      expect(result).toEqual(data);
    } finally {
      fs.unlinkSync(noExtPath);
    }
  });

  it('skips existence check for /dev/stdin path', () => {
    // /dev/stdin may not exist on all platforms (e.g., Windows CI),
    // but the code should not throw "File not found" for it.
    // We can't fully test /dev/stdin without a pipe, but we verify
    // the existence check is skipped (it will throw a read error instead).
    try {
      parseProvisioningFile('/dev/stdin');
    } catch (e) {
      // Should NOT be "File not found" — should be a read error or empty content error
      expect((e as Error).message).not.toContain('File not found');
    }
  });
});

// ============================================================================
// Phase 2: parseDuration() tests
// ============================================================================

import { parseDuration } from '../../../src/cli/commands/provision.js';

describe('parseDuration', () => {
  it('should parse days (e.g., "90d")', () => {
    const now = new Date();
    const result = parseDuration('90d');
    // Should be ~90 days in the future (within 1 second tolerance)
    const expectedMs = now.getTime() + 90 * 24 * 60 * 60 * 1000;
    expect(Math.abs(result.getTime() - expectedMs)).toBeLessThan(1000);
  });

  it('should parse months (e.g., "6m")', () => {
    const now = new Date();
    const result = parseDuration('6m');
    // Should be ~6 months from now
    const expected = new Date(now);
    expected.setMonth(expected.getMonth() + 6);
    expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(1000);
  });

  it('should parse years (e.g., "1y")', () => {
    const now = new Date();
    const result = parseDuration('1y');
    const expected = new Date(now);
    expected.setFullYear(expected.getFullYear() + 1);
    expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(1000);
  });

  it('should parse hours (e.g., "24h")', () => {
    const now = new Date();
    const result = parseDuration('24h');
    const expectedMs = now.getTime() + 24 * 60 * 60 * 1000;
    expect(Math.abs(result.getTime() - expectedMs)).toBeLessThan(1000);
  });

  it('should throw on invalid format', () => {
    expect(() => parseDuration('invalid')).toThrow('Invalid duration format');
    expect(() => parseDuration('90x')).toThrow('Invalid duration format');
    expect(() => parseDuration('')).toThrow('Invalid duration format');
    expect(() => parseDuration('d90')).toThrow('Invalid duration format');
  });

  it('should throw on missing number', () => {
    expect(() => parseDuration('d')).toThrow('Invalid duration format');
  });

  it('should handle large values', () => {
    const result = parseDuration('365d');
    expect(result.getTime()).toBeGreaterThan(Date.now());
  });
});

// ============================================================================
// Phase 2: provisioningSchema — new client fields
// ============================================================================

describe('provisioningSchema — Phase 2 client fields', () => {
  const makeInput = (clientOverrides = {}) => ({
    version: '1.0',
    organizations: [{
      name: 'Org',
      slug: 'org',
      applications: [{
        name: 'App',
        slug: 'app',
        clients: [{
          client_name: 'Test Client',
          client_type: 'confidential',
          redirect_uris: ['https://example.com/cb'],
          ...clientOverrides,
        }],
      }],
    }],
  });

  it('accepts post_logout_redirect_uris', () => {
    const result = provisioningSchema.safeParse(
      makeInput({ post_logout_redirect_uris: ['https://example.com/logout'] }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts allowed_origins', () => {
    const result = provisioningSchema.safeParse(
      makeInput({ allowed_origins: ['https://example.com'] }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts require_pkce: true', () => {
    const result = provisioningSchema.safeParse(makeInput({ require_pkce: true }));
    expect(result.success).toBe(true);
  });

  it('accepts require_pkce: false', () => {
    const result = provisioningSchema.safeParse(makeInput({ require_pkce: false }));
    expect(result.success).toBe(true);
  });

  it('accepts token_endpoint_auth_method enum values', () => {
    for (const method of ['client_secret_basic', 'client_secret_post', 'none']) {
      const result = provisioningSchema.safeParse(
        makeInput({ token_endpoint_auth_method: method }),
      );
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid token_endpoint_auth_method', () => {
    const result = provisioningSchema.safeParse(
      makeInput({ token_endpoint_auth_method: 'private_key_jwt' }),
    );
    expect(result.success).toBe(false);
  });

  it('accepts secret block with label only', () => {
    const result = provisioningSchema.safeParse(
      makeInput({ secret: { label: 'production-key' } }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts secret block with expires_at only', () => {
    const result = provisioningSchema.safeParse(
      makeInput({ secret: { expires_at: '2027-01-01T00:00:00Z' } }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts secret block with expires_in only', () => {
    const result = provisioningSchema.safeParse(
      makeInput({ secret: { expires_in: '90d' } }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts secret block with label + expires_in', () => {
    const result = provisioningSchema.safeParse(
      makeInput({ secret: { label: 'staging', expires_in: '6m' } }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts empty secret block', () => {
    const result = provisioningSchema.safeParse(makeInput({ secret: {} }));
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Phase 2: transformToManifest — secret block validation + flattening
// ============================================================================

describe('transformToManifest — Phase 2 secret block', () => {
  const makeProvisionFile = (clientOverrides = {}): ProvisioningFile => ({
    version: '1.0',
    organizations: [{
      name: 'Org',
      slug: 'org',
      applications: [{
        name: 'App',
        slug: 'app',
        clients: [{
          client_name: 'Test Client',
          client_type: 'confidential',
          redirect_uris: ['https://example.com/cb'],
          ...clientOverrides,
        }],
        roles: [],
        permissions: [],
        claim_definitions: [],
      }],
    }],
  });

  it('should flatten secret label to secret_label', async () => {
    const { manifest } = await transformToManifest(
      makeProvisionFile({ secret: { label: 'prod-key' } }),
    );
    expect(manifest.clients[0].secret_label).toBe('prod-key');
  });

  it('should flatten secret expires_at to secret_expires_at', async () => {
    const { manifest } = await transformToManifest(
      makeProvisionFile({ secret: { expires_at: '2027-06-15T00:00:00Z' } }),
    );
    expect(manifest.clients[0].secret_expires_at).toBe('2027-06-15T00:00:00Z');
  });

  it('should convert expires_in to ISO date in secret_expires_at', async () => {
    const before = Date.now();
    const { manifest } = await transformToManifest(
      makeProvisionFile({ secret: { expires_in: '90d' } }),
    );
    const expiresAt = new Date(manifest.clients[0].secret_expires_at!);
    // Should be ~90 days from now
    const expectedMin = before + 89 * 24 * 60 * 60 * 1000;
    const expectedMax = before + 91 * 24 * 60 * 60 * 1000;
    expect(expiresAt.getTime()).toBeGreaterThan(expectedMin);
    expect(expiresAt.getTime()).toBeLessThan(expectedMax);
  });

  it('should not include nested secret block in flat manifest', async () => {
    const { manifest } = await transformToManifest(
      makeProvisionFile({ secret: { label: 'test' } }),
    );
    // The flat manifest should not have a "secret" property
    expect((manifest.clients[0] as any).secret).toBeUndefined();
  });

  it('should not add secret fields when no secret block present', async () => {
    const { manifest } = await transformToManifest(makeProvisionFile({}));
    expect(manifest.clients[0].secret_label).toBeUndefined();
    expect(manifest.clients[0].secret_expires_at).toBeUndefined();
  });

  it('should throw when secret block is on a public client', async () => {
    await expect(
      transformToManifest(
        makeProvisionFile({ client_type: 'public', secret: { label: 'test' } }),
      ),
    ).rejects.toThrow('secret block not allowed on public clients');
  });

  it('should throw when both expires_at and expires_in are set', async () => {
    await expect(
      transformToManifest(
        makeProvisionFile({
          secret: { expires_at: '2027-01-01T00:00:00Z', expires_in: '90d' },
        }),
      ),
    ).rejects.toThrow('expires_at and expires_in are mutually exclusive');
  });

  it('should pass through post_logout_redirect_uris to flat manifest', async () => {
    const { manifest } = await transformToManifest(
      makeProvisionFile({ post_logout_redirect_uris: ['https://example.com/logout'] }),
    );
    expect(manifest.clients[0].post_logout_redirect_uris).toEqual(['https://example.com/logout']);
  });

  it('should pass through allowed_origins to flat manifest', async () => {
    const { manifest } = await transformToManifest(
      makeProvisionFile({ allowed_origins: ['https://example.com'] }),
    );
    expect(manifest.clients[0].allowed_origins).toEqual(['https://example.com']);
  });

  it('should pass through require_pkce to flat manifest', async () => {
    const { manifest } = await transformToManifest(makeProvisionFile({ require_pkce: false }));
    expect(manifest.clients[0].require_pkce).toBe(false);
  });

  it('should pass through token_endpoint_auth_method to flat manifest', async () => {
    const { manifest } = await transformToManifest(
      makeProvisionFile({ token_endpoint_auth_method: 'client_secret_basic' }),
    );
    expect(manifest.clients[0].token_endpoint_auth_method).toBe('client_secret_basic');
  });
});

// ============================================================================
// Phase 3: User provisioning schema tests
// ============================================================================

describe('provisioningSchema — Phase 3 users', () => {
  it('accepts org with users array', () => {
    const input = {
      version: '1.0',
      allow_passwords: true,
      organizations: [{
        name: 'Test Org', slug: 'test-org',
        applications: [{ name: 'App', slug: 'app' }],
        users: [{
          email: 'alice@test.local',
          given_name: 'Alice',
          family_name: 'Test',
          password: 'SecurePass123!',
          email_verified: true,
          status: 'active',
        }],
      }],
    };
    const result = provisioningSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts user with role and claim references', () => {
    const input = {
      version: '1.0',
      allow_passwords: true,
      organizations: [{
        name: 'Test Org', slug: 'test-org',
        applications: [{ name: 'App', slug: 'app', roles: [{ name: 'Admin', slug: 'admin' }] }],
        users: [{
          email: 'alice@test.local',
          password: 'SecurePass123!',
          roles: [{ app: 'app', role: 'admin' }],
          claims: [{ app: 'app', claim: 'dept', value: 'Eng' }],
        }],
      }],
    };
    const result = provisioningSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts user without password (passwordless flow)', () => {
    const input = {
      version: '1.0',
      organizations: [{
        name: 'Test Org', slug: 'test-org',
        users: [{
          email: 'bob@test.local',
          given_name: 'Bob',
          email_verified: false,
        }],
      }],
    };
    const result = provisioningSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects user with invalid email', () => {
    const input = {
      version: '1.0',
      organizations: [{
        name: 'Test Org', slug: 'test-org',
        users: [{ email: 'not-an-email' }],
      }],
    };
    const result = provisioningSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('defaults allow_passwords to false when omitted', () => {
    const input = {
      version: '1.0',
      organizations: [{ name: 'Test Org', slug: 'test-org' }],
    };
    const result = provisioningSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allow_passwords).toBe(false);
    }
  });
});

// ============================================================================
// Phase 3: Module schema tests
// ============================================================================

describe('provisioningSchema — Phase 3 modules', () => {
  it('accepts application with modules array', () => {
    const input = {
      version: '1.0',
      organizations: [{
        name: 'Test Org', slug: 'test-org',
        applications: [{
          name: 'App', slug: 'app',
          modules: [
            { name: 'Dashboard', slug: 'dashboard', status: 'active' },
            { name: 'Reports', slug: 'reports', description: 'Reporting module' },
          ],
        }],
      }],
    };
    const result = provisioningSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts application without modules (optional)', () => {
    const input = {
      version: '1.0',
      organizations: [{
        name: 'Test Org', slug: 'test-org',
        applications: [{ name: 'App', slug: 'app' }],
      }],
    };
    const result = provisioningSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Phase 3: Branding + 2FA schema tests
// ============================================================================

describe('provisioningSchema — Phase 3 branding + 2FA', () => {
  it('accepts org with branding block', () => {
    const input = {
      version: '1.0',
      organizations: [{
        name: 'Branded Org', slug: 'branded',
        branding: {
          primary_color: '#ff6600',
          company_name: 'Branded Corp',
          custom_css: 'body { color: red; }',
        },
      }],
    };
    const result = provisioningSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts org with two_factor_policy', () => {
    const input = {
      version: '1.0',
      organizations: [{
        name: 'Secure Org', slug: 'secure',
        two_factor_policy: 'required_totp',
      }],
    };
    const result = provisioningSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects invalid two_factor_policy value', () => {
    const input = {
      version: '1.0',
      organizations: [{
        name: 'Bad Org', slug: 'bad',
        two_factor_policy: 'always_on',
      }],
    };
    const result = provisioningSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('accepts all valid 2FA policy values', () => {
    for (const policy of ['optional', 'required_email', 'required_totp', 'required_any']) {
      const input = {
        version: '1.0',
        organizations: [{
          name: 'Test', slug: 'test',
          two_factor_policy: policy,
        }],
      };
      const result = provisioningSchema.safeParse(input);
      expect(result.success, `Policy '${policy}' should be valid`).toBe(true);
    }
  });

  it('accepts org without branding (optional)', () => {
    const input = {
      version: '1.0',
      organizations: [{ name: 'Plain Org', slug: 'plain' }],
    };
    const result = provisioningSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Phase 3: transformToManifest — users, modules, branding, 2FA
// ============================================================================

describe('transformToManifest — Phase 3 features', () => {
  it('extracts users to flat manifest with org_slug', async () => {
    const input: ProvisioningFile = {
      version: '1.0',
      allow_passwords: true,
      organizations: [{
        name: 'Test Org', slug: 'test-org',
        applications: [{ name: 'App', slug: 'app' }],
        users: [{
          email: 'alice@test.local',
          given_name: 'Alice',
          family_name: 'Test',
          password: 'SecurePass123!',
          email_verified: true,
          status: 'active',
        }],
      }],
    };
    const { manifest } = await transformToManifest(input);
    expect(manifest.users).toHaveLength(1);
    expect(manifest.users![0].email).toBe('alice@test.local');
    expect(manifest.users![0].organization_slug).toBe('test-org');
    expect(manifest.users![0].given_name).toBe('Alice');
    // Password should be hashed (Argon2id)
    expect(manifest.users![0].password_hash).toBeDefined();
    expect(manifest.users![0].password_hash).toMatch(/^\$argon2id\$/);
  });

  it('extracts user-role assignments from nested refs', async () => {
    const input: ProvisioningFile = {
      version: '1.0',
      allow_passwords: true,
      organizations: [{
        name: 'Test Org', slug: 'test-org',
        applications: [{
          name: 'App', slug: 'app',
          roles: [{ name: 'Admin', slug: 'admin' }],
        }],
        users: [{
          email: 'alice@test.local',
          password: 'SecurePass123!',
          roles: [{ app: 'app', role: 'admin' }],
        }],
      }],
    };
    const { manifest } = await transformToManifest(input);
    expect(manifest.user_role_assignments).toHaveLength(1);
    expect(manifest.user_role_assignments![0]).toEqual({
      email: 'alice@test.local',
      organization_slug: 'test-org',
      application_slug: 'app',
      role_slug: 'admin',
    });
  });

  it('extracts user-claim values from nested refs', async () => {
    const input: ProvisioningFile = {
      version: '1.0',
      allow_passwords: true,
      organizations: [{
        name: 'Test Org', slug: 'test-org',
        applications: [{
          name: 'App', slug: 'app',
          claim_definitions: [{ name: 'Dept', slug: 'dept', claim_type: 'string' }],
        }],
        users: [{
          email: 'alice@test.local',
          password: 'SecurePass123!',
          claims: [{ app: 'app', claim: 'dept', value: 'Engineering' }],
        }],
      }],
    };
    const { manifest } = await transformToManifest(input);
    expect(manifest.user_claim_values).toHaveLength(1);
    expect(manifest.user_claim_values![0]).toEqual({
      email: 'alice@test.local',
      organization_slug: 'test-org',
      application_slug: 'app',
      claim_slug: 'dept',
      value: 'Engineering',
    });
  });

  it('extracts application modules to flat manifest', async () => {
    const input: ProvisioningFile = {
      version: '1.0',
      organizations: [{
        name: 'Test Org', slug: 'test-org',
        applications: [{
          name: 'App', slug: 'app',
          modules: [
            { name: 'Dashboard', slug: 'dashboard', description: 'Main dashboard', status: 'active' },
            { name: 'Reports', slug: 'reports' },
          ],
        }],
      }],
    };
    const { manifest } = await transformToManifest(input);
    expect(manifest.application_modules).toHaveLength(2);
    expect(manifest.application_modules![0].slug).toBe('dashboard');
    expect(manifest.application_modules![0].application_slug).toBe('app');
    expect(manifest.application_modules![0].organization_slug).toBe('test-org');
  });

  it('maps branding block to flat org fields', async () => {
    const input: ProvisioningFile = {
      version: '1.0',
      organizations: [{
        name: 'Branded Org', slug: 'branded',
        branding: {
          primary_color: '#ff6600',
          company_name: 'Branded Corp',
          custom_css: 'body { color: red; }',
        },
      }],
    };
    const { manifest } = await transformToManifest(input);
    expect(manifest.organizations[0].branding_primary_color).toBe('#ff6600');
    expect(manifest.organizations[0].branding_company_name).toBe('Branded Corp');
    expect(manifest.organizations[0].branding_custom_css).toBe('body { color: red; }');
  });

  it('maps two_factor_policy to flat org field', async () => {
    const input: ProvisioningFile = {
      version: '1.0',
      organizations: [{
        name: 'Secure Org', slug: 'secure',
        two_factor_policy: 'required_totp',
      }],
    };
    const { manifest } = await transformToManifest(input);
    expect(manifest.organizations[0].two_factor_policy).toBe('required_totp');
  });

  it('throws when password is set but allow_passwords is false', async () => {
    const input: ProvisioningFile = {
      version: '1.0',
      allow_passwords: false,
      organizations: [{
        name: 'Test Org', slug: 'test-org',
        users: [{
          email: 'alice@test.local',
          password: 'ShouldBeRejected123!',
        }],
      }],
    };
    await expect(transformToManifest(input)).rejects.toThrow('allow_passwords');
  });

  it('handles user without password (no hash)', async () => {
    const input: ProvisioningFile = {
      version: '1.0',
      organizations: [{
        name: 'Test Org', slug: 'test-org',
        users: [{ email: 'nopass@test.local' }],
      }],
    };
    const { manifest } = await transformToManifest(input);
    expect(manifest.users).toHaveLength(1);
    expect(manifest.users![0].password_hash).toBeUndefined();
  });
});
