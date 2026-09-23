/** Immutable behavior specifications for direct roles assigned to one selected user. */

import { Button, ComboBox, createApplication, DataGrid, Dialog, Group, View } from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import type { AdminApplication } from '../../src/admin/application-state.js';
import { ADMIN_COMMANDS } from '../../src/admin/presentation.js';
import type { AdminRbacOperations } from '../../src/admin/rbac-service.js';
import type { AdminRbacReadResult, AdminRole } from '../../src/admin/rbac-state.js';
import type { AdminCapabilities, AdminConnectionState } from '../../src/admin/state.js';
import { createAdminUserController } from '../../src/admin/user-controller.js';
import type { AdminUserOperations } from '../../src/admin/user-service.js';
import type { AdminUserDetail, AdminUserPage } from '../../src/admin/user-state.js';
import { createAdminUserWorkspace } from '../../src/admin/user-workspace.js';
import type { AdminUserIntent, AdminUserWorkspaceOptions } from '../../src/admin/user-workspace.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const applicationId = '33333333-3333-4333-8333-333333333333';
const roleId = '44444444-4444-4444-8444-444444444444';
const otherApplicationId = '55555555-5555-4555-8555-555555555555';

const application: AdminApplication = {
  id: applicationId,
  name: 'Customer Portal',
  slug: 'customer-portal',
  description: null,
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
};

const role: AdminRole = {
  id: roleId,
  applicationId,
  name: 'Billing administrator',
  slug: 'billing-admin',
  description: 'Manages billing.',
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-08-02T00:00:00Z',
};

const otherApplication: AdminApplication = {
  ...application,
  id: otherApplicationId,
  name: 'Operations Portal',
  slug: 'operations-portal',
};

const user: AdminUserDetail = {
  id: userId,
  organizationId,
  email: 'alice@example.test',
  givenName: 'Alice',
  familyName: 'Admin',
  status: 'active',
  emailVerified: true,
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
  locale: 'en',
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
  createdAt: '2026-01-01T10:00:00Z',
  updatedAt: '2026-08-29T10:00:00Z',
};

