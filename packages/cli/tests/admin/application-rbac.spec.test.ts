/** Immutable behavior specifications for Application role and permission administration. */

import type { CreatePermissionInput, CreateRoleInput, Permission, Role } from '@portaidentity/sdk';
import {
  Button,
  CheckGroup,
  col,
  ComboBox,
  cover,
  createApplication,
  DataGrid,
  Dialog,
  Group,
  grow,
  Input,
  Memo,
  TabView,
  Text,
  View,
} from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import type {
  AdminApplication,
  AdminApplicationModule,
  AdminApplicationViewState,
} from '../../src/admin/application-state.js';
import { createAdminApplicationWorkspace } from '../../src/admin/application-workspace.js';
import type { AdminRbacOperations } from '../../src/admin/rbac-service.js';
import type { AdminRbacReadResult, AdminRole } from '../../src/admin/rbac-state.js';
import type { AdminCapabilities } from '../../src/admin/state.js';

const applicationId = '11111111-1111-4111-8111-111111111111';
const roleId = '22222222-2222-4222-8222-222222222222';
const permissionId = '33333333-3333-4333-8333-333333333333';
const moduleId = '44444444-4444-4444-8444-444444444444';

const application: AdminApplication = {
  id: applicationId,
  name: 'Customer Portal',
  slug: 'customer-portal',
  description: 'The customer-facing application.',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
};

const moduleRow: AdminApplicationModule = {
  id: moduleId,
  applicationId,
  name: 'Billing',
  slug: 'billing',
  description: null,
  status: 'active',
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-08-02T00:00:00Z',
};

const role: Role = {
  id: roleId,
  applicationId,
  name: 'Billing administrator',
  slug: 'billing-admin',
  description: 'Manages billing.',
  createdAt: '2026-01-03T00:00:00Z',
  updatedAt: '2026-08-03T00:00:00Z',
};

const permission: Permission = {
  id: permissionId,
  applicationId,
  moduleId,
  name: 'Read invoices',
  slug: 'billing:invoice:read',
  description: 'Reads invoice records.',
  createdAt: '2026-01-04T00:00:00Z',
};

interface RbacCapabilities {
  readonly canReadRoles: boolean;
  readonly canCreateRoles: boolean;
  readonly canUpdateRoles: boolean;
  readonly canDeleteRoles: boolean;
  readonly canReadPermissions: boolean;
  readonly canCreatePermissions: boolean;
  readonly canUpdatePermissions: boolean;
  readonly canDeletePermissions: boolean;
}

const capabilities: AdminCapabilities & RbacCapabilities = {
  canReadOrganizations: false,
  canCreateOrganizations: false,
  canReadUsers: false,
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
  canCreateRoles: true,
  canUpdateRoles: true,
  canDeleteRoles: true,
  canReadPermissions: true,
  canCreatePermissions: true,
  canUpdatePermissions: true,
  canDeletePermissions: true,
};

type ApplicationRbacProjection =
  | {
      readonly kind: 'ready';
      readonly applicationId: string;
      readonly roles: readonly Role[];
      readonly permissions: readonly Permission[];
      readonly assignedPermissions?: readonly Permission[];
      readonly availablePermissions?: readonly Permission[];
    }
  | {
      readonly kind: 'indeterminate';
      readonly previous: Extract<ApplicationRbacProjection, { readonly kind: 'ready' }>;
    }
  | {
      readonly kind: 'failure';
      readonly failure: 'invalid-response' | 'unavailable';
      readonly previous?: Extract<ApplicationRbacProjection, { readonly kind: 'ready' }>;
    };

interface ApplicationRbacWorkspace {
  readonly roles: View;
  readonly permissions: View;
  readonly setState: (state: ApplicationRbacProjection) => void;
}

