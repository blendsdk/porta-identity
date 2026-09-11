/** Observable specifications for selected-organization settings and branding administration. */

import {
  Button,
  CheckGroup,
  ComboBox,
  createApplication,
  Dialog,
  Group,
  Input,
  RadioGroup,
  TabView,
  View,
} from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import { ADMIN_COMMANDS, createAdminPresentation } from '../../src/admin/presentation.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const organization = {
  id: organizationId,
  name: 'Example Organization',
  slug: 'example-organization',
  status: 'active' as const,
  isSuperAdmin: false,
  defaultLocale: 'en',
  defaultLoginMethods: ['password'] as const,
  twoFactorPolicy: 'optional' as const,
  brandingCompanyName: 'Example Company',
  brandingPrimaryColor: '#336699',
  brandingLogoUrl: 'https://cdn.example.test/logo.png',
  brandingFaviconUrl: 'https://cdn.example.test/favicon.ico',
  createdAt: '2026-01-02T03:04:00.000Z',
  updatedAt: '2026-08-09T10:11:00.000Z',
};
const logo = {
  assetType: 'logo' as const,
  contentType: 'image/png',
  size: 1024,
  updatedAt: '2026-08-10T11:12:00.000Z',
};
const capabilities = {
  canReadOrganizations: true,
  canCreateOrganizations: false,
  canUpdateOrganizations: true,
  canSuspendOrganizations: true,
  canDeleteOrganizations: false,
};

type OrganizationIntent =
  | { readonly kind: 'save-overview'; readonly input: Record<string, unknown> }
  | { readonly kind: 'activate' | 'suspend' }
  | {
      readonly kind: 'save-authentication';
      readonly loginMethods: readonly ('password' | 'magic_link')[];
      readonly twoFactorPolicy: string;
    }
  | { readonly kind: 'save-branding'; readonly input: Record<string, unknown> }
  | { readonly kind: 'upload-asset' | 'remove-asset'; readonly assetType: 'logo' | 'favicon' };

interface Workspace {
  readonly content: View;
  setState(state: unknown): void;
  focusCurrent(): void;
}

interface WorkspaceExports {
  createAdminOrganizationWorkspace(options: {
    readonly capabilities: typeof capabilities;
    readonly onIntent: (intent: OrganizationIntent) => void;
    readonly focusView: (view: View) => void;
  }): Workspace;
}

interface Controller {
  syncContext(state: unknown, epoch: number): void;
  handleCommand(command: string): boolean;
  handleIntent(intent: OrganizationIntent): void;
}

interface ControllerExports {
  createAdminOrganizationController(options: Record<string, unknown>): Controller;
}

/** Loads the planned workspace seam without coupling this oracle to implementation types. */
async function workspaceExports(): Promise<WorkspaceExports> {
  return (await import('../../src/admin/organization-workspace.js')) as WorkspaceExports;
}

/** Loads the planned controller seam without importing an implementation-owned state model. */
async function controllerExports(): Promise<ControllerExports> {
  return (await import('../../src/admin/organization-controller.js')) as ControllerExports;
}

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

