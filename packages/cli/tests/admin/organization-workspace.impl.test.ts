/** Implementation diagnostics for organization workspace bindings and controller ownership. */

import { createApplication, Group, Input, TabView, View } from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import {
  createAdminOrganizationController,
  MANAGE_ORGANIZATION_COMMAND,
} from '../../src/admin/organization-controller.js';
import type {
  AdminOrganizationWorkspace,
  AdminOrganizationWorkspaceOptions,
} from '../../src/admin/organization-controller.js';
import type { AdminOrganizationWorkspaceOperations } from '../../src/admin/organization-service.js';
import { createAdminOrganizationWorkspace } from '../../src/admin/organization-workspace.js';
import { createAdminPresentation } from '../../src/admin/presentation.js';
import type {
  AdminCapabilities,
  AdminConnectionState,
  AdminOrganizationSettings,
  AdminOrganizationWorkspaceState,
} from '../../src/admin/state.js';

const organization: AdminOrganizationSettings = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Example Organization',
  slug: 'example-organization',
  status: 'active',
  isSuperAdmin: false,
  defaultLocale: 'en',
  defaultLoginMethods: ['password'],
  twoFactorPolicy: 'optional',
  brandingCompanyName: 'Example Company',
  brandingPrimaryColor: '#336699',
  brandingLogoUrl: null,
  brandingFaviconUrl: null,
  createdAt: '2026-01-02T03:04:00.000Z',
  updatedAt: '2026-08-09T10:11:00.000Z',
};

const capabilities: AdminCapabilities = {
  canReadOrganizations: true,
  canCreateOrganizations: false,
  canUpdateOrganizations: true,
  canSuspendOrganizations: true,
  canDeleteOrganizations: false,
  canReadUsers: false,
  canCreateUsers: false,
  canInviteUsers: false,
  canUpdateUsers: false,
  canManageUserLifecycle: false,
  canDeleteUsers: false,
  canReadApplications: false,
  canCreateApplications: false,
  canUpdateApplications: false,
  canDeleteApplications: false,
  canDeleteModules: false,
  canReadRoles: false,
  canCreateRoles: false,
  canUpdateRoles: false,
  canDeleteRoles: false,
  canReadPermissions: false,
  canCreatePermissions: false,
  canUpdatePermissions: false,
  canDeletePermissions: false,
  canAssignRoles: false,
  canReadClients: false,
  canCreateClients: false,
  canUpdateClients: false,
  canDeleteClients: false,
  canRevokeClientSecrets: false,
};

/** Returns one authenticated selected-organization state. */
function authenticated(): Extract<AdminConnectionState, { readonly kind: 'authenticated' }> {
  return {
    kind: 'authenticated',
    server: new URL('https://porta.example.test'),
    identity: { sub: 'administrator' },
    organization,
    capabilities,
  };
}

/** Collects every view beneath one retained Group tree. */
function descendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(root);
  return result;
}

/** Allows controller continuations and reactive rendering to settle. */
async function settle(rounds = 6): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

/** Creates a promise controlled explicitly by an implementation test. */
function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    complete = resolve;
  });
  return {
    promise,
    resolve(value) {
      if (!complete) throw new Error('Deferred promise is unavailable.');
      complete(value);
    },
  };
}

/** Creates independent operation spies so one call cannot satisfy another operation's assertion. */
function operations(
  overrides: Partial<AdminOrganizationWorkspaceOperations> = {},
): AdminOrganizationWorkspaceOperations {
  return {
    get: vi.fn().mockResolvedValue({ kind: 'success', value: organization }),
    update: vi.fn().mockResolvedValue({ kind: 'success' }),
    activate: vi.fn().mockResolvedValue({ kind: 'success' }),
    suspend: vi.fn().mockResolvedValue({ kind: 'success' }),
    getLoginMethods: vi.fn().mockResolvedValue({ kind: 'success', value: ['password'] }),
    updateLoginMethods: vi.fn().mockResolvedValue({ kind: 'success' }),
    getTwoFactorPolicy: vi.fn().mockResolvedValue({ kind: 'success', value: 'optional' }),
    updateTwoFactorPolicy: vi.fn().mockResolvedValue({ kind: 'success' }),
    getBranding: vi.fn().mockResolvedValue({
      kind: 'success',
      value: { companyName: null, primaryColor: null, logoUrl: null, faviconUrl: null },
    }),
    updateBranding: vi.fn().mockResolvedValue({ kind: 'success' }),
    listAssets: vi.fn().mockResolvedValue({ kind: 'success', value: [] }),
    uploadAsset: vi.fn().mockResolvedValue({ kind: 'success' }),
    deleteAsset: vi.fn().mockResolvedValue({ kind: 'success' }),
    ...overrides,
  };
}

