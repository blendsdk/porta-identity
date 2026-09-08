/** Immutable behavior specifications for the OIDC client detail workspace. */

import {
  Button,
  createApplication,
  DataGrid,
  Dialog,
  Group,
  GroupBox,
  Input,
  ListBox,
  TabView,
  View,
} from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import { createAdminClientController } from '../../src/admin/client-controller.js';
import { createAdminPresentation } from '../../src/admin/presentation.js';
import type { AdminApplication } from '../../src/admin/application-state.js';
import type { AdminClient, AdminClientViewState } from '../../src/admin/client-state.js';
import type {
  AdminCapabilities,
  AdminConnectionState,
  AdminOrganizationContext,
} from '../../src/admin/state.js';

const organization: AdminOrganizationContext = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Example Organization',
  slug: 'example',
  status: 'active',
};
const application: AdminApplication = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Customer Portal',
  slug: 'customer-portal',
  description: null,
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
};
const client: AdminClient = {
  id: '33333333-3333-4333-8333-333333333333',
  organizationId: organization.id,
  applicationId: application.id,
  clientId: 'porta-generated-client-id',
  clientName: 'Portal Web Client',
  clientType: 'confidential',
  applicationType: 'web',
  redirectUris: ['https://portal.example.test/callback'],
  postLogoutRedirectUris: ['https://portal.example.test/signed-out'],
  grantTypes: ['authorization_code', 'refresh_token'],
  responseTypes: ['code'],
  scope: 'openid profile email',
  tokenEndpointAuthMethod: 'client_secret_basic',
  allowedOrigins: ['https://portal.example.test'],
  requirePkce: true,
  loginMethods: null,
  effectiveLoginMethods: ['password', 'magic_link'],
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
  canCreateApplications: false,
  canUpdateApplications: false,
  canDeleteApplications: false,
  canDeleteModules: false,
  canReadClients: true,
  canCreateClients: true,
  canUpdateClients: true,
  canDeleteClients: true,
  canRevokeClientSecrets: true,
};
const detail: Extract<AdminClientViewState, { kind: 'detail' }> = {
  kind: 'detail',
  organizationId: organization.id,
  clients: [client],
  client,
  applicationName: application.name,
  etag: 'W/"0123456789abcdef"',
  secrets: [],
};

interface DetailWorkspace {
  /** Maximized client administration surface. */
  readonly content: View;
  /** Replaces the complete authoritative projection. */
  readonly setState: (state: AdminClientViewState) => void;
  /** Restores focus to the selected section. */
  readonly focusCurrent: () => void;
}

interface WorkspaceExports {
  /** Builds the stable selected-organization client workspace. */
  readonly createAdminClientWorkspace: (options: {
    readonly organization?: AdminOrganizationContext;
    readonly applications: readonly AdminApplication[];
    readonly capabilities: AdminCapabilities;
    readonly onIntent: (intent: unknown) => void;
    readonly focusView: (view: View) => void;
  }) => DetailWorkspace;
}

interface ClientNameDialogExports {
  /** Opens the focused client-name editor through the stable dialog facade. */
  readonly showEditClientNameDialog: (
    host: ReturnType<typeof createApplication>,
    signal: AbortSignal,
    organization: AdminOrganizationContext,
    client: AdminClient,
  ) => Promise<
    | {
        readonly kind: 'update';
        readonly clientId: string;
        readonly input: { readonly clientName: string };
      }
    | { readonly kind: 'cancel' }
  >;
}

/** Loads the workspace at test execution so the full oracle can collect before implementation. */
async function workspaceExports(): Promise<WorkspaceExports> {
  return (await import('../../src/admin/client-workspace.js')) as WorkspaceExports;
}

/** Loads the stable dialog facade at test execution. */
async function nameDialogExports(): Promise<ClientNameDialogExports> {
  return (await import('../../src/admin/client-dialogs.js')) as ClientNameDialogExports;
}

/** Collects all mounted descendants for widget-level assertions. */
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

/** Lets layout, selection, and modal transitions settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Activates a mounted button through the ordinary keyboard route. */
function activate(host: ReturnType<typeof createApplication>, button: Button): void {
  host.loop.focusView(button);
  host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
}

