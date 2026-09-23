/** Operator-facing configuration and manifest dialogs remain usable through native controls. */
import { FileDialog } from '@jsvision/files';
import { Button, ComboBox, Commands, createApplication, Group, TabView, View } from '@jsvision/ui';
import type { ConfigEntry } from '@portaidentity/sdk';
import { describe, expect, it, vi } from 'vitest';
import { createAdminPresentation, ADMIN_COMMANDS } from '../../src/admin/presentation.js';
import { createAdminPortabilityController } from '../../src/admin/portability-controller.js';
import { createAdminPortabilityWorkspace } from '../../src/admin/portability-workspace.js';
import { validateAdminCapabilities } from '../../src/admin/session-service.js';
import type { AdminConnectionState } from '../../src/admin/state.js';
import { createAdminSystemConfigWorkspace } from '../../src/admin/system-config-workspace.js';

const capabilities = validateAdminCapabilities(
  ['porta-super-admin'],
  [
    'admin:export:read',
    'admin:import:write',
    'admin:org:read',
    'admin:app:read',
    'admin:role:read',
    'admin:permission:read',
    'admin:claim:read',
    'admin:user:read',
  ],
);
const state: AdminConnectionState = {
  kind: 'authenticated',
  server: new URL('https://porta.example.test'),
  identity: { sub: 'admin' },
  capabilities,
};
const locale: ConfigEntry = {
  key: 'default_locale',
  label: 'Default locale',
  description: 'Authentication locale fallback.',
  value: 'en',
  defaultValue: 'en',
  valueType: 'string',
  unit: 'locale',
  group: 'general',
  allowedValues: ['en', 'nl'],
  applicationMode: 'runtime',
  updatedAt: '2026-09-18T00:00:00Z',
};

/** Collect the actual hosted widgets rather than inspecting source text. */
function views(root: View): View[] {
  return [root, ...(root instanceof Group ? root.children.flatMap(views) : [])];
}
/** Allow mounted reactive controls and asynchronous commands to settle. */
async function settle(): Promise<void> {
  for (let index = 0; index < 20; index++) await Promise.resolve();
}