interface ApplicationRbacWorkspaceExports {
  readonly createAdminApplicationRbacWorkspace: (options: {
    readonly application: AdminApplication;
    readonly modules: readonly AdminApplicationModule[];
    readonly capabilities: AdminCapabilities & RbacCapabilities;
    readonly onIntent: (intent: unknown) => void;
    readonly focusView: (view: View) => void;
  }) => ApplicationRbacWorkspace;
}

interface RbacDialogExports {
  readonly showCreateRoleDialog: (
    host: ReturnType<typeof createApplication>,
    signal: AbortSignal,
    application: AdminApplication,
  ) => Promise<
    { readonly kind: 'create-role'; readonly input: CreateRoleInput } | { readonly kind: 'cancel' }
  >;
  readonly showCreatePermissionDialog: (
    host: ReturnType<typeof createApplication>,
    signal: AbortSignal,
    application: AdminApplication,
    modules: readonly AdminApplicationModule[],
  ) => Promise<
    | { readonly kind: 'create-permission'; readonly input: CreatePermissionInput }
    | { readonly kind: 'cancel' }
  >;
  readonly showEditPermissionDialog: (
    host: ReturnType<typeof createApplication>,
    signal: AbortSignal,
    application: AdminApplication,
    permission: Permission,
    modules: readonly AdminApplicationModule[],
  ) => Promise<
    | {
        readonly kind: 'update-permission';
        readonly permissionId: string;
        readonly input: { readonly name?: string; readonly description?: string | null };
      }
    | { readonly kind: 'cancel' }
  >;
}

interface RbacControllerExports {
  readonly createAdminApplicationRbacController: (options: {
    readonly readContext: () => {
      readonly applicationId: string;
      readonly sessionEpoch: number;
    };
    readonly readOperations: () => Pick<
      AdminRbacOperations,
      | 'listRoles'
      | 'listPermissions'
      | 'listRolePermissions'
      | 'assignPermissions'
      | 'removePermissions'
    >;
    readonly publishState: (state: ApplicationRbacProjection | { readonly kind: 'closed' }) => void;
    readonly requestAuthentication: () => void;
  }) => {
    readonly load: () => Promise<void>;
    readonly assignPermissions: (roleId: string, permissionIds: readonly string[]) => Promise<void>;
    readonly removePermissions: (roleId: string, permissionIds: readonly string[]) => Promise<void>;
    readonly reload: () => Promise<void>;
  };
}

interface RbacStateExports {
  readonly validateAdminRoleCollection: (
    value: unknown,
    applicationId: string,
  ) => readonly Role[] | undefined;
  readonly validateAdminPermissionCollection: (
    value: unknown,
    applicationId: string,
  ) => readonly Permission[] | undefined;
}

async function workspaceExports(): Promise<ApplicationRbacWorkspaceExports> {
  return (await import('../../src/admin/application-rbac-workspace.js')) as ApplicationRbacWorkspaceExports;
}

async function dialogExports(): Promise<RbacDialogExports> {
  return (await import('../../src/admin/rbac-dialogs.js')) as RbacDialogExports;
}

async function controllerExports(): Promise<RbacControllerExports> {
  return (await import('../../src/admin/application-rbac-controller.js')) as RbacControllerExports;
}

async function stateExports(): Promise<RbacStateExports> {
  return (await import('../../src/admin/rbac-state.js')) as RbacStateExports;
}

/** Collects every mounted descendant for widget-level assertions. */
function descendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(root);
  return result;
}