/** Reads all visible characters from a real headless terminal frame. */
function frameText(host: ReturnType<typeof createApplication>): string {
  return host.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

/** Allows reactive rebuilding and controller continuations to settle. */
async function settle(rounds = 4): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

/** Returns a visible action or fails with a focused message. */
function button(root: View, label: string): Button {
  const found = descendants(root)
    .filter((view) => view instanceof Button)
    .find((candidate) => candidate.activation.label === label);
  if (!found) throw new Error(`${label} action missing.`);
  return found;
}

/** Activates a control through the ordinary keyboard path. */
function activate(host: ReturnType<typeof createApplication>, action: Button): void {
  host.loop.focusView(action);
  host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
}

/** Selects a tab through the public TabView API and lets its page render. */
async function selectTab(host: ReturnType<typeof createApplication>, tabs: TabView, index: number) {
  tabs.select(index);
  host.loop.focusView(tabs.strip);
  await settle();
}

/** Mounts the planned workspace on the actual administration presentation. */
async function mount(
  overrides: Record<string, unknown> = {},
  width = 80,
  height = 24,
  granted = capabilities,
) {
  const intents: OrganizationIntent[] = [];
  const presentation = createAdminPresentation(
    {
      kind: 'authenticated',
      server: new URL('https://porta.example.test'),
      identity: { sub: 'administrator' },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
      },
      capabilities: granted,
    } as never,
    false,
    { width, height },
  );
  const host = createApplication({
    content: presentation.content,
    menuBar: presentation.menu,
    statusLine: presentation.status,
    viewport: { width, height },
  });
  const workspace = (await workspaceExports()).createAdminOrganizationWorkspace({
    capabilities: granted,
    onIntent: (intent) => intents.push(intent),
    focusView: (view) => host.loop.focusView(view),
  });
  presentation.setWorkspace(workspace.content);
  workspace.setState({ kind: 'ready', organization, assets: [], ...overrides });
  workspace.focusCurrent();
  await settle();
  if (!(workspace.content instanceof Dialog)) throw new Error('Organization window missing.');
  return { host, intents, window: workspace.content, workspace };
}

/** Returns the single organization tab view from a mounted workspace. */
function organizationTabs(root: View): TabView {
  const tabs = descendants(root).filter((view) => view instanceof TabView);
  if (tabs.length !== 1 || !(tabs[0] instanceof TabView)) {
    throw new Error('Expected one organization tab view.');
  }
  return tabs[0];
}

/** Returns the planned menu command without prescribing its internal command string. */
function manageOrganizationCommand(): string {
  const command = (ADMIN_COMMANDS as Partial<Record<'manageOrganization', string>>)
    .manageOrganization;
  if (!command) throw new Error('Manage current organization command missing.');
  return command;
}

describe('organization workspace access and composition', () => {
  it('publishes the stable Manage current organization command', async () => {
    expect(manageOrganizationCommand()).toEqual(expect.any(String));
  });

  it.each([
    ['no selected organization', undefined, capabilities],
    [
      'no organization read capability',
      organization,
      { ...capabilities, canReadOrganizations: false },
    ],
  ])('keeps Manage current organization visible-disabled for %s', (_case, selected, granted) => {
    const presentation = createAdminPresentation(
      {
        kind: 'authenticated',
        server: new URL('https://porta.example.test'),
        identity: { sub: 'administrator' },
        ...(selected ? { organization: selected } : {}),
        capabilities: granted,
      } as never,
      false,
      { width: 80, height: 24 },
    );
    const host = createApplication({
      content: presentation.content,
      menuBar: presentation.menu,
      statusLine: presentation.status,
      viewport: { width: 80, height: 24 },
    });
    host.loop.dispatch({ type: 'key', key: 'o', ctrl: false, alt: true, shift: false });
    const text = frameText(host);

    expect(text).toMatch(/Manage current organization(?:…|\.\.\.)/);
    expect(text).toMatch(/requires organization read|select an organization/i);
  });

  it.each([
    [80, 24],
    [49, 19],
  ])('uses one fixed maximized Layout DSL surface at %ix%i', async (width, height) => {
    const mounted = await mount({}, width, height);
    const tabs = organizationTabs(mounted.window);

    expect(mounted.window.title()).toMatch(/Example Organization.*Organization/i);
    expect(mounted.window.isZoomed()).toBe(true);
    expect(mounted.window.closable).toBe(true);
    expect(mounted.window.resizable).toBe(false);
    expect(mounted.window.zoomable).toBe(false);
    expect(tabs.tabs.peek().map((tab) => tab.title)).toEqual([
      'Overview',
      'Authentication',
      'Branding',
    ]);
    expect(
      descendants(mounted.window)
        .filter(
          (view) =>
            view instanceof Button ||
            view instanceof CheckGroup ||
            view instanceof ComboBox ||
            view instanceof Input ||
            view instanceof RadioGroup ||
            view instanceof TabView,
        )
        .every((view) => view.layout.position !== 'absolute'),
    ).toBe(true);
    expect(frameText(mounted.host)).toContain('Overview');
    await selectTab(mounted.host, tabs, 1);
    expect(frameText(mounted.host)).toContain('Save');
    await selectTab(mounted.host, tabs, 2);
    expect(frameText(mounted.host)).toMatch(/Logo.*Add|Add.*Logo/s);
    expect(frameText(mounted.host)).toMatch(/Favicon.*Add|Add.*Favicon/s);
  });
});

