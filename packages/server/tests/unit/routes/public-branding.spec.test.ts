import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/organizations/repository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/organizations/repository.js')>();
  return { ...actual, findOrganizationBySlug: vi.fn() };
});

vi.mock('../../../src/lib/branding-assets.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/branding-assets.js')>();
  return { ...actual, getAsset: vi.fn() };
});

vi.mock('../../../src/lib/etag.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/etag.js')>();
  return { ...actual, setETagHeader: vi.fn(actual.setETagHeader) };
});

import { getAsset } from '../../../src/lib/branding-assets.js';
import type { BrandingAssetWithData } from '../../../src/lib/branding-assets.js';
import { generateETag, setETagHeader } from '../../../src/lib/etag.js';
import { findOrganizationBySlug } from '../../../src/organizations/repository.js';
import type { Organization } from '../../../src/organizations/types.js';
import { createApp } from '../../../src/server.js';

const OWNER_ID = '10000000-0000-4000-a000-000000000001';
const OTHER_ID = '20000000-0000-4000-a000-000000000002';
const UPDATED_AT = new Date('2026-09-11T08:00:00.000Z');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

/** Return the organization fields consumed by the public branding route. */
function organization(id: string, slug: string, status: 'active' | 'suspended'): Organization {
  return {
    id,
    name: `${slug} organization`,
    slug,
    status,
    isSuperAdmin: false,
    brandingLogoUrl: null,
    brandingFaviconUrl: null,
    brandingPrimaryColor: null,
    brandingCompanyName: null,
    brandingCustomCss: null,
    defaultLocale: 'en',
    twoFactorPolicy: 'optional',
    defaultLoginMethods: ['password'],
    createdAt: new Date('2026-09-10T08:00:00.000Z'),
    updatedAt: UPDATED_AT,
  };
}

/** Return stored metadata and bytes with sentinel private fields that must not be serialized. */
function storedAsset(
  organizationId: string,
  assetType: 'logo' | 'favicon',
  contentType: string,
  data: Buffer,
): BrandingAssetWithData & { filename: string; storageKey: string } {
  return {
    id: `asset-${assetType}`,
    organizationId,
    assetType,
    contentType,
    data,
    fileSize: data.length,
    createdAt: new Date('2026-09-10T08:00:00.000Z'),
    updatedAt: UPDATED_AT,
    filename: 'private-upload-name.png',
    storageKey: 'private-storage-key',
  };
}

