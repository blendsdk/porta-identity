import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderEmail } from '../../../src/auth/email-renderer.js';
import {
  initTemplateEngine,
  renderPage,
  type TemplateContext,
} from '../../../src/auth/template-engine.js';
import type { BrandingAsset } from '../../../src/lib/branding-assets.js';
import type { Organization } from '../../../src/organizations/types.js';

const mocks = vi.hoisted(() => ({
  listAssets: vi.fn(),
  virtualFiles: new Map<string, string>(),
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const virtualSource = (filePath: unknown) => {
    const normalizedPath = String(filePath).replaceAll('\\', '/');
    for (const [suffix, source] of mocks.virtualFiles) {
      if (normalizedPath.endsWith(suffix)) return source;
    }
    return undefined;
  };
  const access = vi.fn((...args: Parameters<typeof actual.access>) => {
    if (virtualSource(args[0]) !== undefined) return Promise.resolve();
    return Reflect.apply(actual.access, actual, args);
  });
  const readFile = vi.fn((...args: Parameters<typeof actual.readFile>) => {
    const source = virtualSource(args[0]);
    if (source !== undefined) return Promise.resolve(source);
    return Reflect.apply(actual.readFile, actual, args);
  });

  return {
    ...actual,
    default: { ...actual, access, readFile },
  };
});

vi.mock('../../../src/lib/branding-assets.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/lib/branding-assets.js')>()),
  listAssets: mocks.listAssets,
}));

vi.mock('../../../src/config/index.js', () => ({
  config: { issuerBaseUrl: 'https://identity.example.test' },
}));

vi.mock('../../../src/lib/logger.js', () => ({ logger: mocks.logger }));

interface EffectiveBranding {
  readonly companyName: string;
  readonly primaryColor: string;
  readonly logoUrl: string | null;
  readonly faviconUrl: string | null;
  readonly customCss: string | null;
  readonly imageSources: readonly string[];
}

interface EffectiveBrandingModule {
  resolveEffectiveBranding(organization: Organization): Promise<EffectiveBranding>;
}

const modulePath = new URL('../../../src/auth/effective-branding.js', import.meta.url).href;

async function loadResolver(): Promise<EffectiveBrandingModule['resolveEffectiveBranding']> {
  const module = (await import(modulePath)) as EffectiveBrandingModule;
  return module.resolveEffectiveBranding;
}

