/** Implementation diagnostics for the application workspace, dialogs, and controller reloads. */

import {
  Button,
  createApplication,
  DataGrid,
  Dialog,
  Group,
  Input,
  Text,
  View,
  Window,
  at,
} from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import { showCreateApplicationDialog } from '../../src/admin/application-dialogs.js';
import { createAdminApplicationController } from '../../src/admin/application-controller.js';
import type { AdminApplicationOperations } from '../../src/admin/application-service.js';
import type {
  AdminApplication,
  AdminApplicationModule,
} from '../../src/admin/application-state.js';
import { createAdminApplicationWorkspace } from '../../src/admin/application-workspace.js';
import { createAdminPresentation } from '../../src/admin/presentation.js';
import type { AdminCapabilities, AdminConnectionState } from '../../src/admin/state.js';

const applicationId = '11111111-1111-4111-8111-111111111111';
const moduleId = '22222222-2222-4222-8222-222222222222';
const application: AdminApplication = {
  id: applicationId,
  name: 'Customer Portal',
  slug: 'customer-portal',
  description: null,
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

/** Collects all descendants of a mounted view. */
function descendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(root);
  return result;
}

/** Reads the visible frame from a real renderer. */
function frameText(host: ReturnType<typeof createApplication>): string {
  return host.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

/** Allows scheduled layout, focus, and redraw work to complete. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Creates a promise whose completion is controlled by the test. */
function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      if (!resolvePromise) throw new Error('Deferred promise is unavailable.');
      resolvePromise(value);
    },
  };
}

/** Mounts the application catalog at one diagnostic geometry. */
function mount(width: number, height: number) {
  const presentation = createAdminPresentation(authenticated(), false, { width, height });
  const host = createApplication({
    content: presentation.content,
    menuBar: presentation.menu,
    statusLine: presentation.status,
    viewport: { width, height },
  });
  const workspace = createAdminApplicationWorkspace({
    capabilities,
    onIntent: vi.fn(),
    focusView: (view) => host.loop.focusView(view),
  });
  presentation.setWorkspace(workspace.content);
  if (!(workspace.content instanceof Dialog)) {
    throw new Error('Expected a dialog-styled application workspace.');
  }
  const window = workspace.content;
  workspace.setState({ kind: 'list', scope: 'global', applications: [application] });
  return { host, window, workspace };
}

/** Builds one authenticated state with all application capabilities. */
function authenticated(): Extract<AdminConnectionState, { kind: 'authenticated' }> {
  return {
    kind: 'authenticated',
    server: new URL('https://porta.example.test'),
    identity: { sub: 'administrator' },
    capabilities,
  };
}