describe('organization overview', () => {
  it('renders immutable identity, lifecycle, and human-readable UTC timestamps', async () => {
    const mounted = await mount();
    const text = frameText(mounted.host);

    expect(text).toContain(organization.id);
    expect(text).toContain(organization.slug);
    expect(text).toContain('ACTIVE');
    expect(text).toContain('02 Jan 2026, 03:04 UTC');
    expect(text).toContain('09 Aug 2026, 10:11 UTC');
    const overview = organizationTabs(mounted.window).tabs.peek()[0]?.content;
    if (!overview) throw new Error('Overview page missing.');
    const views = descendants(overview);
    const comboInputs = new Set(
      views.filter((view) => view instanceof ComboBox).map((combo) => combo.input),
    );
    expect(
      views.filter((view) => view instanceof Input && !comboInputs.has(view)),
    ).toHaveLength(1);
    expect(button(mounted.window, 'Save').state.disabled).toBe(true);
  });

  it('preserves an unknown valid locale until an explicit English selection', async () => {
    const mounted = await mount({
      organization: { ...organization, defaultLocale: 'fy-NL' },
    });
    const combo = descendants(mounted.window).find((view) => view instanceof ComboBox);
    if (!(combo instanceof ComboBox)) throw new Error('Locale selector missing.');

    expect(combo.text.peek()).toBe('fy-NL');
    expect(frameText(mounted.host)).toMatch(/unsupported/i);
    expect(button(mounted.window, 'Save').state.disabled).toBe(true);
    const english = combo.items
      .peek()
      .find((item) => JSON.stringify(item).toLowerCase().includes('en'));
    if (!english) throw new Error('English locale choice missing.');
    combo.value.set(english);
    await settle();
    expect(button(mounted.window, 'Save').state.disabled).toBe(false);
    activate(mounted.host, button(mounted.window, 'Save'));
    expect(mounted.intents).toContainEqual({
      kind: 'save-overview',
      input: { defaultLocale: 'en' },
    });
  });

  it('enables Save only for valid changes and disables editing without update capability', async () => {
    const mounted = await mount();
    const name = descendants(mounted.window).find((view) => view instanceof Input);
    if (!(name instanceof Input)) throw new Error('Organization name input missing.');
    const save = button(mounted.window, 'Save');

    name.getValueSignal().set('');
    await settle();
    expect(save.state.disabled).toBe(true);
    name.getValueSignal().set('Renamed Organization');
    await settle();
    expect(save.state.disabled).toBe(false);
    activate(mounted.host, save);
    expect(mounted.intents).toContainEqual({
      kind: 'save-overview',
      input: { name: 'Renamed Organization' },
    });

    const denied = await mount({}, 80, 24, {
      ...capabilities,
      canUpdateOrganizations: false,
    });
    expect(descendants(denied.window).find((view) => view instanceof Input)?.focusable).toBe(false);
    expect(descendants(denied.window).find((view) => view instanceof ComboBox)?.focusable).toBe(
      false,
    );
    expect(button(denied.window, 'Save').state.disabled).toBe(true);
  });

  it('keeps lifecycle separate and explains every disabled Suspend action', async () => {
    const ordinary = await mount();
    expect(button(ordinary.window, 'Suspend').state.disabled).toBe(false);

    const protectedOrg = await mount({ organization: { ...organization, isSuperAdmin: true } });
    expect(button(protectedOrg.window, 'Suspend').state.disabled).toBe(true);
    expect(frameText(protectedOrg.host)).toMatch(/control-plane|super-admin.*cannot be suspended/i);

    const denied = await mount({}, 80, 24, {
      ...capabilities,
      canSuspendOrganizations: false,
    });
    expect(button(denied.window, 'Suspend').state.disabled).toBe(true);
    expect(frameText(denied.host)).toMatch(/requires organization suspend/i);

    const suspended = await mount({ organization: { ...organization, status: 'suspended' } });
    expect(button(suspended.window, 'Activate').state.disabled).toBe(false);
  });
});