/** Start the assembled application with a terminal fallback representing a later catch-all. */
async function startApplication(fallback: ReturnType<typeof vi.fn>): Promise<{
  baseUrl: string;
  server: Server;
}> {
  const app = createApp();
  app.use(async (context) => {
    fallback(context.path);
    context.status = 418;
    context.body = 'later catch-all';
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Missing test server port');
  return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

/** Stop an ephemeral HTTP server and surface shutdown failures. */
async function stopApplication(server: Server | undefined): Promise<void> {
  if (server === undefined) return;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

/** Remove transport-generated headers before comparing public error responses. */
function stableHeaders(response: Response): Record<string, string> {
  return Object.fromEntries(
    [...response.headers.entries()].filter(
      ([name]) => !['connection', 'date', 'keep-alive', 'x-request-id'].includes(name),
    ),
  );
}

describe('public branding route specification', () => {
  const laterCatchAll = vi.fn();
  let server: Server | undefined;
  let baseUrl = '';

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ baseUrl, server } = await startApplication(laterCatchAll));
  });

  afterEach(async () => {
    await stopApplication(server);
    server = undefined;
  });

  // Both active and suspended organizations expose only their exact stored image representation.
  it.each([
    ['active organization logo', 'active', 'logo'],
    ['suspended organization favicon', 'suspended', 'favicon'],
  ] as const)(
    'should return validated bytes and public cache metadata when requesting %s',
    async (_case, status, type) => {
      const slug = status === 'active' ? 'active-brand' : 'suspended-brand';
      const asset = storedAsset(OWNER_ID, type, 'image/png', PNG);
      vi.mocked(findOrganizationBySlug).mockResolvedValue(organization(OWNER_ID, slug, status));
      vi.mocked(getAsset).mockResolvedValue(asset);

      const response = await fetch(`${baseUrl}/${slug}/branding/${type}`);
      const bytes = Buffer.from(await response.arrayBuffer());

      expect(response.status).toBe(200);
      expect(bytes).toEqual(PNG);
      expect(response.headers.get('content-type')).toBe('image/png');
      expect(response.headers.get('etag')).toBe(
        generateETag('branding-asset', asset.id, UPDATED_AT),
      );
      expect(response.headers.get('cache-control')).toBe('public, no-cache');
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(response.headers.get('content-disposition')).toBeNull();
      expect(response.headers.get('x-organization-id')).toBeNull();
      expect(response.headers.get('x-file-size')).toBeNull();
      expect(response.headers.get('x-storage-key')).toBeNull();
      expect(findOrganizationBySlug).toHaveBeenCalledWith(slug);
      expect(getAsset).toHaveBeenCalledWith(OWNER_ID, type);
      expect(setETagHeader).toHaveBeenCalledWith(
        expect.anything(),
        'branding-asset',
        asset.id,
        UPDATED_AT,
      );
      expect(laterCatchAll).not.toHaveBeenCalled();
    },
  );

  // Organization and asset absence share one response so neither can be inventoried publicly.
  it('should return the same minimal response when organization, type, or asset is unavailable', async () => {
    vi.mocked(findOrganizationBySlug).mockResolvedValueOnce(null);
    const unknownOrganization = await fetch(`${baseUrl}/unknown-brand/branding/logo`);
    const unknownBody = await unknownOrganization.text();

    vi.mocked(findOrganizationBySlug).mockResolvedValue(
      organization(OWNER_ID, 'known-brand', 'active'),
    );
    const unsupportedType = await fetch(`${baseUrl}/known-brand/branding/banner`);
    const unsupportedBody = await unsupportedType.text();

    vi.mocked(getAsset).mockResolvedValue(null);
    const missingAsset = await fetch(`${baseUrl}/known-brand/branding/favicon`);
    const missingBody = await missingAsset.text();

    const representations = [
      {
        status: unknownOrganization.status,
        body: unknownBody,
        headers: stableHeaders(unknownOrganization),
      },
      {
        status: unsupportedType.status,
        body: unsupportedBody,
        headers: stableHeaders(unsupportedType),
      },
      { status: missingAsset.status, body: missingBody, headers: stableHeaders(missingAsset) },
    ];

    expect(representations[0]?.status).toBe(404);
    expect(representations[1]).toEqual(representations[0]);
    expect(representations[2]).toEqual(representations[0]);
    expect(unknownBody).not.toContain('unknown-brand');
    expect(unknownBody).not.toContain(OWNER_ID);
    expect(stableHeaders(unknownOrganization)).not.toHaveProperty('set-cookie');
  });

  it('should return only the slug owner asset when another organization has the same slot', async () => {
    const ownerBytes = Buffer.concat([PNG, Buffer.from('owner')]);
    const otherBytes = Buffer.concat([PNG, Buffer.from('other')]);
    vi.mocked(findOrganizationBySlug).mockImplementation(async (slug) =>
      slug === 'owner-brand'
        ? organization(OWNER_ID, 'owner-brand', 'active')
        : organization(OTHER_ID, 'other-brand', 'active'),
    );
    vi.mocked(getAsset).mockImplementation(async (organizationId, type) =>
      organizationId === OWNER_ID
        ? storedAsset(OWNER_ID, type, 'image/png', ownerBytes)
        : storedAsset(OTHER_ID, type, 'image/png', otherBytes),
    );

    const response = await fetch(`${baseUrl}/owner-brand/branding/logo`);

    expect(Buffer.from(await response.arrayBuffer())).toEqual(ownerBytes);
    expect(getAsset).toHaveBeenCalledOnce();
    expect(getAsset).toHaveBeenCalledWith(OWNER_ID, 'logo');
    expect(getAsset).not.toHaveBeenCalledWith(OTHER_ID, expect.anything());
  });

  // Direct SVG navigation keeps the sanitized stored bytes but cannot execute active content.
  it('should return renderable SVG bytes with nosniff and restrictive CSP when SVG is stored', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1" /></svg>',
    );
    vi.mocked(findOrganizationBySlug).mockResolvedValue(
      organization(OWNER_ID, 'vector-brand', 'suspended'),
    );
    vi.mocked(getAsset).mockResolvedValue(storedAsset(OWNER_ID, 'logo', 'image/svg+xml', svg));

    const response = await fetch(`${baseUrl}/vector-brand/branding/logo`);

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(svg);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toBe(
      "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
    );
    expect(response.headers.get('cache-control')).toBe('public, no-cache');
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
