/** Implementation coverage for User Roles ownership, focus, selection, and disposal. */

import { Button, createApplication, DataGrid, Dialog, Group, View } from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import type { AdminApplication } from '../../src/admin/application-state.js';
import {
  createAdminUserRoleController,
  openAdminUserRoleWorkflow,
} from '../../src/admin/user-role-controller.js';
import { createAdminUserRoleDialog } from '../../src/admin/user-role-dialog.js';
import type { AdminRbacOperations } from '../../src/admin/rbac-service.js';
import type { AdminRole } from '../../src/admin/rbac-state.js';
import type { AdminCapabilities, AdminConnectionState } from '../../src/admin/state.js';
import type { AdminUserSelection } from '../../src/admin/user-state.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const applicationId = '33333333-3333-4333-8333-333333333333';

const application: AdminApplication = {
  id: applicationId,
  name: 'Customer Portal',
  slug: 'customer-portal',
  description: null,
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
};

const roles: readonly AdminRole[] = [
  {
    id: '44444444-4444-4444-8444-444444444444',
    applicationId,
    name: 'Viewer',
    slug: 'viewer',
    description: null,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    applicationId,
    name: 'Administrator',
    slug: 'administrator',
    description: null,
    createdAt: '2026-01-03T00:00:00Z',
    updatedAt: '2026-01-03T00:00:00Z',
  },
];

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
  canReadRoles: true,
  canCreateRoles: false,
  canUpdateRoles: false,
  canDeleteRoles: false,
  canReadPermissions: false,
  canCreatePermissions: false,
  canUpdatePermissions: false,
  canDeletePermissions: false,
  canAssignRoles: true,
  canReadClients: false,
  canCreateClients: false,
  canUpdateClients: false,
  canDeleteClients: false,
  canRevokeClientSecrets: false,
};

const selection: AdminUserSelection = {
  page: {
    data: [],
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
  },
  selected: {
    id: userId,
    organizationId,
    email: 'alice@example.test',
    givenName: 'Alice',
    familyName: 'Admin',
    status: 'active',
  },
  detail: {
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
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  etag: null,
};

/** Collects mounted descendants for direct widget-state checks. */
function descendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(root);
  return result;
}

/** Finds one mounted action by its visible label. */
function button(root: View, label: string): Button {
  const result = descendants(root).find(
    (view) => view instanceof Button && view.activation.label === label,
  );
  if (!(result instanceof Button)) throw new Error(`${label} button missing.`);
  return result;
}

/** Activates a button through the application's normal keyboard route. */
function activate(host: ReturnType<typeof createApplication>, target: Button): void {
  host.loop.focusView(target);
  host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
}

