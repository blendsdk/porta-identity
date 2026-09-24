import { describe, expect, it } from 'vitest';
import { applicationDescriptionSchema } from '../../../src/applications/validators.js';
import {
  portabilityManifestSchema,
  portabilityResultSchema,
} from '../../../src/portability/index.js';

/** Create an empty but complete organization-scoped manifest. */
function emptyManifest(): Record<string, unknown> {
  return {
    version: '1.0',
    exported_at: '2026-09-13T12:34:56.789Z',
    scope: { kind: 'organization', organization_slug: 'acme' },
    categories: ['organizations'],
    application_selection: { all_applications: false, application_slugs: [] },
    organizations: [],
    applications: [],
    application_modules: [],
    roles: [],
    permissions: [],
    claim_definitions: [],
    role_permission_mappings: [],
    users: [],
    user_role_assignments: [],
    user_claim_values: [],
    clients: [],
  };
}

/** Create a valid organization record with optional embedded assets. */
function organization(branding: Record<string, unknown>): Record<string, unknown> {
  return {
    slug: 'acme',
    name: 'Acme',
    status: 'active',
    default_locale: 'en',
    default_login_methods: ['password'],
    two_factor_policy: 'optional',
    branding: {
      logo_url: null,
      favicon_url: null,
      primary_color: null,
      company_name: null,
      custom_css: null,
      logo_asset: null,
      favicon_asset: null,
      ...branding,
    },
  };
}

/** Create PNG-shaped bytes of an exact total size for asset-boundary tests. */
function pngBytes(size: number): Buffer {
  const bytes = Buffer.alloc(size);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  return bytes;
}

/** Create all-zero result counters. */
function zeroCounts() {
  return { created: 0, updated: 0, skipped: 0, rejected: 0 };
}

/** Create a complete safe preview result. */
function previewResult(): Record<string, unknown> {
  return {
    mode: 'dry-run',
    summary: {
      organizations: zeroCounts(),
      applications: zeroCounts(),
      application_modules: zeroCounts(),
      roles: zeroCounts(),
      permissions: zeroCounts(),
      claim_definitions: zeroCounts(),
      role_permission_mappings: zeroCounts(),
      users: zeroCounts(),
      user_role_assignments: zeroCounts(),
      user_claim_values: zeroCounts(),
      clients: zeroCounts(),
    },
    items: [],
    errors: [],
  };
}

