/** Global policy editing keeps native drafts across four DSL tabs and commits one changed-key batch. */
import {
  Button,
  createApplication,
  Dialog,
  Group,
  Input,
  MenuBar,
  ScrollBar,
  statusLine,
  TabView,
  View,
} from '@jsvision/ui';
import type { ConfigEntry, ConfigKey } from '@portaidentity/sdk';
import { describe, expect, it, vi } from 'vitest';

const fields: readonly (readonly [ConfigKey, string, number, number, number])[] = [
  ['access_token_ttl', 'Access token lifetime', 3600, 60, 86400],
  ['id_token_ttl', 'ID token lifetime', 3600, 60, 86400],
  ['refresh_token_ttl', 'Refresh token lifetime', 2592000, 300, 31536000],
  ['authorization_code_ttl', 'Authorization code lifetime', 600, 30, 3600],
  ['session_ttl', 'Session lifetime', 86400, 300, 2592000],
  ['magic_link_ttl', 'Magic-link lifetime', 900, 60, 3600],
  ['password_reset_ttl', 'Password-reset lifetime', 3600, 300, 86400],
  ['invitation_ttl', 'Invitation lifetime', 604800, 300, 2592000],
  ['rate_limit_login_max', 'Login attempt limit', 10, 1, 100],
  ['rate_limit_login_window', 'Login window', 900, 60, 86400],
  ['rate_limit_magic_link_max', 'Magic-link request limit', 5, 1, 100],
  ['rate_limit_magic_link_window', 'Magic-link request window', 900, 60, 86400],
  ['rate_limit_password_reset_max', 'Password-reset request limit', 5, 1, 100],
  ['rate_limit_password_reset_window', 'Password-reset request window', 900, 60, 86400],
  ['max_failed_logins', 'Failed login limit', 5, 1, 100],
  ['lockout_duration_seconds', 'Lockout duration', 900, 60, 604800],
  ['audit_retention_days', 'Audit retention', 90, 1, 3650],
];
const entries: readonly ConfigEntry[] = [
  ...fields.map(([key, label, value, minimum, maximum], index): ConfigEntry => ({
    key,
    label,
    value,
    defaultValue: value,
    minimum,
    maximum,
    description: `${label} operational policy.`,
    valueType: 'integer',
    unit:
      index === 16
        ? 'days'
        : key.endsWith('_max') || key === 'max_failed_logins'
          ? 'attempts'
          : 'seconds',
    group:
      index < 8 ? 'lifetimes' : index < 14 ? 'rate-limits' : index < 16 ? 'lockout' : 'general',
    applicationMode: index < 5 ? 'restart-required' : 'runtime',
    updatedAt: '2026-09-16T00:00:00.000Z',
  })),
  {
    key: 'default_locale',
    label: 'Default locale',
    value: 'en',
    defaultValue: 'en',
    description: 'Final locale fallback used by the authentication UI.',
    valueType: 'string',
    unit: 'locale',
    group: 'general',
    allowedValues: ['en'],
    applicationMode: 'runtime',
    updatedAt: '2026-09-16T00:00:00.000Z',
  },
];
type Intent =
  | { readonly kind: 'set-draft'; readonly key: ConfigKey; readonly text: string }
  | { readonly kind: 'save' | 'close' };
/** Observable mounted editor boundary, independent of the implementation's state types. */
interface Workspace {
  /** Real terminal window whose controls are inspected. */
  readonly content: View;
  /** Supplies authoritative entries and raw drafts to the editor. */
  setState(state: unknown): void;
  /** Selects a reachable control on the active page. */
  focusCurrent(): void;
}
/** Planned focused factory and measured viewport geometry. */
interface WorkspaceExports {
  /** Smallest viewport fitting the editor and application chrome. */
  readonly SYSTEM_CONFIG_MINIMUM_SIZE: { readonly width: number; readonly height: number };
  /** Builds the actual editor with explicit capabilities and closed intents. */
  createAdminSystemConfigWorkspace(options: {
    capabilities: Record<string, boolean>;
    onIntent(intent: Intent): void;
    focusView(view: View): void;
  }): Workspace;
}
/** Observable lifecycle boundary used to drive actual editor operations. */
interface Controller {
  /** Supplies the verified session and its ownership epoch. */
  syncContext(state: unknown, epoch: number): void;
  /** Opens the editor for its public command. */
  handleCommand(command: string): boolean;
  /** Sends an ordinary draft, save or close action. */
  handleIntent(intent: Intent): void;
}
/** Planned controller factory without implementation-owned dependency types. */
interface ControllerExports {
  /** Connects the real workspace to mocked external operations. */
  createAdminSystemConfigController(options: Record<string, unknown>): Controller;
}

