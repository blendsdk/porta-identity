/** Implementation coverage for Application-owned RBAC rendering and operation ownership. */

import {
  Button,
  col,
  cover,
  createApplication,
  DataGrid,
  Dialog,
  Group,
  grow,
  Input,
  Memo,
  TabView,
  View,
} from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import { createAdminApplicationRbacController } from '../../src/admin/application-rbac-controller.js';
import { createAdminApplicationRbacFeatures } from '../../src/admin/application-rbac-features.js';
import { createAdminApplicationRbacWorkspace } from '../../src/admin/application-rbac-workspace.js';
import { createAdminApplicationWorkspace } from '../../src/admin/application-workspace.js';
import type {
  AdminApplication,
  AdminApplicationViewState,
} from '../../src/admin/application-state.js';
import {
  showCreatePermissionDialog,
  showCreateRoleDialog,
  showDeletePermissionDialog,
  showDeleteRoleDialog,
  showEditPermissionDialog,
  showEditRoleDialog,
  showManageRolePermissionsDialog,
} from '../../src/admin/rbac-dialogs.js';
import { createAdminRbacOperations } from '../../src/admin/rbac-service.js';
import type {
  AdminApplicationRbacViewState,
  AdminPermission,
  AdminRole,
} from '../../src/admin/rbac-state.js';
import type { AdminCapabilities } from '../../src/admin/state.js';

const applicationId = '11111111-1111-4111-8111-111111111111';
const alphaRoleId = '22222222-2222-4222-8222-222222222222';
const zuluRoleId = '33333333-3333-4333-8333-333333333333';
const alphaPermissionId = '44444444-4444-4444-8444-444444444444';
const zuluPermissionId = '55555555-5555-4555-8555-555555555555';

const application: AdminApplication = {
  id: applicationId,
  name: 'Customer Portal',
  slug: 'customer-portal',
  description: null,
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
};

const capabilities: AdminCapabilities = {
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
  canAssignRoles: true,
};

/** Creates a valid role owned by the selected Application. */
function role(id: string, name: string, slug: string): AdminRole {
  return {
    id,
    applicationId,
    name,
    slug,
    description: null,
    createdAt: '2026-01-03T00:00:00Z',
    updatedAt: '2026-08-03T00:00:00Z',
  };
}

/** Creates a valid permission owned by the selected Application. */
function permission(id: string, name: string, slug: string): AdminPermission {
  return {
    id,
    applicationId,
    moduleId: null,
    name,
    slug,
    description: null,
    createdAt: '2026-01-04T00:00:00Z',
  };
}

/** Collects every mounted descendant for direct widget assertions. */
function descendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(root);
  return result;
}

/** Returns one mounted button by its visible label. */
function button(root: View, label: string): Button {
  const found = descendants(root)
    .filter((view) => view instanceof Button)
    .find((candidate) => candidate.activation.label === label);
  if (!found) throw new Error(`${label} button missing.`);
  return found;
}

