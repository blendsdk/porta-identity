/** Implementation diagnostics for organization workspace bindings and controller ownership. */

import { Button, ComboBox, createApplication, Dialog, Group, Input, TabView, View } from '@jsvision/ui';
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

/** Activates a button through the same keyboard route used by the application. */
function activate(host: ReturnType<typeof createApplication>, action: Button): void {
  host.loop.focusView(action);
  host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
}

/** Returns a dialog action by its decoded visible label. */
function dialogButton(dialog: Dialog, label: string): Button {
  const action = descendants(dialog).find(
    (view) => view instanceof Button && view.activation.label === label,
  );
  if (!(action instanceof Button)) throw new Error(`${label} action missing.`);
  return action;
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
  let state = authenticated();
  const controller = createAdminOrganizationController({
    host,
    readState: () => state,
    readOperations: () => currentOperations,
    mountWorkspace,
    requestAuthentication: vi.fn(),
    workspaceFactory: (options) => {
      workspaceOptions = options;
      return workspace;
    },
    ...controllerOverrides,
  });
  controller.syncContext(state, 1);
  controller.handleCommand(MANAGE_ORGANIZATION_COMMAND);
  return {
    controller,
    currentOperations,
    host,
    mountWorkspace,
    setState(next: Extract<AdminConnectionState, { readonly kind: 'authenticated' }>) {
      state = next;
    },
    states,
    workspace,
    workspaceOptions: () => workspaceOptions,
  };
}