describe('organization authentication', () => {
  it('edits password and magic link independently and never saves an empty set', async () => {
    const mounted = await mount();
    const tabs = organizationTabs(mounted.window);
    await selectTab(mounted.host, tabs, 1);
    const page = tabs.tabs.peek()[1]?.content;
    if (!page) throw new Error('Authentication page missing.');
    const methods = descendants(page).find((view) => view instanceof CheckGroup);
    const policy = descendants(page).find((view) => view instanceof RadioGroup);
    if (!(methods instanceof CheckGroup) || !(policy instanceof RadioGroup)) {
      throw new Error('Authentication controls missing.');
    }
    const save = button(page, 'Save');

    expect(frameText(mounted.host)).toContain('[X] Password');
    expect(frameText(mounted.host)).toContain('[ ] Magic link');
    expect(save.state.disabled).toBe(true);
    mounted.host.loop.focusView(methods);
    mounted.host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
    await settle();
    expect(save.state.disabled).toBe(true);
    expect(frameText(mounted.host)).toMatch(/select at least one login method/i);
    mounted.host.loop.dispatch({ type: 'key', key: 'down', ctrl: false, alt: false, shift: false });
    mounted.host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
    await settle();
    expect(save.state.disabled).toBe(false);
    activate(mounted.host, save);
    expect(mounted.intents).toContainEqual({
      kind: 'save-authentication',
      loginMethods: ['magic_link'],
      twoFactorPolicy: 'optional',
    });
  });

  it('explains client inheritance and limits organization-wide 2FA to password login', async () => {
    const mounted = await mount();
    await selectTab(mounted.host, organizationTabs(mounted.window), 1);
    const text = frameText(mounted.host);

    expect(text).toMatch(/clients?.*inherit/i);
    expect(text).toMatch(/organization-wide.*password/i);
    expect(text).toMatch(/magic link.*(?:no|without).*(?:OTP|TOTP)/i);
  });
});

describe('organization branding', () => {
  it('validates only the four approved text settings and omits custom CSS', async () => {
    const mounted = await mount();
    const tabs = organizationTabs(mounted.window);
    await selectTab(mounted.host, tabs, 2);
    const page = tabs.tabs.peek()[2]?.content;
    if (!page) throw new Error('Branding page missing.');
    const inputs = descendants(page).filter((view) => view instanceof Input);
    const save = button(page, 'Save');

    expect(inputs).toHaveLength(4);
    expect(frameText(mounted.host)).not.toMatch(/custom css/i);
    expect(save.state.disabled).toBe(true);
    inputs[1]?.getValueSignal().set('blue');
    await settle();
    expect(save.state.disabled).toBe(true);
    inputs[1]?.getValueSignal().set('#112233');
    await settle();
    expect(save.state.disabled).toBe(false);
    activate(mounted.host, save);
    expect(mounted.intents).toContainEqual({
      kind: 'save-branding',
      input: { primaryColor: '#112233' },
    });
  });

  it('always renders Logo and Favicon rows and changes Add to Replace when metadata exists', async () => {
    const empty = await mount();
    await selectTab(empty.host, organizationTabs(empty.window), 2);
    expect(frameText(empty.host)).toMatch(/Logo.*Add|Add.*Logo/s);
    expect(frameText(empty.host)).toMatch(/Favicon.*Add|Add.*Favicon/s);

    const populated = await mount({ assets: [logo] });
    await selectTab(populated.host, organizationTabs(populated.window), 2);
    const text = frameText(populated.host);
    expect(text).toContain('image/png');
    expect(text).toMatch(/1(?:\.0)? KiB/);
    expect(text).toContain('10 Aug 2026, 11:12 UTC');
    expect(text).toContain('Replace');
    expect(text).toContain('Remove');
  });
});