/** Builds a controller with observable workspace and mount boundaries. */
function controllerHarness(
  operationOverrides: Partial<AdminOrganizationWorkspaceOperations> = {},
  controllerOverrides: {
    readonly openFile?: () => Promise<string | null | undefined>;
    readonly readFile?: (path: string) => Promise<Uint8Array>;
  } = {},
) {
  const host = createApplication({ viewport: { width: 80, height: 24 } });
  const currentOperations = operations(operationOverrides);
  const states: AdminOrganizationWorkspaceState[] = [];
  const mountWorkspace = vi.fn<(content: View | null) => void>();
  const workspace: AdminOrganizationWorkspace = {
    content: new Group(),
    setState: vi.fn((state: AdminOrganizationWorkspaceState) => states.push(state)),
    focusCurrent: vi.fn(),
    clear: vi.fn(),
  };
  let workspaceOptions: AdminOrganizationWorkspaceOptions | undefined;
  const controller = createAdminOrganizationController({
    host,
    readState: authenticated,
    readOperations: () => currentOperations,
    mountWorkspace,
    requestAuthentication: vi.fn(),
    workspaceFactory: (options) => {
      workspaceOptions = options;
      return workspace;
    },
    ...controllerOverrides,
  });
  controller.syncContext(authenticated(), 1);
  controller.handleCommand(MANAGE_ORGANIZATION_COMMAND);
  return { controller, currentOperations, mountWorkspace, states, workspace, workspaceOptions: () => workspaceOptions };
}

describe('organization workspace implementation', () => {
  it('retains the selected tab and focuses its first editable field after replacement', async () => {
    const presentation = createAdminPresentation(authenticated(), false, { width: 80, height: 24 });
    const host = createApplication({
      content: presentation.content,
      menuBar: presentation.menu,
      statusLine: presentation.status,
      viewport: { width: 80, height: 24 },
    });
    const workspace = createAdminOrganizationWorkspace({
      capabilities,
      onIntent: vi.fn(),
      focusView: (view) => host.loop.focusView(view),
    });
    presentation.setWorkspace(workspace.content);
    workspace.setState({ kind: 'ready', organization, assets: [] });
    await settle();
    let tabs = descendants(workspace.content).find((view) => view instanceof TabView);
    if (!(tabs instanceof TabView)) throw new Error('Organization tabs missing.');
    tabs.select(2);

    workspace.setState({
      kind: 'ready',
      organization: { ...organization, brandingCompanyName: 'Changed Company' },
      assets: [],
    });
    await settle();
    tabs = descendants(workspace.content).find((view) => view instanceof TabView);
    if (!(tabs instanceof TabView)) throw new Error('Rebuilt organization tabs missing.');
    const brandingPage = tabs.tabs.peek()[2]?.content;
    if (!brandingPage) throw new Error('Branding page missing.');
    const companyName = descendants(brandingPage).find((view) => view instanceof Input);
    if (!(companyName instanceof Input)) throw new Error('Company name input missing.');

    workspace.focusCurrent();

    expect(tabs.active.peek()).toBe(2);
    expect(host.loop.getFocused()).toBe(companyName);
  });

  it('clears retained controls and reports a direct dialog close once', async () => {
    const onClose = vi.fn();
    const workspace = createAdminOrganizationWorkspace({ capabilities, onIntent: vi.fn(), onClose });
    workspace.setState({ kind: 'ready', organization, assets: [] });
    expect(descendants(workspace.content).some((view) => view instanceof TabView)).toBe(true);

    workspace.clear();
    expect(descendants(workspace.content).some((view) => view instanceof TabView)).toBe(false);
    workspace.content.close();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('organization controller implementation', () => {
  it('binds workspace intents and blocks a same-tab double submission', async () => {
    const pending = deferred<{ readonly kind: 'success' }>();
    const update = vi.fn(() => pending.promise);
    const mounted = controllerHarness({ update });
    await settle(12);

    mounted.workspaceOptions()?.onIntent({ kind: 'save-overview', input: { name: 'Renamed' } });
    mounted.workspaceOptions()?.onIntent({ kind: 'save-overview', input: { name: 'Renamed twice' } });
    await settle();

    expect(update).toHaveBeenCalledOnce();
    pending.resolve({ kind: 'success' });
    await settle(12);
    expect(update).toHaveBeenCalledOnce();
  });

  it('keeps a local file-read failure out of upload operations and rendered state', async () => {
    const selectedPath = '/private/operator/company-logo.png';
    const readFile = vi.fn().mockRejectedValue(new Error('local path is unreadable'));
    const mounted = controllerHarness(
      {},
      { openFile: vi.fn().mockResolvedValue(selectedPath), readFile },
    );
    await settle(12);

    mounted.controller.handleIntent({ kind: 'upload-asset', assetType: 'logo' });
    await settle(12);

    expect(readFile).toHaveBeenCalledWith(selectedPath);
    expect(mounted.currentOperations.uploadAsset).not.toHaveBeenCalled();
    expect(mounted.states.at(-1)).toEqual(expect.objectContaining({ failure: 'file-read' }));
    expect(JSON.stringify(mounted.states)).not.toContain(selectedPath);
    expect(JSON.stringify(mounted.states)).not.toContain('local path is unreadable');
  });

  it('discards a late initial read after disposal and removes controller ownership', async () => {
    const pending = deferred<{ readonly kind: 'success'; readonly value: AdminOrganizationSettings }>();
    const get = vi.fn(() => pending.promise);
    const mounted = controllerHarness({ get });
    await settle();

    mounted.controller.dispose();
    mounted.controller.dispose();
    pending.resolve({ kind: 'success', value: organization });
    await settle(12);

    expect(mounted.workspace.clear).toHaveBeenCalledOnce();
    expect(mounted.mountWorkspace).toHaveBeenCalledTimes(1);
    expect(mounted.mountWorkspace).toHaveBeenLastCalledWith(null);
    expect(mounted.states).toHaveLength(0);
    expect(mounted.currentOperations.listAssets).not.toHaveBeenCalled();
    expect(mounted.controller.isOpen()).toBe(false);
  });
});