/** Dynamic imports keep the oracle independent of implementation-owned state types. */
async function exportsForWorkspace(): Promise<WorkspaceExports> {
  return (await import('../../src/admin/system-config-workspace.js')) as WorkspaceExports;
}
/** Load the focused lifecycle seam, not a generic form framework. */
async function exportsForController(): Promise<ControllerExports> {
  return (await import('../../src/admin/system-config-controller.js')) as ControllerExports;
}
/** Collect real terminal widgets in display order. */
function views(root: View): View[] {
  return [root, ...(root instanceof Group ? root.children.flatMap(views) : [])];
}
/** Read actual visible terminal cells. */
function text(host: ReturnType<typeof createApplication>): string {
  return host.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}
/** Settle signal renders and direct asynchronous controller operations. */
async function settle(): Promise<void> {
  for (let index = 0; index < 12; index++) await Promise.resolve();
}
/** Select a named action through its public widget identity. */
function action(root: View, label: string): Button {
  const found = views(root).find(
    (view) => view instanceof Button && view.activation.label === label,
  );
  if (!(found instanceof Button)) throw new Error(`${label} action missing`);
  return found;
}
/** Select the one four-page editor. */
function tabs(root: View): TabView {
  const found = views(root).filter((view) => view instanceof TabView);
  if (found.length !== 1 || !(found[0] instanceof TabView))
    throw new Error('Expected one configuration tab pane');
  return found[0];
}
/** Use visible group order to locate an integer input without prescribing internal control identifiers. */
function input(root: View, index: number): Input {
  const found = views(root).filter((view) => view instanceof Input)[index];
  if (!(found instanceof Input)) throw new Error('Configuration input missing');
  return found;
}
/** Activate through the ordinary keyboard boundary. */
function press(host: ReturnType<typeof createApplication>, button: Button): void {
  host.loop.focusView(button);
  host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
}

/** Mount the actual editor at its feature-derived fitting size. */
async function mount(canUpdateConfig = true, loaded = entries) {
  const module = await exportsForWorkspace();
  const host = createApplication({
    viewport: module.SYSTEM_CONFIG_MINIMUM_SIZE,
    menuBar: new MenuBar(),
    statusLine: statusLine([]),
  });
  const intents: Intent[] = [];
  const workspace = module.createAdminSystemConfigWorkspace({
    capabilities: { canReadConfig: true, canUpdateConfig },
    onIntent: (intent) => intents.push(intent),
    focusView: (view) => host.loop.focusView(view),
  });
  host.desktop.add(workspace.content);
  workspace.setState({ kind: 'ready', entries: loaded });
  workspace.focusCurrent();
  await settle();
  if (!(workspace.content instanceof Dialog)) throw new Error('Configuration window missing');
  return {
    host,
    workspace,
    window: workspace.content,
    intents,
    minimum: module.SYSTEM_CONFIG_MINIMUM_SIZE,
  };
}

/** Real workspace/controller objects share only mocked external SDK operations and discard choice. */
async function lifecycle() {
  const module = await exportsForWorkspace();
  const host = createApplication({
    viewport: module.SYSTEM_CONFIG_MINIMUM_SIZE,
    menuBar: new MenuBar(),
    statusLine: statusLine([]),
  });
  const operations = {
    listConfig: vi.fn().mockResolvedValue({ kind: 'success', value: entries }),
    setConfigMany: vi.fn().mockResolvedValue({ kind: 'success', restartRequired: false }),
  };
  const dialogs = { confirmDiscard: vi.fn().mockResolvedValue(false) };
  const mounted: Array<View | null> = [];
  const state = {
    kind: 'authenticated',
    capabilities: { canReadConfig: true, canUpdateConfig: true },
    identity: { sub: 'admin' },
  };
  const controller = (await exportsForController()).createAdminSystemConfigController({
    host,
    readState: () => state,
    readOperations: () => operations,
    mountWorkspace: (content: View | null) => {
      mounted.push(content);
      if (content) host.desktop.add(content);
      else for (const child of [...host.desktop.children]) host.desktop.remove(child);
    },
    dialogs,
  });
  controller.syncContext(state, 1);
  const presentation = await import('../../src/admin/presentation.js');
  const command = (presentation.ADMIN_COMMANDS as Partial<Record<'systemConfig', string>>)
    .systemConfig;
  if (!command) throw new Error('System Configuration command missing');
  expect(controller.handleCommand(command)).toBe(true);
  await settle();
  const window = mounted.at(-1);
  if (!(window instanceof Dialog)) throw new Error('Configuration window was not mounted');
  return { host, operations, dialogs, mounted, controller, window };
}