/** Reads the complete rendered terminal frame. */
function frameText(host: ReturnType<typeof createApplication>): string {
  return host.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

/** Lets reactive layout and modal transitions settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Finds one visible button by label. */
function button(root: View, label: string): Button {
  const found = descendants(root)
    .filter((view) => view instanceof Button)
    .find((candidate) => candidate.activation.label === label);
  if (!found) throw new Error(`${label} button missing.`);
  return found;
}

/** Activates one control through the ordinary keyboard route. */
function activate(host: ReturnType<typeof createApplication>, action: Button): void {
  host.loop.focusView(action);
  host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
}

/** Selects the focused DataGrid row without invoking an operation. */
async function selectFocusedRow(
  host: ReturnType<typeof createApplication>,
  grid: DataGrid<unknown>,
): Promise<void> {
  host.loop.focusView(grid.rows);
  host.loop.dispatch({ type: 'key', key: 'enter', ctrl: false, alt: false, shift: false });
  await settle();
}

/** Mounts the direct RBAC pages with a complete validated projection. */
async function mountRbac(
  projection: ApplicationRbacProjection,
  granted: AdminCapabilities & RbacCapabilities = capabilities,
  width = 80,
  height = 24,
  owner: AdminApplication = application,
) {
  const exports = await workspaceExports();
  const content = new Group();
  const host = createApplication({ content, viewport: { width, height } });
  const workspace = exports.createAdminApplicationRbacWorkspace({
    application: owner,
    modules: [moduleRow],
    capabilities: granted,
    onIntent: vi.fn(),
    focusView: (view) => host.loop.focusView(view),
  });
  content.add(cover(col({ gap: 1 }, grow(workspace.roles), grow(workspace.permissions))));
  workspace.setState(projection);
  await settle();
  return { host, workspace };
}

describe('Application RBAC tabs and controls', () => {
  // A selected Application retains its identity while the two RBAC pages extend the existing tab order.
  it('appends Roles and Permissions after Overview and Modules', async () => {
    const state: AdminApplicationViewState = {
      kind: 'detail',
      scope: 'global',
      applications: [application],
      application,
      etag: null,
      modules: [moduleRow],
    };
    const workspace = createAdminApplicationWorkspace({
      capabilities,
      onIntent: vi.fn(),
      focusView: vi.fn(),
    });
    const host = createApplication({
      content: workspace.content,
      viewport: { width: 80, height: 24 },
    });
    workspace.setState(state);
    await settle();
    const tabs = descendants(workspace.content).find((view) => view instanceof TabView);
    if (!(tabs instanceof TabView)) throw new Error('Application tabs missing.');

    expect(tabs.tabs.peek().map((tab) => tab.title)).toEqual([
      'Overview',
      'Modules',
      'Roles',
      'Permissions',
    ]);
    tabs.select(3);
    expect(frameText(host)).toContain('Customer Portal');
  });

  // Each RBAC page must consume the complete TabView body instead of measuring to toolbar width.
  it('fills the Roles and Permissions tab body with the DataGrid layout', async () => {
    const workspace = createAdminApplicationWorkspace({
      capabilities,
      onIntent: vi.fn(),
      onRbacIntent: vi.fn(),
      focusView: vi.fn(),
    });
    createApplication({ content: workspace.content, viewport: { width: 80, height: 24 } });
    workspace.setState({
      kind: 'detail',
      scope: 'global',
      applications: [application],
      application,
      etag: null,
      modules: [moduleRow],
    });
    workspace.setRbacState({
      kind: 'ready',
      applicationId,
      roles: [role],
      permissions: [permission],
    });
    await settle();
    const tabs = descendants(workspace.content).find((view) => view instanceof TabView);
    if (!(tabs instanceof TabView)) throw new Error('Application tabs missing.');

    for (const index of [2, 3]) {
      tabs.select(index);
      await settle();
      const page = tabs.tabs.peek()[index]?.content;
      if (!page) throw new Error('RBAC tab page missing.');
      const body = page.children[0];
      if (!(body instanceof Group)) throw new Error('RBAC tab body missing.');
      const grid = descendants(page).find((view) => view instanceof DataGrid);
      if (!(grid instanceof DataGrid)) throw new Error('RBAC DataGrid missing.');

      expect(body.bounds).toEqual({
        x: 0,
        y: 0,
        width: page.bounds.width,
        height: page.bounds.height,
      });
      expect(grid.bounds.width).toBe(page.bounds.width - 2);
    }
  });

  // Empty collections remain real grids so administrators can see the columns and reach Add.
  it('keeps complete role and permission DataGrids visible when both collections are empty', async () => {
    const mounted = await mountRbac({
      kind: 'ready',
      applicationId,
      roles: [],
      permissions: [],
    });

    for (const page of [mounted.workspace.roles, mounted.workspace.permissions]) {
      expect(descendants(page).filter((view) => view instanceof DataGrid)).toHaveLength(1);
      expect(button(page, 'Add').state.disabled).toBe(false);
    }
    expect(frameText(mounted.host)).toContain('Name');
    expect(frameText(mounted.host)).toContain('Slug');
  });

  // Missing capabilities and selection never hide controls or silently choose the first record.
  it('keeps exact operations visible-disabled until capability and explicit selection allow them', async () => {
    const denied = {
      ...capabilities,
      canCreateRoles: false,
      canUpdateRoles: false,
      canDeleteRoles: false,
    };
    const mounted = await mountRbac(
      { kind: 'ready', applicationId, roles: [role], permissions: [permission] },
      denied,
    );
    const roles = mounted.workspace.roles;
    expect(button(roles, 'Add').state.disabled).toBe(true);
    expect(button(roles, 'Edit').state.disabled).toBe(true);
    expect(button(roles, 'Delete').state.disabled).toBe(true);
    expect(button(roles, 'Manage permissions').state.disabled).toBe(true);
    expect(frameText(mounted.host)).toMatch(/role create permission required/i);

    const allowed = await mountRbac({
      kind: 'ready',
      applicationId,
      roles: [role],
      permissions: [permission],
    });
    const grid = descendants(allowed.workspace.roles).find((view) => view instanceof DataGrid);
    if (!(grid instanceof DataGrid)) throw new Error('Role grid missing.');
    expect(button(allowed.workspace.roles, 'Edit').state.disabled).toBe(true);
    await selectFocusedRow(allowed.host, grid);
    expect(button(allowed.workspace.roles, 'Edit').state.disabled).toBe(false);
    expect(button(allowed.workspace.roles, 'Delete').state.disabled).toBe(false);
    expect(button(allowed.workspace.roles, 'Manage permissions').state.disabled).toBe(false);
  });

  // Built-in canonical records remain readable but generic identity, deletion, and mapping controls are fixed-disabled.
  it('prevents generic mutation of canonical Porta Admin records', async () => {
    const canonicalApplication = { ...application, slug: 'porta-admin' };
    const canonicalRole = { ...role, slug: 'porta-super-admin' };
    const canonicalPermission = { ...permission, slug: 'admin:role:read', moduleId: null };
    const mounted = await mountRbac(
      {
        kind: 'ready',
        applicationId,
        roles: [canonicalRole],
        permissions: [canonicalPermission],
      },
      capabilities,
      80,
      24,
      canonicalApplication,
    );
    const grid = descendants(mounted.workspace.roles).find((view) => view instanceof DataGrid);
    if (!(grid instanceof DataGrid)) throw new Error('Role grid missing.');
    await selectFocusedRow(mounted.host, grid);

    for (const label of ['Edit', 'Delete', 'Manage permissions']) {
      expect(button(mounted.workspace.roles, label).state.disabled).toBe(true);
    }
    const permissionGrid = descendants(mounted.workspace.permissions).find(
      (view) => view instanceof DataGrid,
    );
    if (!(permissionGrid instanceof DataGrid)) throw new Error('Permission grid missing.');
    await selectFocusedRow(mounted.host, permissionGrid);
    expect(button(mounted.workspace.permissions, 'Edit').state.disabled).toBe(true);
    expect(button(mounted.workspace.permissions, 'Delete').state.disabled).toBe(true);
    expect(frameText(mounted.host)).toMatch(/built-in Porta Admin record/i);
  });
});

describe('focused RBAC dialogs', () => {
  // Role input uses bounded local validation and a useful multiline description without a nested surface.
  it('enables role creation only for a valid name, optional slug, and bounded multiline description', async () => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const pending = (await dialogExports()).showCreateRoleDialog(
      host,
      new AbortController().signal,
      application,
    );
    await settle();
    const dialog = host.desktop.activeWindow();
    if (!(dialog instanceof Dialog)) throw new Error('Role dialog missing.');
    const inputs = descendants(dialog).filter((view) => view instanceof Input);
    const memo = descendants(dialog).find((view) => view instanceof Memo);
    const create = button(dialog, 'Create');
    if (!memo) throw new Error('Role description missing.');

    expect(descendants(dialog).some((view) => view.constructor.name === 'GroupBox')).toBe(false);
    expect(create.state.disabled).toBe(true);
    inputs[0]?.getValueSignal().set('Billing administrator');
    inputs[1]?.getValueSignal().set('  GROUP_BILLING_ADMIN  ');
    memo.setText('First line\nSecond line');
    expect(memo.bounds.height).toBeGreaterThanOrEqual(4);
    expect(create.state.disabled).toBe(false);
    activate(host, create);
    await expect(pending).resolves.toEqual({
      kind: 'create-role',
      input: {
        name: 'Billing administrator',
        slug: 'GROUP_BILLING_ADMIN',
        description: 'First line\nSecond line',
      },
    });
  });

  // Permission creation explains its required identity and names the application-level scope.
  it('separates permission creation fields from immutable edit identity and scope', async () => {
    const exports = await dialogExports();
    const createHost = createApplication({ viewport: { width: 80, height: 24 } });
    const createPending = exports.showCreatePermissionDialog(
      createHost,
      new AbortController().signal,
      application,
      [moduleRow],
    );
    await settle();
    const createDialog = createHost.desktop.activeWindow();
    if (!(createDialog instanceof Dialog)) throw new Error('Permission create dialog missing.');
    const createInputs = descendants(createDialog).filter((view) => view instanceof Input);
    const scope = descendants(createDialog).find((view) => view instanceof ComboBox);
    if (!(scope instanceof ComboBox)) throw new Error('Permission scope selector missing.');
    expect(frameText(createHost)).toContain('Name *');
    expect(frameText(createHost)).toContain('Slug *');
    expect(frameText(createHost)).toContain('Exact claim value');
    expect(scope.items.peek().map((choice) => choice.label)).toEqual([
      application.name,
      moduleRow.name,
    ]);
    createInputs[0]?.getValueSignal().set('Read invoices');
    createInputs[1]?.getValueSignal().set('   ');
    expect(button(createDialog, 'Create').state.disabled).toBe(true);
    createInputs[1]?.getValueSignal().set('  CAN_READ_INVOICE  ');
    const create = button(createDialog, 'Create');
    expect(create.state.disabled).toBe(false);
    activate(createHost, create);
    await expect(createPending).resolves.toEqual({
      kind: 'create-permission',
      input: { name: 'Read invoices', slug: 'CAN_READ_INVOICE' },
    });

    const editHost = createApplication({ viewport: { width: 80, height: 24 } });
    const editPending = exports.showEditPermissionDialog(
      editHost,
      new AbortController().signal,
      application,
      permission,
      [moduleRow],
    );
    await settle();
    const editDialog = editHost.desktop.activeWindow();
    if (!(editDialog instanceof Dialog)) throw new Error('Permission edit dialog missing.');
    const editable = descendants(editDialog).filter((view) => view instanceof Input);
    expect(editable).toHaveLength(2);
    expect(editHost.loop.getFocused()).toBe(editable[0]);
    expect(editable.some((input) => input.getValueSignal().peek() === permission.slug)).toBe(true);
    expect(frameText(editHost)).toContain(permission.slug);
    expect(frameText(editHost)).toContain('Billing');
    editable[0]?.getValueSignal().set('View invoices');
    activate(editHost, button(editDialog, 'Save'));
    await expect(editPending).resolves.toEqual({
      kind: 'update-permission',
      permissionId,
      input: { name: 'View invoices', description: permission.description },
    });
  });

  // Role permission management uses two checkbox columns and saves the complete visible change set.
  it('assigns and removes permissions from two DSL checkbox columns', async () => {
    const exports = await dialogExports();
    const availablePermission = {
      ...permission,
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Update invoices',
      slug: 'billing:invoice:update',
    };
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const pending = exports.showManageRolePermissionsDialog(
      host,
      new AbortController().signal,
      application,
      role,
      [permission],
      [availablePermission],
      true,
    );
    await settle();
    const dialog = host.desktop.activeWindow();
    if (!(dialog instanceof Dialog)) throw new Error('Role permission dialog missing.');
    const checks = descendants(dialog).filter((view) => view instanceof CheckGroup);
    expect(checks).toHaveLength(2);
    expect(descendants(dialog).filter((view) => view instanceof DataGrid)).toHaveLength(0);
    expect(checks[0]?.bounds.y).toBe(checks[1]?.bounds.y);
    expect(checks[0]?.bounds.x).toBeLessThan(checks[1]?.bounds.x ?? 0);
    expect(dialog.resizable).toBe(true);
    expect(frameText(host)).toContain('[X]');
    expect(frameText(host)).toContain('[ ]');
    expect(button(dialog, 'Save').state.disabled).toBe(true);

    const availableCheck = checks[1];
    if (!(availableCheck instanceof CheckGroup)) throw new Error('Available checkbox missing.');
    host.loop.focusView(availableCheck);
    host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
    expect(button(dialog, 'Save').state.disabled).toBe(false);
    activate(host, button(dialog, 'Save'));
    await expect(pending).resolves.toEqual({
      kind: 'update-role-permissions',
      roleId,
      assignPermissionIds: [availablePermission.id],
      removePermissionIds: [],
    });

    const removeHost = createApplication({ viewport: { width: 80, height: 24 } });
    const removePending = exports.showManageRolePermissionsDialog(
      removeHost,
      new AbortController().signal,
      application,
      role,
      [permission],
      [availablePermission],
      true,
    );
    await settle();
    const removeDialog = removeHost.desktop.activeWindow();
    if (!(removeDialog instanceof Dialog)) throw new Error('Role permission dialog missing.');
    const assignedCheck = descendants(removeDialog).find((view) => view instanceof CheckGroup);
    if (!(assignedCheck instanceof CheckGroup)) throw new Error('Assigned checkbox missing.');
    removeHost.loop.focusView(assignedCheck);
    removeHost.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
    activate(removeHost, button(removeDialog, 'Save'));
    await expect(removePending).resolves.toEqual({
      kind: 'update-role-permissions',
      roleId,
      assignPermissionIds: [],
      removePermissionIds: [permissionId],
    });
  });

  // Protected authorization definitions are visible but cannot be attached through generic role editing.
  it('marks canonical Porta Admin permissions as protected in role management', async () => {
    const exports = await dialogExports();
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const pending = exports.showManageRolePermissionsDialog(
      host,
      new AbortController().signal,
      { ...application, slug: 'porta-admin' },
      role,
      [],
      [{ ...permission, moduleId: null, slug: 'admin:role:read' }],
      true,
    );
    await settle();
    const dialog = host.desktop.activeWindow();
    if (!(dialog instanceof Dialog)) throw new Error('Role permission dialog missing.');
    expect(descendants(dialog).filter((view) => view instanceof CheckGroup)).toHaveLength(0);
    expect(frameText(host)).toMatch(/protected built-in permission/i);
    expect(frameText(host)).not.toContain('admin:role:read');
    expect(button(dialog, 'Save').state.disabled).toBe(true);
    host.loop.endModal('cancel');
    await expect(pending).resolves.toEqual({ kind: 'cancel' });
  });
});

