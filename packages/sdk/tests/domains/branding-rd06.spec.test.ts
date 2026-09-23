import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrandingDomain } from '../../src/domains/branding.js';
import type { Organization } from '../../src/types/organizations.js';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';

const ORGANIZATION_ID = 'organization-1';

const asset = {
  id: 'asset-1',
  organizationId: ORGANIZATION_ID,
  assetType: 'logo' as const,
  contentType: 'image/png' as const,
  fileSize: 68,
  createdAt: '2026-09-11T08:00:00.000Z',
  updatedAt: '2026-09-11T08:00:00.000Z',
};

const organization: Organization = {
  id: ORGANIZATION_ID,
  name: 'Acme Corporation',
  slug: 'acme-corporation',
  status: 'active',
  isSuperAdmin: false,
  brandingLogoUrl: 'https://assets.example.test/logo.png',
  brandingFaviconUrl: null,
  brandingPrimaryColor: '#123456',
  brandingCompanyName: 'Acme',
  brandingCustomCss: null,
  defaultLocale: 'en',
  twoFactorPolicy: 'optional',
  defaultLoginMethods: ['password'],
  createdAt: '2026-09-11T08:00:00.000Z',
  updatedAt: '2026-09-11T08:00:00.000Z',
};

interface ExpectedBrandingDomain {
  listAssets(orgId: string): Promise<(typeof asset)[]>;
  updateSettings(orgId: string, input: Record<string, unknown>): Promise<Organization>;
  uploadAsset(
    orgId: string,
    assetType: 'logo' | 'favicon',
    input: { data: string; contentType: string },
  ): Promise<typeof asset>;
  getAsset(orgId: string, assetType: 'logo' | 'favicon'): Promise<TransportResponse>;
  deleteAsset(orgId: string, assetType: 'logo' | 'favicon'): Promise<void>;
}

/** Build a transport whose calls and supplied server response remain observable. */
function transportWith(response: Partial<TransportResponse> = {}): HttpTransport {
  return {
    request: vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body: {},
      ...response,
    }),
  };
}

/** Expose the intended public surface while its compile-time contract is specified separately. */
function brandingWith(transport: HttpTransport): ExpectedBrandingDomain {
  return createBrandingDomain(transport) as unknown as ExpectedBrandingDomain;
}

describe('branding SDK transport specification', () => {
  let transport: HttpTransport;

  beforeEach(() => {
    transport = transportWith();
  });

  it('should list asset metadata through the organization branding collection', async () => {
    transport = transportWith({ body: { data: [asset] } });
    const branding = brandingWith(transport);

    const result = await branding.listAssets(ORGANIZATION_ID);

    expect(transport.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/organizations/organization-1/branding',
    });
    expect(result).toEqual([asset]);
  });

  it('should update flat branding settings and return the full organization', async () => {
    const input = {
      logoUrl: 'https://assets.example.test/logo.png',
      faviconUrl: null,
      primaryColor: '#123456',
      companyName: 'Acme',
      customCss: null,
    };
    transport = transportWith({ body: { data: organization } });
    const branding = brandingWith(transport);

    const result = await branding.updateSettings(ORGANIZATION_ID, input);

    expect(transport.request).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/organizations/organization-1/branding',
      body: input,
    });
    expect(result).toEqual(organization);
  });

  it('should upload an exact JSON base64 envelope and return asset metadata', async () => {
    const input = { data: 'iVBORw0KGgo=', contentType: 'image/png' };
    transport = transportWith({ body: { data: asset } });
    const branding = brandingWith(transport);

    const result = await branding.uploadAsset(ORGANIZATION_ID, 'logo', input);

    expect(transport.request).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/organizations/organization-1/branding/logo',
      body: input,
    });
    expect(result).toEqual(asset);
  });

  it('should retain the protected raw asset response', async () => {
    const rawResponse = new Response('png-bytes', {
      status: 200,
      headers: { 'content-type': 'image/png' },
    });
    const response = {
      status: 200,
      headers: { 'content-type': 'image/png' },
      body: undefined,
      raw: rawResponse,
    };
    transport = transportWith(response);
    const branding = brandingWith(transport);

    const result = await branding.getAsset(ORGANIZATION_ID, 'favicon');

    expect(transport.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/organizations/organization-1/branding/favicon',
      responseType: 'raw',
    });
    expect(result).toEqual(response);
  });

  it('should delete an organization asset and resolve without a value', async () => {
    transport = transportWith({ status: 204, body: undefined });
    const branding = brandingWith(transport);

    const result = await branding.deleteAsset(ORGANIZATION_ID, 'logo');

    expect(transport.request).toHaveBeenCalledWith({
      method: 'DELETE',
      path: '/organizations/organization-1/branding/logo',
    });
    expect(result).toBeUndefined();
  });

  // The domain has one direct contract and retains no legacy settings alias or upload path.
  it('should expose only list, update, upload, protected read, and delete operations', () => {
    const branding = createBrandingDomain(transport);

    expect(Object.keys(branding).sort()).toEqual(
      ['listAssets', 'updateSettings', 'uploadAsset', 'getAsset', 'deleteAsset'].sort(),
    );
    expect('getSettings' in branding).toBe(false);
  });
});