describe('organization workspace implementation', () => {
  it('restores landing focus without targeting Desktop when the workspace closes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const presentation = createAdminPresentation(authenticated(), false, { width: 80, height: 24 });
    const host = createApplication({
      content: presentation.content,
      menuBar: presentation.menu,
      statusLine: presentation.status,
      viewport: { width: 80, height: 24 },
    });
    const workspace = createAdminOrganizationWorkspace({ capabilities, onIntent: vi.fn() });
    presentation.setWorkspace(workspace.content);

    presentation.setWorkspace(null);

    expect(host.loop.getFocused()?.focusable).toBe(true);
    expect(
      warn.mock.calls.filter(([message]) => String(message).includes('focusView(Desktop)')),
    ).toEqual([]);
    warn.mockRestore();
  });

  it.each([
    [80, 24],
    [49, 19],
  ])('navigates every organization tab without a JSVision layout warning at %ix%i', async (width, height) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const presentation = createAdminPresentation(authenticated(), false, { width, height });
    const host = createApplication({
      content: presentation.content,
      menuBar: presentation.menu,
      statusLine: presentation.status,
      viewport: { width, height },
    });
    const workspace = createAdminOrganizationWorkspace({ capabilities, onIntent: vi.fn() });
    presentation.setWorkspace(workspace.content);
    workspace.setState({ kind: 'ready', organization, assets: [] });
    const tabs = descendants(workspace.content).find((view) => view instanceof TabView);
    if (!(tabs instanceof TabView)) throw new Error('Organization tabs missing.');

    const locale = descendants(tabs.tabs.peek()[0]!.content).find(
      (view) => view instanceof ComboBox,
    );
    if (!(locale instanceof ComboBox)) throw new Error('Organization locale selector missing.');
    host.loop.focusView(locale.input);
    host.loop.dispatch({ type: 'key', key: 'down', ctrl: false, alt: true, shift: false });
    await settle();
    host.loop.dispatch({ type: 'key', key: 'escape', ctrl: false, alt: false, shift: false });
    await settle();

    tabs.select(1);
    await settle();
    tabs.select(2);
    await settle();
    tabs.select(0);
    await settle();

    expect(
      warn.mock.calls.filter(([message]) => String(message).startsWith('[jsvision/ui layout]')),
    ).toEqual([]);
    warn.mockRestore();
  });

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

  it('restores focus to the asset action that opened the picker', async () => {
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
    const tabs = descendants(workspace.content).find((view) => view instanceof TabView);
    if (!(tabs instanceof TabView)) throw new Error('Organization tabs missing.');
    tabs.select(2);
    const branding = tabs.tabs.peek()[2]?.content;
    const add = branding && descendants(branding).find(
      (view) => view instanceof Button && view.activation.label === 'Add',
    );
    if (!(add instanceof Button)) throw new Error('Add asset action missing.');
    activate(host, add);

    workspace.focusCurrent();

    expect(host.loop.getFocused()).toBe(add);
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

  it('discards a file picker continuation after the selected organization changes', async () => {
    const picker = deferred<string | null | undefined>();
    const readFile = vi.fn().mockResolvedValue(Uint8Array.from([1]));
    const mounted = controllerHarness({}, { openFile: () => picker.promise, readFile });
    await settle(12);

    mounted.controller.handleIntent({ kind: 'upload-asset', assetType: 'logo' });
    const next = {
      ...authenticated(),
      organization: { ...organization, id: '22222222-2222-4222-8222-222222222222' },
    };
    mounted.setState(next);
    mounted.controller.syncContext(next, 2);
    picker.resolve('/tmp/logo.png');
    await settle(12);

    expect(readFile).not.toHaveBeenCalled();
    expect(mounted.currentOperations.uploadAsset).not.toHaveBeenCalled();
  });

  it.each([
    ['remove asset', { kind: 'remove-asset', assetType: 'logo' } as const, 'Remove', 'deleteAsset'],
    ['suspend', { kind: 'suspend' } as const, 'Suspend', 'suspend'],
  ])('discards a confirmed %s continuation after the organization changes', async (
    _case,
    intent,
    actionLabel,
    operation,
  ) => {
    const mounted = controllerHarness();
    await settle(12);
    mounted.controller.handleIntent(intent);
    await settle();
    const dialog = mounted.host.desktop.activeWindow();
    if (!(dialog instanceof Dialog)) throw new Error('Confirmation dialog missing.');
    const next = {
      ...authenticated(),
      organization: { ...organization, id: '22222222-2222-4222-8222-222222222222' },
    };
    mounted.setState(next);
    mounted.controller.syncContext(next, 2);

    activate(mounted.host, dialogButton(dialog, actionLabel));
    await settle(12);

    expect(mounted.currentOperations[operation as 'deleteAsset' | 'suspend']).not.toHaveBeenCalled();
  });

  it('guards update intents with the latest verified capability state', async () => {
    const mounted = controllerHarness();
    await settle(12);
    mounted.setState({
      ...authenticated(),
      capabilities: { ...capabilities, canUpdateOrganizations: false },
    });

    mounted.controller.handleIntent({ kind: 'save-overview', input: { name: 'Denied' } });
    await settle();

    expect(mounted.currentOperations.update).not.toHaveBeenCalled();
  });

  it('allows lifecycle mutation with suspend permission when update permission is absent', async () => {
    const mounted = controllerHarness();
    await settle(12);
    mounted.setState({
      ...authenticated(),
      capabilities: {
        ...capabilities,
        canUpdateOrganizations: false,
        canSuspendOrganizations: true,
      },
    });

    mounted.controller.handleIntent({ kind: 'suspend' });
    await settle();
    const dialog = mounted.host.desktop.activeWindow();
    if (!(dialog instanceof Dialog)) throw new Error('Suspend confirmation missing.');
    activate(mounted.host, dialogButton(dialog, 'Suspend'));
    await settle(12);

    expect(mounted.currentOperations.suspend).toHaveBeenCalledOnce();
  });

  it('rejects an intent queued by a workspace after its opening context closes', async () => {
    const mounted = controllerHarness();
    await settle(12);
    const staleIntent = mounted.workspaceOptions()?.onIntent;
    if (!staleIntent) throw new Error('Workspace intent binding missing.');
    const next = {
      ...authenticated(),
      organization: { ...organization, id: '22222222-2222-4222-8222-222222222222' },
    };
    mounted.setState(next);
    mounted.controller.syncContext(next, 2);
    mounted.controller.handleCommand(MANAGE_ORGANIZATION_COMMAND);
    await settle(12);

    staleIntent({ kind: 'save-overview', input: { name: 'Stale value' } });
    await settle();

    expect(mounted.currentOperations.update).not.toHaveBeenCalled();
  });

  it('stops a two-part authentication save when organization ownership changes', async () => {
    const firstWrite = deferred<{ readonly kind: 'success' }>();
    const updateLoginMethods = vi.fn(() => firstWrite.promise);
    const mounted = controllerHarness({ updateLoginMethods });
    await settle(12);

    mounted.controller.handleIntent({
      kind: 'save-authentication',
      loginMethods: ['magic_link'],
      twoFactorPolicy: 'required_email',
    });
    await settle();
    const next = {
      ...authenticated(),
      organization: { ...organization, id: '22222222-2222-4222-8222-222222222222' },
    };
    mounted.setState(next);
    mounted.controller.syncContext(next, 2);
    firstWrite.resolve({ kind: 'success' });
    await settle(12);

    expect(updateLoginMethods).toHaveBeenCalledOnce();
    expect(mounted.currentOperations.updateTwoFactorPolicy).not.toHaveBeenCalled();
  });

  it('keeps the prior projection when the authoritative overview reload fails', async () => {
    const get = vi.fn().mockResolvedValueOnce({ kind: 'success', value: organization });
    const mounted = controllerHarness({ get });
    await settle(12);
    get.mockResolvedValue({ kind: 'failure', failure: 'unavailable' });

    mounted.controller.handleIntent({ kind: 'save-overview', input: { name: 'Renamed' } });
    await settle(12);

    expect(mounted.states.at(-1)).toEqual(expect.objectContaining({
      kind: 'ready',
      organization,
      feedbackTab: 'overview',
      failure: 'unavailable',
    }));
    expect(mounted.states.at(-1)).not.toEqual(expect.objectContaining({ savedTab: 'overview' }));
  });

  it('reports authentication and asset reload failures on their owning tabs', async () => {
    const getLoginMethods = vi.fn().mockResolvedValue({ kind: 'failure', failure: 'unavailable' });
    const listAssets = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'success', value: [] })
      .mockResolvedValue({ kind: 'failure', failure: 'invalid-response' });
    const mounted = controllerHarness(
      { getLoginMethods, listAssets },
      {
        openFile: vi.fn().mockResolvedValue('/tmp/logo.png'),
        readFile: vi.fn().mockResolvedValue(Uint8Array.from([1])),
      },
    );
    await settle(12);

    mounted.controller.handleIntent({
      kind: 'save-authentication',
      loginMethods: ['magic_link'],
      twoFactorPolicy: 'optional',
    });
    await settle(12);
    expect(mounted.states.at(-1)).toEqual(expect.objectContaining({
      feedbackTab: 'authentication',
      failure: 'unavailable',
    }));
    expect(mounted.currentOperations.getTwoFactorPolicy).toHaveBeenCalled();

    mounted.controller.handleIntent({ kind: 'upload-asset', assetType: 'logo' });
    await settle(12);
    expect(mounted.states.at(-1)).toEqual(expect.objectContaining({
      feedbackTab: 'branding',
      failure: 'invalid-response',
    }));
  });

  it('focuses live rerendered launchers after confirmed lifecycle and picker outcomes', async () => {
    const nextOrganization = { ...organization, status: 'suspended' as const };
    const currentOperations = operations({
      get: vi
        .fn()
        .mockResolvedValueOnce({ kind: 'success', value: organization })
        .mockResolvedValue({ kind: 'success', value: nextOrganization }),
    });
    const presentation = createAdminPresentation(authenticated(), false, { width: 80, height: 24 });
    const host = createApplication({
      content: presentation.content,
      menuBar: presentation.menu,
      statusLine: presentation.status,
      viewport: { width: 80, height: 24 },
    });
    let workspace: AdminOrganizationWorkspace | undefined;
    const controller = createAdminOrganizationController({
      host,
      readState: authenticated,
      readOperations: () => currentOperations,
      mountWorkspace: (content) => presentation.setWorkspace(content),
      requestAuthentication: vi.fn(),
      workspaceFactory: (workspaceOptions) => {
        workspace = createAdminOrganizationWorkspace(workspaceOptions);
        return workspace;
      },
      openFile: vi.fn().mockResolvedValue('/tmp/unsupported.gif'),
    });
    controller.syncContext(authenticated(), 1);
    controller.handleCommand(MANAGE_ORGANIZATION_COMMAND);
    await settle(12);
    if (!workspace) throw new Error('Organization workspace missing.');
    const workspaceContent = workspace.content;
    if (!(workspaceContent instanceof Dialog)) throw new Error('Organization dialog missing.');

    activate(host, dialogButton(workspaceContent, 'Suspend'));
    await settle();
    const confirmation = host.desktop.activeWindow();
    if (!(confirmation instanceof Dialog)) throw new Error('Suspend confirmation missing.');
    activate(host, dialogButton(confirmation, 'Suspend'));
    await settle(16);
    const lifecycleFocus = host.loop.getFocused();
    if (!(lifecycleFocus instanceof Button)) throw new Error('Lifecycle focus missing.');
    expect(lifecycleFocus.activation.label).toBe('Activate');
    expect(descendants(workspaceContent)).toContain(lifecycleFocus);

    const tabs = descendants(workspaceContent).find((view) => view instanceof TabView);
    if (!(tabs instanceof TabView)) throw new Error('Organization tabs missing.');
    tabs.select(2);
    const branding = tabs.tabs.peek()[2]?.content;
    const add = branding && descendants(branding).find(
      (view) => view instanceof Button && view.activation.label === 'Add',
    );
    if (!(add instanceof Button)) throw new Error('Add asset action missing.');
    activate(host, add);
    await settle(12);
    const assetFocus = host.loop.getFocused();
    if (!(assetFocus instanceof Button)) throw new Error('Asset focus missing.');
    expect(assetFocus.activation.label).toBe('Add');
    expect(descendants(workspaceContent)).toContain(assetFocus);
  });
});
