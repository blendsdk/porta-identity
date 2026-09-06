/** Immutable state and ownership specifications for the five Admin UI deletion surfaces. */

import { createApplication, Group } from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import { createAdminApplicationController } from '../../src/admin/application-controller.js';
import { createAdminApplicationOperations } from '../../src/admin/application-service.js';
import { createAdminClientController } from '../../src/admin/client-controller.js';
import { createAdminClientOperations } from '../../src/admin/client-service.js';
import { createAdminOrganizationOperations } from '../../src/admin/organization-service.js';
import { validateAdminCapabilities } from '../../src/admin/session-service.js';
import type { AdminConnectionState } from '../../src/admin/state.js';
import { createAdminUserController } from '../../src/admin/user-controller.js';
import { createAdminUserOperations } from '../../src/admin/user-service.js';

const server = new URL('https://porta.example.test');
const organizationId = '11111111-1111-4111-8111-111111111111';
const applicationId = '22222222-2222-4222-8222-222222222222';
const moduleId = '33333333-3333-4333-8333-333333333333';
const clientId = '44444444-4444-4444-8444-444444444444';
const userId = '55555555-5555-4555-8555-555555555555';
const createdAt = '2026-01-01T00:00:00Z';
const updatedAt = '2026-08-01T00:00:00Z';

const organization = {
  id: organizationId,
  name: 'Example Organization',
  slug: 'example-organization',
  status: 'active' as const,
};
const application = {
  id: applicationId,
  name: 'Customer Portal',
  slug: 'customer-portal',
  description: null,
  status: 'active' as const,
  createdAt,
  updatedAt,
};
const moduleRow = {
  id: moduleId,
  applicationId,
  name: 'Billing',
  slug: 'billing',
  description: null,
  status: 'active' as const,
  createdAt,
  updatedAt,
};
const client = {
  id: clientId,
  organizationId,
  applicationId,
  clientId: 'porta-client',
  clientName: 'Portal Web Client',
  clientType: 'confidential' as const,
  applicationType: 'web' as const,
  redirectUris: ['https://client.example.test/callback'],
  postLogoutRedirectUris: [],
  grantTypes: ['authorization_code' as const],
  responseTypes: ['code' as const],
  scope: 'openid',
  tokenEndpointAuthMethod: 'client_secret_basic' as const,
  allowedOrigins: ['https://client.example.test'],
  requirePkce: true,
  loginMethods: null,
  effectiveLoginMethods: ['password' as const],
  status: 'active' as const,
  createdAt,
  updatedAt,
};
const userRow = {
  id: userId,
  organizationId,
  email: 'alice@example.test',
  givenName: 'Alice',
  familyName: 'Admin',
  status: 'active' as const,
};

/** Adds future exact Delete capabilities while retaining the current compile-time state shape. */
function authenticated(overrides: Record<string, boolean> = {}): AdminConnectionState {
  const capabilities = Object.assign(
    {
      canReadOrganizations: true,
      canCreateOrganizations: false,
      canReadUsers: true,
      canCreateUsers: false,
      canInviteUsers: false,
      canUpdateUsers: false,
      canManageUserLifecycle: false,
      canPurgeUsers: false,
      canReadApplications: true,
      canCreateApplications: false,
      canUpdateApplications: false,
      canArchiveApplications: false,
      canReadClients: true,
      canCreateClients: false,
      canUpdateClients: false,
      canRevokeClients: false,
    },
    {
      canDeleteOrganizations: true,
      canDeleteUsers: true,
      canDeleteApplications: true,
      canDeleteModules: true,
      canDeleteClients: true,
    },
    overrides,
  );
  return {
    kind: 'authenticated',
    server,
    identity: { sub: userId, email: userRow.email },
    capabilities,
    organization,
  };
}

/** Returns a required runtime method or fails at the missing contract boundary. */
function requiredMethod(target: object, name: string): (...args: unknown[]) => Promise<unknown> {
  const candidate = Reflect.get(target, name);
  expect(typeof candidate).toBe('function');
  if (typeof candidate !== 'function') throw new TypeError(`Missing Admin operation: ${name}`);
  return (...args) => Promise.resolve(Reflect.apply(candidate, target, args));
}

/** Creates one promise whose completion is controlled by the ownership assertion. */
function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolvePromise = (_value: T): void => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