describe('Application RBAC mutation reconciliation', () => {
  /** Creates controllable direct operations and one application-owned controller. */
  async function setupController() {
    let context = { applicationId, sessionEpoch: 1 };
    const states: Array<ApplicationRbacProjection | { readonly kind: 'closed' }> = [];
    const requestAuthentication = vi.fn();
    const listRoles = vi.fn<AdminRbacOperations['listRoles']>(async () => ({
      kind: 'success',
      value: [role],
    }));
    const listPermissions = vi.fn<AdminRbacOperations['listPermissions']>(async () => ({
      kind: 'success',
      value: [permission],
    }));
    const listRolePermissions = vi.fn<AdminRbacOperations['listRolePermissions']>(async () => ({
      kind: 'success',
      value: [],
    }));
    const assignPermissions = vi.fn<AdminRbacOperations['assignPermissions']>(async () => ({
      kind: 'success',
    }));
    const removePermissions = vi.fn<AdminRbacOperations['removePermissions']>(async () => ({
      kind: 'success',
      reauthenticationRequired: false,
    }));
    const operations = {
      listRoles,
      listPermissions,
      listRolePermissions,
      assignPermissions,
      removePermissions,
    };
    const controller = (await controllerExports()).createAdminApplicationRbacController({
      readContext: () => context,
      readOperations: () => operations,
      publishState: (state) => states.push(state),
      requestAuthentication,
    });
    return {
      controller,
      operations,
      requestAuthentication,
      states,
      setContext: (next: typeof context) => {
        context = next;
      },
    };
  }

  // Each mapping action is one direct request followed by authoritative assigned and available reads.
  it('adds and removes one permission at a time and reloads both collections', async () => {
    const mounted = await setupController();
    await mounted.controller.assignPermissions(roleId, [permissionId]);
    expect(mounted.operations.assignPermissions).toHaveBeenCalledOnce();
    expect(mounted.operations.assignPermissions).toHaveBeenCalledWith(
      applicationId,
      roleId,
      [permissionId],
      expect.any(AbortSignal),
    );
    expect(mounted.operations.listRolePermissions).toHaveBeenCalledOnce();
    expect(mounted.operations.listPermissions).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    await mounted.controller.removePermissions(roleId, [permissionId]);
    expect(mounted.operations.removePermissions).toHaveBeenCalledOnce();
    expect(mounted.operations.removePermissions).toHaveBeenCalledWith(
      applicationId,
      roleId,
      [permissionId],
      expect.any(AbortSignal),
    );
    expect(mounted.operations.listRolePermissions).toHaveBeenCalledOnce();
    expect(mounted.operations.listPermissions).toHaveBeenCalledOnce();
  });

  // Definite self-revocation clears protected state and authenticates without an unauthorized reload.
  it('opens authentication without reload after definite reauthentication', async () => {
    const mounted = await setupController();
    mounted.operations.removePermissions.mockResolvedValueOnce({
      kind: 'success',
      reauthenticationRequired: true,
    });
    await mounted.controller.removePermissions(roleId, [permissionId]);

    expect(mounted.states.at(-1)).toEqual({ kind: 'closed' });
    expect(mounted.requestAuthentication).toHaveBeenCalledOnce();
    expect(mounted.operations.listRolePermissions).not.toHaveBeenCalled();
    expect(mounted.operations.listPermissions).not.toHaveBeenCalled();
  });

  // Unknown outcomes preserve the last validated projection; Reload performs reads and never replays mutation.
  it('requires explicit read-only Reload after an unknown mutation outcome', async () => {
    const mounted = await setupController();
    await mounted.controller.load();
    mounted.operations.removePermissions.mockResolvedValueOnce({ kind: 'outcome-unknown' });
    await mounted.controller.removePermissions(roleId, [permissionId]);
    expect(mounted.states.at(-1)).toMatchObject({ kind: 'indeterminate' });
    expect(mounted.operations.removePermissions).toHaveBeenCalledOnce();

    await mounted.controller.reload();
    expect(mounted.operations.removePermissions).toHaveBeenCalledOnce();
    expect(mounted.operations.listRoles).toHaveBeenCalledTimes(2);
    expect(mounted.operations.listPermissions).toHaveBeenCalledTimes(2);
  });

  // Results from an old application or session epoch cannot replace the current protected context.
  it('rejects stale reads after application or session context changes', async () => {
    const mounted = await setupController();
    let resolveRoles: ((result: AdminRbacReadResult<readonly AdminRole[]>) => void) | undefined;
    mounted.operations.listRoles.mockImplementationOnce(
      () => new Promise((resolve) => (resolveRoles = resolve)),
    );
    const load = mounted.controller.load();
    mounted.setContext({
      applicationId: '55555555-5555-4555-8555-555555555555',
      sessionEpoch: 2,
    });
    resolveRoles?.({ kind: 'success', value: [role] });
    await load;

    expect(mounted.states.some((state) => state.kind === 'ready')).toBe(false);
  });
});