describe('portability manifest schema implementation', () => {
  it('should trim external RBAC claim values while preserving their internal form', () => {
    const manifest = emptyManifest();
    manifest.categories = ['applications_authorization'];
    manifest.application_selection = {
      all_applications: false,
      application_slugs: ['customer-portal'],
    };
    manifest.roles = [
      {
        application_slug: 'customer-portal',
        slug: '  GROUP_ABC  ',
        name: 'Group ABC',
        description: null,
      },
    ];
    manifest.permissions = [
      {
        application_slug: 'customer-portal',
        slug: '  CAN_ADD_ORDER  ',
        module_slug: null,
        name: 'Add order',
        description: null,
      },
    ];

    const parsed = portabilityManifestSchema.parse(manifest);

    expect(parsed.roles[0]?.slug).toBe('GROUP_ABC');
    expect(parsed.permissions[0]?.slug).toBe('CAN_ADD_ORDER');
  });

  it('should reject collections whose category was not selected', () => {
    const manifest = emptyManifest();
    manifest.clients = [
      {
        client_id: 'client-id',
        organization_slug: 'acme',
        application_slug: 'customer-portal',
        name: 'Client',
        client_type: 'public',
        application_type: 'spa',
        status: 'active',
        grant_types: ['authorization_code'],
        response_types: ['code'],
        scope: 'openid',
        login_methods: null,
        token_endpoint_auth_method: 'none',
        redirect_uris: ['https://client.example/callback'],
        post_logout_redirect_uris: [],
        allowed_origins: ['https://client.example'],
        require_pkce: true,
        require_consent: true,
      },
    ];

    expect(portabilityManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('should accept branding assets at the limit and reject bytes beyond it', () => {
    const atLimit = emptyManifest();
    atLimit.organizations = [
      organization({
        logo_asset: {
          media_type: 'image/png',
          content_base64: pngBytes(2 * 1024 * 1024).toString('base64'),
        },
      }),
    ];
    const beyondLimit = structuredClone(atLimit);
    const organizations = beyondLimit.organizations;
    if (!Array.isArray(organizations)) throw new TypeError('Expected organizations');
    const first = organizations[0];
    if (typeof first !== 'object' || first === null) throw new TypeError('Expected organization');
    const branding = Reflect.get(first, 'branding');
    if (typeof branding !== 'object' || branding === null) throw new TypeError('Expected branding');
    Reflect.set(branding, 'logo_asset', {
      media_type: 'image/png',
      content_base64: pngBytes(2 * 1024 * 1024 + 1).toString('base64'),
    });

    expect(portabilityManifestSchema.safeParse(atLimit).success).toBe(true);
    expect(portabilityManifestSchema.safeParse(beyondLimit).success).toBe(false);
  });

  it('should retain sanitized SVG bytes instead of active content', () => {
    const manifest = emptyManifest();
    manifest.organizations = [
      organization({
        logo_asset: {
          media_type: 'image/svg+xml',
          content_base64: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="1" height="1"/></svg>',
          ).toString('base64'),
        },
      }),
    ];

    const parsed = portabilityManifestSchema.parse(manifest);
    const sanitized = parsed.organizations[0]?.branding.logo_asset?.content_base64;

    expect(sanitized).toBeDefined();
    expect(Buffer.from(sanitized ?? '', 'base64').toString('utf8')).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>',
    );
  });

  it('should return a validation failure instead of throwing for unsafe branding URLs', () => {
    const manifest = emptyManifest();
    manifest.organizations = [organization({ logo_url: 'javascript:alert(1)' })];

    expect(() => portabilityManifestSchema.safeParse(manifest)).not.toThrow();
    expect(portabilityManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('should reject non-UTC timestamps and unsorted permission mappings', () => {
    const timestamp = emptyManifest();
    timestamp.exported_at = '2026-09-13T14:34:56.789+02:00';

    const mapping = emptyManifest();
    mapping.categories = ['applications_authorization'];
    mapping.application_selection = {
      all_applications: false,
      application_slugs: ['customer-portal'],
    };
    mapping.role_permission_mappings = [
      {
        application_slug: 'customer-portal',
        role_slug: 'reader',
        permission_slugs: ['z-last', 'a-first'],
      },
    ];

    expect(portabilityManifestSchema.safeParse(timestamp).success).toBe(false);
    expect(portabilityManifestSchema.safeParse(mapping).success).toBe(false);
  });

  it('should apply the same bounded description rule as ordinary application input', () => {
    const description = 'x'.repeat(2_001);
    const manifest = emptyManifest();
    manifest.categories = ['applications_authorization'];
    manifest.application_selection = {
      all_applications: false,
      application_slugs: ['customer-portal'],
    };
    manifest.applications = [
      {
        slug: 'customer-portal',
        name: 'Customer Portal',
        description,
        status: 'active',
      },
    ];

    expect(applicationDescriptionSchema.safeParse(description).success).toBe(false);
    expect(portabilityManifestSchema.safeParse(manifest).success).toBe(false);
  });
});

describe('portability result schema implementation', () => {
  it('should reject extra natural-key fields and more than 100 errors', () => {
    const invalidKey = previewResult();
    invalidKey.items = [
      {
        entity_type: 'organizations',
        action: 'created',
        natural_key: { slug: 'acme', database_id: 'not-portable' },
      },
    ];
    const tooManyErrors = previewResult();
    tooManyErrors.errors = Array.from({ length: 101 }, () => ({
      entity_type: 'organizations',
      natural_key: { slug: 'acme' },
      code: 'invalid_record',
    }));

    expect(portabilityResultSchema.safeParse(invalidKey).success).toBe(false);
    expect(portabilityResultSchema.safeParse(tooManyErrors).success).toBe(false);
  });

  it('should reject credentials in a dry-run result', () => {
    const result = previewResult();
    result.credentials = [];

    expect(portabilityResultSchema.safeParse(result).success).toBe(false);
  });
});
