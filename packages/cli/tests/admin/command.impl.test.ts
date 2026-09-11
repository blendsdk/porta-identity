/** Implementation coverage for production Admin command SDK-domain composition. */

import { describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  loadCredentials: vi.fn(() => null),
  createClient: vi.fn(),
}));

vi.mock('../../src/credential-store.js', () => ({
  loadCredentials: dependencies.loadCredentials,
}));
vi.mock('../../src/client-factory.js', () => ({
  createClient: dependencies.createClient,
}));

import { runAdminCommand } from '../../src/commands/admin.js';

const arguments_ = {
  json: false,
  verbose: false,
  insecure: false,
  force: false,
  server: 'https://porta.example.test',
  _: ['admin'],
  $0: 'porta',
};

describe('admin command implementation', () => {
  it('shares one lazy SDK client with all organization workspace domains', async () => {
    const organizationId = '11111111-1111-4111-8111-111111111111';
    const get = vi.fn().mockResolvedValue({
      data: {
        id: organizationId,
        name: 'Example Organization',
        slug: 'example-organization',
        status: 'active',
        isSuperAdmin: false,
        defaultLocale: 'en',
        defaultLoginMethods: ['password'],
        twoFactorPolicy: 'optional',
        brandingCompanyName: null,
        brandingPrimaryColor: null,
        brandingLogoUrl: null,
        brandingFaviconUrl: null,
        createdAt: '2026-01-02T03:04:00.000Z',
        updatedAt: '2026-08-09T10:11:00.000Z',
      },
    });
    const listAssets = vi.fn().mockResolvedValue([]);
    const getPolicy = vi.fn().mockResolvedValue({ twoFactorPolicy: 'optional' });
    dependencies.createClient.mockReturnValue({
      organizations: {
        get,
        listAll: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        activate: vi.fn(),
        suspend: vi.fn(),
      },
      users: {},
      applications: {},
      clients: {},
      roles: {},
      permissions: {},
      userRoles: {},
      branding: {
        listAssets,
        updateSettings: vi.fn(),
        uploadAsset: vi.fn(),
        deleteAsset: vi.fn(),
      },
      twoFactor: { getPolicy, setPolicy: vi.fn() },
    });
    const runApplication = vi.fn(async (options) => {
      const prepared = options.prepareSession(new URL('https://porta.example.test'), {
        presentAuthorizationUrl: vi.fn(),
        requestManualCallback: vi.fn(),
        confirmCredentialReplacement: vi.fn(),
      });
      expect(dependencies.createClient).not.toHaveBeenCalled();

      await prepared.session.organizationWorkspace?.get(organizationId);
      await prepared.session.organizationWorkspace?.listAssets(organizationId);
      await prepared.session.organizationWorkspace?.getTwoFactorPolicy(organizationId);

      expect(dependencies.createClient).toHaveBeenCalledOnce();
      expect(get).toHaveBeenCalledOnce();
      expect(listAssets).toHaveBeenCalledOnce();
      expect(getPolicy).toHaveBeenCalledOnce();
      return 0;
    });

    await expect(
      runAdminCommand(arguments_, {
        stdinIsTTY: true,
        stdoutIsTTY: true,
        writeStderr: vi.fn(),
        runApplication,
      }),
    ).resolves.toBe(0);
  });
});
