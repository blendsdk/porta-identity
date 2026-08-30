/** Internal ownership regressions for the selected-organization user controller. */

import { createApplication, Group, View } from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import { ADMIN_COMMANDS } from '../../src/admin/presentation.js';
import type { AdminConnectionState } from '../../src/admin/state.js';
import type { AdminUserMutationResult, AdminUserOperations } from '../../src/admin/user-service.js';
import type { AdminUserListItem, AdminUserViewState } from '../../src/admin/user-state.js';
import { createAdminUserController } from '../../src/admin/user-controller.js';
import type { AdminUserIntent, AdminUserWorkspace } from '../../src/admin/user-workspace.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const user = {
  id: '22222222-2222-4222-8222-222222222222',
  organizationId,
  email: 'alice@example.test',
  givenName: 'Alice',
  familyName: 'Admin',
  status: 'active' as const,
};
const page = { data: [user], total: 1, page: 1, pageSize: 20, totalPages: 1 } as const;
const detail = {
  ...user,
  emailVerified: false,
  hasPassword: true,
  middleName: null,
  nickname: null,
  preferredUsername: null,
  profileUrl: null,
  pictureUrl: null,
  websiteUrl: null,
  gender: null,
  birthdate: null,
  zoneinfo: null,
  locale: null,
  phoneNumber: null,
  phoneNumberVerified: false,
  addressStreet: null,
  addressLocality: null,
  addressRegion: null,
  addressPostalCode: null,
  addressCountry: null,
  twoFactorEnabled: false,
  lastLoginAt: null,
  loginCount: 0,
  createdAt: '2026-08-30T00:00:00Z',
  updatedAt: '2026-08-30T00:00:00Z',
};

/** Creates one authenticated controller state. */
function authenticated(): AdminConnectionState {
  return {
    kind: 'authenticated',
    server: new URL('https://porta.example.test'),
    identity: { sub: 'subject-1' },
    capabilities: {
      canReadOrganizations: false,
      canCreateOrganizations: false,
      canReadUsers: true,
      canCreateUsers: true,
      canInviteUsers: true,
      canUpdateUsers: true,
      canManageUserLifecycle: true,
      canPurgeUsers: true,
    },
    organization: {
      id: organizationId,
      name: 'Selected Organization',
      slug: 'selected-organization',
      status: 'active',
    },
  };
}

/** Creates a promise whose completion is controlled by the test. */
function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    complete = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      if (!complete) throw new Error('Deferred promise was not initialized.');
      complete(value);
    },
  };
}