describe('application workspace implementation', () => {
  it('lets the DataGrid consume remaining tall geometry and focuses its rows', async () => {
    const mounted = mount(100, 35);
    await settle();
    mounted.workspace.focusCurrent();
    const grid = descendants(mounted.window).find((view) => view instanceof DataGrid);
    if (!(grid instanceof DataGrid)) throw new Error('Application grid missing.');

    expect(grid.layout.position).not.toBe('absolute');
    expect(grid.layout.size).toEqual({ kind: 'fr', weight: 1 });
    expect(grid.bounds.height).toBeGreaterThan(20);
    expect(mounted.host.loop.getFocused()).toBe(grid.rows);
  });

  it('keeps controls bounded at 48x12 and clears replaced view artifacts', async () => {
    const mounted = mount(48, 12);
    await settle();
    expect(mounted.host.loop.renderRoot.buffer().width).toBe(48);
    expect(mounted.host.loop.renderRoot.buffer().height).toBe(12);
    expect(descendants(mounted.window).some((view) => view instanceof DataGrid)).toBe(true);

    mounted.workspace.setState({ kind: 'failure', failure: 'unavailable' });
    await settle();
    expect(frameText(mounted.host)).toContain('Service unavailable');
    expect(frameText(mounted.host)).not.toContain('Customer Portal');
    expect(frameText(mounted.host)).not.toContain('[jsvision/ui');
  });

  it('lays out detail actions with fixed DSL sizes and separate navigation', async () => {
    const mounted = mount(100, 35);
    mounted.workspace.setState({
      kind: 'detail',
      scope: 'global',
      applications: [application],
      application,
      etag: null,
      modules: [moduleRow],
    });
    await settle();
    const buttons = descendants(mounted.window).filter((view) => view instanceof Button);
    const byLabel = (label: string): Button => {
      const button = buttons.find((candidate) => candidate.activation.label === label);
      if (!button) throw new Error(`${label} button missing.`);
      return button;
    };
    const actionLabels = new Set([
      'Edit',
      'Deactivate',
      'Delete',
      'Add module',
      'Edit module',
      'Deactivate module',
      'Delete module',
      'Back to applications',
    ]);

    for (const label of actionLabels) {
      const button = byLabel(label);
      expect(button.layout.position).not.toBe('absolute');
      expect(button.layout.size).toBeUndefined();
    }

    const xOf = (label: string): number => {
      const origin = mounted.host.loop.renderRoot.originOf(byLabel(label));
      if (!origin) throw new Error(`${label} button origin missing.`);
      return origin.x;
    };

    expect(byLabel('Edit').bounds.x).toBeLessThan(byLabel('Deactivate').bounds.x);
    expect(byLabel('Deactivate').bounds.x).toBeLessThan(byLabel('Delete').bounds.x);
    expect(xOf('Add module')).toBeLessThan(xOf('Edit module'));
    expect(xOf('Edit module')).toBeLessThan(xOf('Deactivate module'));
    expect(xOf('Back to applications')).toBeLessThan(xOf('Add module'));

    const grid = descendants(mounted.window).find((view) => view instanceof DataGrid);
    if (!(grid instanceof DataGrid)) throw new Error('Module DataGrid missing.');
    const gridOrigin = mounted.host.loop.renderRoot.originOf(grid);
    const moduleActionOrigin = mounted.host.loop.renderRoot.originOf(byLabel('Add module'));
    if (!gridOrigin || !moduleActionOrigin) throw new Error('Module layout origins missing.');
    expect(moduleActionOrigin.y).toBe(gridOrigin.y + grid.bounds.height + 1);
  });

  it('removes retained projections on clear and ignores state after disposal', async () => {
    const mounted = mount(80, 24);
    mounted.workspace.clear();
    await settle();
    expect(descendants(mounted.window).some((view) => view instanceof DataGrid)).toBe(false);

    mounted.workspace.dispose();
    mounted.workspace.setState({ kind: 'list', scope: 'global', applications: [application] });
    await settle();
    expect(descendants(mounted.window).some((view) => view instanceof DataGrid)).toBe(false);
  });
});

describe('application dialog implementation', () => {
  it('mounts one movable Layout DSL form with one-row inputs', async () => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const result = showCreateApplicationDialog(host, new AbortController().signal);
    await settle();
    const dialog = host.desktop.activeWindow();
    if (!(dialog instanceof Dialog)) throw new Error('Create dialog missing.');
    const inputs = descendants(dialog).filter((view) => view instanceof Input);

    expect(dialog.movable).toBe(true);
    expect(inputs).toHaveLength(2);
    expect(inputs.every((input) => input.layout.position !== 'absolute')).toBe(true);
    expect(inputs.every((input) => input.bounds.height === 1)).toBe(true);
    host.loop.endModal('cancel');
    await expect(result).resolves.toEqual({ kind: 'cancel' });
  });

  it('tears down an aborted modal and redraws populated content without artifacts', async () => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const underlying = new Window('Underlying');
    underlying.setLayout({ rect: { x: 0, y: 0, width: 80, height: 24 } });
    underlying.add(at(new Text('UNDERLYING-CONTENT'), 2, 2, 30, 1));
    host.desktop.addWindow(underlying);
    const controller = new AbortController();
    const result = showCreateApplicationDialog(host, controller.signal);
    await settle();
    controller.abort();

    await expect(result).resolves.toEqual({ kind: 'cancel' });
    await settle();
    expect(host.desktop.activeWindow()).toBe(underlying);
    expect(frameText(host)).toContain('UNDERLYING-CONTENT');
    expect(frameText(host)).not.toContain('[jsvision/ui');
  });
});

