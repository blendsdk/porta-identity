/** Focused tests for the native JSVision host boundary. */

import { Commands, createApplication } from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

const nativeHost = vi.hoisted(() => ({ createHost: vi.fn() }));

vi.mock('@jsvision/core', async (importOriginal) => ({
  ...(await importOriginal()),
  createHost: nativeHost.createHost,
}));

import { runAdminApplication } from '../../src/admin/application.js';
import type { AdminOrganizationWorkspaceOperations } from '../../src/admin/organization-service.js';
import { ADMIN_COMMANDS } from '../../src/admin/presentation.js';
import { validateAdminCapabilities } from '../../src/admin/session-service.js';

const server = new URL('https://porta.example.test');

/** Reads plain text from the current rendered frame. */
function frameText(application: ReturnType<typeof createApplication>): string {
  return application.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

/** Lets the controller complete its initial organization and asset reads. */
async function settle(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

/** Creates the two successful reads needed to mount the organization workspace. */
function organizationWorkspaceOperations(): AdminOrganizationWorkspaceOperations {
  const organization = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Example Organization',
    slug: 'example-organization',
    status: 'active' as const,
    isSuperAdmin: false,
    defaultLocale: 'en',
    defaultLoginMethods: ['password'] as const,
    twoFactorPolicy: 'optional' as const,
    brandingCompanyName: null,
    brandingPrimaryColor: null,
    brandingLogoUrl: null,
    brandingFaviconUrl: null,
    createdAt: '2026-01-02T03:04:00.000Z',
    updatedAt: '2026-08-09T10:11:00.000Z',
  };
  return {
    get: vi.fn().mockResolvedValue({ kind: 'success', value: organization }),
    update: vi.fn().mockResolvedValue({ kind: 'success' }),
    activate: vi.fn().mockResolvedValue({ kind: 'success' }),
    suspend: vi.fn().mockResolvedValue({ kind: 'success' }),
    getLoginMethods: vi.fn().mockResolvedValue({ kind: 'success', value: ['password'] }),
    updateLoginMethods: vi.fn().mockResolvedValue({ kind: 'success' }),
    getTwoFactorPolicy: vi.fn().mockResolvedValue({ kind: 'success', value: 'optional' }),
    updateTwoFactorPolicy: vi.fn().mockResolvedValue({ kind: 'success' }),
    updateBranding: vi.fn().mockResolvedValue({ kind: 'success' }),
    listAssets: vi.fn().mockResolvedValue({ kind: 'success', value: [] }),
    uploadAsset: vi.fn().mockResolvedValue({ kind: 'success' }),
    deleteAsset: vi.fn().mockResolvedValue({ kind: 'success' }),
  };
}

describe('native admin host', () => {
  it('should render and restore the host after the keyboard quit command', async () => {
    const stop = vi.fn();
    const render = vi.fn();
    nativeHost.createHost.mockImplementation((options) => ({
      start: async () => {
        queueMicrotask(() =>
          options.onInput({
            type: 'key',
            key: 'x',
            ctrl: false,
            alt: true,
            shift: false,
            codepoint: 120,
          }),
        );
      },
      stop,
      render,
    }));

    await expect(
      runAdminApplication({
        server,
        insecure: false,
        viewport: { width: 80, height: 24 },
        applicationFactory: createApplication,
      }),
    ).resolves.toBe(0);
    expect(render).toHaveBeenCalled();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('should propagate a native host signal after aborting the application', async () => {
    nativeHost.createHost.mockImplementation((options) => ({
      start: async () => queueMicrotask(() => options.onBeforeExit(143)),
      stop: vi.fn(),
      render: vi.fn(),
    }));

    await expect(
      runAdminApplication({
        server,
        insecure: false,
        viewport: { width: 80, height: 24 },
        applicationFactory: createApplication,
      }),
    ).resolves.toBe(143);
  });

  it.each([
    [80, 24],
    [49, 19],
  ])('should render the organization workspace through the native host at %ix%i', async (width, height) => {
    let application: ReturnType<typeof createApplication> | undefined;
    let rendered = '';
    nativeHost.createHost.mockImplementation(() => ({
      start: async () => {
        if (!application) throw new Error('Application was not constructed.');
        application.loop.emitCommand(ADMIN_COMMANDS.manageOrganization);
        await settle();
        rendered = frameText(application);
        application.loop.emitCommand(Commands.quit);
      },
      stop: vi.fn(),
      render: vi.fn(),
    }));
    const workspace = organizationWorkspaceOperations();

    await expect(
      runAdminApplication({
        server,
        insecure: false,
        viewport: { width, height },
        initialState: {
          kind: 'authenticated',
          server,
          identity: { sub: 'administrator' },
          organization: {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Example Organization',
            slug: 'example-organization',
            status: 'active',
          },
          capabilities: validateAdminCapabilities(['porta-admin'], []),
        },
        session: { organizationWorkspace: workspace },
        applicationFactory: (options) => {
          application = createApplication(options);
          return application;
        },
      }),
    ).resolves.toBe(0);

    expect(workspace.get).toHaveBeenCalledOnce();
    expect(workspace.listAssets).toHaveBeenCalledOnce();
    expect(rendered).toContain('Overview');
    expect(rendered).toContain('Authentication');
    expect(rendered).toContain('Branding');
    expect(rendered).not.toContain('Terminal too small');
    expect(rendered).not.toContain('[jsvision/ui');
  });
});
