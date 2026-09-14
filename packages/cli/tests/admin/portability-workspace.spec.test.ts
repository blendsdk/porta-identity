/** Observable specifications for the terminal administration portability workspace. */

import {
  Button,
  CheckGroup,
  createApplication,
  Dialog,
  Group,
  Input,
  RadioGroup,
  TabView,
  View,
} from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import { ADMIN_COMMANDS } from '../../src/admin/presentation.js';
import { SelectableReadOnlyInput } from '../../src/admin/selectable-read-only-input.js';

const organization = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Example Organization',
  slug: 'example-organization',
  status: 'active' as const,
};
const applications = [
  { id: '22222222-2222-4222-8222-222222222222', name: 'Orders', slug: 'orders' },
];
const fullCapabilities = {
  canExportData: true,
  canImportData: true,
  isSuperAdmin: true,
  canReadOrganizations: true,
  canReadApplications: true,
  canReadRoles: true,
  canReadPermissions: true,
  canReadClaims: true,
  canReadUsers: true,
  canReadClients: true,
};
const manifest = Object.freeze({
  format: 'porta-portability',
  version: 1,
  scope: { kind: 'organization', organization_slug: organization.slug },
  categories: ['organizations'],
  application_selection: { all_applications: true, application_slugs: [] },
  organizations: [],
  applications: [],
  application_modules: [],
  roles: [],
  permissions: [],
  claim_definitions: [],
  role_permission_mappings: [],
  users: [],
  user_role_assignments: [],
  user_claim_values: [],
  clients: [],
});
const emptyCounts = Object.freeze({ created: 0, updated: 0, skipped: 0, rejected: 0 });
const preview = Object.freeze({
  mode: 'dry-run',
  summary: { organizations: { ...emptyCounts, created: 1 } },
  items: [],
  errors: [],
});
const exportRequest = Object.freeze({
  scope: { kind: 'organization', organization_slug: organization.slug },
  categories: ['organizations'],
  application_selection: { all_applications: true, application_slugs: [] },
});

type PortabilityIntent =
  | { readonly kind: 'export'; readonly request: typeof exportRequest }
  | { readonly kind: 'choose-manifest' }
  | { readonly kind: 'preview' }
  | { readonly kind: 'apply' }
  | { readonly kind: 'set-import-mode'; readonly mode: 'keep-existing' | 'update-existing' }
  | { readonly kind: 'close' };

interface Workspace {
  readonly content: View;
  setState(state: unknown): void;
  focusCurrent(): void;
}

interface WorkspaceExports {
  createAdminPortabilityWorkspace(options: {
    readonly capabilities: Record<string, boolean>;
    readonly organization?: typeof organization;
    readonly applications: typeof applications;
    readonly onIntent: (intent: PortabilityIntent) => void;
    readonly focusView: (view: View) => void;
  }): Workspace;
}

interface Controller {
  syncContext(state: unknown, epoch: number): void;
  handleCommand(command: string): boolean;
  handleIntent(intent: PortabilityIntent): void;
}

interface ControllerExports {
  createAdminPortabilityController(options: Record<string, unknown>): Controller;
}

interface ControllerHarnessOverrides {
  readonly operationOverrides?: Record<string, unknown>;
  readonly dialogOverrides?: Record<string, unknown>;
  readonly fileOverrides?: Record<string, unknown>;
}

/** Loads the planned workspace seam without coupling this oracle to implementation-owned types. */
async function workspaceExports(): Promise<WorkspaceExports> {
  return (await import('../../src/admin/portability-workspace.js')) as WorkspaceExports;
}

/** Loads the planned controller seam without coupling this oracle to implementation-owned types. */
async function controllerExports(): Promise<ControllerExports> {
  return (await import('../../src/admin/portability-controller.js')) as ControllerExports;
}

/** Traverses a mounted JSVision tree in display order. */
function descendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(root);
  return result;
}