describe('application controller implementation', () => {
  it('reloads authoritative same-parent detail after a module mutation', async () => {
    const states: unknown[] = [];
    const operations: Partial<AdminApplicationOperations> = {
      listAll: vi.fn().mockResolvedValue({ kind: 'success', value: [application] }),
      get: vi.fn().mockResolvedValue({
        kind: 'success',
        value: { application, etag: 'W/"0123456789abcdef"' },
      }),
      listModules: vi.fn().mockResolvedValue({ kind: 'success', value: [moduleRow] }),
      addModule: vi.fn().mockResolvedValue({ kind: 'success', value: moduleRow }),
    };
    const controller = createAdminApplicationController({
      readState: authenticated,
      readOperations: () => operations,
      publishState: (state) => states.push(state),
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(authenticated(), 1);
    await controller.load();
    await controller.select(applicationId);
    vi.mocked(operations.get!).mockClear();
    vi.mocked(operations.listModules!).mockClear();
    await controller.addModule(applicationId, { name: 'Billing' });

    expect(operations.addModule).toHaveBeenCalledWith(applicationId, { name: 'Billing' });
    expect(operations.get).toHaveBeenCalledWith(applicationId);
    expect(operations.listModules).toHaveBeenCalledWith(applicationId);
    expect(states.at(-1)).toEqual({
      kind: 'detail',
      scope: 'global',
      applications: [application],
      application,
      etag: 'W/"0123456789abcdef"',
      modules: [moduleRow],
    });
  });

  it('preserves validated detail when a module mutation fails', async () => {
    const states: unknown[] = [];
    const operations: Partial<AdminApplicationOperations> = {
      get: vi.fn().mockResolvedValue({ kind: 'success', value: { application, etag: null } }),
      listModules: vi.fn().mockResolvedValue({ kind: 'success', value: [moduleRow] }),
      updateModule: vi.fn().mockResolvedValue({ kind: 'failure', failure: 'conflict' }),
    };
    const controller = createAdminApplicationController({
      readState: authenticated,
      readOperations: () => operations,
      publishState: (state) => states.push(state),
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(authenticated(), 1);
    await controller.select(applicationId);
    await controller.updateModule(applicationId, moduleId, { name: 'Changed' });

    expect(states.at(-1)).toEqual(
      expect.objectContaining({
        kind: 'failure',
        failure: 'conflict',
        previous: expect.objectContaining({ kind: 'detail', application, modules: [moduleRow] }),
      }),
    );
  });

  it('retries retained detail through its authoritative application and module reads', async () => {
    const operations: Partial<AdminApplicationOperations> = {
      listAll: vi.fn().mockResolvedValue({ kind: 'success', value: [application] }),
      get: vi.fn().mockResolvedValue({ kind: 'success', value: { application, etag: null } }),
      listModules: vi.fn().mockResolvedValue({ kind: 'success', value: [moduleRow] }),
    };
    const controller = createAdminApplicationController({
      readState: authenticated,
      readOperations: () => operations,
      publishState: vi.fn(),
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(authenticated(), 1);
    await controller.load();
    await controller.select(applicationId);
    vi.mocked(operations.get!).mockClear();
    vi.mocked(operations.listModules!).mockClear();
    vi.mocked(operations.listAll!).mockClear();

    await controller.reload();

    expect(operations.get).toHaveBeenCalledWith(applicationId);
    expect(operations.listModules).toHaveBeenCalledWith(applicationId);
    expect(operations.listAll).not.toHaveBeenCalled();
  });

  it('aborts an owned confirmation before dispatch when application context is cancelled', async () => {
    let confirmationSignal: AbortSignal | undefined;
    const activate = vi.fn();
    const controller = createAdminApplicationController({
      readState: authenticated,
      readOperations: () => ({ activate }),
      publishState: vi.fn(),
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(authenticated(), 1);
    const pending = controller.activate(applicationId, async (signal) => {
      confirmationSignal = signal;
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
      return false;
    });
    await settle();
    controller.cancelActiveOperation();
    await pending;

    expect(confirmationSignal?.aborted).toBe(true);
    expect(activate).not.toHaveBeenCalled();
  });

  it('requires reconciliation when cancellation occurs after mutation dispatch', async () => {
    const mutation = deferred<{ readonly kind: 'success' }>();
    const states: unknown[] = [];
    const activate = vi.fn(() => mutation.promise);
    const controller = createAdminApplicationController({
      readState: authenticated,
      readOperations: () => ({ activate, listAll: vi.fn() }),
      publishState: (state) => states.push(state),
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(authenticated(), 1);
    const pending = controller.activate(applicationId, async () => true);
    await settle();
    expect(activate).toHaveBeenCalledOnce();
    controller.cancelActiveOperation();
    expect(states.at(-1)).toEqual(expect.objectContaining({ kind: 'indeterminate' }));
    mutation.resolve({ kind: 'success' });
    await pending;
    expect(states.at(-1)).toEqual(expect.objectContaining({ kind: 'indeterminate' }));
  });
});
