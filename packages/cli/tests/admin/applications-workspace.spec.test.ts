/** Observable specifications for deployment-global application administration. */

import {
  Button,
  createApplication,
  DataGrid,
  Dialog,
  Group,
  GroupBox,
  Input,
  Memo,
  View,
} from '@jsvision/ui';
import { describe, expect, it } from 'vitest';

import {
  showApplicationLifecycleDialog,
  showCreateApplicationDialog,
  showCreateModuleDialog,
  showEditApplicationDialog,
  showEditModuleDialog,
  showModuleDeactivationDialog,
} from '../../src/admin/application-dialogs.js';
import {
  createAdminApplicationWorkspace,
  type AdminApplicationIntent,
} from '../../src/admin/application-workspace.js';
import { createAdminPresentation } from '../../src/admin/presentation.js';
import type { AdminCapabilities } from '../../src/admin/state.js';
import type {
  AdminApplication,
  AdminApplicationModule,
  AdminApplicationViewState,
} from '../../src/admin/application-state.js';

const applicationId = '11111111-1111-4111-8111-111111111111';
const moduleId = '22222222-2222-4222-8222-222222222222';
const application: AdminApplication = {
  id: applicationId,
  name: 'Customer Portal',
  slug: 'customer-portal',
  description: 'The deployment-wide customer product.',
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
  canCreateApplications: true,
  canUpdateApplications: true,
  canDeleteApplications: true,
  canDeleteModules: true,
  canReadClients: false,
  canCreateClients: false,
  canUpdateClients: false,
  canDeleteClients: false,
  canRevokeClientSecrets: false,
};

/** Collects a mounted JSVision tree for observable control assertions. */
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

/** Lets reactive layout and modal mounting settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Mounts the global workspace on a real headless terminal surface. */
function mountWorkspace(
  state: AdminApplicationViewState,
  width = 80,
  height = 24,
  granted: AdminCapabilities = capabilities,
) {
  const intents: AdminApplicationIntent[] = [];
  const presentation = createAdminPresentation(
    {
      kind: 'authenticated',
      server: new URL('https://porta.example.test'),
      identity: { sub: 'administrator' },
      capabilities: granted,
    },
    false,
    { width, height },
  );
  const host = createApplication({
    content: presentation.content,
    menuBar: presentation.menu,
    statusLine: presentation.status,
    viewport: { width, height },
  });
  const workspace = createAdminApplicationWorkspace({
    capabilities: granted,
    onIntent: (intent) => intents.push(intent),
    focusView: (view) => host.loop.focusView(view),
  });
  presentation.setWorkspace(workspace.content);
  workspace.setState(state);
  workspace.focusCurrent();
  if (!(workspace.content instanceof Dialog)) {
    throw new Error('Expected a dialog-styled application workspace.');
  }
  const window = workspace.content;
  return { host, intents, window, workspace };
}

/** Returns the active modal dialog or fails with a useful assertion error. */
function activeDialog(host: ReturnType<typeof createApplication>): Dialog {
  const dialog = host.desktop.activeWindow();
  if (!(dialog instanceof Dialog)) throw new Error('Expected a mounted application dialog.');
  return dialog;
}

/** Activates a mounted control through the ordinary keyboard route. */
function activate(host: ReturnType<typeof createApplication>, button: Button): void {
  host.loop.focusView(button);
  host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
}

/** Clicks a mounted button without changing focus to an unrelated control. */
function click(host: ReturnType<typeof createApplication>, button: Button): void {
  const origin = host.loop.renderRoot.originOf(button);
  if (!origin) throw new Error('Button has no rendered origin.');
  for (const kind of ['down', 'up'] as const) {
    host.loop.dispatch({
      type: 'mouse',
      kind,
      button: 0,
      x: origin.x + 2,
      y: origin.y,
    });
  }
}

/** Opens a create-style dialog, fills its fields, and accepts it. */
async function submitCreateDialog<T>(
  open: (host: ReturnType<typeof createApplication>) => Promise<T>,
  values: readonly [name: string, slug: string, description: string],
): Promise<T> {
  const host = createApplication({ viewport: { width: 80, height: 24 } });
  const result = open(host);
  await settle();
  const views = descendants(activeDialog(host));
  const inputs = views.filter((view) => view instanceof Input);
  const memo = views.find((view) => view instanceof Memo);
  inputs[0]?.getValueSignal().set(values[0]);
  inputs[1]?.getValueSignal().set(values[1]);
  memo?.setText(values[2]);
  const submit = views
    .filter((view) => view instanceof Button)
    .find((button) => button.activation.command === 'ok');
  if (!submit) throw new Error('Create submit button missing.');
  activate(host, submit);
  return result;
}

