/** Observable specifications for the selected-organization user workflow. */

import { createApplication, Group, View } from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import { ADMIN_COMMANDS } from '../../src/admin/presentation.js';
import type { AdminConnectionState } from '../../src/admin/state.js';
import type { AdminUserOperations } from '../../src/admin/user-service.js';
import type { AdminUserViewState } from '../../src/admin/user-state.js';
import {
  createAdminUserController,
  type AdminUserControllerDialogs,
} from '../../src/admin/user-controller.js';
import type {
  AdminUserIntent,
  AdminUserWorkspace,
  AdminUserWorkspaceOptions,
} from '../../src/admin/user-workspace.js';

const server = new URL('https://porta.example.test');
const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const page = {
  data: [
    {
      id: userId,
      organizationId,
      email: 'alice@example.test',
      givenName: 'Alice',
      familyName: 'Admin',
      status: 'active' as const,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

/** Builds one authenticated state with independently selectable user capabilities. */
function authenticated(
  capabilities: Partial<AdminConnectionState & { kind: 'authenticated' }> = {},
) {
  return {
    kind: 'authenticated',
    server,
    identity: { sub: 'subject-1', email: 'admin@example.test' },
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
      status: 'active' as const,
    },
    ...capabilities,
  } satisfies AdminConnectionState;
}

/** Allows controller continuations to publish their final state. */
async function settle(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

/** Creates a direct controller harness without replacing JSVision dialog ownership. */
function harness(
  overrides: {
    readonly state?: AdminConnectionState;
    readonly operations?: Partial<AdminUserOperations>;
    readonly dialogs?: Partial<AdminUserControllerDialogs>;
    readonly applicationBusy?: boolean;
  } = {},
) {
  let state = overrides.state ?? authenticated();
  let intent: ((value: AdminUserIntent) => void) | undefined;
  const states: AdminUserViewState[] = [];
  const clears = vi.fn();
  const workspace: AdminUserWorkspace = {
    content: new Group(),
    setState: (next) => states.push(next),
    focusCurrent: vi.fn(),
    clear: clears,
    dispose: vi.fn(),
  };
  const workspaceFactory = vi.fn((options: AdminUserWorkspaceOptions) => {
    intent = options.onIntent;
    return workspace;
  });
  const application = createApplication({ viewport: { width: 80, height: 24 } });
  const list = vi.fn().mockResolvedValue({ kind: 'success', value: page });
  const successfulMutation = vi.fn().mockResolvedValue({ kind: 'success' });
  const operations = {
    list,
    get: vi.fn(),
    getHistory: vi.fn(),
    previewInvitation: vi.fn(),
    create: vi.fn(),
    invite: vi.fn(),
    update: vi.fn(),
    setPassword: successfulMutation,
    clearPassword: successfulMutation,
    verifyEmail: successfulMutation,
    suspend: successfulMutation,
    unsuspend: successfulMutation,
    lock: successfulMutation,
    unlock: successfulMutation,
    deactivate: successfulMutation,
    reactivate: successfulMutation,
    purge: successfulMutation,
    ...overrides.operations,
  } satisfies AdminUserOperations;
  const mounted: Array<View | null> = [];
  const busy: boolean[] = [];
  const recovery: boolean[] = [];
  const requestAuthentication = vi.fn();
  const controller = createAdminUserController({
    host: application,
    readState: () => state,
    readOperations: () => operations,
    mountWorkspace: (content) => mounted.push(content),
    isApplicationBusy: () => overrides.applicationBusy === true,
    setDialogBusy: (value) => busy.push(value),
    setRecoveryRequired: (required) => recovery.push(required),
    requestAuthentication,
    workspaceFactory,
    dialogs: overrides.dialogs,
  });
  controller.syncContext(state, 1);
  return {
    busy,
    clears,
    controller,
    getIntent: () => intent,
    list,
    mounted,
    operations,
    recovery,
    requestAuthentication,
    setState: (next: AdminConnectionState) => {
      state = next;
    },
    states,
    workspace,
  };
}

describe('admin user workflow', () => {
  it('should dispatch browse and query intents only to the selected organization', async () => {
    const mounted = harness();
    expect(mounted.controller.handleCommand(ADMIN_COMMANDS.browseUsers)).toBe(true);
    await settle();
    expect(mounted.list).toHaveBeenCalledWith(organizationId, { page: 1 });
    expect(mounted.states.at(-1)).toEqual({ kind: 'page', page });

    mounted.getIntent()?.({ kind: 'search', value: 'alice' });
    await settle();
    expect(mounted.list).toHaveBeenLastCalledWith(organizationId, {
      page: 1,
      search: 'alice',
    });
    mounted.getIntent()?.({ kind: 'filter', status: 'active' });
    await settle();
    expect(mounted.list).toHaveBeenLastCalledWith(organizationId, {
      page: 1,
      search: 'alice',
      status: 'active',
    });
  });

  it('should clear context and quarantine a late read after organization or epoch change', async () => {
    let resolveList: ((value: { kind: 'success'; value: typeof page }) => void) | undefined;
    const pending = new Promise<{ kind: 'success'; value: typeof page }>((resolve) => {
      resolveList = resolve;
    });
    const mounted = harness({ operations: { list: vi.fn(async () => pending) } });
    mounted.controller.handleCommand(ADMIN_COMMANDS.browseUsers);
    const next = authenticated({
      organization: {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Other',
        slug: 'other',
        status: 'active',
      },
    });
    mounted.setState(next);
    mounted.controller.syncContext(next, 1);
    resolveList?.({ kind: 'success', value: page });
    await settle();

    expect(mounted.clears).toHaveBeenCalled();
    expect(mounted.states).not.toContainEqual({ kind: 'page', page });
    mounted.controller.syncContext(next, 2);
    expect(mounted.clears).toHaveBeenCalledTimes(2);
  });

  it('should clear a late read when the same subject and organization receive a new session epoch', async () => {
    let resolveList: ((value: { kind: 'success'; value: typeof page }) => void) | undefined;
    const pending = new Promise<{ kind: 'success'; value: typeof page }>((resolve) => {
      resolveList = resolve;
    });
    const mounted = harness({ operations: { list: vi.fn(async () => pending) } });
    mounted.controller.handleCommand(ADMIN_COMMANDS.browseUsers);
    mounted.controller.syncContext(authenticated(), 2);
    resolveList?.({ kind: 'success', value: page });
    await settle();

    expect(mounted.clears).toHaveBeenCalledOnce();
    expect(mounted.states).not.toContainEqual({ kind: 'page', page });
  });

  it('should show fixed success without a read for a create-only administrator', async () => {
    const state = authenticated({
      capabilities: {
        canReadOrganizations: false,
        canCreateOrganizations: false,
        canReadUsers: false,
        canCreateUsers: true,
        canInviteUsers: false,
        canUpdateUsers: false,
        canManageUserLifecycle: false,
        canPurgeUsers: false,
      },
    });
    const create = vi.fn().mockResolvedValue({ kind: 'success', value: page.data[0] });
    const mounted = harness({
      state,
      operations: { create },
      dialogs: {
        create: vi.fn().mockResolvedValue({
          kind: 'create',
          input: { email: 'alice@example.test' },
        }),
      },
    });
    mounted.controller.handleCommand(ADMIN_COMMANDS.createUser);
    await settle();

    expect(create).toHaveBeenCalledOnce();
    expect(mounted.list).not.toHaveBeenCalled();
    expect(mounted.states.at(-1)).toEqual({ kind: 'success', action: 'created' });
  });

  it('should exclude user dialogs while another application modal owns the surface', async () => {
    const create = vi.fn();
    const mounted = harness({
      applicationBusy: true,
      operations: { create },
      dialogs: { create: vi.fn() },
    });
    mounted.controller.handleCommand(ADMIN_COMMANDS.createUser);
    await settle();

    expect(create).not.toHaveBeenCalled();
    expect(mounted.busy).toEqual([]);
  });

  it('should hand a final session failure to the existing authentication flow', async () => {
    const mounted = harness({
      operations: { list: vi.fn().mockResolvedValue({ kind: 'session-invalid' }) },
    });
    mounted.controller.handleCommand(ADMIN_COMMANDS.browseUsers);
    await settle();

    expect(mounted.requestAuthentication).toHaveBeenCalledOnce();
    expect(mounted.mounted.at(-1)).toBeNull();
  });

  it('should replace an in-flight read with the latest query and quarantine its late result', async () => {
    let resolveFirst: ((value: { kind: 'success'; value: typeof page }) => void) | undefined;
    const first = new Promise<{ kind: 'success'; value: typeof page }>((resolve) => {
      resolveFirst = resolve;
    });
    const list = vi
      .fn()
      .mockImplementationOnce(async () => first)
      .mockResolvedValueOnce({ kind: 'success', value: { ...page, total: 0, data: [] } });
    const mounted = harness({ operations: { list } });
    mounted.controller.handleCommand(ADMIN_COMMANDS.browseUsers);
    mounted.getIntent()?.({ kind: 'search', value: 'latest' });
    await settle();

    expect(list).toHaveBeenCalledTimes(2);
    expect(mounted.states.at(-1)).toEqual({
      kind: 'page',
      page: { ...page, total: 0, data: [] },
    });
    resolveFirst?.({ kind: 'success', value: page });
    await settle();
    expect(mounted.states.at(-1)).not.toEqual({ kind: 'page', page });
  });

  it('should reject stale intents and dialog submission after capability revocation', async () => {
    let finishDialog: ((value: { kind: 'create'; input: { email: string } }) => void) | undefined;
    const dialog = new Promise<{ kind: 'create'; input: { email: string } }>((resolve) => {
      finishDialog = resolve;
    });
    const create = vi.fn();
    const mounted = harness({
      operations: { create },
      dialogs: { create: vi.fn(async () => dialog) },
    });
    mounted.controller.handleCommand(ADMIN_COMMANDS.browseUsers);
    await settle();
    const staleIntent = mounted.getIntent();
    mounted.controller.handleCommand(ADMIN_COMMANDS.createUser);
    const revoked = authenticated({
      capabilities: {
        ...authenticated().capabilities,
        canReadUsers: false,
        canCreateUsers: false,
      },
    });
    mounted.setState(revoked);
    mounted.controller.syncContext(revoked, 1);
    staleIntent?.({ kind: 'search', value: 'forbidden' });
    finishDialog?.({ kind: 'create', input: { email: 'alice@example.test' } });
    await settle();

    expect(mounted.list).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
  });

  it('should hand a final invitation-preview 401 to authentication', async () => {
    const mounted = harness({
      operations: {
        previewInvitation: vi.fn().mockResolvedValue({ kind: 'session-invalid' }),
      },
      dialogs: {
        invite: vi.fn(async (_host, _signal, preview) => {
          await preview({ email: 'alice@example.test' });
          return { kind: 'cancel' };
        }),
      },
    });
    mounted.controller.handleCommand(ADMIN_COMMANDS.inviteUser);
    await settle();

    expect(mounted.requestAuthentication).toHaveBeenCalledOnce();
    expect(mounted.mounted.at(-1)).toBeNull();
  });

  it('should quarantine a late invitation-preview 401 after session replacement', async () => {
    let resolvePreview: ((value: { kind: 'session-invalid' }) => void) | undefined;
    const previewResult = new Promise<{ kind: 'session-invalid' }>((resolve) => {
      resolvePreview = resolve;
    });
    const mounted = harness({
      operations: { previewInvitation: vi.fn(async () => previewResult) },
      dialogs: {
        invite: vi.fn(async (_host, _signal, preview) => {
          await preview({ email: 'alice@example.test' });
          return { kind: 'cancel' };
        }),
      },
    });
    mounted.controller.handleCommand(ADMIN_COMMANDS.inviteUser);
    await settle();
    mounted.controller.syncContext(authenticated(), 2);
    resolvePreview?.({ kind: 'session-invalid' });
    await settle();

    expect(mounted.requestAuthentication).not.toHaveBeenCalled();
  });

  it.each([
    {
      result: { kind: 'failure', failure: 'validation' } as const,
      expected: { kind: 'failure', failure: 'validation' } as const,
    },
    {
      result: { kind: 'outcome-unknown' } as const,
      expected: { kind: 'indeterminate' } as const,
    },
    {
      result: { kind: 'failure', failure: 'unauthorized' } as const,
      expected: { kind: 'failure', failure: 'unauthorized' } as const,
    },
    {
      result: { kind: 'failure', failure: 'not-found' } as const,
      expected: { kind: 'failure', failure: 'not-found' } as const,
    },
    {
      result: { kind: 'failure', failure: 'conflict' } as const,
      expected: { kind: 'failure', failure: 'conflict' } as const,
    },
  ])('should visibly present a fixed top-level mutation outcome: $result.kind', async (example) => {
    const mounted = harness({
      operations: { create: vi.fn().mockResolvedValue(example.result) },
      dialogs: {
        create: vi.fn().mockResolvedValue({
          kind: 'create',
          input: { email: 'alice@example.test' },
        }),
      },
    });
    mounted.controller.handleCommand(ADMIN_COMMANDS.createUser);
    await settle();

    expect(mounted.states.at(-1)).toEqual(example.expected);
    expect(mounted.mounted.at(-1)).toBeInstanceOf(Group);
  });
});
