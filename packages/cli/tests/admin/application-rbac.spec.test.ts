/** Immutable behavior specifications for Application role and permission administration. */

import type { CreatePermissionInput, CreateRoleInput, Permission, Role } from '@portaidentity/sdk';
import {
  Button,
  createApplication,
  DataGrid,
  Dialog,
  Group,
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
    readonly operations: {
      readonly listRoles: (applicationId: string, signal: AbortSignal) => Promise<readonly Role[]>;
      readonly listPermissions: (
        applicationId: string,
        signal: AbortSignal,
      ) => Promise<readonly Permission[]>;
      readonly listRolePermissions: (
        applicationId: string,
        roleId: string,
        signal: AbortSignal,
      ) => Promise<readonly Permission[]>;
      readonly assignPermissions: (
        applicationId: string,
        roleId: string,
        permissionIds: readonly string[],
        signal: AbortSignal,
      ) => Promise<{ readonly kind: 'success' }>;
      readonly removePermissions: (
        applicationId: string,
        roleId: string,
        permissionIds: readonly string[],
        signal: AbortSignal,
      ) => Promise<
        | { readonly kind: 'success'; readonly reauthenticationRequired: boolean }
        | { readonly kind: 'outcome-unknown' }
      >;
    };
    readonly publishState: (state: ApplicationRbacProjection | { readonly kind: 'closed' }) => void;
    readonly requestAuthentication: () => void;
  }) => {
    readonly load: () => Promise<void>;
    readonly assignPermission: (roleId: string, permissionId: string) => Promise<void>;
    readonly removePermission: (roleId: string, permissionId: string) => Promise<void>;
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
  content.add(workspace.roles, workspace.permissions);
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
    inputs[1]?.getValueSignal().set('-invalid-');
    memo.setText('First line\nSecond line');
    expect(create.state.disabled).toBe(true);
    inputs[1]?.getValueSignal().set('billing-admin');
    expect(memo.bounds.height).toBeGreaterThanOrEqual(4);
    expect(create.state.disabled).toBe(false);
    activate(host, create);
    await expect(pending).resolves.toEqual({
      kind: 'create-role',
      input: {
        name: 'Billing administrator',
        slug: 'billing-admin',
        description: 'First line\nSecond line',
      },
    });
  });

  // Permission creation validates its stable identity while edit submits only mutable metadata.
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
    createInputs[0]?.getValueSignal().set('Read invoices');
    createInputs[1]?.getValueSignal().set('not-valid');
    expect(button(createDialog, 'Create').state.disabled).toBe(true);
    createInputs[1]?.getValueSignal().set('billing:invoice:read');
    expect(button(createDialog, 'Create').state.disabled).toBe(false);
    createHost.desktop.removeAll();
    await expect(createPending).resolves.toEqual({ kind: 'cancel' });

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
    expect(editable).toHaveLength(1);
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
});

describe('Application RBAC mutation reconciliation', () => {
  /** Creates controllable direct operations and one application-owned controller. */
  async function setupController() {
    let context = { applicationId, sessionEpoch: 1 };
    const states: Array<ApplicationRbacProjection | { readonly kind: 'closed' }> = [];
    const requestAuthentication = vi.fn();
    const operations = {
      listRoles: vi.fn(async () => [role] as readonly Role[]),
      listPermissions: vi.fn(async () => [permission] as readonly Permission[]),
      listRolePermissions: vi.fn(async () => [] as readonly Permission[]),
      assignPermissions: vi.fn(async () => ({ kind: 'success' as const })),
      removePermissions: vi.fn(async () => ({
        kind: 'success' as const,
        reauthenticationRequired: false,
      })),
    };
    const controller = (await controllerExports()).createAdminApplicationRbacController({
      readContext: () => context,
      operations,
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
    await mounted.controller.assignPermission(roleId, permissionId);
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
    await mounted.controller.removePermission(roleId, permissionId);
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
    await mounted.controller.removePermission(roleId, permissionId);

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
    await mounted.controller.removePermission(roleId, permissionId);
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
    let resolveRoles: ((roles: readonly Role[]) => void) | undefined;
    mounted.operations.listRoles.mockImplementationOnce(
      () => new Promise((resolve) => (resolveRoles = resolve)),
    );
    const load = mounted.controller.load();
    mounted.setContext({
      applicationId: '55555555-5555-4555-8555-555555555555',
      sessionEpoch: 2,
    });
    resolveRoles?.([role]);
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

    for (const invalidRole of [
      { ...role, id: 'not-a-uuid' },
      { ...role, applicationId: '55555555-5555-4555-8555-555555555555' },
      { ...role, createdAt: 'yesterday' },
      { ...role, name: 'Unsafe\u0000name' },
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
        expect(action.tabStop).toBe(true);
      }
      const actionRow = views.find(
        (view) =>
          view instanceof Group && descendants(view).some((child) => child instanceof Button),
      );
      if (!actionRow) throw new Error('RBAC action row missing.');
      expect(actionRow.bounds.y).toBeGreaterThan(grid.bounds.y + grid.bounds.height);
    }
    expect(frameText(mounted.host)).not.toContain('[jsvision/ui');
    expect(descendants(mounted.workspace.roles).some((view) => view instanceof Text)).toBe(true);
  });
});