const page: AdminUserPage = {
  data: [user],
  total: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

const capabilities: AdminCapabilities = {
  canReadOrganizations: false,
  canCreateOrganizations: false,
  canReadUsers: true,
  canCreateUsers: false,
  canInviteUsers: false,
  canUpdateUsers: false,
  canManageUserLifecycle: false,
  canDeleteOrganizations: false,
  canDeleteUsers: false,
  canReadApplications: true,
  canCreateApplications: false,
  canUpdateApplications: false,
  canDeleteApplications: false,
  canDeleteModules: false,
  canReadClients: false,
  canCreateClients: false,
  canUpdateClients: false,
  canDeleteClients: false,
  canRevokeClientSecrets: false,
  canReadRoles: true,
  canCreateRoles: false,
  canUpdateRoles: false,
  canDeleteRoles: false,
  canReadPermissions: false,
  canCreatePermissions: false,
  canUpdatePermissions: false,
  canDeletePermissions: false,
  canAssignRoles: true,
};

/** Assigned-role row enriched only with a safe application label when it is readable. */
interface AssignedUserRole extends AdminRole {
  readonly applicationName?: string;
}

/** Complete immutable projection owned by the focused User Roles dialog. */
type UserRoleProjection =
  | {
      readonly kind: 'ready';
      readonly organizationId: string;
      readonly userId: string;
      readonly assignedRoles: readonly AssignedUserRole[];
      readonly applications: readonly AdminApplication[];
      readonly availableRoles: readonly AdminRole[];
      readonly availableRolesApplicationId?: string;
    }
  | {
      readonly kind: 'indeterminate';
      readonly previous: Extract<UserRoleProjection, { readonly kind: 'ready' }>;
    }
  | {
      readonly kind: 'failure';
      readonly failure: 'invalid-response' | 'unavailable';
      readonly previous?: Extract<UserRoleProjection, { readonly kind: 'ready' }>;
    };

/** Closed set of direct actions emitted by the focused dialog. */
type UserRoleIntent =
  | { readonly kind: 'load-available'; readonly applicationId: string }
  | { readonly kind: 'assign'; readonly roleId: string }
  | { readonly kind: 'remove'; readonly roleId: string }
  | { readonly kind: 'reload' }
  | { readonly kind: 'close' };

/** Planned test-facing contract for the focused dialog owner. */
interface UserRoleDialogExports {
  readonly createAdminUserRoleDialog: (options: {
    readonly organization: { readonly id: string; readonly name: string };
    readonly user: { readonly id: string; readonly label: string };
    readonly capabilities: AdminCapabilities;
    readonly viewport: { readonly width: number; readonly height: number };
    readonly onIntent: (intent: UserRoleIntent) => void;
  }) => {
    readonly content: Dialog;
    readonly setState: (state: UserRoleProjection) => void;
    readonly focusCurrent: () => void;
    readonly clear: () => void;
    readonly dispose: () => void;
  };
}

/** Planned test-facing contract for exact-context User Roles orchestration. */
interface UserRoleControllerExports {
  readonly createAdminUserRoleController: (options: {
    readonly readContext: () => {
      readonly organizationId: string;
      readonly userId: string;
      readonly sessionEpoch: number;
    };
    readonly readOperations: () => Pick<
      AdminRbacOperations,
      'listUserRoles' | 'listRoles' | 'assignUserRoles' | 'removeUserRoles'
    >;
    readonly listApplications: (
      signal?: AbortSignal,
    ) => Promise<
      | { readonly kind: 'success'; readonly value: readonly AdminApplication[] }
      | { readonly kind: 'session-invalid' }
      | { readonly kind: 'failure'; readonly failure: 'invalid-response' | 'unavailable' }
    >;
    readonly publishState: (state: UserRoleProjection | { readonly kind: 'closed' }) => void;
    readonly requestAuthentication: () => void;
    readonly setRecoveryRequired?: (required: boolean) => void;
  }) => {
    readonly load: () => Promise<void>;
    readonly loadAvailableRoles: (applicationId: string) => Promise<void>;
    readonly assignRole: (roleId: string) => Promise<void>;
    readonly removeRole: (roleId: string) => Promise<void>;
    readonly reload: () => Promise<void>;
    readonly dispose: () => void;
  };
}

/** Loads the planned dialog module without requiring it during test discovery. */
async function dialogExports(): Promise<UserRoleDialogExports> {
  return (await import('../../src/admin/user-role-dialog.js')) as UserRoleDialogExports;
}

/** Loads the planned controller module without requiring it during test discovery. */
async function controllerExports(): Promise<UserRoleControllerExports> {
  return (await import('../../src/admin/user-role-controller.js')) as UserRoleControllerExports;
}

/** Collects every mounted descendant for control-level assertions. */
function descendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(root);
  return result;
}