/** Allows controller continuations to publish their final state. */
async function settle(): Promise<void> {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

describe('Admin resource deletion state', () => {
  it('ST-32 derives five independent exact Delete capabilities and removes terminal aliases', () => {
    const capabilities = validateAdminCapabilities(
      [],
      [
        'admin:org:delete',
        'admin:user:delete',
        'admin:app:delete',
        'admin:module:delete',
        'admin:client:delete',
      ],
    );

    expect(capabilities).toMatchObject({
      canDeleteOrganizations: true,
      canDeleteUsers: true,
      canDeleteApplications: true,
      canDeleteModules: true,
      canDeleteClients: true,
    });
    expect(capabilities).not.toHaveProperty('canPurgeUsers');
    expect(capabilities).not.toHaveProperty('canArchiveApplications');
    expect(capabilities).not.toHaveProperty('canRevokeClients');
  });

  it('ST-32 keeps each Delete capability independent', () => {
    const permissions = [
      ['admin:org:delete', 'canDeleteOrganizations'],
      ['admin:user:delete', 'canDeleteUsers'],
      ['admin:app:delete', 'canDeleteApplications'],
      ['admin:module:delete', 'canDeleteModules'],
      ['admin:client:delete', 'canDeleteClients'],
    ] as const;

    for (const [permission, capability] of permissions) {
      const granted = validateAdminCapabilities([], [permission]);
      for (const [, candidate] of permissions) {
        expect(Reflect.get(granted, candidate)).toBe(candidate === capability);
      }
    }
  });

  it('ST-32 sends organization deletion through its selected exact ID', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const operations = Reflect.apply(createAdminOrganizationOperations, undefined, [
      () => ({ listAll: vi.fn(), create: vi.fn(), delete: remove }),
    ]);

    await expect(requiredMethod(operations, 'delete')(organizationId)).resolves.toEqual({
      kind: 'success',
    });
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith(organizationId);
  });

  it('ST-32 sends application and same-parent module deletion to distinct operations', async () => {
    const deleteApplication = vi.fn().mockResolvedValue(undefined);
    const deleteModule = vi.fn().mockResolvedValue(undefined);
    const operations = Reflect.apply(createAdminApplicationOperations, undefined, [
      () => ({ delete: deleteApplication, deleteModule }),
    ]);

    await requiredMethod(operations, 'delete')(applicationId);
    await requiredMethod(operations, 'deleteModule')(applicationId, moduleId);

    expect(deleteApplication).toHaveBeenCalledOnce();
    expect(deleteApplication).toHaveBeenCalledWith(applicationId);
    expect(deleteModule).toHaveBeenCalledOnce();
    expect(deleteModule).toHaveBeenCalledWith(applicationId, moduleId);
  });

  it('ST-32 verifies current organization ownership before deleting a client', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const get = vi.fn().mockResolvedValue({ data: client, etag: null });
    const operations = Reflect.apply(createAdminClientOperations, undefined, [
      () => ({ get, delete: remove }),
    ]);

    await expect(
      requiredMethod(operations, 'delete')(organizationId, clientId, new AbortController().signal),
    ).resolves.toEqual({ kind: 'success' });
    expect(get).toHaveBeenCalledWith(clientId);
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith(clientId);
  });

  it('ST-32 sends user deletion through both current organization and selected user IDs', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const operations = Reflect.apply(createAdminUserOperations, undefined, [
      () => ({ delete: remove }),
    ]);

    await expect(requiredMethod(operations, 'delete')(organizationId, userId)).resolves.toEqual({
      kind: 'success',
    });
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith(organizationId, userId);
  });

  it('ST-34 dispatches one application delete, reloads the list, and leaves detail', async () => {
    const pending = deferred<{ readonly kind: 'success' }>();
    const remove = vi.fn(() => pending.promise);
    const listAll = vi.fn().mockResolvedValue({ kind: 'success', value: [application] });
    const states: unknown[] = [];
    const controller = createAdminApplicationController({
      readState: authenticated,
      readOperations: () => ({
        listAll,
        get: vi.fn().mockResolvedValue({
          kind: 'success',
          value: { application, etag: null },
        }),
        listModules: vi.fn().mockResolvedValue({ kind: 'success', value: [moduleRow] }),
        delete: remove,
      }),
      publishState: (state) => states.push(state),
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(authenticated(), 1);
    await controller.load();
    await controller.select(applicationId);

    const first = requiredMethod(controller, 'delete')(applicationId, () => Promise.resolve(true));
    const duplicate = requiredMethod(controller, 'delete')(applicationId, () =>
      Promise.resolve(true),
    );
    await settle();
    expect(remove).toHaveBeenCalledOnce();
    pending.resolve({ kind: 'success' });
    await Promise.all([first, duplicate]);

    expect(listAll).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toEqual({
      kind: 'list',
      scope: 'global',
      applications: [application],
    });
  });

  it('ST-32 rejects a stale module delete after the session generation changes', async () => {
    const confirmation = deferred<boolean>();
    const remove = vi.fn().mockResolvedValue({ kind: 'success' });
    let state = authenticated();
    const controller = createAdminApplicationController({
      readState: () => state,
      readOperations: () => ({
        get: vi.fn().mockResolvedValue({
          kind: 'success',
          value: { application, etag: null },
        }),
        listModules: vi.fn().mockResolvedValue({ kind: 'success', value: [moduleRow] }),
        deleteModule: remove,
      }),
      publishState: vi.fn(),
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(state, 1);
    await controller.select(applicationId);
    const deletion = requiredMethod(controller, 'deleteModule')(
      applicationId,
      moduleId,
      () => confirmation.promise,
    );
    state = authenticated();
    controller.syncContext(state, 2);
    confirmation.resolve(true);
    await deletion;

    expect(remove).not.toHaveBeenCalled();
  });

  it('ST-35 preserves client detail, reloads, and exposes only a fixed deletion failure', async () => {
    const states: unknown[] = [];
    const listAll = vi.fn().mockResolvedValue({ kind: 'success', value: [client] });
    const get = vi.fn().mockResolvedValue({
      kind: 'success',
      value: { client, etag: null },
    });
    const controller = createAdminClientController({
      readState: authenticated,
      readOperations: () => ({
        listAll,
        get,
        delete: vi.fn().mockResolvedValue({ kind: 'failure', failure: 'unavailable' }),
      }),
      publishState: (state) => states.push(state),
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(authenticated(), 1);
    await controller.load();
    await controller.select(clientId);
    await requiredMethod(controller, 'delete')(clientId, () => Promise.resolve(true));

    expect(get).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toEqual(
      expect.objectContaining({
        kind: 'failure',
        failure: 'unavailable',
        previous: expect.objectContaining({ kind: 'detail', client }),
      }),
    );
    expect(JSON.stringify(states)).not.toContain('Redis');
    expect(JSON.stringify(states)).not.toContain('PostgreSQL');
  });

  it('ST-39 routes self-deletion session invalidation through the authentication gate', async () => {
    let intent: ((value: unknown) => void) | undefined;
    const requestAuthentication = vi.fn();
    const remove = vi.fn().mockResolvedValue({ kind: 'session-invalid' });
    const workspace = {
      content: new Group(),
      setState: vi.fn(),
      focusCurrent: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
    };
    const controller = createAdminUserController({
      host: createApplication({ viewport: { width: 80, height: 24 } }),
      readState: authenticated,
      readOperations: () => ({
        list: vi.fn().mockResolvedValue({
          kind: 'success',
          value: { data: [userRow], total: 1, page: 1, pageSize: 20, totalPages: 1 },
        }),
        get: vi.fn().mockResolvedValue({
          kind: 'success',
          value: { user: userRow, etag: null },
        }),
        delete: remove,
      }),
      mountWorkspace: vi.fn(),
      isApplicationBusy: () => false,
      setDialogBusy: vi.fn(),
      requestAuthentication,
      workspaceFactory: (options) => {
        intent = (value) => Reflect.apply(options.onIntent, undefined, [value]);
        return workspace;
      },
      dialogs: {
        delete: vi.fn().mockResolvedValue({ kind: 'delete' }),
      },
    });
    controller.syncContext(authenticated(), 1);
    controller.handleCommand('browse-users');
    await settle();
    Reflect.apply(intent ?? (() => undefined), undefined, [{ kind: 'select', userId }]);
    await settle();
    Reflect.apply(intent ?? (() => undefined), undefined, [{ kind: 'delete' }]);
    await settle();

    expect(remove).toHaveBeenCalledWith(organizationId, userId);
    expect(requestAuthentication).toHaveBeenCalledOnce();
    expect(workspace.clear).toHaveBeenCalled();
  });
});