/** Lets asynchronous controller continuations and reactive effects settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('User Roles dialog internals', () => {
  it('clears positional selection after sorting and restores focus after repaint', async () => {
    const focusView = vi.fn();
    const owner = createAdminUserRoleDialog({
      organization: { id: organizationId, name: 'Example Organization' },
      user: { id: userId, label: 'Alice' },
      capabilities,
      viewport: { width: 80, height: 24 },
      focusView,
      onIntent: vi.fn(),
    });
    owner.setState({
      kind: 'ready',
      organizationId,
      userId,
      assignedRoles: roles,
      applications: [application],
      availableRoles: [],
    });
    owner.focusCurrent();
    const grid = descendants(owner.content).find((view) => view instanceof DataGrid);
    if (!(grid instanceof DataGrid)) throw new Error('Assigned-role grid missing.');
    expect(focusView).toHaveBeenLastCalledWith(grid.rows);
    grid.selected.set(0);
    grid.sortBy(0, 'desc');
    await settle();
    expect(grid.selected()).toBe(-1);
  });

  it('ignores later publication after the dialog owner is disposed', () => {
    const owner = createAdminUserRoleDialog({
      organization: { id: organizationId, name: 'Example Organization' },
      user: { id: userId, label: 'Alice' },
      capabilities,
      viewport: { width: 80, height: 24 },
      onIntent: vi.fn(),
    });
    owner.dispose();
    owner.setState({
      kind: 'ready',
      organizationId,
      userId,
      assignedRoles: roles,
      applications: [application],
      availableRoles: [],
    });
    expect(owner.content.children).toHaveLength(0);
  });
});

describe('User Roles controller ownership', () => {
  it('publishes reconciliation and ignores a mutation result after cancellation', async () => {
    let resolveMutation: ((value: { readonly kind: 'success' }) => void) | undefined;
    const states: unknown[] = [];
    const recovery = vi.fn();
    const assignUserRoles = vi.fn<AdminRbacOperations['assignUserRoles']>(
      () => new Promise((resolve) => (resolveMutation = resolve)),
    );
    const controller = createAdminUserRoleController({
      readContext: () => ({ organizationId, userId, sessionEpoch: 1 }),
      readOperations: () => ({
        listUserRoles: vi.fn(),
        listRoles: vi.fn(),
        assignUserRoles,
        removeUserRoles: vi.fn(),
      }),
      listApplications: vi.fn(),
      publishState: (state) => states.push(state),
      requestAuthentication: vi.fn(),
      setRecoveryRequired: recovery,
    });
    const mutation = controller.assignRole(roles[0]!.id);
    await settle();
    controller.cancelActiveOperation();
    resolveMutation?.({ kind: 'success' });
    await mutation;
    expect(recovery).toHaveBeenLastCalledWith(true);
    expect(states.at(-1)).toMatchObject({ kind: 'indeterminate' });
  });

  it('publishes closed and ignores a late read after disposal', async () => {
    let resolveRead:
      | ((value: { readonly kind: 'success'; readonly value: readonly AdminRole[] }) => void)
      | undefined;
    const states: unknown[] = [];
    const controller = createAdminUserRoleController({
      readContext: () => ({ organizationId, userId, sessionEpoch: 1 }),
      readOperations: () => ({
        listUserRoles: vi.fn(() => new Promise((resolve) => (resolveRead = resolve))),
        listRoles: vi.fn(),
        assignUserRoles: vi.fn(),
        removeUserRoles: vi.fn(),
      }),
      listApplications: vi.fn(),
      publishState: (state) => states.push(state),
      requestAuthentication: vi.fn(),
    });
    const read = controller.load();
    controller.dispose();
    resolveRead?.({ kind: 'success', value: roles });
    await read;
    expect(states).toEqual([{ kind: 'closed' }]);
  });
});

describe('User Roles modal lifecycle', () => {
  it('removes the owned modal before requesting authentication', async () => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const focusView = vi.spyOn(host.loop, 'focusView');
    const requestAuthentication = vi.fn();
    const state: AdminConnectionState = {
      kind: 'authenticated',
      server: new URL('https://porta.example.test'),
      identity: { sub: userId },
      capabilities,
      organization: {
        id: organizationId,
        name: 'Example Organization',
        slug: 'example',
        status: 'active',
      },
    };
    openAdminUserRoleWorkflow({
      host,
      readState: () => state,
      readSelection: () => selection,
      readSessionEpoch: () => 1,
      readOperations: () => ({
        listUserRoles: vi.fn(async () => ({ kind: 'success', value: [roles[0]!] })),
        listRoles: vi.fn(),
        assignUserRoles: vi.fn(),
        removeUserRoles: vi.fn(async () => ({
          kind: 'success',
          reauthenticationRequired: true,
        })),
      }),
      readApplicationOperations: () => ({
        listAll: vi.fn(async () => ({ kind: 'success', value: [application] })),
      }),
      requestAuthentication,
      onClosed: vi.fn(),
    });
    await settle();
    const dialog = host.desktop.activeWindow();
    if (!(dialog instanceof Dialog)) throw new Error('User Roles dialog missing.');
    const grid = descendants(dialog).find((view) => view instanceof DataGrid);
    if (!(grid instanceof DataGrid)) throw new Error('Assigned-role grid missing.');
    expect(focusView).toHaveBeenCalledWith(grid.rows);
    grid.selected.set(0);
    activate(host, button(dialog, 'Remove'));
    activate(host, button(dialog, `Remove ${roles[0]!.name}`));
    await settle();
    expect(requestAuthentication).toHaveBeenCalledOnce();
    expect(host.desktop.activeWindow()).toBeNull();
  });
});