/** Reads the complete visible terminal frame. */
function frameText(host: ReturnType<typeof createApplication>): string {
  return host.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

/** Lets modal mounting and reactive layout settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Finds one visible action by its label. */
function button(root: View, label: string): Button {
  const found = descendants(root)
    .filter((view) => view instanceof Button)
    .find((candidate) => candidate.activation.label === label);
  if (!found) throw new Error(`${label} button missing.`);
  return found;
}

/** Activates one control through the normal keyboard route. */
function activate(host: ReturnType<typeof createApplication>, action: Button): void {
  host.loop.focusView(action);
  host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
}

/** Selects the focused row without invoking a mutation. */
async function selectFocusedRow(
  host: ReturnType<typeof createApplication>,
  grid: DataGrid<unknown>,
): Promise<void> {
  host.loop.focusView(grid.rows);
  host.loop.dispatch({ type: 'key', key: 'enter', ctrl: false, alt: false, shift: false });
  await settle();
}

/** Opens a real focused User Roles dialog at one supported terminal size. */
async function openDialog(
  projection: UserRoleProjection,
  granted: AdminCapabilities = capabilities,
  width = 80,
  height = 24,
) {
  const intents: UserRoleIntent[] = [];
  const host = createApplication({ viewport: { width, height } });
  const owner = (await dialogExports()).createAdminUserRoleDialog({
    organization: { id: organizationId, name: 'Example Organization' },
    user: { id: userId, label: 'Alice Admin' },
    capabilities: granted,
    viewport: { width, height },
    onIntent: (intent) => intents.push(intent),
  });
  host.desktop.addWindow(owner.content);
  owner.setState(projection);
  owner.focusCurrent();
  await settle();
  return { dialog: owner.content, host, intents, owner };
}

describe('User detail Roles operation', () => {
  // Role reading adds one focused operation to User details and emits no unrelated navigation.
  it('shows Roles only with role-read capability and emits the selected-user intent', async () => {
    const intents: unknown[] = [];
    const workspace = createAdminUserWorkspace({
      capabilities,
      onIntent: (intent) => intents.push(intent),
    });
    const host = createApplication({
      content: workspace.content,
      viewport: { width: 80, height: 24 },
    });
    workspace.setState({ kind: 'detail', page, selected: page.data[0]!, detail: user, etag: null });
    await settle();
    activate(host, button(workspace.content, 'Roles'));
    expect(intents).toContainEqual({ kind: 'roles' });

    const denied = createAdminUserWorkspace({
      capabilities: { ...capabilities, canReadRoles: false },
      onIntent: vi.fn(),
    });
    denied.setState({ kind: 'detail', page, selected: page.data[0]!, detail: user, etag: null });
    expect(
      descendants(denied.content).some(
        (view) => view instanceof Button && view.activation.label === 'Roles',
      ),
    ).toBe(false);
  });
});

describe('focused User Roles dialog', () => {
  const empty: UserRoleProjection = {
    kind: 'ready',
    organizationId,
    userId,
    assignedRoles: [],
    applications: [application],
    availableRoles: [role],
    availableRolesApplicationId: applicationId,
  };

  // No assignments still render the complete grid and Add chooses one application and one unassigned role.
  it('keeps the empty grid and completes one direct Add choice', async () => {
    const mounted = await openDialog(empty);
    const grid = descendants(mounted.dialog).find((view) => view instanceof DataGrid);
    expect(grid).toBeInstanceOf(DataGrid);
    expect(frameText(mounted.host)).toContain('Application');
    expect(frameText(mounted.host)).toContain('Name');
    expect(frameText(mounted.host)).toContain('Slug');

    activate(mounted.host, button(mounted.dialog, 'Add'));
    await settle();
    const choices = descendants(mounted.dialog).filter((view) => view instanceof ComboBox);
    expect(choices).toHaveLength(2);
    choices[0]?.value.set(choices[0].items.peek()[0]);
    mounted.owner.setState(empty);
    await settle();
    const loadedChoices = descendants(mounted.dialog).filter((view) => view instanceof ComboBox);
    loadedChoices[1]?.value.set(loadedChoices[1].items.peek()[0]);
    activate(mounted.host, button(mounted.dialog, 'Assign'));
    expect(mounted.intents).toContainEqual({ kind: 'load-available', applicationId });
    expect(mounted.intents).toContainEqual({ kind: 'assign', roleId });
  });

  // Role choices remain unusable unless they belong to the application currently shown.
  it('does not expose roles retained from a different application selection', async () => {
    const mounted = await openDialog({
      ...empty,
      applications: [application, otherApplication],
    });
    activate(mounted.host, button(mounted.dialog, 'Add'));
    await settle();
    const choices = descendants(mounted.dialog).filter((view) => view instanceof ComboBox);
    choices[0]?.value.set(otherApplication);
    await settle();

    const roleChoice = descendants(mounted.dialog).filter((view) => view instanceof ComboBox)[1];
    expect(roleChoice?.items.peek()).toEqual([]);
    expect(button(mounted.dialog, 'Assign').state.disabled).toBe(true);
  });

  // Missing exact capabilities leave actions visible-disabled and application UUID is the safe name fallback.
  it('uses fixed disabled reasons and the application ID fallback', async () => {
    const mounted = await openDialog(
      { ...empty, assignedRoles: [role], availableRoles: [] },
      { ...capabilities, canReadApplications: false, canAssignRoles: false },
    );
    expect(button(mounted.dialog, 'Add').state.disabled).toBe(true);
    expect(button(mounted.dialog, 'Remove').state.disabled).toBe(true);
    expect(frameText(mounted.host)).toContain(applicationId.slice(0, 16));
    expect(frameText(mounted.host)).toMatch(/role assign permission required/i);
  });

  // Remove requires an explicit row and a confirmation that names the selected role.
  it('confirms one selected role removal without hiding the operation', async () => {
    const mounted = await openDialog({ ...empty, assignedRoles: [role], availableRoles: [] });
    const grid = descendants(mounted.dialog).find((view) => view instanceof DataGrid);
    if (!(grid instanceof DataGrid)) throw new Error('Assigned-role grid missing.');
    expect(button(mounted.dialog, 'Remove').state.disabled).toBe(true);
    await selectFocusedRow(mounted.host, grid);
    activate(mounted.host, button(mounted.dialog, 'Remove'));
    await settle();
    const confirmation = mounted.host.desktop.activeWindow();
    if (!(confirmation instanceof Dialog)) throw new Error('Role removal confirmation missing.');
    expect(frameText(mounted.host)).toContain('Keep');
    expect(frameText(mounted.host)).toContain(`Remove ${role.name}`);
    activate(mounted.host, button(confirmation, `Remove ${role.name}`));
    expect(mounted.intents).toContainEqual({ kind: 'remove', roleId });
  });

  // Invalid remote content preserves no partial row and presents only the fixed safe failure.
  it('rejects the whole invalid collection without rendering retained remote text', async () => {
    const mounted = await openDialog({
      kind: 'failure',
      failure: 'invalid-response',
      previous: empty,
    });
    expect(frameText(mounted.host)).toContain('Invalid server response');
    expect(frameText(mounted.host)).not.toContain('Unsafe\u0000role');
  });
});

describe('User Roles controller reconciliation', () => {
  /** Creates one controller with direct, controllable Admin operation boundaries. */
  async function setupController() {
    let context = { organizationId, userId, sessionEpoch: 1 };
    const states: Array<UserRoleProjection | { readonly kind: 'closed' }> = [];
    const requestAuthentication = vi.fn();
    const listUserRoles = vi.fn<AdminRbacOperations['listUserRoles']>(async () => ({
      kind: 'success',
      value: [role],
    }));
    const listRoles = vi.fn<AdminRbacOperations['listRoles']>(async () => ({
      kind: 'success',
      value: [role],
    }));
    const assignUserRoles = vi.fn<AdminRbacOperations['assignUserRoles']>(async () => ({
      kind: 'success',
    }));
    const removeUserRoles = vi.fn<AdminRbacOperations['removeUserRoles']>(async () => ({
      kind: 'success',
      reauthenticationRequired: false,
    }));
    const operations = { listUserRoles, listRoles, assignUserRoles, removeUserRoles };
    const listApplications = vi.fn(async () => ({
      kind: 'success' as const,
      value: [application] as readonly AdminApplication[],
    }));
    const controller = (await controllerExports()).createAdminUserRoleController({
      readContext: () => context,
      readOperations: () => operations,
      listApplications,
      publishState: (state) => states.push(state),
      requestAuthentication,
    });
    return {
      controller,
      operations,
      listApplications,
      requestAuthentication,
      states,
      setContext: (next: typeof context) => {
        context = next;
      },
    };
  }

  // Assignment and removal each send one role ID and then reload the authoritative assignments.
  it('uses one-item direct mutations followed by authoritative reload', async () => {
    const mounted = await setupController();
    await mounted.controller.load();
    await mounted.controller.loadAvailableRoles(applicationId);
    expect(mounted.operations.listRoles).toHaveBeenCalledWith(
      applicationId,
      expect.any(AbortSignal),
    );

    vi.clearAllMocks();
    await mounted.controller.assignRole(roleId);
    expect(mounted.operations.assignUserRoles).toHaveBeenCalledWith(
      organizationId,
      userId,
      [roleId],
      expect.any(AbortSignal),
    );
    expect(mounted.operations.listUserRoles).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    await mounted.controller.removeRole(roleId);
    expect(mounted.operations.removeUserRoles).toHaveBeenCalledWith(
      organizationId,
      userId,
      [roleId],
      expect.any(AbortSignal),
    );
    expect(mounted.operations.listUserRoles).toHaveBeenCalledOnce();
  });

  // The shared allowlisted projection rejects every malformed row instead of publishing a partial list.
  it('rejects invalid ownership, UUID, timestamp, and control text as one remote collection', async () => {
    const { validateAdminRoleCollection } = await import('../../src/admin/rbac-state.js');
    for (const invalid of [
      { ...role, applicationId: '55555555-5555-4555-8555-555555555555' },
      { ...role, id: 'not-a-uuid' },
      { ...role, createdAt: 'yesterday' },
      { ...role, name: 'Unsafe\u0000role' },
    ]) {
      expect(validateAdminRoleCollection([role, invalid], applicationId)).toBeUndefined();
    }

    const mounted = await setupController();
    mounted.operations.listUserRoles.mockResolvedValueOnce({
      kind: 'failure',
      failure: 'invalid-response',
    });
    await mounted.controller.load();
    expect(mounted.states.at(-1)).toMatchObject({ kind: 'failure', failure: 'invalid-response' });
  });

  // A stale organization, user, or session result cannot replace the current protected context.
  it('ignores a late role response after the exact context changes', async () => {
    const mounted = await setupController();
    let resolveRoles: ((result: AdminRbacReadResult<readonly AdminRole[]>) => void) | undefined;
    mounted.operations.listUserRoles.mockImplementationOnce(
      () => new Promise((resolve) => (resolveRoles = resolve)),
    );
    const load = mounted.controller.load();
    mounted.setContext({
      organizationId: '55555555-5555-4555-8555-555555555555',
      userId: '66666666-6666-4666-8666-666666666666',
      sessionEpoch: 2,
    });
    resolveRoles?.({ kind: 'success', value: [role] });
    await load;
    expect(mounted.states.some((state) => state.kind === 'ready')).toBe(false);
  });

  // Definite self-revocation clears protected state and authenticates without an unauthorized reload.
  it('opens authentication without reload after definite reauthentication', async () => {
    const mounted = await setupController();
    mounted.operations.removeUserRoles.mockResolvedValueOnce({
      kind: 'success',
      reauthenticationRequired: true,
    });
    await mounted.controller.removeRole(roleId);
    expect(mounted.states.at(-1)).toEqual({ kind: 'closed' });
    expect(mounted.requestAuthentication).toHaveBeenCalledOnce();
    expect(mounted.operations.listUserRoles).not.toHaveBeenCalled();
  });

  // Unknown outcomes retain validated state and Reload reads without replaying the mutation.
  it('requires explicit read-only Reload after an unknown removal outcome', async () => {
    const mounted = await setupController();
    await mounted.controller.load();
    mounted.operations.removeUserRoles.mockResolvedValueOnce({ kind: 'outcome-unknown' });
    await mounted.controller.removeRole(roleId);
    expect(mounted.states.at(-1)).toMatchObject({ kind: 'indeterminate' });
    expect(mounted.operations.removeUserRoles).toHaveBeenCalledOnce();

    await mounted.controller.reload();
    expect(mounted.operations.removeUserRoles).toHaveBeenCalledOnce();
    expect(mounted.operations.listUserRoles).toHaveBeenCalledTimes(2);
  });

  // A failed replacement load cannot retain choices from the previously selected application.
  it('clears application-owned role choices before a replacement load can fail', async () => {
    const mounted = await setupController();
    await mounted.controller.load();
    await mounted.controller.loadAvailableRoles(applicationId);
    expect(mounted.states.at(-1)).toMatchObject({
      kind: 'ready',
      availableRolesApplicationId: applicationId,
    });

    mounted.operations.listRoles.mockResolvedValueOnce({
      kind: 'failure',
      failure: 'unavailable',
    });
    await mounted.controller.loadAvailableRoles(otherApplicationId);
    expect(mounted.states.at(-1)).toMatchObject({
      kind: 'failure',
      previous: { availableRoles: [] },
    });
    expect(
      (mounted.states.at(-1) as Extract<UserRoleProjection, { readonly kind: 'failure' }>).previous,
    ).not.toHaveProperty('availableRolesApplicationId');
  });

  // Closing an owner cannot erase uncertainty after the remote mutation was dispatched.
  it('preserves reconciliation ownership when disposed during a mutation', async () => {
    let resolveMutation: ((result: { readonly kind: 'success' }) => void) | undefined;
    const recovery = vi.fn();
    const mounted = await setupController();
    mounted.operations.assignUserRoles.mockImplementationOnce(
      () => new Promise((resolve) => (resolveMutation = resolve)),
    );
    const controller = (await controllerExports()).createAdminUserRoleController({
      readContext: () => ({ organizationId, userId, sessionEpoch: 1 }),
      readOperations: () => mounted.operations,
      listApplications: mounted.listApplications,
      publishState: vi.fn(),
      requestAuthentication: vi.fn(),
      setRecoveryRequired: recovery,
    });

    const mutation = controller.assignRole(roleId);
    await settle();
    controller.dispose();
    resolveMutation?.({ kind: 'success' });
    await mutation;

    expect(recovery).toHaveBeenLastCalledWith(true);
    expect(recovery).not.toHaveBeenLastCalledWith(false);
  });

  // Ordinary user reads cannot reconcile an uncertain role assignment because they do not read roles.
  it('keeps role recovery gated until the same user roles are reloaded', async () => {
    let userIntent: ((intent: AdminUserIntent) => void) | undefined;
    let resolveRemoval: ((result: { readonly kind: 'success' }) => void) | undefined;
    const recovery: boolean[] = [];
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const connection: AdminConnectionState = {
      kind: 'authenticated',
      server: new URL('https://porta.example.test'),
      identity: { sub: 'admin-subject', email: 'admin@example.test' },
      capabilities,
      organization: {
        id: organizationId,
        name: 'Example Organization',
        slug: 'example-organization',
        status: 'active',
      },
    };
    const userOperations: AdminUserOperations = {
      list: vi.fn(async () => ({ kind: 'success', value: page })),
      get: vi.fn(async () => ({ kind: 'success', value: { detail: user, etag: null } })),
      getHistory: vi.fn(),
      previewInvitation: vi.fn(),
      create: vi.fn(),
      invite: vi.fn(),
      update: vi.fn(),
      setPassword: vi.fn(),
      clearPassword: vi.fn(),
      verifyEmail: vi.fn(),
      deactivate: vi.fn(),
      activate: vi.fn(),
      delete: vi.fn(),
    };
    const rbacOperations: AdminRbacOperations = {
      listRoles: vi.fn(async () => ({ kind: 'success', value: [role] })),
      getRole: vi.fn(),
      createRole: vi.fn(),
      updateRole: vi.fn(),
      deleteRole: vi.fn(),
      listPermissions: vi.fn(),
      getPermission: vi.fn(),
      createPermission: vi.fn(),
      updatePermission: vi.fn(),
      deletePermission: vi.fn(),
      listRolePermissions: vi.fn(),
      assignRolePermissions: vi.fn(),
      removeRolePermissions: vi.fn(),
      listUserRoles: vi.fn(async () => ({ kind: 'success', value: [role] })),
      assignUserRoles: vi.fn(),
      removeUserRoles: vi.fn(
        () => new Promise((resolve) => (resolveRemoval = resolve)),
      ),
    };
    const controller = createAdminUserController({
      host,
      readState: () => connection,
      readOperations: () => userOperations,
      readRbacOperations: () => rbacOperations,
      readApplicationOperations: () => ({
        listAll: vi.fn(async () => ({ kind: 'success', value: [application] })),
      }),
      mountWorkspace: vi.fn(),
      isApplicationBusy: () => false,
      setDialogBusy: vi.fn(),
      setRecoveryRequired: (required) => recovery.push(required),
      requestAuthentication: vi.fn(),
      workspaceFactory: (options: AdminUserWorkspaceOptions) => {
        userIntent = options.onIntent;
        return {
          content: new Group(),
          setState: vi.fn(),
          focusCurrent: vi.fn(),
          clear: vi.fn(),
          dispose: vi.fn(),
        };
      },
    });
    controller.syncContext(connection, 1);
    controller.handleCommand(ADMIN_COMMANDS.browseUsers);
    await settle();
    userIntent?.({ kind: 'select', userId });
    await settle();
    userIntent?.({ kind: 'roles' });
    await settle();

    const roleDialog = host.desktop.activeWindow();
    if (!(roleDialog instanceof Dialog)) throw new Error('User Roles dialog missing.');
    const grid = descendants(roleDialog).find((view) => view instanceof DataGrid);
    if (!(grid instanceof DataGrid)) throw new Error('Assigned-role grid missing.');
    await selectFocusedRow(host, grid);
    activate(host, button(roleDialog, 'Remove'));
    await settle();
    const confirmation = host.desktop.activeWindow();
    if (!(confirmation instanceof Dialog)) throw new Error('Role removal confirmation missing.');
    activate(host, button(confirmation, `Remove ${role.name}`));
    await settle();
    controller.cancelActiveOperation();
    resolveRemoval?.({ kind: 'success' });
    await settle();
    expect(recovery).toEqual([true]);

    controller.handleCommand(ADMIN_COMMANDS.browseUsers);
    await settle();
    expect(recovery).toEqual([true]);

    userIntent?.({ kind: 'select', userId });
    await settle();
    userIntent?.({ kind: 'roles' });
    await settle();
    expect(recovery).toEqual([true, false]);
  });
});

describe.each([
  [80, 24],
  [48, 12],
] as const)('User Roles layout at %ix%i', (width, height) => {
  // The bounded dialog keeps every natural-width action reachable and separates the grid from operations.
  it('uses only Layout DSL geometry at supported terminal sizes', async () => {
    const mounted = await openDialog(
      {
        kind: 'ready',
        organizationId,
        userId,
        assignedRoles: [role],
        applications: [application],
        availableRoles: [],
      },
      capabilities,
      width,
      height,
    );
    const views = descendants(mounted.dialog);
    const grid = views.find((view) => view instanceof DataGrid);
    if (!(grid instanceof DataGrid)) throw new Error('Assigned-role grid missing.');
    expect(mounted.dialog.bounds.x).toBeGreaterThanOrEqual(0);
    expect(mounted.dialog.bounds.y).toBeGreaterThanOrEqual(0);
    expect(mounted.dialog.bounds.x + mounted.dialog.bounds.width).toBeLessThanOrEqual(width);
    expect(mounted.dialog.bounds.y + mounted.dialog.bounds.height).toBeLessThanOrEqual(height);
    for (const action of views.filter((view) => view instanceof Button)) {
      expect(action.layout.size).toBeUndefined();
      expect(action.focusable).toBe(true);
      expect(action.bounds.width).toBeGreaterThan(0);
      expect(action.bounds.height).toBeGreaterThan(0);
      expect(action.bounds.x).toBeGreaterThanOrEqual(0);
      expect(action.bounds.y).toBeGreaterThanOrEqual(0);
      expect(action.bounds.x + action.bounds.width).toBeLessThanOrEqual(
        mounted.dialog.bounds.width,
      );
      expect(action.bounds.y + action.bounds.height).toBeLessThanOrEqual(
        mounted.dialog.bounds.height,
      );
    }
    const operationRow = views.find(
      (view) =>
        view instanceof Group &&
        view.children.some(
          (child) => child instanceof Button && ['Add', 'Remove'].includes(child.activation.label),
        ),
    );
    if (!operationRow) throw new Error('Role operation row missing.');
    expect(operationRow.bounds.y).toBeGreaterThan(grid.bounds.y + grid.bounds.height);
    expect(frameText(mounted.host)).not.toContain('[jsvision/ui');
  });
});
