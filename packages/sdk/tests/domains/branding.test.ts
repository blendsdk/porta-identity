import { describe, expect, it, vi } from 'vitest';
import { createBrandingDomain } from '../../src/domains/branding.js';
import type { Organization } from '../../src/types/organizations.js';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';

const ORGANIZATION_ID = 'org-1';

const organization: Organization = {
  id: ORGANIZATION_ID,
  name: 'Acme',
  slug: 'acme',
  status: 'active',
  isSuperAdmin: false,
  brandingLogoUrl: null,
  brandingFaviconUrl: null,
  brandingPrimaryColor: '#ffffff',
  brandingCompanyName: 'Acme',
  brandingCustomCss: null,
  defaultLocale: 'en',
  twoFactorPolicy: 'optional',
  defaultLoginMethods: ['password'],
  createdAt: '2026-09-11T08:00:00.000Z',
  updatedAt: '2026-09-11T08:00:00.000Z',
};

const asset = {
  id: 'asset-1',
  organizationId: ORGANIZATION_ID,
  assetType: 'logo' as const,
  contentType: 'image/png' as const,
  fileSize: 8,
  createdAt: '2026-09-11T08:00:00.000Z',
  updatedAt: '2026-09-11T08:00:00.000Z',
};

/** Create a transport spy with a complete successful response by default. */
function mockTransport(response: Partial<TransportResponse> = {}): HttpTransport {
  return {
    request: vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body: {},
      ...response,
    }),
  };
}

describe('domains/branding', () => {
  it('lists unwrapped asset metadata', async () => {
    const transport = mockTransport({ body: { data: [asset] } });
    const branding = createBrandingDomain(transport);

    const result = await branding.listAssets(ORGANIZATION_ID);

    expect(transport.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/organizations/org-1/branding',
    });
    expect(result).toEqual([asset]);
  });

  it('updates flat settings and unwraps the complete organization', async () => {
    const input = { primaryColor: '#ffffff', companyName: 'Acme' };
    const transport = mockTransport({ body: { data: organization } });
    const branding = createBrandingDomain(transport);

    const result = await branding.updateSettings(ORGANIZATION_ID, input);

    expect(transport.request).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/organizations/org-1/branding',
      body: input,
    });
    expect(result).toEqual(organization);
  });

  it('returns the protected raw asset response unchanged', async () => {
    const raw = new Response(Buffer.from('png-data'), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    });
    const response = {
      status: 200,
      body: undefined,
      headers: { 'content-type': 'image/png' },
      raw,
    };
    const transport = mockTransport(response);
    const branding = createBrandingDomain(transport);

    const result = await branding.getAsset(ORGANIZATION_ID, 'logo');

    expect(transport.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/organizations/org-1/branding/logo',
      responseType: 'raw',
    });
    expect(result).toEqual(response);
  });

  it('uploads a JSON base64 envelope and unwraps metadata', async () => {
    const input = { data: 'iVBORw0KGgo=', contentType: 'image/png' as const };
    const transport = mockTransport({ body: { data: asset } });
    const branding = createBrandingDomain(transport);

    const result = await branding.uploadAsset(ORGANIZATION_ID, 'logo', input);

    expect(transport.request).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/organizations/org-1/branding/logo',
      body: input,
    });
    expect(result).toEqual(asset);
  });

  it('deletes one asset without a request body', async () => {
    const transport = mockTransport({ status: 204, body: undefined });
    const branding = createBrandingDomain(transport);

    const result = await branding.deleteAsset(ORGANIZATION_ID, 'favicon');

    expect(transport.request).toHaveBeenCalledWith({
      method: 'DELETE',
      path: '/organizations/org-1/branding/favicon',
    });
    expect(result).toBeUndefined();
  });
});