describe('Application RBAC remote validation', () => {
  // Any malformed UUID, ownership, timestamp, nullable text, or control text rejects the whole collection.
  it('publishes only complete allowlisted role and permission collections', async () => {
    const validators = await stateExports();
    expect(validators.validateAdminRoleCollection([role], applicationId)).toEqual([role]);
    expect(validators.validateAdminPermissionCollection([permission], applicationId)).toEqual([
      permission,
    ]);
    expect(
      validators.validateAdminRoleCollection(
        [{ ...role, slug: 'GROUP_BILLING_ADMIN' }],
        applicationId,
      ),
    ).toBeDefined();
    expect(
      validators.validateAdminPermissionCollection(
        [{ ...permission, slug: 'CAN_READ_INVOICE' }],
        applicationId,
      ),
    ).toBeDefined();

    for (const invalidRole of [
      { ...role, id: 'not-a-uuid' },
      { ...role, applicationId: '55555555-5555-4555-8555-555555555555' },
      { ...role, createdAt: 'yesterday' },
      { ...role, name: 'Unsafe\u0000name' },
      { ...role, slug: ' GROUP_ADMIN ' },
    ]) {
      expect(
        validators.validateAdminRoleCollection([role, invalidRole], applicationId),
      ).toBeUndefined();
    }
    expect(
      validators.validateAdminPermissionCollection(
        [{ ...permission, description: 42 }],
        applicationId,
      ),
    ).toBeUndefined();
  });
});

