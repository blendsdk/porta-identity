/** Observable shell integration specifications for Applications and OIDC Clients. */

import { createApplication, Dialog, View } from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import { runAdminApplication } from '../../src/admin/application.js';
import type { AdminApplicationSession } from '../../src/admin/application.js';
import type { AdminConnectionState } from '../../src/admin/state.js';

const server = new URL('https://porta.example.test');
const organization = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Selected Organization',
  slug: 'selected-organization',
  status: 'active' as const,
};
const applicationRow = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Customer Portal',
  slug: 'customer-portal',
  description: null,
  status: 'active' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
};
const clientRow = {
  id: '33333333-3333-4333-8333-333333333333',
  organizationId: organization.id,
  applicationId: applicationRow.id,
  clientId: 'generated-client-id',
  clientName: 'Portal Web Client',
  clientType: 'confidential' as const,
  applicationType: 'web' as const,
  redirectUris: ['https://portal.example.test/callback'],
  postLogoutRedirectUris: [],
  grantTypes: ['authorization_code' as const],
  responseTypes: ['code' as const],
  scope: 'openid',
  tokenEndpointAuthMethod: 'client_secret_basic' as const,
  allowedOrigins: ['https://portal.example.test'],
  requirePkce: true,
  loginMethods: null,
  effectiveLoginMethods: ['password' as const],
  status: 'active' as const,
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-08-02T00:00:00Z',
};
const allCapabilities = {
  canReadOrganizations: true,
  canCreateOrganizations: true,
  canReadUsers: false,
  canCreateUsers: false,
  canInviteUsers: false,
  canUpdateUsers: false,
  canManageUserLifecycle: false,
  canPurgeUsers: false,
  canReadApplications: true,
  canCreateApplications: true,
  canUpdateApplications: true,
  canArchiveApplications: true,
  canReadClients: true,
  canCreateClients: true,
  canUpdateClients: true,
  canRevokeClients: true,
};
const commands = {
  browseApplications: 'browse-applications',
  createApplication: 'create-application',
  browseClients: 'browse-clients',
  createClient: 'create-client',
} as const;

/** Creates one authenticated shell state with optional organization ownership. */
function authenticated(
  selected: typeof organization | null = organization,
  capabilities = allCapabilities,
): AdminConnectionState {
  return {
    kind: 'authenticated',
    server,
    identity: { sub: 'subject-1', email: 'admin@example.test' },
    capabilities,
    ...(selected ? { organization: selected } : {}),
  };
}

/** Reads visible text from a real JSVision frame. */
function frameText(application: ReturnType<typeof createApplication>): string {
  return application.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

/** Allows command continuations and coalesced repaint to finish. */
async function settle(): Promise<void> {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

/** Creates one explicitly controlled promise for ownership-race specifications. */
function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolvePromise = (_value: T): void => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

/** Creates complete feature operation sets with observable list methods. */
function featureSession(overrides: Partial<AdminApplicationSession> = {}): AdminApplicationSession {
  const mutation = vi.fn().mockResolvedValue({ kind: 'success' });
  return {
    applications: {
      listAll: vi.fn().mockResolvedValue({ kind: 'success', value: [applicationRow] }),
      get: vi.fn().mockResolvedValue({ kind: 'success', value: { application: applicationRow, etag: null } }),
      create: vi.fn(),
      update: vi.fn(),
      activate: mutation,
      deactivate: mutation,
      archive: mutation,
      listModules: vi.fn().mockResolvedValue({ kind: 'success', value: [] }),
      addModule: vi.fn(),
      updateModule: vi.fn(),
      deactivateModule: mutation,
    },
    clients: {
      listAll: vi.fn().mockResolvedValue({ kind: 'success', value: [clientRow] }),
      get: vi.fn().mockResolvedValue({ kind: 'success', value: { client: clientRow, etag: null } }),
      create: vi.fn(),
      update: vi.fn(),
      activate: mutation,
      deactivate: mutation,
      revoke: mutation,
      listSecrets: vi.fn().mockResolvedValue({ kind: 'success', value: [] }),
      generateSecret: vi.fn(),
      revokeSecret: mutation,
    },
    ...overrides,
  };
}

describe('application and client shell navigation', () => {
  it('keeps Applications global while OIDC Clients has the exact organization requirement', async () => {
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticated(null),
      session: featureSession(),
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        expect(application.loop.isCommandEnabled(commands.browseApplications)).toBe(true);
        expect(application.loop.isCommandEnabled(commands.browseClients)).toBe(false);
        application.loop.emitCommand(commands.browseApplications);
        await settle();
        expect(frameText(application)).toContain('Deployment-global applications');
        application.loop.dispatch({ type: 'key', key: 'c', codepoint: 99, ctrl: false, alt: true, shift: false });
        await settle();
        const matches = frameText(application).match(/OIDC Clients \(organization required\)/g);
        expect(matches).toHaveLength(1);
        return 0;
      },
    });
  });

  it.each([
    ['both permissions', allCapabilities, true],
    ['missing application read', { ...allCapabilities, canReadApplications: false }, false],
    ['missing client create', { ...allCapabilities, canCreateClients: false }, false],
  ])('enables create-client only with %s', async (_case, capabilities, expected) => {
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticated(organization, capabilities),
      session: featureSession(),
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        expect(application.loop.isCommandEnabled(commands.createClient)).toBe(expected);
        return 0;
      },
    });
  });

  it('mounts exactly one workspace and focuses its focusable child after replacement', async () => {
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticated(),
      session: featureSession(),
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        application.loop.emitCommand(commands.browseApplications);
        await settle();
        expect(frameText(application)).toContain('Deployment-global applications');
        const applicationFocus = application.loop.getFocused();
        expect(applicationFocus).toBeInstanceOf(View);
        expect(applicationFocus?.focusable).toBe(true);

        application.loop.emitCommand(commands.browseClients);
        await settle();
        expect(frameText(application)).toContain('Portal Web Client');
        expect(frameText(application)).not.toContain('Deployment-global applications');
        expect(application.loop.getFocused()?.focusable).toBe(true);
        return 0;
      },
    });
  });
});