describe('system configuration terminal workspace', () => {
  it('should open a fixed full-page window with four catalog-ordered tabs and one persistent footer', async () => {
    const mounted = await mount();
    expect(mounted.window.title()).toBe('System Configuration');
    expect(mounted.window.isZoomed()).toBe(true);
    expect(mounted.window.resizable).toBe(false);
    expect(mounted.window.zoomable).toBe(false);
    expect(
      tabs(mounted.window)
        .tabs.peek()
        .map((tab) => tab.title),
    ).toEqual(['Lifetimes', 'Rate limits', 'Lockout', 'General']);
    expect(
      views(mounted.window)
        .filter((view) => view instanceof Button)
        .map((view) => view.activation.label),
    ).toEqual(['Save', 'Cancel']);
    expect(views(mounted.window).some((view) => view instanceof ScrollBar)).toBe(false);
  });

  it('should fit full labels, inline help, bounded single-line inputs and DSL spacing at the measured minimum', async () => {
    const mounted = await mount();
    const pane = tabs(mounted.window);
    for (let index = 0; index < 4; index++) {
      pane.select(index);
      await settle();
      const page = pane.tabs.peek()[index]?.content;
      if (!page) throw new Error('Tab page missing');
      const group = ['lifetimes', 'rate-limits', 'lockout', 'general'][index];
      const expected = entries.filter((entry) => entry.group === group);
      for (const entry of expected) {
        expect(text(mounted.host)).toContain(entry.label);
        expect(text(mounted.host)).toContain(entry.unit);
        if (entry.minimum !== undefined)
          expect(text(mounted.host)).toContain(String(entry.minimum));
        if (entry.maximum !== undefined)
          expect(text(mounted.host)).toContain(String(entry.maximum));
      }
      const column = views(page).find(
        (view) =>
          view instanceof Group && view.layout.direction === 'col' && view.layout.padding === 1,
      );
      expect(column?.layout.gap).toBe(1);
      const inputs = views(page).filter((view) => view instanceof Input);
      for (const control of inputs) {
        expect(control.bounds.height).toBe(1);
        expect(control.bounds.width).toBeLessThan(mounted.minimum.width / 2);
        expect(control.layout.position).not.toBe('absolute');
        mounted.host.loop.focusView(control);
        expect(mounted.host.loop.getFocused()).toBe(control);
      }
      expect(text(mounted.host)).toContain('Save');
      expect(text(mounted.host)).toContain('Cancel');
    }
  });

  it.each(['width', 'height'] as const)(
    'should replace clipped controls with guidance one cell below minimum %s and preserve drafts',
    async (axis) => {
      const mounted = await mount();
      input(mounted.window, 0).getValueSignal().set('7200');
      await settle();
      mounted.host.loop.resize({ ...mounted.minimum, [axis]: mounted.minimum[axis] - 1 });
      await settle();
      expect(text(mounted.host)).toMatch(/resize|larger|increase/i);
      expect(
        views(mounted.window).filter(
          (view) => view instanceof Input && view.bounds.width > 0 && view.bounds.height > 0,
        ),
      ).toHaveLength(0);
      mounted.host.loop.resize(mounted.minimum);
      await settle();
      expect(input(mounted.window, 0).getValueSignal().peek()).toBe('7200');
    },
  );

  it('should keep clean and equivalent values unsaveable, invalid drafts dirty and valid drafts across tabs', async () => {
    const mounted = await lifecycle();
    expect(action(mounted.window, 'Save').state.disabled).toBe(true);
    const access = input(mounted.window, 0);
    for (const value of ['', '1.5', '59', 'invalid']) {
      access.getValueSignal().set(value);
      await settle();
      expect(action(mounted.window, 'Save').state.disabled).toBe(true);
    }
    access.getValueSignal().set('03600');
    await settle();
    expect(action(mounted.window, 'Save').state.disabled).toBe(true);
    access.getValueSignal().set('7200');
    await settle();
    tabs(mounted.window).select(1);
    await settle();
    input(tabs(mounted.window).tabs.peek()[1]!.content, 0).getValueSignal().set('20');
    await settle();
    tabs(mounted.window).select(0);
    await settle();
    expect(input(mounted.window, 0).getValueSignal().peek()).toBe('7200');
    expect(action(mounted.window, 'Save').state.disabled).toBe(false);
  });

  it('should save one changed-key native batch, block duplicate saves and close while busy, then reload authoritative values', async () => {
    const mounted = await lifecycle();
    let release: ((value: { kind: 'success'; restartRequired: boolean }) => void) | undefined;
    mounted.operations.setConfigMany.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    input(mounted.window, 0).getValueSignal().set('7200');
    await settle();
    tabs(mounted.window).select(1);
    await settle();
    input(tabs(mounted.window).tabs.peek()[1]!.content, 0).getValueSignal().set('20');
    await settle();
    press(mounted.host, action(mounted.window, 'Save'));
    press(mounted.host, action(mounted.window, 'Save'));
    mounted.controller.handleIntent({ kind: 'close' });
    await settle();
    expect(mounted.operations.setConfigMany).toHaveBeenCalledExactlyOnceWith({
      access_token_ttl: 7200,
      rate_limit_login_max: 20,
    });
    expect(mounted.mounted.at(-1)).not.toBeNull();
    mounted.operations.listConfig.mockResolvedValue({
      kind: 'success',
      value: entries.map((entry) => ({
        ...entry,
        value:
          entry.key === 'access_token_ttl'
            ? 7200
            : entry.key === 'rate_limit_login_max'
              ? 20
              : entry.value,
      })),
    });
    release?.({ kind: 'success', restartRequired: true });
    await settle();
    expect(mounted.operations.listConfig).toHaveBeenCalledTimes(2);
    expect(action(mounted.window, 'Save').state.disabled).toBe(true);
    expect(text(mounted.host)).toMatch(/every|all/i);
    expect(text(mounted.host)).toMatch(/Porta.*server.*restart|restart.*Porta.*server/i);
  });

  it('should show ordinary runtime success without a startup restart warning', async () => {
    const mounted = await lifecycle();
    input(mounted.window, 5).getValueSignal().set('1200');
    await settle();
    mounted.operations.listConfig.mockResolvedValue({
      kind: 'success',
      value: entries.map((entry) => ({
        ...entry,
        value: entry.key === 'magic_link_ttl' ? 1200 : entry.value,
      })),
    });
    press(mounted.host, action(mounted.window, 'Save'));
    await settle();
    expect(mounted.operations.setConfigMany).toHaveBeenCalledWith({ magic_link_ttl: 1200 });
    expect(text(mounted.host)).toMatch(/saved|success/i);
    expect(text(mounted.host)).not.toMatch(/every.*restart|restart.*every/i);
  });

  it('should close cleanly without confirmation and require one discard choice for dirty drafts', async () => {
    const clean = await lifecycle();
    clean.controller.handleIntent({ kind: 'close' });
    await settle();
    expect(clean.dialogs.confirmDiscard).not.toHaveBeenCalled();
    expect(clean.mounted.at(-1)).toBeNull();
    const dirty = await lifecycle();
    input(dirty.window, 0).getValueSignal().set('7200');
    await settle();
    dirty.controller.handleIntent({ kind: 'close' });
    await settle();
    expect(dirty.dialogs.confirmDiscard).toHaveBeenCalledOnce();
    expect(dirty.mounted.at(-1)).not.toBeNull();
    dirty.dialogs.confirmDiscard.mockResolvedValue(true);
    dirty.controller.handleIntent({ kind: 'close' });
    await settle();
    expect(dirty.mounted.at(-1)).toBeNull();
  });

  it.each([
    [60, '1 minute'],
    [900, '15 minutes'],
    [3600, '1 hour'],
    [604800, '7 days'],
    [61, '61 seconds'],
  ] as const)(
    'should show exact seconds %s alongside whole-unit duration %s',
    async (seconds, duration) => {
      const fieldIndex = seconds === 604800 ? 7 : 5;
      const key = fields[fieldIndex]?.[0];
      const mounted = await mount(
        true,
        entries.map((entry) => (entry.key === key ? { ...entry, value: seconds } : entry)),
      );
      expect(input(mounted.window, fieldIndex).getValueSignal().peek()).toBe(String(seconds));
      expect(text(mounted.host)).toContain(duration);
    },
  );

  it('should render read-only values but never enable Save without update permission', async () => {
    const mounted = await mount(false);
    input(mounted.window, 0).getValueSignal().set('7200');
    await settle();
    expect(text(mounted.host)).toContain('Access token lifetime');
    expect(action(mounted.window, 'Save').state.disabled).toBe(true);
  });
});