/** Reads visible characters from a real headless terminal frame. */
function frameText(host: ReturnType<typeof createApplication>): string {
  return host.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

/** Returns a view's absolute terminal row. */
function absoluteY(view: View): number {
  let y = view.bounds.y;
  let parent = view.parent;
  while (parent) {
    y += parent.bounds.y;
    parent = parent.parent;
  }
  return y;
}

/** Lets signal-driven rendering and controller continuations settle. */
async function settle(rounds = 6): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

/** Returns an action by its plain label. */
function button(root: View, label: string): Button {
  const found = descendants(root)
    .filter((view) => view instanceof Button)
    .find((candidate) => candidate.activation.label === label);
  if (!found) throw new Error(`${label} action missing.`);
  return found;
}

/** Returns the direct Import / Export command without prescribing its internal string. */
function portabilityCommand(): string {
  const command = (ADMIN_COMMANDS as Partial<Record<'portability', string>>).portability;
  if (!command) throw new Error('Import / Export command missing.');
  return command;
}

/** Mounts the planned workspace on a real headless terminal. */
async function mount(
  capabilities: Record<string, boolean> = fullCapabilities,
  selectedOrganization?: typeof organization,
  width = 80,
  height = 24,
) {
  const effectiveOrganization = arguments.length < 2 ? organization : selectedOrganization;
  const intents: PortabilityIntent[] = [];
  const focused: View[] = [];
  const host = createApplication({ viewport: { width, height } });
  const workspace = (await workspaceExports()).createAdminPortabilityWorkspace({
    capabilities,
    ...(effectiveOrganization ? { organization: effectiveOrganization } : {}),
    applications,
    onIntent: (intent) => intents.push(intent),
    focusView: (view) => {
      focused.push(view);
      host.loop.focusView(view);
    },
  });
  host.desktop.add(workspace.content);
  workspace.setState({ kind: 'ready' });
  workspace.focusCurrent();
  await settle();
  if (!(workspace.content instanceof Dialog)) throw new Error('Import / Export window missing.');
  return { focused, host, intents, window: workspace.content, workspace };
}

/** Returns the single two-page tab control. */
function portabilityTabs(root: View): TabView {
  const controls = descendants(root).filter((view) => view instanceof TabView);
  if (controls.length !== 1 || !(controls[0] instanceof TabView)) {
    throw new Error('Expected one Import / Export tab control.');
  }
  return controls[0];
}

/** Builds a controller with observable file, SDK, dialog, and workspace boundaries. */
async function controllerHarness(overrides: ControllerHarnessOverrides = {}) {
  let state: Record<string, unknown> = {
    kind: 'authenticated',
    organization,
    capabilities: fullCapabilities,
  };
  let intent: ((value: PortabilityIntent) => void) | undefined;
  const states: unknown[] = [];
  const workspace = {
    content: new Group(),
    setState: vi.fn((value: unknown) => states.push(value)),
    focusCurrent: vi.fn(),
  };
  const operations = {
    exportManifest: vi.fn().mockResolvedValue({ manifest, filename: 'porta-export.json' }),
    preview: vi.fn().mockResolvedValue(preview),
    apply: vi.fn().mockResolvedValue({ ...preview, mode: 'keep-existing' }),
  };
  const dialogs = {
    chooseManifest: vi.fn().mockResolvedValue(undefined),
    saveManifest: vi.fn().mockResolvedValue(undefined),
    confirmApply: vi.fn().mockResolvedValue(true),
    showOneTimeClientSecret: vi.fn().mockResolvedValue(undefined),
  };
  const files = {
    readUtf8: vi.fn().mockResolvedValue(JSON.stringify(manifest)),
    writeUtf8: vi.fn().mockResolvedValue(undefined),
  };
  if (overrides.operationOverrides) Object.assign(operations, overrides.operationOverrides);
  if (overrides.dialogOverrides) Object.assign(dialogs, overrides.dialogOverrides);
  if (overrides.fileOverrides) Object.assign(files, overrides.fileOverrides);
  const mounted: Array<View | null> = [];
  const host = createApplication({ viewport: { width: 80, height: 24 } });
  const controller = (await controllerExports()).createAdminPortabilityController({
    host,
    readState: () => state,
    readOperations: () => operations,
    mountWorkspace: (content: View | null) => mounted.push(content),
    workspaceFactory: (options: { onIntent(value: PortabilityIntent): void }) => {
      intent = options.onIntent;
      return workspace;
    },
    dialogs,
    files,
  });
  controller.syncContext(state, 1);
  return {
    controller,
    dialogs,
    files,
    getIntent: () => intent,
    mounted,
    operations,
    setState: (next: Record<string, unknown>) => {
      state = next;
    },
    states,
    workspace,
  };
}

describe('portability workspace access and composition', () => {
  // One direct command owns both portability operations so the menu does not scatter them.
  it('should publish one stable Import / Export command', () => {
    expect(portabilityCommand()).toEqual(expect.any(String));
  });

  // Both tabs stay visible, while the first authorized operation is selected and denied tabs are inert.
  it.each([
    ['both operations', true, true, 'Export…', 'Import'],
    ['export only', true, false, 'Export…', 'Import permission required'],
    ['import only', false, true, 'Choose manifest…', 'Export permission required'],
  ])(
    'should open one fixed maximized two-tab window for %s',
    async (_case, canExportData, canImportData, initialAction, deniedMessage) => {
      const mounted = await mount({ ...fullCapabilities, canExportData, canImportData });
      const tabs = portabilityTabs(mounted.window);

      expect(mounted.window.title()).toBe('Import / Export');
      expect(mounted.window.isZoomed()).toBe(true);
      expect(mounted.window.resizable).toBe(false);
      expect(mounted.window.zoomable).toBe(false);
      expect(tabs.tabs.peek().map((tab) => tab.title)).toEqual(['Export', 'Import']);
      expect(frameText(mounted.host)).toContain(initialAction);
      if (canExportData !== canImportData) {
        tabs.select(canExportData ? 1 : 0);
        await settle();
        expect(frameText(mounted.host)).toContain(deniedMessage);
        const deniedPage = tabs.tabs.peek()[canExportData ? 1 : 0]?.content;
        if (!deniedPage) throw new Error('Denied tab missing.');
        expect(descendants(deniedPage).some((view) => view instanceof Button)).toBe(false);
      }
    },
  );

  // A selected organization wins over environment scope; environment is the fallback only for an exact super-admin.
  it('should choose the selected organization first and environment only for super-admin without one', async () => {
    const selected = await mount(fullCapabilities, organization);
    expect(frameText(selected.host)).toMatch(/Selected organization.*Example Organization/i);
    expect(frameText(selected.host)).toMatch(/(?:\(•\)|\(X\)|\[X\]).*Selected organization/i);

    const environment = await mount(fullCapabilities, undefined);
    expect(frameText(environment.host)).toMatch(/(?:\(•\)|\(X\)|\[X\]).*Entire environment/i);
  });

  // Legacy broad administration permissions never substitute for the exact porta-super-admin role.
  it('should hide environment scope without exact super-admin capability', async () => {
    const mounted = await mount(
      {
        ...fullCapabilities,
        isSuperAdmin: false,
        canReadOrganizations: true,
        canExportData: true,
      },
      organization,
    );

    expect(frameText(mounted.host)).not.toContain('Entire environment');
  });

  // Export starts with clients excluded and uses padded, spaced Layout DSL without legacy fixed-window sizing.
  it('should render safe export defaults with flexible Layout DSL geometry', async () => {
    const mounted = await mount();
    const exportPage = portabilityTabs(mounted.window).tabs.peek()[0]?.content;
    if (!exportPage) throw new Error('Export tab missing.');
    const exportColumn = descendants(exportPage).find(
      (view) =>
        view instanceof Group && view.layout.direction === 'col' && view.layout.padding === 1,
    );

    expect(frameText(mounted.host)).toMatch(/\[ \].*OIDC clients/i);
    expect(exportColumn?.layout.gap).toBe(1);
    expect(mounted.window.bounds).not.toMatchObject({ width: 48, height: 12 });
    expect(
      descendants(exportPage)
        .filter(
          (view) =>
            view instanceof Button ||
            view instanceof CheckGroup ||
            view instanceof Input ||
            view instanceof RadioGroup,
        )
        .every((view) => view.layout.position !== 'absolute'),
    ).toBe(true);
  });
});

describe('portability export workflow', () => {
  // Export is possible only with a non-empty category set and a valid explicit application choice.
  it('should enable Export only for a complete explicit selection', async () => {
    const mounted = await mount();
    mounted.workspace.setState({
      kind: 'ready',
      exportSelection: {
        scope: { kind: 'organization', organizationSlug: organization.slug },
        categories: [],
        applications: { kind: 'selected', slugs: [] },
      },
    });
    await settle();
    expect(button(mounted.window, 'Export…').state.disabled).toBe(true);

    mounted.workspace.setState({
      kind: 'ready',
      exportSelection: {
        scope: { kind: 'organization', organizationSlug: organization.slug },
        categories: ['applications_authorization'],
        applications: { kind: 'selected', slugs: [] },
      },
    });
    await settle();
    expect(button(mounted.window, 'Export…').state.disabled).toBe(true);

    mounted.workspace.setState({
      kind: 'ready',
      exportSelection: {
        scope: { kind: 'organization', organizationSlug: organization.slug },
        categories: ['applications_authorization'],
        applications: { kind: 'selected', slugs: ['orders'] },
      },
    });
    await settle();
    expect(button(mounted.window, 'Export…').state.disabled).toBe(false);
  });

  // Server export and its audit happen before local file choice; cancelling the save writes nothing.
  it('should preserve completed server export when the save dialog is cancelled', async () => {
    const mounted = await controllerHarness();
    mounted.controller.handleCommand(portabilityCommand());
    await settle(12);
    mounted.getIntent()?.({ kind: 'export', request: exportRequest });
    await settle(12);

    expect(mounted.operations.exportManifest).toHaveBeenCalledOnce();
    expect(mounted.dialogs.saveManifest).toHaveBeenCalledWith('porta-export.json');
    expect(mounted.files.writeUtf8).not.toHaveBeenCalled();
  });

  // A local write error has fixed feedback and never reports success or retries either operation.
  it('should show safe write failure feedback without false success or retry', async () => {
    const files = {
      readUtf8: vi.fn(),
      writeUtf8: vi.fn().mockRejectedValue(new Error('/private/path: permission denied')),
    };
    const mounted = await controllerHarness({
      fileOverrides: files,
      dialogOverrides: {
        chooseManifest: vi.fn(),
        saveManifest: vi.fn().mockResolvedValue('/exports/porta.json'),
        confirmApply: vi.fn(),
        showOneTimeClientSecret: vi.fn(),
      },
    });
    mounted.controller.handleCommand(portabilityCommand());
    await settle(12);
    mounted.getIntent()?.({ kind: 'export', request: exportRequest });
    await settle(12);

    expect(mounted.operations.exportManifest).toHaveBeenCalledOnce();
    expect(files.writeUtf8).toHaveBeenCalledOnce();
    const visibleState = JSON.stringify(mounted.states.at(-1));
    expect(visibleState).toContain('Could not save the export file.');
    expect(visibleState).not.toContain('/private/path');
    expect(visibleState).not.toMatch(/saved|success/i);
  });
});

describe('portability import workflow', () => {
  // Cancelling file choice preserves the current manifest; invalid local input is safe and cannot be applied.
  it.each([
    ['unreadable', vi.fn().mockRejectedValue(new Error('/secret/path: denied'))],
    ['oversized', vi.fn().mockRejectedValue(new Error('MAX_BYTES_EXCEEDED'))],
    ['malformed', vi.fn().mockResolvedValue('{not-json')],
  ])('should reject an %s manifest with safe feedback', async (_case, readUtf8) => {
    const mounted = await controllerHarness({
      fileOverrides: { readUtf8, writeUtf8: vi.fn() },
      dialogOverrides: {
        chooseManifest: vi.fn().mockResolvedValue('/imports/manifest.json'),
        saveManifest: vi.fn(),
        confirmApply: vi.fn(),
        showOneTimeClientSecret: vi.fn(),
      },
    });
    mounted.controller.handleCommand(portabilityCommand());
    await settle(12);
    mounted.getIntent()?.({ kind: 'choose-manifest' });
    await settle(12);

    expect(readUtf8).toHaveBeenCalledWith('/imports/manifest.json', 64 * 1024 * 1024);
    const visibleState = JSON.stringify(mounted.states.at(-1));
    expect(visibleState).toMatch(/could not read|too large|invalid manifest/i);
    expect(visibleState).not.toContain('/secret/path');
  });

  // Closing a file dialog is a no-op, so a previously selected reusable filename remains visible.
  it('should preserve the selected filename when file choice is cancelled', async () => {
    const mounted = await mount();
    mounted.workspace.setState({
      kind: 'ready',
      importSelection: { filename: 'existing.json', mode: 'keep-existing' },
    });
    await settle();
    const before = descendants(mounted.window).find(
      (view) =>
        view instanceof SelectableReadOnlyInput && view.getValueSignal().peek() === 'existing.json',
    );
    expect(before).toBeInstanceOf(Input);

    const chooseManifest = vi
      .fn()
      .mockResolvedValueOnce('/imports/existing.json')
      .mockResolvedValueOnce(undefined);
    const controller = await controllerHarness({ dialogOverrides: { chooseManifest } });
    controller.controller.handleCommand(portabilityCommand());
    await settle(12);
    controller.getIntent()?.({ kind: 'choose-manifest' });
    await settle(12);
    const selectedState = controller.states.at(-1);
    expect(JSON.stringify(selectedState)).toContain('existing.json');
    controller.getIntent()?.({ kind: 'choose-manifest' });
    await settle(12);
    expect(controller.states.at(-1)).toEqual(selectedState);
    expect(controller.files.readUtf8).toHaveBeenCalledOnce();
  });

  // A selected file and conflict mode do not authorize mutation until preview succeeds.
  it('should keep Apply disabled before a successful preview', async () => {
    const mounted = await mount();
    mounted.workspace.setState({
      kind: 'ready',
      importSelection: { filename: 'manifest.json', mode: 'keep-existing' },
    });
    await settle();

    expect(button(mounted.window, 'Apply').state.disabled).toBe(true);
  });

  // Any change to the selected file or mode invalidates the exact preview immediately.
  it.each([
    ['file', 'choose-manifest'],
    ['mode', 'set-import-mode'],
  ])('should clear a successful preview when the %s changes', async (_case, changeKind) => {
    const chooseManifest = vi
      .fn()
      .mockResolvedValueOnce('/imports/manifest.json')
      .mockResolvedValueOnce('/imports/changed.json');
    const mounted = await controllerHarness({ dialogOverrides: { chooseManifest } });
    mounted.controller.handleCommand(portabilityCommand());
    await settle(12);
    mounted.getIntent()?.({ kind: 'choose-manifest' });
    await settle(12);
    mounted.getIntent()?.({ kind: 'preview' });
    await settle(12);
    expect(JSON.stringify(mounted.states.at(-1))).toMatch(/organizations.*created.*1/i);

    if (changeKind === 'choose-manifest') {
      mounted.getIntent()?.({ kind: 'choose-manifest' });
    } else {
      mounted.getIntent()?.({ kind: 'set-import-mode', mode: 'update-existing' });
    }
    await settle(12);
    const invalidated = JSON.stringify(mounted.states.at(-1));
    expect(invalidated).not.toMatch(/organizations.*created.*1/i);
  });

  // Rejections are grouped in dependency order and keyboard focus begins at the earliest dependency.
  it('should order rejected preview groups and focus the first invalid dependency', async () => {
    const mounted = await mount();
    mounted.workspace.setState({
      kind: 'ready',
      importSelection: { filename: 'manifest.json', mode: 'keep-existing' },
      preview: {
        ...preview,
        errors: [
          {
            entity_type: 'users',
            natural_key: { organization_slug: organization.slug, email: 'user@example.test' },
            code: 'missing_dependency',
          },
          {
            entity_type: 'applications',
            natural_key: { slug: 'orders' },
            code: 'invalid_record',
          },
        ],
      },
    });
    await settle();

    const text = frameText(mounted.host);
    expect(text.indexOf('Applications')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('Users')).toBeGreaterThan(text.indexOf('Applications'));
    const focused = mounted.focused.at(-1);
    expect(focused).toBeDefined();
    const focusedRow = frameText(mounted.host).split('\n')[absoluteY(focused!)];
    expect(focusedRow).toMatch(/Applications|orders/i);
  });

  // Apply asks once, retains committed counts, and blocks dismissal while each one-time secret is shown in order.
  it('should confirm once and present every generated credential sequentially', async () => {
    const releases: Array<() => void> = [];
    const showOneTimeClientSecret = vi.fn(
      () => new Promise<void>((resolve) => releases.push(resolve)),
    );
    const applied = {
      ...preview,
      mode: 'keep-existing',
      summary: { organizations: emptyCounts, clients: { ...emptyCounts, created: 2 } },
      credentials: [
        {
          client_id: 'client-a',
          label: 'Imported credential',
          secret: 'secret-a',
          expires_at: '2027-09-14T00:00:00.000Z',
        },
        {
          client_id: 'client-b',
          label: 'Imported credential',
          secret: 'secret-b',
          expires_at: '2027-09-14T00:00:00.000Z',
        },
      ],
    };
    const mounted = await controllerHarness({
      dialogOverrides: {
        chooseManifest: vi.fn().mockResolvedValue('/imports/manifest.json'),
        saveManifest: vi.fn(),
        confirmApply: vi.fn().mockResolvedValue(true),
        showOneTimeClientSecret,
      },
    });
    mounted.operations.apply.mockResolvedValue(applied);
    mounted.controller.handleCommand(portabilityCommand());
    await settle(12);
    mounted.getIntent()?.({ kind: 'choose-manifest' });
    await settle(12);
    mounted.getIntent()?.({ kind: 'preview' });
    await settle(12);
    mounted.getIntent()?.({ kind: 'apply' });
    await settle(12);

    expect(mounted.dialogs.confirmApply).toHaveBeenCalledOnce();
    expect(mounted.operations.apply).toHaveBeenCalledOnce();
    expect(showOneTimeClientSecret).toHaveBeenCalledTimes(1);
    expect(showOneTimeClientSecret).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        clientName: 'client-a',
        clientId: 'client-a',
        plaintext: 'secret-a',
      }),
    );
    releases.shift()?.();
    await settle(12);
    expect(showOneTimeClientSecret).toHaveBeenCalledTimes(2);
    releases.shift()?.();
    await settle(12);

    const visibleState = JSON.stringify(mounted.states.at(-1));
    expect(visibleState).toMatch(/clients.*created.*2/i);
    expect(visibleState).not.toMatch(/secret-a|secret-b/);
  });

  // A credential-free result still leaves its committed summary visible for operator review.
  it('should retain successful counts when apply returns no credentials', async () => {
    const mounted = await mount();
    mounted.workspace.setState({
      kind: 'ready',
      importSelection: { filename: 'manifest.json', mode: 'keep-existing' },
      applied: {
        ...preview,
        mode: 'keep-existing',
        summary: { organizations: { ...emptyCounts, created: 1 } },
      },
    });
    await settle();

    expect(frameText(mounted.host)).toMatch(/Organizations.*1/i);
    expect(button(mounted.window, 'Close').state.disabled).toBe(false);
  });
});