describe('global applications workspace', () => {
  it('shows a clean full-height DataGrid with creation owned by the Applications menu', async () => {
    const mounted = mountWorkspace({ kind: 'list', scope: 'global', applications: [application] });
    await settle();
    const views = descendants(mounted.window);
    const grid = views.find((view) => view instanceof DataGrid);

    expect(mounted.window.title()).toBe('Applications');
    expect(mounted.window.isZoomed()).toBe(true);
    expect(mounted.window.closable).toBe(false);
    expect(mounted.window.resizable).toBe(false);
    expect(mounted.window.zoomable).toBe(false);
    expect(grid).toBeInstanceOf(DataGrid);
    expect((grid as DataGrid<unknown>).layout.size).toEqual({ kind: 'fr', weight: 1 });
    expect((grid as DataGrid<unknown>).bounds.height).toBeGreaterThan(10);
    expect(frameText(mounted.host)).toContain('Applications');
    expect(frameText(mounted.host).match(/Applications/g)).toHaveLength(2);
    expect(frameText(mounted.host)).toContain('Enter View details · 1 application');
    expect(frameText(mounted.host)).not.toContain('Deployment-global');
    expect(
      views
        .filter((view) => view instanceof Button)
        .some((button) => button.activation.label === 'Create'),
    ).toBe(false);
    expect(frameText(mounted.host)).toContain('Name');
    expect(frameText(mounted.host)).toContain('Slug');
    expect(frameText(mounted.host)).toContain('Status');
    expect(frameText(mounted.host)).toContain('Customer Portal');
  });

  it('replaces empty and failed catalogs cleanly without retaining partial rows', async () => {
    const mounted = mountWorkspace({ kind: 'list', scope: 'global', applications: [application] });
    await settle();
    mounted.workspace.setState({ kind: 'list', scope: 'global', applications: [] });
    await settle();
    expect(frameText(mounted.host)).toContain(
      'No applications. Use Applications > Create application.',
    );
    expect(frameText(mounted.host)).not.toContain('Customer Portal');

    mounted.workspace.setState({ kind: 'failure', failure: 'unavailable' });
    await settle();
    expect(frameText(mounted.host)).toContain('Service unavailable');
    expect(frameText(mounted.host)).not.toContain('Customer Portal');
  });

  it('shows safe detail, timestamps, modules, and permitted actions without scope jargon', async () => {
    const mounted = mountWorkspace({
      kind: 'detail',
      scope: 'global',
      applications: [application],
      application,
      etag: 'W/"0123456789abcdef"',
      modules: [moduleRow],
    });
    await settle();
    const text = frameText(mounted.host);
    const views = descendants(mounted.window);
    const grids = views.filter((view) => view instanceof DataGrid);
    const groupBoxes = views.filter((view) => view instanceof GroupBox);

    expect(grids).toHaveLength(1);
    expect(groupBoxes).toHaveLength(2);
    expect(text).not.toContain('Deployment-global');
    expect(text).toContain('Customer Portal');
    expect(text).toContain('ACTIVE');
    expect(text).toContain('customer-portal');
    expect(text).toContain('The deployment-wide customer product.');
    expect(text).toContain('Created: 2026-01-01T00:00:00Z');
    expect(text).toContain('Updated: 2026-08-01T00:00:00Z');
    expect(text).toContain('Modules · 1 module');
    expect(text).toContain('Billing');
    expect(text).toContain('Edit');
    expect(text).toContain('Deactivate');
    expect(text).toContain('Delete');
    expect(text).toContain('Add module');

    const applicationActions = descendants(groupBoxes[0]!)
      .filter((view) => view instanceof Button)
      .map((button) => button.activation.label);
    const moduleActions = descendants(groupBoxes[1]!)
      .filter((view) => view instanceof Button)
      .map((button) => button.activation.label);
    expect(applicationActions).toEqual(expect.arrayContaining(['Edit', 'Deactivate', 'Delete']));
    expect(applicationActions).not.toContain('Back to applications');
    expect(applicationActions).not.toContain('Add module');
    expect(moduleActions).toEqual(
      expect.arrayContaining(['Add module', 'Edit module', 'Deactivate module', 'Delete module']),
    );
    expect(moduleActions).not.toContain('Back to applications');
    expect(
      views
        .filter((view) => view instanceof Button)
        .map((button) => button.activation.label),
    ).toContain('Back to applications');

    // Every detail action keeps both face-padding cells and its shadow column.
    const detailActionLabels = new Set([
      'Edit',
      'Deactivate',
      'Delete',
      'Add module',
      'Edit module',
      'Deactivate module',
      'Delete module',
      'Back to applications',
    ]);
    for (const button of views.filter(
      (view): view is Button =>
        view instanceof Button && detailActionLabels.has(view.activation.label),
    )) {
      expect(button.bounds.width).toBe(button.measure().width);
    }
  });

  it('enables parent-qualified module actions only after selecting a module record', async () => {
    const mounted = mountWorkspace({
      kind: 'detail',
      scope: 'global',
      applications: [application],
      application,
      etag: null,
      modules: [moduleRow],
    });
    await settle();
    const grid = descendants(mounted.window).find((view) => view instanceof DataGrid);
    if (!(grid instanceof DataGrid)) throw new Error('Module grid missing.');
    const edit = descendants(mounted.window)
      .filter((view) => view instanceof Button)
      .find((button) => button.activation.label === 'Edit module');
    const deactivate = descendants(mounted.window)
      .filter((view) => view instanceof Button)
      .find((button) => button.activation.label === 'Deactivate module');
    const add = descendants(mounted.window)
      .filter((view) => view instanceof Button)
      .find((button) => button.activation.label === 'Add module');
    if (!add || !edit || !deactivate) throw new Error('Module operation buttons missing.');

    // Creating a new record does not depend on selecting an existing record.
    activate(mounted.host, add);
    expect(mounted.intents).toContainEqual({ kind: 'add-module', applicationId });
    mounted.intents.length = 0;

    // Module mutation controls require an explicitly selected DataGrid record.
    click(mounted.host, edit);
    click(mounted.host, deactivate);
    expect(mounted.intents).toEqual([]);

    mounted.host.loop.focusView(grid.rows);
    mounted.host.loop.dispatch({
      type: 'key',
      key: 'enter',
      ctrl: false,
      alt: false,
      shift: false,
    });
    await settle();

    // Enter selects the focused record without silently choosing an operation.
    expect(mounted.intents).toEqual([]);
    activate(mounted.host, edit);
    expect(mounted.intents).toContainEqual({
      kind: 'edit-module',
      applicationId,
      moduleId,
    });
    expect(mounted.intents.map((intent) => intent.kind)).not.toEqual(
      expect.arrayContaining(['delete-module', 'restore-module']),
    );

    activate(mounted.host, deactivate);
    expect(mounted.intents).toContainEqual({
      kind: 'deactivate-module',
      applicationId,
      moduleId,
    });
  });

  it('keeps deactivation disabled when the selected module is already inactive', async () => {
    const inactiveModule = { ...moduleRow, status: 'inactive' as const };
    const mounted = mountWorkspace({
      kind: 'detail',
      scope: 'global',
      applications: [application],
      application,
      etag: null,
      modules: [inactiveModule],
    });
    await settle();
    const grid = descendants(mounted.window).find((view) => view instanceof DataGrid);
    const buttons = descendants(mounted.window).filter((view) => view instanceof Button);
    const edit = buttons.find((button) => button.activation.label === 'Edit module');
    const deactivate = buttons.find((button) => button.activation.label === 'Deactivate module');
    if (!(grid instanceof DataGrid) || !edit || !deactivate) {
      throw new Error('Inactive module controls missing.');
    }

    mounted.host.loop.focusView(grid.rows);
    mounted.host.loop.dispatch({
      type: 'key',
      key: 'enter',
      ctrl: false,
      alt: false,
      shift: false,
    });
    await settle();
    click(mounted.host, deactivate);
    expect(mounted.intents).toEqual([]);

    activate(mounted.host, edit);
    expect(mounted.intents).toContainEqual({
      kind: 'edit-module',
      applicationId,
      moduleId,
    });
  });

  it('keeps retained detail visible with a retry action when its reload fails', async () => {
    const previous: Extract<AdminApplicationViewState, { kind: 'detail' }> = {
      kind: 'detail',
      scope: 'global',
      applications: [application],
      application,
      etag: null,
      modules: [moduleRow],
    };
    const mounted = mountWorkspace({ kind: 'failure', failure: 'unavailable', previous });
    await settle();
    expect(frameText(mounted.host)).toContain('Customer Portal');
    expect(frameText(mounted.host)).toContain('Billing');
    expect(frameText(mounted.host)).toContain('Service unavailable');
    const retry = descendants(mounted.window)
      .filter((view) => view instanceof Button)
      .find((button) => button.activation.label === 'Retry');
    if (!retry) throw new Error('Detail retry button missing.');
    activate(mounted.host, retry);
    expect(mounted.intents).toContainEqual({ kind: 'retry' });
  });

  it('keeps the workspace usable at 48x12 and restores focus after replacement', async () => {
    const mounted = mountWorkspace(
      { kind: 'list', scope: 'global', applications: [application] },
      48,
      12,
    );
    await settle();
    const grid = descendants(mounted.window).find((view) => view instanceof DataGrid);
    expect(grid).toBeInstanceOf(DataGrid);
    expect(mounted.host.loop.getFocused()).toBe((grid as DataGrid<unknown>).rows);
    expect(frameText(mounted.host)).not.toContain('[jsvision/ui');

    mounted.workspace.setState({ kind: 'failure', failure: 'unavailable' });
    mounted.workspace.setState({ kind: 'list', scope: 'global', applications: [application] });
    await settle();
    mounted.workspace.focusCurrent();
    expect(mounted.host.loop.getFocused()).toBeInstanceOf(View);
    expect(frameText(mounted.host)).not.toContain('[jsvision/ui');
  });

  it('keeps creation menu-owned when the session lacks application-create permission', async () => {
    const mounted = mountWorkspace(
      { kind: 'list', scope: 'global', applications: [application] },
      80,
      24,
      { ...capabilities, canCreateApplications: false },
    );
    await settle();
    const create = descendants(mounted.window)
      .filter((view) => view instanceof Button)
      .find((button) => button.activation.label === 'Create');

    expect(create).toBeUndefined();
    expect(mounted.intents).toEqual([]);
    expect(frameText(mounted.host)).not.toContain('requires application create');
  });
});
describe('application and module dialogs', () => {
  it('places plain-language scope guidance only inside mutation dialogs', async () => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const dialogs = [
      {
        open: () => showCreateApplicationDialog(host, new AbortController().signal),
        notice: 'This application will be available to every organization.',
      },
      {
        open: () => showEditApplicationDialog(host, new AbortController().signal, application),
        notice: 'Changes apply wherever this application is used.',
      },
      {
        open: () =>
          showApplicationLifecycleDialog(
            host,
            new AbortController().signal,
            'deactivate',
            application,
          ),
        notice: 'Changes apply wherever this application is used.',
      },
      {
        open: () => showCreateModuleDialog(host, new AbortController().signal, applicationId),
        notice: 'Changes apply wherever this application is used.',
      },
      {
        open: () => showEditModuleDialog(host, new AbortController().signal, moduleRow),
        notice: 'Changes apply wherever this application is used.',
      },
      {
        open: () =>
          showModuleDeactivationDialog(host, new AbortController().signal, application, moduleRow),
        notice: 'Changes apply wherever this application is used.',
      },
    ];

    for (const { open, notice } of dialogs) {
      const result = open();
      await settle();
      expect(frameText(host)).toContain(notice);
      expect(frameText(host)).not.toContain('Deployment-global');
      host.loop.endModal('cancel');
      await expect(result).resolves.toEqual({ kind: 'cancel' });
    }
  });
  it.each([
    [
      'application',
      (host: ReturnType<typeof createApplication>) =>
        showCreateApplicationDialog(host, new AbortController().signal),
    ],
    [
      'module',
      (host: ReturnType<typeof createApplication>) =>
        showCreateModuleDialog(host, new AbortController().signal, applicationId),
    ],
  ] as const)(
    'accepts exact create boundaries and rejects adjacent invalid %s values',
    async (_name, open) => {
      const accepted: Array<readonly [string, string, string]> = [
        ['n', '', ''],
        ['n'.repeat(255), 'abc', 'd'.repeat(2_000)],
        ['name', 'a'.repeat(100), 'description'],
      ];
      for (const values of accepted) {
        const result = await submitCreateDialog(open, values);
        expect(result.kind).not.toBe('cancel');
      }

      for (const values of [
        ['', 'abc', ''],
        ['n'.repeat(256), 'abc', ''],
        ['name', 'ab', ''],
        ['name', 'a'.repeat(101), ''],
        ['name', 'bad slug', ''],
        ['name\u001b', 'abc', ''],
        ['name', 'abc', `description\u001b`],
        ['name', 'abc', 'd'.repeat(2_001)],
      ] as const) {
        const host = createApplication({ viewport: { width: 80, height: 24 } });
        const result = open(host);
        await settle();
        const views = descendants(activeDialog(host));
        const inputs = views.filter((view) => view instanceof Input);
        const memo = views.find((view) => view instanceof Memo);
        inputs[0]?.getValueSignal().set(values[0]);
        inputs[1]?.getValueSignal().set(values[1]);
        memo?.setText(values[2]);
        const submit = views
          .filter((view) => view instanceof Button)
          .find((button) => button.activation.command === 'ok');
        if (!submit) throw new Error('Create submit button missing.');
        activate(host, submit);
        await settle();
        expect(
          host.desktop.activeWindow(),
          `invalid values closed: ${JSON.stringify(values)}`,
        ).toBeInstanceOf(Dialog);
        host.loop.endModal('cancel');
        await expect(result).resolves.toEqual({ kind: 'cancel' });
      }
    },
  );

  it('creates application and module payloads with omitted empty optional values', async () => {
    const created = await submitCreateDialog(
      (host) => showCreateApplicationDialog(host, new AbortController().signal),
      ['Portal', '', ''],
    );
    const moduleCreated = await submitCreateDialog(
      (host) => showCreateModuleDialog(host, new AbortController().signal, applicationId),
      ['Billing', '', ''],
    );
    expect(created).toEqual({ kind: 'create', input: { name: 'Portal' } });
    expect(moduleCreated).toEqual({
      kind: 'create-module',
      applicationId,
      input: { name: 'Billing' },
    });
  });

  it('keeps application and module slugs immutable in edit dialogs', async () => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const editing = showEditApplicationDialog(host, new AbortController().signal, application);
    await settle();
    expect(descendants(activeDialog(host)).filter((view) => view instanceof Input)).toHaveLength(1);
    expect(frameText(host)).toContain('customer-portal (read only)');
    host.loop.endModal('cancel');
    await editing;

    const moduleEditing = showEditModuleDialog(host, new AbortController().signal, moduleRow);
    await settle();
    expect(descendants(activeDialog(host)).filter((view) => view instanceof Input)).toHaveLength(1);
    expect(frameText(host)).toContain('billing (read only)');
    host.loop.endModal('cancel');
    await moduleEditing;
  });

  it.each(['deactivate'] as const)(
    'names the application and explains existing-client behavior before %s',
    async (action) => {
      const host = createApplication({ viewport: { width: 80, height: 24 } });
      const result = showApplicationLifecycleDialog(
        host,
        new AbortController().signal,
        action,
        application,
      );
      await settle();
      const dialog = activeDialog(host);
      expect(frameText(host)).toContain('Customer Portal');
      expect(frameText(host)).toContain('New client creation stops');
      expect(frameText(host)).toContain('Existing clients remain enabled');
      expect(dialog.movable).toBe(true);
      host.loop.endModal('cancel');
      await expect(result).resolves.toEqual({ kind: 'cancel' });
    },
  );

  it('names the parent and module before deactivation and returns both internal IDs', async () => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const result = showModuleDeactivationDialog(
      host,
      new AbortController().signal,
      application,
      moduleRow,
    );
    await settle();
    expect(frameText(host)).toContain('Customer Portal');
    expect(frameText(host)).toContain('Billing');
    host.loop.endModal('ok');
    await expect(result).resolves.toEqual({ kind: 'deactivate-module', applicationId, moduleId });
  });

  it('uses movable Layout DSL dialogs, fixed one-row inputs, clean teardown, and resize cancellation', async () => {
    const host = createApplication({ viewport: { width: 48, height: 12 } });
    const controller = new AbortController();
    const result = showCreateApplicationDialog(host, controller.signal);
    await settle();
    const dialog = activeDialog(host);
    const inputs = descendants(dialog).filter((view) => view instanceof Input);
    expect(dialog.movable).toBe(true);
    expect(dialog.bounds.width).toBeLessThanOrEqual(48);
    expect(dialog.bounds.height).toBeLessThanOrEqual(12);
    expect(inputs.every((input) => input.layout.position !== 'absolute')).toBe(true);
    expect(inputs.every((input) => input.bounds.height === 1)).toBe(true);
    controller.abort();
    await expect(result).resolves.toEqual({ kind: 'cancel' });
    expect(host.desktop.activeWindow()).toBeNull();
    expect(frameText(host)).not.toContain('[jsvision/ui');
  });

  it('supports keyboard and mouse activation while restoring a clean underlying frame', async () => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const result = showCreateApplicationDialog(host, new AbortController().signal);
    await settle();
    const dialog = activeDialog(host);
    const cancel = descendants(dialog)
      .filter((view) => view instanceof Button)
      .find((button) => button.activation.label === 'Cancel');
    if (!cancel) throw new Error('Cancel button missing.');
    activate(host, cancel);
    await expect(result).resolves.toEqual({ kind: 'cancel' });
    expect(host.desktop.activeWindow()).toBeNull();
    expect(frameText(host)).not.toContain('[jsvision/ui');
  });
});