/** Reads all visible terminal text from an application frame. */
function frameText(host: ReturnType<typeof createApplication>): string {
  return host.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

/** Allows signal-driven selection and rendering to settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('Application RBAC workspace internals', () => {
  it('dispatches the selected display row after sorting roles', async () => {
    const onIntent = vi.fn();
    const root = new Group();
    const host = createApplication({ content: root, viewport: { width: 100, height: 24 } });
    const workspace = createAdminApplicationRbacWorkspace({
      application,
      modules: [],
      capabilities,
      onIntent,
      focusView: (view) => host.loop.focusView(view),
    });
    root.add(cover(col({}, grow(workspace.roles))));
    workspace.setState({
      kind: 'ready',
      applicationId,
      roles: [
        role(zuluRoleId, 'Zulu operator', 'zulu-operator'),
        role(alphaRoleId, 'Alpha operator', 'alpha-operator'),
      ],
      permissions: [],
    });
    await settle();

    const grid = descendants(workspace.roles).find((view) => view instanceof DataGrid);
    if (!(grid instanceof DataGrid)) throw new Error('Role grid missing.');
    grid.sortBy(0, 'asc');
    host.loop.focusView(grid.rows);
    host.loop.dispatch({ type: 'key', key: 'enter', ctrl: false, alt: false, shift: false });
    await settle();
    host.loop.focusView(button(workspace.roles, 'Edit'));
    host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });

    expect(onIntent).toHaveBeenCalledWith({ kind: 'edit-role', roleId: alphaRoleId });
  });

  it('restores focus to each page DataGrid and removes stale rows on clear and dispose', async () => {
    const focused: View[] = [];
    const root = new Group();
    const host = createApplication({ content: root, viewport: { width: 100, height: 24 } });
    const workspace = createAdminApplicationRbacWorkspace({
      application,
      modules: [],
      capabilities,
      onIntent: vi.fn(),
      focusView: (view) => focused.push(view),
    });
    root.add(cover(col({}, grow(workspace.roles), grow(workspace.permissions))));
    workspace.setState({
      kind: 'ready',
      applicationId,
      roles: [role(alphaRoleId, 'Temporary role', 'temporary-role')],
      permissions: [],
    });
    await settle();

    workspace.focusCurrent('roles');
    workspace.focusCurrent('permissions');
    expect(focused).toHaveLength(2);
    expect(focused.every((view) => view.constructor.name === 'GridRows')).toBe(true);
    expect(frameText(host)).toContain('Temporary role');

    workspace.clear();
    await settle();
    expect(frameText(host)).not.toContain('Temporary role');
    expect(descendants(workspace.roles).some((view) => view instanceof DataGrid)).toBe(true);

    workspace.dispose();
    workspace.setState({
      kind: 'ready',
      applicationId,
      roles: [role(zuluRoleId, 'Late role', 'late-role')],
      permissions: [],
    });
    await settle();
    expect(frameText(host)).not.toContain('Late role');
  });

  it('clears role and permission selection when sorting changes', async () => {
    const root = new Group();
    const host = createApplication({ content: root, viewport: { width: 100, height: 24 } });
    const workspace = createAdminApplicationRbacWorkspace({
      application,
      modules: [],
      capabilities,
      onIntent: vi.fn(),
      focusView: (view) => host.loop.focusView(view),
    });
    root.add(cover(col({}, grow(workspace.roles), grow(workspace.permissions))));
    workspace.setState({
      kind: 'ready',
      applicationId,
      roles: [
        role(alphaRoleId, 'Alpha operator', 'alpha-operator'),
        role(zuluRoleId, 'Zulu operator', 'zulu-operator'),
      ],
      permissions: [
        permission(alphaPermissionId, 'Alpha permission', 'alpha:item:read'),
        permission(zuluPermissionId, 'Zulu permission', 'zulu:item:read'),
      ],
    });
    await settle();

    for (const page of [workspace.roles, workspace.permissions]) {
      const grid = descendants(page).find((view) => view instanceof DataGrid);
      if (!(grid instanceof DataGrid)) throw new Error('RBAC grid missing.');
      host.loop.focusView(grid.rows);
      host.loop.dispatch({ type: 'key', key: 'enter', ctrl: false, alt: false, shift: false });
      await settle();
      expect(grid.selected.peek()).toBe(0);
      grid.sortBy(0, 'desc');
      await settle();
      expect(grid.selected.peek()).toBe(-1);
      expect(button(page, 'Edit').state.disabled).toBe(true);
      expect(button(page, 'Delete').state.disabled).toBe(true);
    }
  });

  it('renders fixed safe failure and unknown-outcome notices', async () => {
    const mounted = new Group();
    const host = createApplication({ content: mounted, viewport: { width: 100, height: 24 } });
    const workspace = createAdminApplicationRbacWorkspace({
      application,
      modules: [],
      capabilities,
      onIntent: vi.fn(),
    });
    mounted.add(cover(col({}, grow(workspace.roles), grow(workspace.permissions))));
    const previous = {
      kind: 'ready' as const,
      applicationId,
      roles: [role(alphaRoleId, 'Alpha operator', 'alpha-operator')],
      permissions: [],
    };

    workspace.setState({ kind: 'failure', failure: 'invalid-response', previous });
    await settle();
    expect(frameText(host)).toContain('Invalid server response');
    workspace.setState({ kind: 'indeterminate', previous });
    await settle();
    expect(frameText(host)).toContain('The operation outcome is unknown; reload is required');
  });
});

describe('Application RBAC controller ownership', () => {
  it('aborts an active load and ignores its late completion', async () => {
    let resolveRoles:
      ((value: { kind: 'success'; value: readonly AdminRole[] }) => void) | undefined;
    let capturedSignal: AbortSignal | undefined;
    const pendingRoles = new Promise<{ kind: 'success'; value: readonly AdminRole[] }>(
      (resolve) => {
        resolveRoles = resolve;
      },
    );
    const states: AdminApplicationRbacViewState[] = [];
    const controller = createAdminApplicationRbacController({
      readContext: () => ({ applicationId, sessionEpoch: 1 }),
      readOperations: () => ({
        listRoles: (_owner, signal) => {
          capturedSignal = signal;
          return pendingRoles;
        },
        listPermissions: vi.fn().mockResolvedValue({ kind: 'success', value: [] }),
      }),
      publishState: (state) => states.push(state),
      requestAuthentication: vi.fn(),
    });

    const load = controller.load();
    controller.cancelActiveOperation();
    resolveRoles?.({
      kind: 'success',
      value: [role(alphaRoleId, 'Alpha operator', 'alpha-operator')],
    });
    await load;

    expect(capturedSignal?.aborted).toBe(true);
    expect(states).toEqual([{ kind: 'loading' }]);
  });

  it('blocks another mutation until reload after an unknown first mutation', async () => {
    const states: AdminApplicationRbacViewState[] = [];
    const createRole = vi.fn().mockResolvedValue({ kind: 'outcome-unknown' });
    const listRoles = vi.fn().mockResolvedValue({ kind: 'success', value: [] });
    const listPermissions = vi.fn().mockResolvedValue({ kind: 'success', value: [] });
    const controller = createAdminApplicationRbacController({
      readContext: () => ({ applicationId, sessionEpoch: 1 }),
      readOperations: () => ({ createRole, listRoles, listPermissions }),
      publishState: (state) => states.push(state),
      requestAuthentication: vi.fn(),
    });

    await controller.createRole({ name: 'First attempt' });
    await controller.createRole({ name: 'Blocked duplicate' });

    expect(createRole).toHaveBeenCalledOnce();
    expect(states.at(-1)).toEqual({ kind: 'indeterminate' });

    await controller.reload();
    expect(states.at(-1)).toMatchObject({ kind: 'ready', applicationId });
    await controller.createRole({ name: 'New deliberate attempt' });
    expect(createRole).toHaveBeenCalledTimes(2);
  });

  it('reports whether role mappings were freshly loaded for the requested role', async () => {
    const firstRole = role(alphaRoleId, 'Alpha operator', 'alpha-operator');
    const secondRole = role(zuluRoleId, 'Zulu operator', 'zulu-operator');
    const listRolePermissions = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'success', value: [] })
      .mockResolvedValueOnce({ kind: 'failure', failure: 'unavailable' });
    const controller = createAdminApplicationRbacController({
      readContext: () => ({ applicationId, sessionEpoch: 1 }),
      readOperations: () => ({
        listRoles: vi.fn().mockResolvedValue({
          kind: 'success',
          value: [firstRole, secondRole],
        }),
        listPermissions: vi.fn().mockResolvedValue({ kind: 'success', value: [] }),
        listRolePermissions,
      }),
      publishState: vi.fn(),
      requestAuthentication: vi.fn(),
    });

    await controller.load();
    await expect(controller.loadRolePermissions(firstRole.id)).resolves.toBe(true);
    await expect(controller.loadRolePermissions(secondRole.id)).resolves.toBe(false);
  });
});

describe('RBAC response validation', () => {
  it('rejects a duplicate remote role collection without retaining partial data', async () => {
    const duplicate = role(alphaRoleId, 'Alpha operator', 'alpha-operator');
    const operations = createAdminRbacOperations(() => ({
      roles: {
        list: vi.fn().mockResolvedValue([duplicate, duplicate]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        listPermissions: vi.fn(),
        assignPermissions: vi.fn(),
        removePermissions: vi.fn(),
      },
      permissions: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
      userRoles: { list: vi.fn(), assign: vi.fn(), remove: vi.fn() },
    }));

    await expect(operations.listRoles(applicationId)).resolves.toEqual({
      kind: 'failure',
      failure: 'invalid-response',
    });
  });

  it('treats an AbortError raised after mutation dispatch as an unknown outcome', async () => {
    const operations = createAdminRbacOperations(() => ({
      roles: {
        list: vi.fn(),
        create: vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')),
        update: vi.fn(),
        delete: vi.fn(),
        listPermissions: vi.fn(),
        assignPermissions: vi.fn(),
        removePermissions: vi.fn(),
      },
      permissions: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
      userRoles: { list: vi.fn(), assign: vi.fn(), remove: vi.fn() },
    }));

    await expect(operations.createRole(applicationId, { name: 'Operator' })).resolves.toEqual({
      kind: 'outcome-unknown',
    });
  });
});

describe('Application RBAC production focus', () => {
  it('focuses the replacement grid when the active RBAC tab receives state', async () => {
    const detail: AdminApplicationViewState = {
      kind: 'detail',
      scope: 'global',
      applications: [application],
      application,
      etag: null,
      modules: [],
    };
    const workspace = createAdminApplicationWorkspace({
      capabilities,
      onIntent: vi.fn(),
      onRbacIntent: vi.fn(),
      focusView: (view) => host.loop.focusView(view),
    });
    const host = createApplication({
      content: workspace.content,
      viewport: { width: 100, height: 24 },
    });
    workspace.setState(detail);
    const tabs = descendants(workspace.content).find((view) => view instanceof TabView);
    if (!(tabs instanceof TabView)) throw new Error('Application tabs missing.');
    tabs.select(2);

    workspace.setRbacState({
      kind: 'ready',
      applicationId,
      roles: [role(alphaRoleId, 'Alpha operator', 'alpha-operator')],
      permissions: [],
    });
    await settle();

    const grid = descendants(tabs.tabs.peek()[2]?.content ?? workspace.content).find(
      (view) => view instanceof DataGrid,
    );
    if (!(grid instanceof DataGrid)) throw new Error('Role grid missing.');
    expect(host.loop.getFocused()).toBe(grid.rows);
  });
});

describe('Application RBAC mapping ownership', () => {
  it('closes role permission management after saving and reloading authoritative state', async () => {
    const selectedRole = role(alphaRoleId, 'Alpha operator', 'alpha-operator');
    const selectedPermission = permission(
      alphaPermissionId,
      'Read invoices',
      'billing:invoice:read',
    );
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    let assigned = false;
    const listRolePermissions = vi.fn(async () => ({
      kind: 'success' as const,
      value: assigned ? [selectedPermission] : [],
    }));
    const assignPermissions = vi.fn(async () => {
      assigned = true;
      return { kind: 'success' as const };
    });
    const runDialog = vi.fn().mockResolvedValueOnce({
      kind: 'update-role-permissions',
      roleId: selectedRole.id,
      assignPermissionIds: [selectedPermission.id],
      removePermissionIds: [],
    });
    const features = createAdminApplicationRbacFeatures({
      dialogs: {
        host,
        removeAll: vi.fn(),
        setModalCommandHandler: vi.fn(),
      },
      readSelection: () => ({ application, modules: [] }),
      readSession: () => ({
        rbac: {
          listRoles: vi.fn().mockResolvedValue({ kind: 'success', value: [selectedRole] }),
          listPermissions: vi.fn().mockResolvedValue({
            kind: 'success',
            value: [selectedPermission],
          }),
          listRolePermissions,
          assignPermissions,
        },
      }),
      readSessionEpoch: () => 1,
      readCapabilities: () => capabilities,
      runDialog,
      publishState: vi.fn(),
      requestAuthentication: vi.fn(),
    });
    features.syncApplication();
    await settle();

    features.handleIntent({ kind: 'manage-role-permissions', roleId: selectedRole.id });
    await vi.waitFor(() => expect(listRolePermissions).toHaveBeenCalledTimes(2));

    expect(runDialog).toHaveBeenCalledOnce();
    expect(assignPermissions).toHaveBeenCalledWith(
      applicationId,
      selectedRole.id,
      [selectedPermission.id],
      expect.any(AbortSignal),
    );
    expect(listRolePermissions).toHaveBeenCalledTimes(2);
  });

  it('does not open a role dialog after a different role mapping load fails', async () => {
    const firstRole = role(alphaRoleId, 'Alpha operator', 'alpha-operator');
    const secondRole = role(zuluRoleId, 'Zulu operator', 'zulu-operator');
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const runDialog = vi.fn(async () => undefined);
    const listRolePermissions = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'success', value: [] })
      .mockResolvedValueOnce({ kind: 'failure', failure: 'unavailable' });
    const features = createAdminApplicationRbacFeatures({
      dialogs: {
        host,
        removeAll: vi.fn(),
        setModalCommandHandler: vi.fn(),
      },
      readSelection: () => ({ application, modules: [] }),
      readSession: () => ({
        rbac: {
          listRoles: vi.fn().mockResolvedValue({
            kind: 'success',
            value: [firstRole, secondRole],
          }),
          listPermissions: vi.fn().mockResolvedValue({ kind: 'success', value: [] }),
          listRolePermissions,
        },
      }),
      readSessionEpoch: () => 1,
      readCapabilities: () => capabilities,
      runDialog,
      publishState: vi.fn(),
      requestAuthentication: vi.fn(),
    });
    features.syncApplication();
    await settle();

    features.handleIntent({ kind: 'manage-role-permissions', roleId: firstRole.id });
    await settle();
    expect(runDialog).toHaveBeenCalledOnce();

    features.handleIntent({ kind: 'manage-role-permissions', roleId: secondRole.id });
    await settle();
    expect(runDialog).toHaveBeenCalledOnce();
  });
});

describe('Application RBAC compact dialogs', () => {
  it('keeps every public dialog action reachable at 48x12', async () => {
    const selectedRole = role(alphaRoleId, 'Alpha operator', 'alpha-operator');
    const selectedPermission = permission(alphaPermissionId, 'Alpha permission', 'alpha:item:read');
    const cases: Array<{
      readonly safeAction: string;
      readonly entityForm: boolean;
      readonly open: (host: ReturnType<typeof createApplication>) => Promise<unknown>;
    }> = [
      {
        safeAction: 'Cancel',
        entityForm: true,
        open: (host) => showCreateRoleDialog(host, new AbortController().signal, application),
      },
      {
        safeAction: 'Cancel',
        entityForm: true,
        open: (host) =>
          showEditRoleDialog(host, new AbortController().signal, application, selectedRole),
      },
      {
        safeAction: 'Keep',
        entityForm: false,
        open: (host) =>
          showDeleteRoleDialog(host, new AbortController().signal, application, selectedRole),
      },
      {
        safeAction: 'Cancel',
        entityForm: true,
        open: (host) =>
          showCreatePermissionDialog(host, new AbortController().signal, application, []),
      },
      {
        safeAction: 'Cancel',
        entityForm: true,
        open: (host) =>
          showEditPermissionDialog(
            host,
            new AbortController().signal,
            application,
            selectedPermission,
            [],
          ),
      },
      {
        safeAction: 'Keep',
        entityForm: false,
        open: (host) =>
          showDeletePermissionDialog(
            host,
            new AbortController().signal,
            application,
            selectedPermission,
          ),
      },
      {
        safeAction: 'Cancel',
        entityForm: false,
        open: (host) =>
          showManageRolePermissionsDialog(
            host,
            new AbortController().signal,
            application,
            selectedRole,
            [selectedPermission],
            [],
            true,
          ),
      },
    ];

    for (const example of cases) {
      const host = createApplication({ viewport: { width: 48, height: 12 } });
      const pending = example.open(host);
      await settle();
      const dialog = host.desktop.activeWindow();
      if (!(dialog instanceof Dialog)) throw new Error('RBAC dialog missing.');
      expect(frameText(host)).toContain(example.safeAction);
      expect(
        descendants(dialog)
          .filter((view) => view instanceof Button)
          .every((action) => action.bounds.height > 0),
      ).toBe(true);
      if (example.entityForm) {
        expect(
          descendants(dialog)
            .filter((view) => view instanceof Input)
            .every((input) => input.bounds.height > 0),
        ).toBe(true);
        expect(
          descendants(dialog)
            .filter((view) => view instanceof Memo)
            .every((memo) => memo.bounds.height > 0),
        ).toBe(true);
      }
      host.loop.endModal('cancel');
      await pending;
    }
  });
});