describe('configuration and portability usability', () => {
  it.each(['choose-manifest', 'preview', 'apply'] as const)(
    'keeps Import focus on an enabled control while %s is pending',
    async (pending) => {
      const host = createApplication({ viewport: { width: 100, height: 35 } });
      const focusView = vi.fn((view: View) => host.loop.focusView(view));
      const workspace = createAdminPortabilityWorkspace({
        capabilities,
        applications: [],
        onIntent: vi.fn(),
        focusView,
      });
      host.desktop.add(workspace.content);
      const pane = views(workspace.content).find((view) => view instanceof TabView);
      if (!(pane instanceof TabView)) throw new Error('Portability tabs missing');
      pane.active.set(1);
      workspace.setState({ kind: 'ready', pending });
      await settle();
      workspace.focusCurrent();
      const target = focusView.mock.calls.at(-1)?.[0];
      expect(target).toBeDefined();
      expect(target?.state.disabled).toBe(false);
      workspace.setState({ kind: 'ready' });
      await settle();
      workspace.focusCurrent();
      const restored = focusView.mock.calls.at(-1)?.[0];
      expect(restored).toBeInstanceOf(Button);
      expect(restored instanceof Button && restored.activation.label).toBe('Choose manifest…');
    },
  );
  it('gives System Configuration a unique S menu accelerator', () => {
    const presentation = createAdminPresentation(state, false, { width: 160, height: 45 });
    const item = presentation.menu.items.find(
      (entry) => 'command' in entry && entry.command === ADMIN_COMMANDS.systemConfig,
    );
    expect(item).toMatchObject({ title: '~S~ystem Configuration…' });
  });

  it('pads the configuration main surface by one cell', () => {
    const workspace = createAdminSystemConfigWorkspace({
      capabilities: { canReadConfig: true, canUpdateConfig: true },
      onIntent: vi.fn(),
    });
    workspace.setState({ kind: 'ready', entries: [locale] });
    expect(workspace.content.children[0]?.layout.padding).toBe(1);
  });

  it('offers only catalog locales and records a selected locale as a draft', async () => {
    const host = createApplication({ viewport: { width: 160, height: 45 } });
    const onIntent = vi.fn();
    const entries = [locale];
    const workspace = createAdminSystemConfigWorkspace({
      capabilities: { canReadConfig: true, canUpdateConfig: true },
      onIntent,
    });
    host.desktop.add(workspace.content);
    workspace.setState({ kind: 'ready', entries });
    const pane = views(workspace.content).find((view) => view instanceof TabView);
    if (!(pane instanceof TabView)) throw new Error('Configuration tabs missing');
    pane.active.set(3);
    await settle();
    const picker = views(workspace.content).find((view) => view instanceof ComboBox);
    expect(picker).toBeInstanceOf(ComboBox);
    if (!(picker instanceof ComboBox)) throw new Error('Locale picker missing');
    expect(picker.items.peek()).toEqual(['en', 'nl']);
    host.loop.focusView(picker.input);
    host.loop.dispatch({ type: 'key', key: 'x', ctrl: false, alt: false, shift: false });
    expect(picker.text.peek()).toBe('en');
    picker.value.set('nl');
    await settle();
    expect(onIntent).toHaveBeenCalledWith({ kind: 'set-draft', key: 'default_locale', text: 'nl' });
    workspace.setState({
      kind: 'ready',
      entries,
      drafts: { default_locale: 'nl' },
      busy: true,
    });
    expect(picker.state.disabled).toBe(true);
    expect(picker.value.peek()).toBe('nl');
  });

  it('defaults control-plane administrators to Entire environment and prevents a protected organization export', async () => {
    const host = createApplication({ viewport: { width: 110, height: 35 } });
    const onIntent = vi.fn();
    const workspace = createAdminPortabilityWorkspace({
      capabilities,
      applications: [],
      onIntent,
      organization: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Porta',
        slug: 'porta',
        status: 'active',
        isSuperAdmin: true,
      },
    });
    host.desktop.add(workspace.content);
    await settle();
    const action = views(workspace.content).find(
      (view) => view instanceof Button && view.activation.label === 'Export…',
    );
    if (!(action instanceof Button)) throw new Error('Export action missing');
    host.loop.focusView(action);
    host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
    expect(onIntent).toHaveBeenCalledWith({
      kind: 'export',
      request: expect.objectContaining({ scope: { kind: 'environment' } }),
    });
  });

  it.each(['Export is unavailable.', 'Could not save the export file.'] as const)(
    'shows %s on the Export page',
    async (feedback) => {
      const host = createApplication({ viewport: { width: 100, height: 30 } });
      const workspace = createAdminPortabilityWorkspace({
        capabilities,
        applications: [],
        onIntent: vi.fn(),
      });
      host.desktop.add(workspace.content);
      workspace.setState({ kind: 'ready', feedback });
      await settle();
      const pane = views(workspace.content).find((view) => view instanceof TabView);
      expect(pane instanceof TabView && pane.active.peek()).toBe(0);
      const rendered = host.loop.renderRoot
        .buffer()
        .rows()
        .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
        .join('\n');
      expect(rendered).toContain(feedback);
    },
  );

  it.each(['choose-manifest', 'export'] as const)(
    '%s uses a native file dialog without duplicate accelerators',
    async (kind) => {
      const host = createApplication({ viewport: { width: 100, height: 35 } });
      const exportManifest = vi
        .fn()
        .mockResolvedValue({ filename: 'environment.json', manifest: {} });
      const controller = createAdminPortabilityController({
        host,
        readState: () => state,
        readOperations: () => ({ exportManifest, preview: vi.fn(), apply: vi.fn() }),
        mountWorkspace: (content) => {
          if (content) host.desktop.add(content);
        },
      });
      controller.syncContext(state, 1);
      controller.handleCommand(ADMIN_COMMANDS.portability);
      await settle();
      const exec = vi.spyOn(host.loop, 'execView').mockResolvedValue(Commands.cancel);
      const pane = views(host.desktop).find((view) => view instanceof TabView);
      if (!(pane instanceof TabView)) throw new Error('Portability tabs missing');
      if (kind === 'choose-manifest') pane.active.set(1);
      await settle();
      const action = views(host.desktop).find(
        (view) =>
          'activation' in view &&
          typeof view.activation === 'object' &&
          view.activation !== null &&
          'label' in view.activation &&
          view.activation.label === (kind === 'export' ? 'Export…' : 'Choose manifest…'),
      );
      if (!action) throw new Error('Manifest action missing');
      host.loop.focusView(action);
      host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
      await settle();
      const dialog = exec.mock.calls[0]?.[0];
      expect(dialog).toBeInstanceOf(FileDialog);
      if (!(dialog instanceof FileDialog)) throw new Error('File dialog missing');
      const accelerators = views(dialog).flatMap((view) => [...view.accelerators()]);
      expect(new Set(accelerators).size).toBe(accelerators.length);
      expect(host.desktop.children).not.toContain(dialog);
    },
  );
});
