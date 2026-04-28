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
  it('transforms a single org with no applications', () => {
    const input: ProvisioningFile = {
      version: '1.0',
      organizations: [
        { name: 'Test Org', slug: 'test-org', applications: [] },
      ],
    };
    const { manifest, mappingCount, hasConfig } = transformToManifest(input);

    expect(manifest.version).toBe('1.0');
    expect(manifest.organizations).toHaveLength(1);
    expect(manifest.organizations[0].slug).toBe('test-org');
    expect(manifest.applications).toHaveLength(0);
    expect(mappingCount).toBe(0);
    expect(hasConfig).toBe(false);
  });

  it('flattens nested organizations → applications → clients', () => {
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
    const { manifest } = transformToManifest(input);

    expect(manifest.organizations).toHaveLength(1);
    expect(manifest.applications).toHaveLength(1);
    expect(manifest.applications[0].organization_slug).toBe('acme');
    expect(manifest.clients).toHaveLength(1);
    expect(manifest.clients[0].organization_slug).toBe('acme');
    expect(manifest.clients[0].application_slug).toBe('crm');
  });

  it('flattens roles and permissions with org/app references', () => {
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
    const { manifest } = transformToManifest(input);

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

  it('extracts role-permission mappings from inline permissions', () => {
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
    const { manifest, mappingCount } = transformToManifest(input);

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

  it('passes through config overrides', () => {
    const input: ProvisioningFile = {
      version: '1.0',
      config: { access_token_ttl: '7200', session_ttl: '43200' },
      organizations: [
        { name: 'Org', slug: 'org', applications: [] },
      ],
    };
    const { manifest, hasConfig } = transformToManifest(input);

    expect(hasConfig).toBe(true);
    expect(manifest.config).toEqual({
      access_token_ttl: '7200',
      session_ttl: '43200',
    });
  });

  it('generates slugs from names when slug is omitted', () => {
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
    const { manifest } = transformToManifest(input);

    // Slugs should be auto-generated from names (kebab-case)
    expect(manifest.organizations[0].slug).toBeTruthy();
    expect(manifest.organizations[0].slug).not.toBe('');
    expect(manifest.applications[0].slug).toBeTruthy();
    expect(manifest.roles[0].slug).toBeTruthy();
  });

  it('handles multi-org with multiple apps correctly', () => {
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
    const { manifest } = transformToManifest(input);

    expect(manifest.organizations).toHaveLength(2);
    expect(manifest.applications).toHaveLength(3);
    expect(manifest.applications[0].organization_slug).toBe('org-a');
    expect(manifest.applications[1].organization_slug).toBe('org-a');
    expect(manifest.applications[2].organization_slug).toBe('org-b');
  });

  it('flattens claim definitions with correct references', () => {
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
    const { manifest } = transformToManifest(input);

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

  it('handles roles without permissions (no mappings generated)', () => {
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
    const { manifest, mappingCount } = transformToManifest(input);

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
});
