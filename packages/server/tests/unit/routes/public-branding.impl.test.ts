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

import { getAsset } from '../../../src/lib/branding-assets.js';
import { findOrganizationBySlug } from '../../../src/organizations/repository.js';
import type { Organization } from '../../../src/organizations/types.js';
import { createApp } from '../../../src/server.js';

const ORGANIZATION: Organization = {
  id: '10000000-0000-4000-a000-000000000001',
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
  createdAt: new Date('2026-09-10T08:00:00.000Z'),
  updatedAt: new Date('2026-09-11T08:00:00.000Z'),
};

/** Start the assembled server so failures cross the production error boundary. */
async function startApplication(): Promise<{ baseUrl: string; server: Server }> {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Missing test server port');
  return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

/** Stop the ephemeral server and surface any shutdown error. */
async function stopApplication(server: Server | undefined): Promise<void> {
  if (server === undefined) return;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

describe('public branding route implementation', () => {
  let server: Server | undefined;
  let baseUrl = '';

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ baseUrl, server } = await startApplication());
  });

  afterEach(async () => {
    await stopApplication(server);
    server = undefined;
  });

  it('should reject unsupported slots before querying organization storage', async () => {
    const response = await fetch(`${baseUrl}/example-organization/branding/banner`);

    expect(response.status).toBe(404);
    expect(findOrganizationBySlug).not.toHaveBeenCalled();
    expect(getAsset).not.toHaveBeenCalled();
  });

  it('should let infrastructure failures reach the sanitized server error boundary', async () => {
    vi.mocked(findOrganizationBySlug).mockResolvedValue(ORGANIZATION);
    vi.mocked(getAsset).mockRejectedValue(new Error('postgresql://private-host/secret-database'));

    const response = await fetch(`${baseUrl}/example-organization/branding/logo`);
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).not.toContain('private-host');
    expect(body).not.toContain('secret-database');
  });
});
