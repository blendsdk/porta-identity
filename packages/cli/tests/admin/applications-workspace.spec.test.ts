/** Observable specifications for deployment-global application administration. */

import {
  Button,
  createApplication,
  DataGrid,
  Dialog,
  Group,
  Input,
  Memo,
  View,
  Window,
  at,
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
  canPurgeUsers: false,
  canReadApplications: true,
  canCreateApplications: true,
  canUpdateApplications: true,
  canArchiveApplications: true,
  canReadClients: false,
  canCreateClients: false,
  canUpdateClients: false,
  canRevokeClients: false,
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
  const host = createApplication({ viewport: { width, height } });
  const workspace = createAdminApplicationWorkspace({
    capabilities: granted,
    onIntent: (intent) => intents.push(intent),
    focusView: (view) => host.loop.focusView(view),
  });
  const window = new Window('Applications');
  window.setLayout({ rect: { x: 0, y: 0, width, height } });
  window.add(at(workspace.content, 1, 1, Math.max(1, width - 4), Math.max(1, height - 4)));
  host.desktop.addWindow(window);
  workspace.setState(state);
  workspace.focusCurrent();
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
  it('shows a full-height DataGrid and persistent deployment-global notice without an organization', async () => {
    const mounted = mountWorkspace({ kind: 'list', scope: 'global', applications: [application] });
    await settle();
    const views = descendants(mounted.window);
    const grid = views.find((view) => view instanceof DataGrid);

    expect(grid).toBeInstanceOf(DataGrid);
    expect((grid as DataGrid<unknown>).layout.size).toEqual({ kind: 'fr', weight: 1 });
    expect((grid as DataGrid<unknown>).bounds.height).toBeGreaterThan(10);
    expect(frameText(mounted.host)).toContain('Deployment-global applications');
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
    expect(frameText(mounted.host)).toContain('No applications');
    expect(frameText(mounted.host)).not.toContain('Customer Portal');

    mounted.workspace.setState({ kind: 'failure', failure: 'unavailable' });
    await settle();
    expect(frameText(mounted.host)).toContain('Service unavailable');
    expect(frameText(mounted.host)).not.toContain('Customer Portal');
  });

  it('shows safe detail, timestamps, modules, global scope, and permitted actions', async () => {
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
    const grids = descendants(mounted.window).filter((view) => view instanceof DataGrid);

    expect(grids).toHaveLength(1);
    expect(text).toContain('Deployment-global application');
    expect(text).toContain('Created: 2026-01-01T00:00:00Z');
    expect(text).toContain('Updated: 2026-08-01T00:00:00Z');
    expect(text).toContain('Billing');
    expect(text).toContain('Edit');
    expect(text).toContain('Deactivate');
    expect(text).toContain('Archive');
    expect(text).toContain('Add module');
  });

  it('keeps archived detail readable while every mutation is visible-disabled and restore is absent', async () => {
    const archived = { ...application, status: 'archived' as const };
    const mounted = mountWorkspace({
      kind: 'detail',
      scope: 'global',
      applications: [archived],
      application: archived,
      etag: null,
      modules: [moduleRow],
    });
    await settle();
    const buttons = descendants(mounted.window).filter((view) => view instanceof Button);
    const labels = buttons.map((button) => button.activation.label);

    expect(labels).toEqual(
      expect.arrayContaining(['Edit', 'Add module', 'Edit module', 'Deactivate module', 'Archive']),
    );
    for (const button of buttons.filter((candidate) =>
      ['Edit', 'Add module', 'Edit module', 'Deactivate module', 'Archive'].includes(
        candidate.activation.label,
      ),
    )) {
      click(mounted.host, button);
    }
    const grid = descendants(mounted.window).find((view) => view instanceof DataGrid);
    if (!(grid instanceof DataGrid)) throw new Error('Archived module grid missing.');
    mounted.host.loop.focusView(grid.rows);
    mounted.host.loop.dispatch({ type: 'key', key: 'enter', ctrl: false, alt: false, shift: false });
    expect(mounted.intents).toEqual([]);
    expect(frameText(mounted.host)).toContain('Archived applications are read only');
    expect(frameText(mounted.host)).not.toContain('Restore');
    expect(frameText(mounted.host)).not.toContain('Delete');
  });

  it('emits parent-qualified module actions and no delete or restore action', async () => {
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
    mounted.host.loop.focusView(grid.rows);
    mounted.host.loop.dispatch({ type: 'key', key: 'enter', ctrl: false, alt: false, shift: false });
    await settle();

    expect(mounted.intents).toContainEqual({
      kind: 'edit-module',
      applicationId,
      moduleId,
    });
    expect(mounted.intents.map((intent) => intent.kind)).not.toEqual(
      expect.arrayContaining(['delete-module', 'restore-module']),
    );

    const deactivate = descendants(mounted.window)
      .filter((view) => view instanceof Button)
      .find((button) => button.activation.label === 'Deactivate module');
    if (!deactivate) throw new Error('Deactivate module button missing.');
    activate(mounted.host, deactivate);
    expect(mounted.intents).toContainEqual({
      kind: 'deactivate-module',
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

  it('keeps unavailable actions visible-disabled with a fixed denial reason', async () => {
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
    if (!create) throw new Error('Create button missing.');
    click(mounted.host, create);
    expect(mounted.intents).toEqual([]);
    expect(frameText(mounted.host)).toContain('requires application create');
  });
});

describe('application and module dialogs', () => {
  it('repeats the deployment-global multi-organization notice in every mutation dialog', async () => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const openers = [
      () => showCreateApplicationDialog(host, new AbortController().signal),
      () => showEditApplicationDialog(host, new AbortController().signal, application),
      () =>
        showApplicationLifecycleDialog(
          host,
          new AbortController().signal,
          'deactivate',
          application,
        ),
      () => showCreateModuleDialog(host, new AbortController().signal, applicationId),
      () => showEditModuleDialog(host, new AbortController().signal, moduleRow),
      () =>
        showModuleDeactivationDialog(
          host,
          new AbortController().signal,
          application,
          moduleRow,
        ),
    ];
    for (const open of openers) {
      const result = open();
      await settle();
      expect(frameText(host)).toContain('Deployment-global: changes may affect multiple organizations');
      host.loop.endModal('cancel');
      await expect(result).resolves.toEqual({ kind: 'cancel' });
    }
  });
  it.each([
    ['application', (host: ReturnType<typeof createApplication>) => showCreateApplicationDialog(host, new AbortController().signal)],
    ['module', (host: ReturnType<typeof createApplication>) => showCreateModuleDialog(host, new AbortController().signal, applicationId)],
  ] as const)('accepts exact create boundaries and rejects adjacent invalid %s values', async (_name, open) => {
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
      expect(host.desktop.activeWindow(), `invalid values closed: ${JSON.stringify(values)}`).toBeInstanceOf(
        Dialog,
      );
      host.loop.endModal('cancel');
      await expect(result).resolves.toEqual({ kind: 'cancel' });
    }
  });

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

  it.each(['deactivate', 'archive'] as const)(
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