describe('organization controller request semantics', () => {
  /** Creates a controller harness around direct operations and an observable workspace. */
  async function harness(
    operationOverrides: Record<string, unknown> = {},
    controllerOverrides: Record<string, unknown> = {},
  ) {
    let state: Record<string, unknown> = {
      kind: 'authenticated',
      server: new URL('https://porta.example.test'),
      identity: { sub: 'administrator' },
      organization,
      capabilities,
    };
    let intent: ((value: OrganizationIntent) => void) | undefined;
    const states: unknown[] = [];
    const mounted: Array<View | null> = [];
    const workspace = {
      content: new Group(),
      setState: vi.fn((value: unknown) => states.push(value)),
      focusCurrent: vi.fn(),
    };
    const operations = {
      get: vi.fn().mockResolvedValue({ kind: 'success', value: organization }),
      update: vi.fn().mockResolvedValue({ kind: 'success' }),
      activate: vi.fn().mockResolvedValue({ kind: 'success' }),
      suspend: vi.fn().mockResolvedValue({ kind: 'success' }),
      getLoginMethods: vi.fn().mockResolvedValue({
        kind: 'success',
        value: ['password'],
      }),
      updateLoginMethods: vi.fn().mockResolvedValue({ kind: 'success' }),
      getTwoFactorPolicy: vi.fn().mockResolvedValue({ kind: 'success', value: 'optional' }),
      updateTwoFactorPolicy: vi.fn().mockResolvedValue({ kind: 'success' }),
      getBranding: vi.fn().mockResolvedValue({
        kind: 'success',
        value: {
          companyName: organization.brandingCompanyName,
          primaryColor: organization.brandingPrimaryColor,
          logoUrl: organization.brandingLogoUrl,
          faviconUrl: organization.brandingFaviconUrl,
        },
      }),
      updateBranding: vi.fn().mockResolvedValue({ kind: 'success' }),
      listAssets: vi.fn().mockResolvedValue({ kind: 'success', value: [] }),
      uploadAsset: vi.fn().mockResolvedValue({ kind: 'success' }),
      deleteAsset: vi.fn().mockResolvedValue({ kind: 'success' }),
      ...operationOverrides,
    };
    const requestAuthentication = vi.fn();
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const controller = (await controllerExports()).createAdminOrganizationController({
      host,
      readState: () => state,
      readOperations: () => operations,
      mountWorkspace: (content: View | null) => mounted.push(content),
      requestAuthentication,
      workspaceFactory: (options: { onIntent(value: OrganizationIntent): void }) => {
        intent = options.onIntent;
        return workspace;
      },
      ...controllerOverrides,
    });
    controller.syncContext(state, 1);
    return {
      controller,
      getIntent: () => intent,
      host,
      mounted,
      operations,
      requestAuthentication,
      setState: (next: Record<string, unknown>) => {
        state = next;
      },
      states,
      workspace,
    };
  }

  it('opens once only when selection and read capability are present', async () => {
    const mounted = await harness();
    expect(mounted.controller.handleCommand(manageOrganizationCommand())).toBe(true);
    await settle(12);
    expect(mounted.operations.get).toHaveBeenCalledOnce();
    expect(mounted.operations.get).toHaveBeenCalledWith(organizationId, expect.any(AbortSignal));
    expect(mounted.mounted.filter(Boolean)).toHaveLength(1);

    const absent = await harness();
    absent.setState({
      kind: 'authenticated',
      server: new URL('https://porta.example.test'),
      identity: { sub: 'administrator' },
      capabilities,
    });
    absent.controller.syncContext(
      {
        kind: 'authenticated',
        server: new URL('https://porta.example.test'),
        identity: { sub: 'administrator' },
        capabilities,
      },
      2,
    );
    expect(absent.controller.handleCommand(manageOrganizationCommand())).toBe(true);
    await settle();
    expect(absent.operations.get).not.toHaveBeenCalled();

    const denied = await harness();
    const deniedState = {
      kind: 'authenticated',
      server: new URL('https://porta.example.test'),
      identity: { sub: 'administrator' },
      organization,
      capabilities: { ...capabilities, canReadOrganizations: false },
    };
    denied.setState(deniedState);
    denied.controller.syncContext(deniedState, 2);
    expect(denied.controller.handleCommand(manageOrganizationCommand())).toBe(true);
    await settle();
    expect(denied.operations.get).not.toHaveBeenCalled();
  });

  it.each([
    [
      'only login methods',
      { loginMethods: ['password', 'magic_link'], twoFactorPolicy: 'optional' },
      1,
      0,
    ],
    ['only two-factor policy', { loginMethods: ['password'], twoFactorPolicy: 'required' }, 0, 1],
    [
      'both resources',
      { loginMethods: ['magic_link'], twoFactorPolicy: 'required' },
      1,
      1,
    ],
  ])('sends %s sequentially without validators or retries', async (_case, values, methods, policy) => {
    const mounted = await harness();
    mounted.controller.handleCommand(manageOrganizationCommand());
    await settle(12);
    mounted.getIntent()?.({ kind: 'save-authentication', ...values } as OrganizationIntent);
    await settle(12);

    expect(mounted.operations.updateLoginMethods).toHaveBeenCalledTimes(methods);
    expect(mounted.operations.updateTwoFactorPolicy).toHaveBeenCalledTimes(policy);
    for (const call of [
      ...mounted.operations.updateLoginMethods.mock.calls,
      ...mounted.operations.updateTwoFactorPolicy.mock.calls,
    ]) {
      expect(call).not.toEqual(expect.arrayContaining([expect.stringMatching(/etag/i)]));
    }
  });

  it('reloads both authentication resources once after a second-request failure', async () => {
    const updateLoginMethods = vi.fn().mockResolvedValue({ kind: 'success' });
    const updateTwoFactorPolicy = vi.fn().mockResolvedValue({
      kind: 'failure',
      failure: 'unavailable',
    });
    const mounted = await harness({ updateLoginMethods, updateTwoFactorPolicy });
    mounted.controller.handleCommand(manageOrganizationCommand());
    await settle(12);
    vi.clearAllMocks();
    mounted.getIntent()?.({
      kind: 'save-authentication',
      loginMethods: ['magic_link'],
      twoFactorPolicy: 'required',
    });
    await settle(16);

    expect(updateLoginMethods).toHaveBeenCalledOnce();
    expect(updateTwoFactorPolicy).toHaveBeenCalledOnce();
    expect(mounted.operations.getLoginMethods).toHaveBeenCalledOnce();
    expect(mounted.operations.getTwoFactorPolicy).toHaveBeenCalledOnce();
    expect(JSON.stringify(mounted.states.at(-1))).toMatch(/Service unavailable|unavailable/i);
  });

  it('keeps Suspend by default, then suspends once and reloads the selected organization', async () => {
    const mounted = await harness();
    mounted.controller.handleCommand(manageOrganizationCommand());
    await settle(12);
    vi.clearAllMocks();

    mounted.getIntent()?.({ kind: 'suspend' });
    await settle();
    const first = mounted.host.desktop.activeWindow();
    if (!(first instanceof Dialog)) throw new Error('Suspend confirmation missing.');
    expect((mounted.host.loop.getFocused() as Button).activation.label).toBe('Keep');
    activate(mounted.host, button(first, 'Keep'));
    await settle();
    expect(mounted.operations.suspend).not.toHaveBeenCalled();

    mounted.getIntent()?.({ kind: 'suspend' });
    await settle();
    const second = mounted.host.desktop.activeWindow();
    if (!(second instanceof Dialog)) throw new Error('Suspend confirmation missing.');
    activate(mounted.host, button(second, 'Suspend'));
    await settle(12);
    expect(mounted.operations.suspend).toHaveBeenCalledOnce();
    expect(mounted.operations.get).toHaveBeenCalledOnce();
  });

  it('uses the native picker, validates decoded bytes, uploads immediately, and reloads metadata', async () => {
    const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const openFile = vi.fn().mockResolvedValue('/tmp/brand.png');
    const readFile = vi.fn().mockResolvedValue(bytes);
    const mounted = await harness({}, { openFile, readFile });
    mounted.controller.handleCommand(manageOrganizationCommand());
    await settle(12);
    vi.clearAllMocks();
    mounted.getIntent()?.({ kind: 'upload-asset', assetType: 'logo' });
    await settle(16);

    expect(openFile).toHaveBeenCalledOnce();
    for (const type of ['png', 'jpeg', 'webp', 'ico', 'svg']) {
      expect(JSON.stringify(openFile.mock.calls[0])).toMatch(new RegExp(type, 'i'));
    }
    expect(readFile).toHaveBeenCalledWith('/tmp/brand.png');
    expect(mounted.operations.uploadAsset).toHaveBeenCalledOnce();
    expect(mounted.operations.uploadAsset).toHaveBeenCalledWith(
      organizationId,
      'logo',
      { contentType: 'image/png', data: Buffer.from(bytes).toString('base64') },
      expect.any(AbortSignal),
    );
    expect(mounted.operations.listAssets).toHaveBeenCalledOnce();
  });

  it.each([
    ['picker cancellation', undefined, undefined],
    ['unsupported type', '/tmp/brand.gif', Uint8Array.from([71, 73, 70, 56])],
    ['oversized logo', '/tmp/brand.png', new Uint8Array(2 * 1024 * 1024 + 1)],
  ])('keeps %s local and mutation-free', async (_case, picked, bytes) => {
    const mounted = await harness(
      {},
      {
        openFile: vi.fn().mockResolvedValue(picked),
        readFile: vi.fn().mockResolvedValue(bytes),
      },
    );
    mounted.controller.handleCommand(manageOrganizationCommand());
    await settle(12);
    vi.clearAllMocks();
    mounted.getIntent()?.({ kind: 'upload-asset', assetType: 'logo' });
    await settle(16);

    expect(mounted.operations.uploadAsset).not.toHaveBeenCalled();
    const published = JSON.stringify(mounted.states);
    if (picked === undefined) expect(published).not.toMatch(/cancel|failure|error/i);
    else expect(published).toMatch(bytes && bytes.length > 2 * 1024 * 1024 ? /size/i : /type/i);
    expect(published).not.toContain('/tmp/brand');
  });

  it('removes only after confirmation and restores focus to the launcher', async () => {
    const mounted = await harness();
    mounted.controller.handleCommand(manageOrganizationCommand());
    await settle(12);
    vi.clearAllMocks();
    mounted.getIntent()?.({ kind: 'remove-asset', assetType: 'logo' });
    await settle();
    const dialog = mounted.host.desktop.activeWindow();
    if (!(dialog instanceof Dialog)) throw new Error('Remove confirmation missing.');
    const keep = button(dialog, 'Keep');
    expect((mounted.host.loop.getFocused() as Button).activation.label).toBe('Keep');
    activate(mounted.host, keep);
    await settle();
    expect(mounted.operations.deleteAsset).not.toHaveBeenCalled();

    mounted.getIntent()?.({ kind: 'remove-asset', assetType: 'logo' });
    await settle();
    const confirm = mounted.host.desktop.activeWindow();
    if (!(confirm instanceof Dialog)) throw new Error('Remove confirmation missing.');
    activate(mounted.host, button(confirm, 'Remove'));
    await settle(12);
    expect(mounted.operations.deleteAsset).toHaveBeenCalledOnce();
    expect(mounted.operations.listAssets).toHaveBeenCalledOnce();
    expect(mounted.workspace.focusCurrent).toHaveBeenCalled();
  });

  it.each([
    ['session invalid', { kind: 'session-invalid' }, true, /session-invalid/i],
    [
      'authorization failure',
      { kind: 'failure', failure: 'unauthorized' },
      false,
      /Not authorized|unauthorized/i,
    ],
    [
      'invalid response',
      { kind: 'failure', failure: 'invalid-response' },
      false,
      /Invalid server response|invalid-response/i,
    ],
  ])('handles a fixed %s without exposing remote detail', async (_case, result, reauth, message) => {
    const update = vi.fn().mockResolvedValue(result);
    const mounted = await harness({ update });
    mounted.controller.handleCommand(manageOrganizationCommand());
    await settle(12);
    mounted.getIntent()?.({ kind: 'save-overview', input: { name: 'Renamed' } });
    await settle(12);

    expect(mounted.requestAuthentication).toHaveBeenCalledTimes(reauth ? 1 : 0);
    if (!reauth) expect(JSON.stringify(mounted.states.at(-1))).toMatch(message);
    expect(JSON.stringify(mounted.states)).not.toMatch(/stack|body|header|private/i);
  });

  it('reloads an unknown asset outcome once before accepting another action', async () => {
    const uploadAsset = vi.fn().mockResolvedValue({ kind: 'failure', failure: 'unknown-outcome' });
    const mounted = await harness(
      { uploadAsset },
      {
        openFile: vi.fn().mockResolvedValue('/tmp/favicon.ico'),
        readFile: vi.fn().mockResolvedValue(Uint8Array.from([0, 0, 1, 0, 1, 0])),
      },
    );
    mounted.controller.handleCommand(manageOrganizationCommand());
    await settle(12);
    vi.clearAllMocks();
    mounted.getIntent()?.({ kind: 'upload-asset', assetType: 'favicon' });
    await settle(12);

    expect(uploadAsset).toHaveBeenCalledOnce();
    expect(mounted.operations.listAssets).toHaveBeenCalledOnce();
  });

  it('closes on organization or session epoch change and discards every late result', async () => {
    let finish: ((value: unknown) => void) | undefined;
    const get = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const mounted = await harness({ get });
    mounted.controller.handleCommand(manageOrganizationCommand());
    await settle();
    mounted.setState({
      kind: 'authenticated',
      server: new URL('https://porta.example.test'),
      identity: { sub: 'administrator' },
      organization: { ...organization, id: '22222222-2222-4222-8222-222222222222' },
      capabilities,
    });
    mounted.controller.syncContext(
      {
        kind: 'authenticated',
        server: new URL('https://porta.example.test'),
        identity: { sub: 'administrator' },
        organization: { ...organization, id: '22222222-2222-4222-8222-222222222222' },
        capabilities,
      },
      2,
    );
    expect(mounted.mounted.at(-1)).toBeNull();
    finish?.({ kind: 'success', value: organization });
    await settle(12);
    expect(mounted.mounted.filter(Boolean)).toHaveLength(0);
    expect(mounted.states).toHaveLength(0);
  });
});