function organization(overrides: Partial<Organization> = {}): Organization {
  const timestamp = new Date('2026-01-02T03:04:05.000Z');
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Example Organization',
    slug: 'example-organization',
    status: 'active',
    isSuperAdmin: false,
    brandingLogoUrl: null,
    brandingFaviconUrl: null,
    brandingPrimaryColor: null,
    brandingCompanyName: null,
    brandingCustomCss: null,
    defaultLocale: 'en',
    twoFactorPolicy: 'optional',
    defaultLoginMethods: ['password'],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function asset(overrides: Partial<BrandingAsset> = {}): BrandingAsset {
  const timestamp = new Date('2026-01-02T03:04:05.000Z');
  return {
    id: '00000000-0000-4000-8000-000000000101',
    organizationId: '00000000-0000-4000-8000-000000000001',
    assetType: 'logo',
    contentType: 'image/png',
    fileSize: 128,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe('effective organization branding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.virtualFiles.clear();
    mocks.listAssets.mockResolvedValue([]);
  });

  // Uploaded assets use the configured issuer and cannot be redirected by request-derived hosts.
  it('should prefer an absolute trusted uploaded logo URL when a configured fallback and hostile hosts are present', async () => {
    mocks.listAssets.mockResolvedValue([asset()]);
    const resolveEffectiveBranding = await loadResolver();
    const hostileHosts = ['attacker.example', 'forwarded.attacker.example'];

    expect(resolveEffectiveBranding).toHaveLength(1);
    const result = await resolveEffectiveBranding(
      organization({ brandingLogoUrl: 'https://fallback.example/logo.png' }),
    );

    expect(result.logoUrl).toBe('https://identity.example.test/example-organization/branding/logo');
    for (const hostileHost of hostileHosts) expect(result.logoUrl).not.toContain(hostileHost);
    expect(result.logoUrl).not.toContain('fallback.example');
    expect(result.imageSources).toEqual(["'self'"]);
    expect(mocks.listAssets).toHaveBeenCalledOnce();
    expect(mocks.listAssets).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
  });

  // A configured external image contributes its origin, never its path, to the image policy.
  it('should use a validated configured image URL when uploaded metadata is absent', async () => {
    const resolveEffectiveBranding = await loadResolver();

    const result = await resolveEffectiveBranding(
      organization({
        brandingLogoUrl: 'https://static.example.test/brands/logo.png?version=2',
        brandingFaviconUrl: 'https://static.example.test/brands/favicon.ico',
      }),
    );

    expect(result.logoUrl).toBe('https://static.example.test/brands/logo.png?version=2');
    expect(result.faviconUrl).toBe('https://static.example.test/brands/favicon.ico');
    expect(result.imageSources).toEqual(['https://static.example.test']);
  });

  // Blank optional settings fall back without discarding compatible custom styling.
  it('should use organization defaults and preserve custom CSS when images and text settings are blank', async () => {
    const resolveEffectiveBranding = await loadResolver();

    const result = await resolveEffectiveBranding(
      organization({
        name: 'Fallback Organization Name',
        brandingCompanyName: '   ',
        brandingPrimaryColor: '',
        brandingCustomCss: '.login-card { border-radius: 1rem; }',
      }),
    );

    expect(result).toEqual({
      companyName: 'Fallback Organization Name',
      primaryColor: '#3B82F6',
      logoUrl: null,
      faviconUrl: null,
      customCss: '.login-card { border-radius: 1rem; }',
      imageSources: [],
    });
  });

  // Metadata lookup failures degrade once to configured branding and never disclose diagnostic inputs.
  it('should return configured branding and one sanitized diagnostic when metadata lookup fails', async () => {
    const rawFailure =
      'SELECT data FROM branding_assets failed: password=database-secret bytes=89504e47';
    mocks.listAssets.mockRejectedValue(new Error(rawFailure));
    const resolveEffectiveBranding = await loadResolver();
    const configuredLogo = 'https://assets.example.test/private-name/logo.png';
    const org = organization({
      id: '00000000-0000-4000-8000-00000000dead',
      name: 'Diagnostic Canary Organization',
      slug: 'diagnostic-canary',
      brandingLogoUrl: configuredLogo,
      brandingCompanyName: 'Diagnostic Canary Company',
      brandingCustomCss: '/* diagnostic-canary-css */',
    });

    const result = await resolveEffectiveBranding(org);

    expect(result.logoUrl).toBe(configuredLogo);
    expect(result.companyName).toBe('Diagnostic Canary Company');
    expect(mocks.listAssets).toHaveBeenCalledOnce();

    const diagnosticCalls = [
      ...mocks.logger.debug.mock.calls,
      ...mocks.logger.error.mock.calls,
      ...mocks.logger.info.mock.calls,
      ...mocks.logger.warn.mock.calls,
    ];
    expect(diagnosticCalls).toHaveLength(1);
    const diagnostic = JSON.stringify(diagnosticCalls);
    for (const secret of [
      rawFailure,
      org.id,
      org.name,
      org.slug,
      configuredLogo,
      org.brandingCompanyName,
      org.brandingCustomCss,
      '89504e47',
      'database-secret',
    ]) {
      expect(diagnostic).not.toContain(secret as string);
    }
  });

  // Default and organization-specific renderers consume presentation values without storage records.
  it('should pass the same presentation fields to default and organization-specific page and email templates', async () => {
    mocks.listAssets.mockResolvedValue([
      asset({ fileSize: 73_091 }),
      asset({
        id: '00000000-0000-4000-8000-000000000102',
        assetType: 'favicon',
        contentType: 'image/x-icon',
        fileSize: 84_017,
      }),
    ]);
    const resolveEffectiveBranding = await loadResolver();

    const branding = await resolveEffectiveBranding(
      organization({
        brandingCompanyName: 'Template Company',
        brandingPrimaryColor: '#123ABC',
        brandingCustomCss: '.brand-marker { color: #123ABC; }',
      }),
    );
    const templateSource = [
      '{{branding.companyName}}',
      '{{branding.primaryColor}}',
      '{{branding.logoUrl}}',
      '{{branding.faviconUrl}}',
      '{{branding.customCss}}',
      '{{#each branding.imageSources}}{{this}}{{/each}}',
    ].join('|');
    for (const suffix of [
      '/default/pages/branding-contract.hbs',
      '/example-organization/pages/branding-contract.hbs',
      '/default/emails/branding-contract.hbs',
      '/default/emails/branding-contract.txt.hbs',
      '/example-organization/emails/branding-contract.hbs',
      '/example-organization/emails/branding-contract.txt.hbs',
    ]) {
      mocks.virtualFiles.set(suffix, templateSource);
    }
    await initTemplateEngine();

    const basePageContext = {
      branding,
      locale: 'en',
      t: (key: string) => key,
      csrfToken: 'csrf-token',
    } satisfies Omit<TemplateContext, 'orgSlug'>;
    const [defaultPage, organizationPage, defaultEmail, organizationEmail] = await Promise.all([
      renderPage('branding-contract', { ...basePageContext, orgSlug: 'no-template-override' }),
      renderPage('branding-contract', { ...basePageContext, orgSlug: 'example-organization' }),
      renderEmail('branding-contract', 'no-template-override', { branding }),
      renderEmail('branding-contract', 'example-organization', { branding }),
    ]);
    const outputs = [
      defaultPage,
      organizationPage,
      defaultEmail.html,
      defaultEmail.text,
      organizationEmail.html,
      organizationEmail.text,
    ];

    for (const output of outputs) {
      for (const presentationValue of [
        branding.companyName,
        branding.primaryColor,
        branding.logoUrl,
        branding.faviconUrl,
        branding.customCss,
      ]) {
        expect(output).toContain(presentationValue as string);
      }
      expect(output).toContain('self');
      for (const forbiddenValue of [
        '00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000102',
        '00000000-0000-4000-8000-000000000001',
        'image/png',
        'image/x-icon',
        '73091',
        '84017',
      ]) {
        expect(output).not.toContain(forbiddenValue);
      }
    }
  });
});