describe('application and client shell ownership', () => {
  it('clears organization client work on switch while retaining global application ownership', async () => {
    const switched = { ...organization, id: '44444444-4444-4444-8444-444444444444', name: 'Other Organization', slug: 'other' };
    const reauthenticate = vi.fn().mockResolvedValue(authenticated(switched));
    const session = featureSession({ reauthenticate });
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticated(),
      session,
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        application.loop.emitCommand(commands.browseApplications);
        await settle();
        application.loop.emitCommand(commands.browseClients);
        await settle();
        application.loop.emitCommand('reauthenticate');
        await settle();
        expect(reauthenticate).toHaveBeenCalledOnce();
        expect(frameText(application)).not.toContain('Portal Web Client');
        application.loop.emitCommand(commands.browseApplications);
        await settle();
        expect(frameText(application)).toContain('Deployment-global applications');
        return 0;
      },
    });
  });

  it.each(['replacement', 'invalidation'] as const)('clears both features, dialogs, and plaintext on authentication %s', async (outcome) => {
    const reauthenticate = vi.fn().mockResolvedValue(
      outcome === 'replacement'
        ? authenticated(organization)
        : { kind: 'unauthenticated', server } satisfies AdminConnectionState,
    );
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticated(),
      session: featureSession({ reauthenticate }),
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        application.loop.emitCommand(commands.browseClients);
        await settle();
        application.loop.emitCommand(commands.createClient);
        await settle();
        application.loop.emitCommand('reauthenticate');
        await settle();
        expect(application.desktop.activeWindow()).not.toBeInstanceOf(Dialog);
        expect(frameText(application)).not.toMatch(/Portal Web Client|one-time-secret-value/);
        return 0;
      },
    });
  });

  it('does not open an old-organization client dialog after a deferred application load', async () => {
    const applications = deferred<Awaited<ReturnType<NonNullable<AdminApplicationSession['applications']>['listAll']>>>();
    const switched = { ...organization, id: '44444444-4444-4444-8444-444444444444' };
    const base = featureSession({ reauthenticate: vi.fn().mockResolvedValue(authenticated(switched)) });
    if (!base.applications) throw new Error('Application operations missing.');
    const session: AdminApplicationSession = {
      ...base,
      applications: { ...base.applications, listAll: vi.fn(() => applications.promise) },
    };
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticated(),
      session,
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        application.loop.emitCommand(commands.createClient);
        await settle();
        application.loop.emitCommand('reauthenticate');
        await settle();
        applications.resolve({ kind: 'success', value: [applicationRow] });
        await settle();
        expect(application.desktop.activeWindow()).not.toBeInstanceOf(Dialog);
        expect(frameText(application)).not.toContain(organization.name);
        return 0;
      },
    });
  });

  it('owns one deferred application preload across duplicate create-client commands', async () => {
    const applications = deferred<Awaited<ReturnType<NonNullable<AdminApplicationSession['applications']>['listAll']>>>();
    const base = featureSession();
    if (!base.applications) throw new Error('Application operations missing.');
    const listAll = vi.fn(() => applications.promise);
    const session: AdminApplicationSession = {
      ...base,
      applications: { ...base.applications, listAll },
    };
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticated(),
      session,
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        application.loop.emitCommand(commands.createClient);
        application.loop.emitCommand(commands.createClient);
        await settle();
        expect(listAll).toHaveBeenCalledOnce();
        expect(application.desktop.activeWindow()).not.toBeInstanceOf(Dialog);

        applications.resolve({ kind: 'success', value: [applicationRow] });
        await settle();
        expect(frameText(application)).toContain('Create OIDC client');
        return 0;
      },
    });
  });

  it('removes a feature dialog when another pending operation invalidates the session', async () => {
    const clients = deferred<{ readonly kind: 'session-invalid' }>();
    let dialogOpened = false;
    let finalFrame = '';
    const base = featureSession();
    if (!base.clients) throw new Error('Client operations missing.');
    const session = featureSession({
      clients: { ...base.clients, listAll: vi.fn(() => clients.promise) },
    });
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticated(),
      session,
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        application.loop.emitCommand(commands.browseApplications);
        await settle();
        application.loop.emitCommand(commands.browseClients);
        await settle();
        application.loop.emitCommand(commands.createClient);
        await settle();
        dialogOpened = frameText(application).includes('Create OIDC client');

        clients.resolve({ kind: 'session-invalid' });
        await settle();
        finalFrame = frameText(application);
        return 0;
      },
    });
    expect(dialogOpened).toBe(true);
    expect(finalFrame).not.toContain('Create OIDC client');
    expect(finalFrame).not.toContain(organization.name);
  });

  it('owns generated plaintext during Alt-X and removes it before clean exit', async () => {
    const secret = {
      id: '55555555-5555-4555-8555-555555555555',
      clientId: clientRow.id,
      label: 'runtime',
      status: 'active' as const,
      lastUsedAt: null,
      expiresAt: null,
      createdAt: '2026-08-30T00:00:00Z',
    };
    const base = featureSession();
    if (!base.clients) throw new Error('Client operations missing.');
    const session: AdminApplicationSession = {
      ...base,
      clients: {
        ...base.clients,
        listSecrets: vi.fn().mockResolvedValue({ kind: 'success', value: [secret] }),
        generateSecret: vi.fn().mockResolvedValue({
          kind: 'success',
          value: { ...secret, plaintext: 'one-time-secret-value' },
        }),
      },
    };
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const exit = await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticated(),
      session,
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        application.loop.emitCommand(commands.browseClients);
        await settle();
        application.loop.dispatch({ type: 'key', key: 'enter', codepoint: 13, ctrl: false, alt: false, shift: false });
        await settle();
        application.loop.dispatch({ type: 'key', key: 's', codepoint: 115, ctrl: false, alt: true, shift: false });
        await settle();
        application.loop.dispatch({ type: 'key', key: 'g', codepoint: 103, ctrl: false, alt: true, shift: false });
        await settle();
        application.loop.dispatch({ type: 'key', key: 'enter', codepoint: 13, ctrl: false, alt: false, shift: false });
        await settle();
        expect(frameText(application)).toContain('one-time-secret-value');
        application.loop.dispatch({ type: 'key', key: 'x', codepoint: 120, ctrl: false, alt: true, shift: false });
        await settle();
        expect(application.desktop.activeWindow()).not.toBeInstanceOf(Dialog);
        expect(frameText(application)).not.toContain('one-time-secret-value');
        return 0;
      },
    });
    expect(exit).toBe(0);
    expect(warning.mock.calls.flat().join(' ')).not.toMatch(/command.*not handled/i);
    warning.mockRestore();
  });

  it('lets an active feature dialog own Cancel and defers Quit without a command diagnostic', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const exit = await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticated(),
      session: featureSession(),
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        application.loop.emitCommand(commands.createApplication);
        await settle();
        expect(application.desktop.activeWindow()).toBeInstanceOf(Dialog);
        application.loop.dispatch({ type: 'key', key: 'x', codepoint: 120, ctrl: false, alt: true, shift: false });
        await settle();
        expect(application.desktop.activeWindow()).not.toBeInstanceOf(Dialog);
        return 0;
      },
    });
    expect(exit).toBe(0);
    expect(warning.mock.calls.flat().join(' ')).not.toMatch(/command.*not handled|focusView.*did nothing/i);
    warning.mockRestore();
  });

  it('keeps 48x12 usable and clears modal/plaintext ownership below recovery size with Quit reachable', async () => {
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 48, height: 12 },
      initialState: authenticated(),
      session: featureSession(),
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        application.loop.emitCommand(commands.createClient);
        await settle();
        expect(application.desktop.activeWindow()).toBeInstanceOf(Dialog);
        application.loop.resize({ width: 24, height: 6 });
        await settle();
        expect(application.desktop.activeWindow()).not.toBeInstanceOf(Dialog);
        expect(frameText(application)).toContain('Alt-X Quit');
        expect(frameText(application)).not.toContain('one-time-secret-value');
        return 0;
      },
    });
  });

  it('disposes both feature owners exactly once on ordinary quit', async () => {
    const applicationsList = vi.fn().mockResolvedValue({ kind: 'success', value: [applicationRow] });
    const clientsList = vi.fn().mockResolvedValue({ kind: 'success', value: [clientRow] });
    const base = featureSession();
    if (!base.applications || !base.clients) throw new Error('Feature operations missing.');
    const session: AdminApplicationSession = {
      ...base,
      applications: { ...base.applications, listAll: applicationsList },
      clients: { ...base.clients, listAll: clientsList },
    };
    const finalized = vi.fn();
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticated(),
      session,
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        application.loop.emitCommand(commands.browseApplications);
        await settle();
        application.loop.emitCommand(commands.browseClients);
        await settle();
        application.loop.emitCommand('quit');
        return 0;
      },
      applicationFinalizer: finalized,
    });
    expect(applicationsList).toHaveBeenCalledOnce();
    expect(clientsList).toHaveBeenCalledOnce();
    expect(finalized).toHaveBeenCalledOnce();
  });
});