/** Allows controller promise continuations to finish. */
async function settle(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

/** Builds complete operations while allowing a test to replace only relevant methods. */
function operations(overrides: Partial<AdminUserOperations> = {}): AdminUserOperations {
  const mutation = vi.fn().mockResolvedValue({ kind: 'success' });
  return {
    list: vi.fn().mockResolvedValue({ kind: 'success', value: page }),
    get: vi.fn(),
    getHistory: vi.fn(),
    previewInvitation: vi.fn(),
    create: vi.fn(),
    invite: vi.fn(),
    update: vi.fn(),
    setPassword: mutation,
    clearPassword: mutation,
    verifyEmail: mutation,
    suspend: mutation,
    unsuspend: mutation,
    lock: mutation,
    unlock: mutation,
    deactivate: mutation,
    reactivate: mutation,
    purge: mutation,
    ...overrides,
  };
}

describe('admin user controller ownership', () => {
  it('should dispatch only one mutation while its dialog owns the modal surface', async () => {
    const dialog = deferred<{ kind: 'cancel' }>();
    const showCreate = vi.fn(async () => dialog.promise);
    const create = vi.fn();
    const controller = createAdminUserController({
      host: createApplication({ viewport: { width: 80, height: 24 } }),
      readState: authenticated,
      readOperations: () => operations({ create }),
      mountWorkspace: vi.fn(),
      isApplicationBusy: () => false,
      setDialogBusy: vi.fn(),
      requestAuthentication: vi.fn(),
      dialogs: { create: showCreate },
    });
    controller.syncContext(authenticated(), 1);

    controller.handleCommand(ADMIN_COMMANDS.createUser);
    controller.handleCommand(ADMIN_COMMANDS.createUser);
    expect(showCreate).toHaveBeenCalledOnce();
    dialog.resolve({ kind: 'cancel' });
    await settle();
    expect(create).not.toHaveBeenCalled();
  });

  it('should quarantine a cancelled dispatched mutation until a read reconciles state', async () => {
    const pendingCreate = deferred<AdminUserMutationResult<AdminUserListItem>>();
    const list = vi.fn().mockResolvedValue({ kind: 'success', value: page });
    const states: AdminUserViewState[] = [];
    const recovery: boolean[] = [];
    const controller = createAdminUserController({
      host: createApplication({ viewport: { width: 80, height: 24 } }),
      readState: authenticated,
      readOperations: () => operations({ list, create: vi.fn(() => pendingCreate.promise) }),
      mountWorkspace: vi.fn(),
      isApplicationBusy: () => false,
      setDialogBusy: vi.fn(),
      setRecoveryRequired: (required) => recovery.push(required),
      requestAuthentication: vi.fn(),
      workspaceFactory: () => ({
        content: new Group(),
        setState: (state) => states.push(state),
        focusCurrent: vi.fn(),
        clear: vi.fn(),
        dispose: vi.fn(),
      }),
      dialogs: {
        create: vi.fn().mockResolvedValue({
          kind: 'create',
          input: { email: 'alice@example.test' },
        }),
      },
    });
    controller.syncContext(authenticated(), 1);
    controller.handleCommand(ADMIN_COMMANDS.createUser);
    await settle();
    controller.handleRecoverableGeometry(false);

    expect(states.at(-1)).toEqual({ kind: 'indeterminate' });
    expect(recovery).toEqual([true]);
    pendingCreate.resolve({
      kind: 'success',
      value: {
        id: '22222222-2222-4222-8222-222222222222',
        organizationId,
        email: 'alice@example.test',
        givenName: null,
        familyName: null,
        status: 'active',
      },
    });
    await settle();
    expect(states.at(-1)).toEqual({ kind: 'indeterminate' });

    controller.handleRecoverableGeometry(true);
    await settle();
    controller.handleCommand(ADMIN_COMMANDS.browseUsers);
    await settle();
    expect(list).toHaveBeenCalledOnce();
    expect(states.at(-1)).toEqual({ kind: 'page', page });
    expect(recovery).toEqual([true, false]);
  });

  it('should retain the page when a post-create reconciliation read fails', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'success', value: page })
      .mockResolvedValueOnce({ kind: 'failure', failure: 'unavailable' });
    const states: AdminUserViewState[] = [];
    const userOperations = operations({
      list,
      create: vi.fn().mockResolvedValue({
        kind: 'success',
        value: {
          id: '22222222-2222-4222-8222-222222222222',
          organizationId,
          email: 'alice@example.test',
          givenName: null,
          familyName: null,
          status: 'active',
        },
      }),
    });
    const controller = createAdminUserController({
      host: createApplication({ viewport: { width: 80, height: 24 } }),
      readState: authenticated,
      readOperations: () => userOperations,
      mountWorkspace: vi.fn(),
      isApplicationBusy: () => false,
      setDialogBusy: vi.fn(),
      requestAuthentication: vi.fn(),
      workspaceFactory: () => ({
        content: new Group(),
        setState: (state) => states.push(state),
        focusCurrent: vi.fn(),
        clear: vi.fn(),
        dispose: vi.fn(),
      }),
      dialogs: {
        create: vi.fn().mockResolvedValue({
          kind: 'create',
          input: { email: 'alice@example.test' },
        }),
      },
    });
    controller.syncContext(authenticated(), 1);
    controller.handleCommand(ADMIN_COMMANDS.browseUsers);
    await settle();
    controller.handleCommand(ADMIN_COMMANDS.createUser);
    await settle();
    expect(states.at(-1)).toEqual({
      kind: 'failure',
      failure: 'unavailable',
      previous: { kind: 'page', page },
    });
  });

  it('should clear dialog ownership before reentrant invalid-session context cleanup', async () => {
    let state = authenticated();
    const requestAuthentication = vi.fn(() => {
      state = { kind: 'unauthenticated', server: state.server };
      controller.syncContext(state, 2);
    });
    const controller = createAdminUserController({
      host: createApplication({ viewport: { width: 80, height: 24 } }),
      readState: () => state,
      readOperations: () =>
        operations({ create: vi.fn().mockResolvedValue({ kind: 'session-invalid' }) }),
      mountWorkspace: vi.fn(),
      isApplicationBusy: () => false,
      setDialogBusy: vi.fn(),
      requestAuthentication,
      dialogs: {
        create: vi.fn().mockResolvedValue({
          kind: 'create',
          input: { email: 'alice@example.test' },
        }),
      },
    });
    controller.syncContext(state, 1);
    controller.handleCommand(ADMIN_COMMANDS.createUser);
    await settle();

    expect(requestAuthentication).toHaveBeenCalledOnce();
  });

  it('should not treat history as reconciliation for an unknown mutation outcome', async () => {
    let intent: ((intent: AdminUserIntent) => void) | undefined;
    let connection = authenticated();
    const recovery: boolean[] = [];
    const states: AdminUserViewState[] = [];
    const edit = vi.fn().mockResolvedValue({ kind: 'update', input: { givenName: 'Alicia' } });
    const update = vi.fn().mockResolvedValue({ kind: 'outcome-unknown' });
    const userOperations = operations({
      get: vi.fn().mockResolvedValue({ kind: 'success', value: { detail, etag: null } }),
      getHistory: vi.fn().mockResolvedValue({
        kind: 'success',
        value: { entries: [], hasMore: false },
      }),
      update,
    });
    const controller = createAdminUserController({
      host: createApplication({ viewport: { width: 80, height: 24 } }),
      readState: () => connection,
      readOperations: () => userOperations,
      mountWorkspace: vi.fn(),
      isApplicationBusy: () => false,
      setDialogBusy: vi.fn(),
      setRecoveryRequired: (required) => recovery.push(required),
      requestAuthentication: vi.fn(),
      workspaceFactory: (options) => {
        intent = options.onIntent;
        return {
          content: new Group(),
          setState: (state) => states.push(state),
          focusCurrent: vi.fn(),
          clear: vi.fn(),
          dispose: vi.fn(),
        };
      },
      dialogs: { edit },
    });
    controller.syncContext(connection, 1);
    controller.handleCommand(ADMIN_COMMANDS.browseUsers);
    await settle();
    intent?.({ kind: 'select', userId: user.id });
    await settle();
    intent?.({ kind: 'edit' });
    await settle();
    expect(update).toHaveBeenCalledWith(
      organizationId,
      user.id,
      { givenName: 'Alicia' },
      undefined,
    );
    expect(recovery).toEqual([true]);

    intent?.({ kind: 'history' });
    await settle();
    intent?.({ kind: 'edit' });
    await settle();
    expect(edit).toHaveBeenCalledOnce();
    expect(recovery).toEqual([true]);

    connection = {
      ...connection,
      capabilities: { ...connection.capabilities, canReadUsers: false },
    };
    controller.syncContext(connection, 1);
    intent?.({ kind: 'back' });
    expect(states.at(-1)).toEqual({ kind: 'page', page });
  });

  it('should preserve validated content across recoverable resize and dispose once', async () => {
    const mounted: Array<View | null> = [];
    const states: AdminUserViewState[] = [];
    const dispose = vi.fn();
    let intent: ((intent: AdminUserIntent) => void) | undefined;
    const controller = createAdminUserController({
      host: createApplication({ viewport: { width: 80, height: 24 } }),
      readState: authenticated,
      readOperations: () => operations(),
      mountWorkspace: (view) => mounted.push(view),
      isApplicationBusy: () => false,
      setDialogBusy: vi.fn(),
      requestAuthentication: vi.fn(),
      workspaceFactory: (options): AdminUserWorkspace => {
        intent = options.onIntent;
        return {
          content: new Group(),
          setState: (state) => states.push(state),
          focusCurrent: vi.fn(),
          clear: vi.fn(),
          dispose,
        };
      },
    });
    controller.syncContext(authenticated(), 1);
    controller.handleCommand(ADMIN_COMMANDS.browseUsers);
    await settle();
    expect(intent).toBeDefined();

    controller.handleRecoverableGeometry(false);
    expect(mounted.at(-1)).toBeNull();
    controller.handleRecoverableGeometry(true);
    await settle();
    expect(mounted.at(-1)).toBeInstanceOf(Group);
    expect(states.at(-1)).toEqual({ kind: 'page', page });
    expect(states.filter((state) => state.kind === 'page')).toHaveLength(2);

    controller.dispose();
    controller.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(mounted.at(-1)).toBeNull();
  });
});
