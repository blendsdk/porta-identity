/** Implementation coverage for Application-owned RBAC rendering and operation ownership. */

import { Button, col, createApplication, DataGrid, Group, grow, View } from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import { createAdminApplicationRbacController } from '../../src/admin/application-rbac-controller.js';
import { createAdminApplicationRbacWorkspace } from '../../src/admin/application-rbac-workspace.js';
import type { AdminApplication } from '../../src/admin/application-state.js';
import { createAdminRbacOperations } from '../../src/admin/rbac-service.js';
import type { AdminApplicationRbacViewState, AdminRole } from '../../src/admin/rbac-state.js';
import type { AdminCapabilities } from '../../src/admin/state.js';

const applicationId = '11111111-1111-4111-8111-111111111111';
const alphaRoleId = '22222222-2222-4222-8222-222222222222';
const zuluRoleId = '33333333-3333-4333-8333-333333333333';

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
    root.add(col({}, grow(workspace.roles)));
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
    root.add(col({}, grow(workspace.roles), grow(workspace.permissions)));
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
});