describe.each([
  [80, 24],
  [48, 12],
] as const)('Application RBAC layout at %ix%i', (width, height) => {
  // Layout DSL keeps navigation separate, leaves one row below each grid, and preserves keyboard reachability.
  it('uses natural actions and a bounded terminal layout', async () => {
    const mounted = await mountRbac(
      { kind: 'ready', applicationId, roles: [role], permissions: [permission] },
      capabilities,
      width,
      height,
    );
    for (const page of [mounted.workspace.roles, mounted.workspace.permissions]) {
      const views = descendants(page);
      const grid = views.find((view) => view instanceof DataGrid);
      if (!(grid instanceof DataGrid)) throw new Error('RBAC grid missing.');
      for (const action of views.filter((view) => view instanceof Button)) {
        expect(action.layout.size).toBeUndefined();
        expect(action.focusable).toBe(true);
      }
      const actionRow = views.find(
        (view) => view instanceof Group && view.children.some((child) => child instanceof Button),
      );
      if (!actionRow) throw new Error('RBAC action row missing.');
      expect(actionRow.bounds.y).toBeGreaterThan(grid.bounds.y + grid.bounds.height);
    }
    expect(frameText(mounted.host)).not.toContain('[jsvision/ui');
    expect(descendants(mounted.workspace.roles).some((view) => view instanceof Text)).toBe(true);
  });
});