/** Mounts one authoritative client detail projection on the real application surface. */
async function mountDetail(value: AdminClient = client, width = 80, height = 24) {
  const intents: unknown[] = [];
  const presentation = createAdminPresentation(
    {
      kind: 'authenticated',
      server: new URL('https://porta.example.test'),
      identity: { sub: 'administrator' },
      organization,
      capabilities,
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
  const workspace = (await workspaceExports()).createAdminClientWorkspace({
    organization,
    applications: [application],
    capabilities,
    onIntent: (intent) => intents.push(intent),
    focusView: (view) => host.loop.focusView(view),
  });
  presentation.setWorkspace(workspace.content);
  workspace.setState({ ...detail, client: value, clients: [value] });
  workspace.focusCurrent();
  await settle();
  if (!(workspace.content instanceof Dialog)) throw new Error('Expected the OIDC Clients surface.');
  return { host, intents, window: workspace.content, workspace };
}

/** Selects a detail section through the ListBox's normal keyboard activation. */
async function selectSection(
  host: ReturnType<typeof createApplication>,
  navigation: ListBox,
  index: number,
): Promise<void> {
  navigation.focused.set(index);
  host.loop.focusView(navigation.rows);
  host.loop.dispatch({ type: 'key', key: 'enter', ctrl: false, alt: false, shift: false });
  await settle();
}

/** Returns the active modal dialog. */
function activeDialog(host: ReturnType<typeof createApplication>): Dialog {
  const dialog = host.desktop.activeWindow();
  if (!(dialog instanceof Dialog)) throw new Error('Expected a client name dialog.');
  return dialog;
}

/** Returns a button by its visible activation label. */
function button(root: View, label: string): Button {
  const result = descendants(root)
    .filter((view) => view instanceof Button)
    .find((candidate) => candidate.activation.label === label);
  if (!result) throw new Error(`${label} button missing.`);
  return result;
}

/** Returns the authenticated controller state. */
function authenticated(): Extract<AdminConnectionState, { kind: 'authenticated' }> {
  return {
    kind: 'authenticated',
    server: new URL('https://porta.example.test'),
    identity: {
      subject: 'administrator',
      displayName: 'Administrator',
      email: 'admin@example.test',
      claims: {},
    },
    organization,
    capabilities,
  };
}

describe('OIDC client detail surface', () => {
  // Selecting a client opens Overview with separately captioned identity, protocol, and login facts.
  it('shows authoritative Overview regions and separate section navigation', async () => {
    const mounted = await mountDetail();
    const views = descendants(mounted.window);
    const navigation = views.filter((view) => view instanceof ListBox);
    const titles = views.filter((view) => view instanceof GroupBox).map((section) => section.title);
    const frame = frameText(mounted.host);

    expect(mounted.window.title()).toBe('OIDC Clients');
    expect(mounted.window.isZoomed()).toBe(true);
    expect(navigation).toHaveLength(1);
    expect(titles.join(' ')).toMatch(/Identity/i);
    expect(titles.join(' ')).toMatch(/Context/i);
    expect(titles.join(' ')).toMatch(/Protocol/i);
    expect(titles.join(' ')).toMatch(/Login/i);
    for (const expected of [
      client.clientName,
      client.clientId,
      organization.name,
      application.name,
      client.clientType,
      client.applicationType,
      client.status,
      client.createdAt,
      client.updatedAt,
      'authorization_code',
      'client_secret_basic',
      'password',
      'magic_link',
    ]) {
      expect(frame).toContain(expected);
    }
    expect(views.filter((view) => view instanceof TabView)).toHaveLength(0);
  });

  // One ListBox selects every detail section without replacing the maximized workspace.
  it('navigates every section through exactly one persistent ListBox', async () => {
    const mounted = await mountDetail();
    const navigation = descendants(mounted.window).find((view) => view instanceof ListBox);
    if (!(navigation instanceof ListBox)) throw new Error('Section navigation missing.');
    const expectedItems = [
      'Overview',
      'Authentication',
      'Protocol',
      'Login experience',
      'Credentials',
      'Lifecycle',
    ];
    for (const item of expectedItems) expect(frameText(mounted.host)).toContain(item);

    const sectionContent = [
      client.clientId,
      'Redirect URIs',
      'Grant types',
      'Effective methods',
      'Expires',
      'Delete',
    ];
    for (const [index, expected] of sectionContent.entries()) {
      await selectSection(mounted.host, navigation, index);
      expect(frameText(mounted.host)).toContain(expected);
      if (index === 4) {
        expect(descendants(mounted.window).find((view) => view instanceof DataGrid)).toBeInstanceOf(
          DataGrid,
        );
      }
      expect(descendants(mounted.window).filter((view) => view instanceof ListBox)).toEqual([
        navigation,
      ]);
      expect(mounted.host.desktop.activeWindow()).toBe(mounted.window);
    }
  });

  // Public clients keep all applicable sections but expose no client-secret operations.
  it('keeps public-client sections reachable without secret operations', async () => {
    const publicClient: AdminClient = {
      ...client,
      clientType: 'public',
      tokenEndpointAuthMethod: 'none',
    };
    const mounted = await mountDetail(publicClient);
    const navigation = descendants(mounted.window).find((view) => view instanceof ListBox);
    if (!(navigation instanceof ListBox)) throw new Error('Section navigation missing.');

    await selectSection(mounted.host, navigation, 4);
    const credentialActions = descendants(mounted.window)
      .filter((view) => view instanceof Button)
      .map((action) => action.activation.label);
    expect(credentialActions).not.toEqual(expect.arrayContaining(['Generate', 'Revoke']));

    for (const index of [0, 1, 2, 3, 5]) {
      await selectSection(mounted.host, navigation, index);
      expect(navigation.selected.peek()).toBe(index);
      expect(descendants(mounted.window)).toContain(navigation);
    }
  });

  // Responsive layout moves the same selected navigation above compact content and leaves Back reachable.
  it('preserves one selected ListBox and bottom navigation across repeated shrink and grow', async () => {
    const mounted = await mountDetail();
    const navigation = descendants(mounted.window).find((view) => view instanceof ListBox);
    if (!(navigation instanceof ListBox)) throw new Error('Section navigation missing.');
    await selectSection(mounted.host, navigation, 2);
    const normalSection = descendants(mounted.window).find((view) => view instanceof GroupBox);
    if (!(normalSection instanceof GroupBox)) throw new Error('Selected section missing.');
    expect(navigation.bounds.x).toBeLessThan(normalSection.bounds.x);

    for (const viewport of [
      { width: 48, height: 12 },
      { width: 80, height: 24 },
      { width: 48, height: 12 },
      { width: 80, height: 24 },
    ]) {
      mounted.host.loop.resize(viewport);
      await settle();
      const currentViews = descendants(mounted.window);
      const currentNavigation = currentViews.filter((view) => view instanceof ListBox);
      const currentSection = currentViews.find((view) => view instanceof GroupBox);
      const back = button(mounted.window, 'Back to OIDC clients');
      expect(currentNavigation).toEqual([navigation]);
      expect(navigation.selected.peek()).toBe(2);
      expect(back.bounds.y).toBeLessThan(viewport.height);
      expect(currentViews.filter((view) => view instanceof TabView)).toHaveLength(0);
      expect(frameText(mounted.host)).not.toContain('[jsvision/ui');
      expect(currentSection).toBeInstanceOf(GroupBox);
      if (viewport.width === 48 && currentSection instanceof GroupBox) {
        expect(currentSection.bounds.height).toBeGreaterThan(0);
        expect(frameText(mounted.host)).toContain('Edit protocol');
      }
    }
  });

  // Detail actions use natural Layout DSL measurement so both face-padding cells remain visible.
  it('uses natural width for complete detail action labels', async () => {
    const mounted = await mountDetail();
    const navigation = descendants(mounted.window).find((view) => view instanceof ListBox);
    if (!(navigation instanceof ListBox)) throw new Error('Section navigation missing.');
    const labels = new Set([
      'Edit name',
      'Edit authentication',
      'Edit protocol',
      'Edit login experience',
      'Generate',
      'Revoke',
      'Activate',
      'Deactivate',
      'Delete',
      'Back to OIDC clients',
    ]);
    for (const index of [0, 1, 2, 3, 4, 5]) {
      await selectSection(mounted.host, navigation, index);
      for (const action of descendants(mounted.window).filter(
        (view): view is Button => view instanceof Button && labels.has(view.activation.label),
      )) {
        expect(action.layout.size).toBeUndefined();
        expect(action.bounds.width).toBe(action.measure().width);
      }
    }
    expect(button(mounted.window, 'Back to OIDC clients').measure().width).toBeGreaterThan(
      'Back to OIDC clients'.length,
    );
  });

  // Overview emits only the selected client identity when asking orchestration to edit its name.
  it('emits the focused name-edit intent from Overview', async () => {
    const mounted = await mountDetail();
    activate(mounted.host, button(mounted.window, 'Edit name'));
    expect(mounted.intents).toEqual([{ kind: 'edit-name', clientId: client.id }]);
  });
});

describe('focused OIDC client name edit', () => {
  // Compact terminals retain the editable field and fixed dialog actions.
  it('keeps the name field and actions reachable at compact geometry', async () => {
    const host = createApplication({ viewport: { width: 48, height: 12 } });
    const pending = (await nameDialogExports()).showEditClientNameDialog(
      host,
      new AbortController().signal,
      organization,
      client,
    );
    await settle();
    const dialog = activeDialog(host);
    const views = descendants(dialog);
    expect(views.filter((view) => view instanceof Input)).toHaveLength(1);
    const actions = views.filter(
      (view): view is Button =>
        view instanceof Button && ['Save', 'Cancel'].includes(view.activation.label),
    );
    expect(actions).toHaveLength(2);
    expect(frameText(host)).toContain('Save');
    expect(frameText(host)).toContain('Cancel');
    for (const action of actions) {
      expect(action.bounds.y).toBeLessThan(12);
      expect(action.bounds.height).toBeGreaterThan(0);
    }
    host.loop.endModal('cancel');
    await expect(pending).resolves.toEqual({ kind: 'cancel' });
  });

  // The name dialog returns only the mutable name and leaves identity and type fields read-only.
  it('returns only a changed client name from a naturally sized focused dialog', async () => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const pending = (await nameDialogExports()).showEditClientNameDialog(
      host,
      new AbortController().signal,
      organization,
      client,
    );
    await settle();
    const dialog = activeDialog(host);
    const inputs = descendants(dialog).filter((view) => view instanceof Input);
    expect(inputs).toHaveLength(1);
    expect(frameText(host)).toContain(client.clientId);
    expect(frameText(host)).toContain(client.clientType);
    expect(frameText(host)).toContain(client.applicationType);
    inputs[0]?.getValueSignal().set('Renamed Portal Client');
    const save = descendants(dialog)
      .filter((view) => view instanceof Button)
      .find((action) => action.activation.command === 'ok');
    if (!save) throw new Error('Save button missing.');
    expect(save.layout.size).toBeUndefined();
    expect(save.bounds.width).toBe(save.measure().width);
    activate(host, save);

    await expect(pending).resolves.toEqual({
      kind: 'update',
      clientId: client.id,
      input: { clientName: 'Renamed Portal Client' },
    });
  });

  // A successful name update reloads the selected client and publishes only authoritative values.
  it('reloads the selected client after one name-only update', async () => {
    const authoritative = { ...client, clientName: 'Renamed Portal Client' };
    const states: AdminClientViewState[] = [];
    const update = vi.fn().mockResolvedValue({ kind: 'success' });
    const get = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'success', value: { client, etag: 'before' } })
      .mockResolvedValueOnce({ kind: 'success', value: { client: authoritative, etag: 'after' } });
    const controller = createAdminClientController({
      readState: authenticated,
      readOperations: () => ({
        listAll: vi.fn().mockResolvedValue({ kind: 'success', value: [client] }),
        get,
        update,
      }),
      publishState: (state) => states.push(state),
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(authenticated(), 1);
    await controller.load();
    await controller.select(client.id);

    await controller.update(client.id, { clientName: authoritative.clientName }, 'before');

    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(
      organization.id,
      client.id,
      { clientName: authoritative.clientName },
      'before',
      expect.any(AbortSignal),
    );
    expect(get).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toEqual(
      expect.objectContaining({ kind: 'detail', client: authoritative }),
    );
    expect(authoritative.clientId).toBe(client.clientId);
    expect(authoritative.clientType).toBe(client.clientType);
    expect(authoritative.applicationType).toBe(client.applicationType);
  });
});
