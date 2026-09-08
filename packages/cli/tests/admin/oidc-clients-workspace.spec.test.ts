/** Observable specifications for selected-organization OIDC client administration. */

import {
  Button,
  createApplication,
  DataGrid,
  Dialog,
  Group,
  Input,
  TabView,
  Text,
  View,
} from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import { createAdminPresentation } from '../../src/admin/presentation.js';
import type { AdminCapabilities, AdminOrganizationContext } from '../../src/admin/state.js';
import type { AdminClient, AdminClientSecret } from '../../src/admin/client-state.js';

const organization: AdminOrganizationContext = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Example Organization',
  slug: 'example',
  status: 'active',
};
const application = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Customer Portal',
  slug: 'customer-portal',
  description: null,
  status: 'active' as const,
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
const secret: AdminClientSecret = {
  id: '44444444-4444-4444-8444-444444444444',
  clientId: client.id,
  label: 'Current deployment',
  status: 'active',
  lastUsedAt: '2026-08-20T00:00:00Z',
  expiresAt: '2027-01-01T00:00:00Z',
  createdAt: '2026-08-01T00:00:00Z',
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

interface ClientWorkspace {
  readonly content: View;
  readonly setState: (state: unknown) => void;
  readonly focusCurrent: () => void;
}
interface ClientWorkspaceExports {
  readonly createAdminClientWorkspace: (options: {
    readonly organization?: AdminOrganizationContext;
    readonly applications: readonly (typeof application)[];
    readonly capabilities: AdminCapabilities;
    readonly onIntent: (intent: unknown) => void;
    readonly focusView: (view: View) => void;
  }) => ClientWorkspace;
}
interface ClientDialogExports {
  readonly showClientLifecycleDialog: (
    host: ReturnType<typeof createApplication>,
    signal: AbortSignal,
    action: 'deactivate',
    organization: AdminOrganizationContext,
    client: AdminClient,
  ) => Promise<unknown>;
  readonly showRevokeClientSecretDialog: (
    host: ReturnType<typeof createApplication>,
    signal: AbortSignal,
    organization: AdminOrganizationContext,
    client: AdminClient,
    secret: AdminClientSecret,
  ) => Promise<unknown>;
  readonly showOneTimeClientSecretDialog: (
    host: ReturnType<typeof createApplication>,
    signal: AbortSignal,
    value: {
      readonly clientName: string;
      readonly clientId: string;
      readonly label: string | null;
      readonly plaintext: string;
      readonly expiresAt?: string | null;
    },
  ) => Promise<void>;
}

/** Loads the future workspace at execution time so all immutable tests collect before implementation. */
async function workspaceExports(): Promise<ClientWorkspaceExports> {
  return (await import('../../src/admin/client-workspace.js')) as ClientWorkspaceExports;
}

/** Loads future dialogs at execution time so all immutable tests collect before implementation. */
async function dialogExports(): Promise<ClientDialogExports> {
  return (await import('../../src/admin/client-dialogs.js')) as ClientDialogExports;
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

/** Lets reactive layout and modal transitions settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Mounts one organization-owned workspace on a real headless surface. */
async function mountWorkspace(options: {
  readonly organization?: AdminOrganizationContext;
  readonly capabilities?: AdminCapabilities;
  readonly applications?: readonly (typeof application)[];
  readonly width?: number;
  readonly height?: number;
}) {
  const width = options.width ?? 80;
  const height = options.height ?? 24;
  const intents: unknown[] = [];
  const granted = options.capabilities ?? capabilities;
  const presentation = createAdminPresentation({
    kind: 'authenticated', server: new URL('https://porta.example.test'), identity: { sub: 'administrator' },
    ...(options.organization ? { organization: options.organization } : {}), capabilities: granted,
  }, false, { width, height });
  const host = createApplication({ content: presentation.content, menuBar: presentation.menu, statusLine: presentation.status, viewport: { width, height } });
  const workspace = (await workspaceExports()).createAdminClientWorkspace({
    ...(options.organization ? { organization: options.organization } : {}),
    applications: options.applications ?? [application],
    capabilities: granted,
    onIntent: (intent) => intents.push(intent),
    focusView: (view) => host.loop.focusView(view),
  });
  presentation.setWorkspace(workspace.content);
  if (!(workspace.content instanceof Dialog)) throw new Error('Expected an OIDC Clients dialog.');
  const window = workspace.content;
  return { host, intents, window, workspace };
}

/** Returns the active feature dialog. */
function activeDialog(host: ReturnType<typeof createApplication>): Dialog {
  const dialog = host.desktop.activeWindow();
  if (!(dialog instanceof Dialog)) throw new Error('Expected a client dialog.');
  return dialog;
}

/** Activates a button through the normal keyboard route. */
function activate(host: ReturnType<typeof createApplication>, button: Button): void {
  host.loop.focusView(button);
  host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
}

describe('organization OIDC client workspace', () => {
  it('remains visible-disabled with the exact organization-required reason without context', async () => {
    const mounted = await mountWorkspace({});
    mounted.workspace.setState({ kind: 'closed' });
    await settle();
    expect(frameText(mounted.host)).toContain('OIDC Clients');
    expect(frameText(mounted.host)).toContain('organization required');
    expect(descendants(mounted.window).filter((view) => view instanceof Button).every((button) => button.state.disabled)).toBe(true);
  });

  it.each([
    ['resolved application name', capabilities, 'Customer Portal'],
    ['immutable application ID fallback', { ...capabilities, canReadApplications: false }, application.id],
  ] as const)('shows the complete same-organization full-height DataGrid with %s', async (_case, granted, expectedApplication) => {
    const mounted = await mountWorkspace({ organization, capabilities: granted });
    mounted.workspace.setState({ kind: 'list', organizationId: organization.id, clients: [client] });
    mounted.workspace.focusCurrent();
    await settle();
    const grid = descendants(mounted.window).find((view) => view instanceof DataGrid);
    const text = frameText(mounted.host);
    expect(mounted.window.title()).toBe('OIDC Clients');
    expect(mounted.window.isZoomed()).toBe(true);
    expect(mounted.window.closable).toBe(false);
    expect(mounted.window.resizable).toBe(false);
    expect(mounted.window.zoomable).toBe(false);
    expect(grid).toBeInstanceOf(DataGrid);
    expect((grid as DataGrid<unknown>).layout.size).toEqual({ kind: 'fr', weight: 1 });
    expect((grid as DataGrid<unknown>).bounds.height).toBeGreaterThan(10);
    expect(text.match(/OIDC Clients/g)).toHaveLength(granted.canReadApplications ? 2 : 1);
    expect(text).toContain('Enter View details · 1 client');
    expect(text).not.toContain(`Client: ${client.clientName}`);
    expect(text).not.toContain(`Application: ${expectedApplication}`);
    expect(descendants(mounted.window).filter((view) => view instanceof Button).some((button) => button.activation.label === 'Create')).toBe(false);
    for (const heading of ['Name', 'Client ID', 'Application', 'Status'])
      expect(text).toContain(heading);
    expect(text).toContain(expectedApplication === application.id ? application.id.slice(0, 16) : expectedApplication);
    expect(text).toContain('active');
    expect(text).not.toContain('Application Type');
    expect(text).not.toContain('Client Type');
  });

  it('keeps the OIDC client DataGrid visible when the organization has no clients', async () => {
    const mounted = await mountWorkspace({ organization });
    mounted.workspace.setState({ kind: 'list', organizationId: organization.id, clients: [] });
    await settle();
    const text = frameText(mounted.host);
    expect(descendants(mounted.window).find((view) => view instanceof DataGrid)).toBeInstanceOf(DataGrid);
    for (const heading of ['Name', 'Client ID', 'Application', 'Status']) expect(text).toContain(heading);
    expect(text).toContain('No OIDC clients. Use OIDC Clients > Create client.');
  });

  it('replaces failed loading and preserves authoritative prior detail without speculative changes', async () => {
    const mounted = await mountWorkspace({ organization });
    const previous = { kind: 'detail', organizationId: organization.id, clients: [client], client, applicationName: application.name, secrets: [secret] };
    mounted.workspace.setState({ kind: 'failure', organizationId: organization.id, failure: 'unavailable', previous });
    await settle();
    expect(frameText(mounted.host)).toContain(client.clientName);
    expect(frameText(mounted.host)).toContain('Service unavailable');
    expect(frameText(mounted.host)).not.toContain('outcome unknown secret');
    const retry = descendants(mounted.window).filter((view) => view instanceof Button).find((button) => button.activation.label === 'Retry');
    if (!retry) throw new Error('Retry control missing.');
    activate(mounted.host, retry);
    expect(mounted.intents).toContainEqual({ kind: 'retry' });
  });

  it.each([['inactive', { ...client, status: 'inactive' as const }, true]])(
    'renders complete %s detail with immutable context and correct editability',
    async (_status, value, editable) => {
      const mounted = await mountWorkspace({ organization });
      mounted.workspace.setState({
        kind: 'detail',
        organizationId: organization.id,
        clients: [value],
        client: value,
        applicationName: application.name,
        secrets: [secret],
      });
      await settle();
      const text = frameText(mounted.host);
      const tabs = descendants(mounted.window).find((view) => view instanceof TabView);
      if (!(tabs instanceof TabView)) throw new Error('Client tab pane missing.');
      for (const expected of [
        organization.name,
        application.name,
        value.clientId,
        value.clientType,
        value.applicationType,
      ])
        expect(text).toContain(expected);
      expect(tabs.tabs.peek().map((tab) => tab.title)).toEqual([
        'Overview',
        'Authentication',
        'Protocol',
        'Login experience',
        'Credentials',
        'Lifecycle',
      ]);
      const editName = descendants(mounted.window)
        .filter((view) => view instanceof Button)
        .find((button) => button.activation.label === 'Edit name');
      expect(editName?.state.disabled).toBe(!editable);
    },
  );

  it('uses the immutable application ID in detail when application read is unavailable', async () => {
    const mounted = await mountWorkspace({
      organization,
      capabilities: { ...capabilities, canReadApplications: false },
    });
    mounted.workspace.setState({
      kind: 'detail',
      organizationId: organization.id,
      clients: [client],
      client,
      applicationName: 'Must not be disclosed',
      secrets: [],
    });
    await settle();
    const text = frameText(mounted.host);
    expect(text).toContain(application.id.slice(0, 24));
    expect(text).toContain(application.id.slice(-2));
    expect(text).not.toContain('Must not be disclosed');
  });

  it('renders metadata-only secrets with fixed capability states', async () => {
    const mounted = await mountWorkspace({ organization });
    mounted.workspace.setState({
      kind: 'secrets',
      organizationId: organization.id,
      clients: [client],
      client,
      applicationName: application.name,
      secrets: [secret],
      legacyOnly: true,
    });
    await settle();
    const text = frameText(mounted.host);
    expect(descendants(mounted.window).find((view) => view instanceof DataGrid)).toBeInstanceOf(
      DataGrid,
    );
    for (const expected of ['Label', 'Status', 'Last used', 'Expires', secret.label!.slice(0, 14)])
      expect(text).toContain(expected);
    expect(text).not.toMatch(/plaintext|secret-value/i);
    expect(
      descendants(mounted.window)
        .filter((view) => view instanceof Button)
        .map((button) => button.activation.label),
    ).toEqual(expect.arrayContaining(['Add', 'Delete']));
  });

  it.each([
    ['public', { ...client, clientType: 'public' as const }],
  ])('hides secret mutation for a %s client', async (_case, value) => {
    const mounted = await mountWorkspace({ organization });
    mounted.workspace.setState({
      kind: 'secrets',
      organizationId: organization.id,
      clients: [value],
      client: value,
      applicationName: application.name,
      secrets: [],
    });
    await settle();
    const tabs = descendants(mounted.window).find((view) => view instanceof TabView);
    if (!(tabs instanceof TabView)) throw new Error('Client tabs missing.');
    const credentials = tabs.tabs.peek()[4]?.content;
    if (!credentials) throw new Error('Credentials tab missing.');
    const actions = descendants(credentials)
      .filter((view) => view instanceof Button)
      .filter((button) => ['Add', 'Delete'].includes(button.activation.label));
    expect(actions).toHaveLength(0);
  });

  it('allows deleting a retained legacy revoked secret row', async () => {
    const mounted = await mountWorkspace({ organization });
    mounted.workspace.setState({ kind: 'secrets', organizationId: organization.id, clients: [client], client, applicationName: application.name, secrets: [{ ...secret, status: 'revoked' }] });
    await settle();
    const tabs = descendants(mounted.window).find((view) => view instanceof TabView);
    if (!(tabs instanceof TabView)) throw new Error('Client tabs missing.');
    const credentials = tabs.tabs.peek()[4]?.content;
    if (!credentials) throw new Error('Credentials tab missing.');
    const remove = descendants(credentials).filter((view) => view instanceof Button).find((button) => button.activation.label === 'Delete');
    expect(remove?.state.disabled).toBe(false);
  });
});

describe('client lifecycle and one-time secrets', () => {
  it.each(['deactivate'] as const)('names client and organization before %s with no restore path', async (action) => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const pending = (await dialogExports()).showClientLifecycleDialog(host, new AbortController().signal, action, organization, client);
    await settle();
    expect(frameText(host)).toContain(client.clientName);
    expect(frameText(host)).toContain(organization.name);
    expect(frameText(host)).not.toContain('Restore');
    host.loop.endModal('cancel');
    await pending;
  });

  it('shows confidential plaintext once in a bounded non-editable view without Copy', async () => {
    let copied = '';
    const host = createApplication({
      viewport: { width: 80, height: 24 },
      writeClipboardText: (value) => {
        copied = value;
      },
    });
    const plaintext = 'one-time-secret-value';
    const pending = (await dialogExports()).showOneTimeClientSecretDialog(host, new AbortController().signal, {
      clientName: client.clientName,
      clientId: client.clientId,
      label: secret.label,
      plaintext,
      expiresAt: '2027-03-08T00:00:00.000Z',
    });
    await settle();
    const dialog = activeDialog(host);
    const views = descendants(dialog);
    const text = frameText(host);
    for (const expected of [client.clientName, client.clientId, secret.label!, plaintext, 'cannot be shown again'])
      expect(text).toContain(expected);
    expect(text).toContain('Expires: 08 Mar 2027, 00:00 UTC');
    expect(text).not.toContain('2027-03-08T00:00:00.000Z');
    const secretInput = views.find((view) => view instanceof Input);
    if (!(secretInput instanceof Input)) throw new Error('Selectable secret field missing.');
    expect(views.filter((view) => view instanceof Input)).toHaveLength(1);
    expect(secretInput.getValueSignal().peek()).toBe(plaintext);
    host.loop.focusView(secretInput);
    host.loop.dispatch({ type: 'key', key: 'a', codepoint: 97, ctrl: true, alt: false, shift: false });
    host.loop.dispatch({ type: 'key', key: 'c', codepoint: 99, ctrl: true, alt: false, shift: false });
    await settle();
    expect(copied).toBe(plaintext);
    host.loop.dispatch({ type: 'key', key: 'x', codepoint: 120, ctrl: false, alt: false, shift: false });
    expect(secretInput.getValueSignal().peek()).toBe(plaintext);
    expect(views.find((view) => view instanceof Text)).toBeInstanceOf(Text);
    expect(views.filter((view) => view instanceof Button).map((button) => button.activation.label)).not.toContain('Copy');
    host.loop.endModal('ok');
    await pending;
    expect(frameText(host)).not.toContain(plaintext);
  });

  it.each(['close', 'cancel', 'resize', 'switch context', 'reauthenticate', 'quit'])('permanently disposes plaintext after %s and cannot reopen it', async () => {
    const host = createApplication({ viewport: { width: 48, height: 12 } });
    const controller = new AbortController();
    const plaintext = `discard-${Math.random().toString(16).slice(2)}`;
    const dialogs = await dialogExports();
    const pending = dialogs.showOneTimeClientSecretDialog(host, controller.signal, {
      clientName: client.clientName,
      clientId: client.clientId,
      label: null,
      plaintext,
    });
    await settle();
    controller.abort();
    await pending;
    expect(host.desktop.activeWindow()).toBeNull();
    expect(frameText(host)).not.toContain(plaintext);
    expect(Object.values(host).join(' ')).not.toContain(plaintext);
  });

  it('moves and closes a populated secret dialog cleanly without focus or command diagnostics', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const pending = (await dialogExports()).showRevokeClientSecretDialog(host, new AbortController().signal, organization, client, secret);
    await settle();
    const dialog = activeDialog(host);
    expect(dialog.title()).toBe('Delete client secret');
    expect(frameText(host)).toContain('Deleting this secret is permanent.');
    const remove = descendants(dialog)
      .filter((view) => view instanceof Button)
      .find((action) => action.activation.label === `Delete ${secret.label}`);
    expect(remove?.state.disabled).toBe(false);
    const before = { ...dialog.bounds };
    const origin = host.loop.renderRoot.originOf(dialog);
    if (!origin) throw new Error('Dialog origin missing.');
    host.loop.dispatch({ type: 'mouse', kind: 'down', button: 0, x: origin.x + 11, y: origin.y + 1 });
    host.loop.dispatch({ type: 'mouse', kind: 'drag', button: 0, x: origin.x + 16, y: origin.y + 3 });
    host.loop.dispatch({ type: 'mouse', kind: 'up', button: 0, x: origin.x + 16, y: origin.y + 3 });
    expect([dialog.bounds.x, dialog.bounds.y]).toEqual([before.x + 5, before.y + 2]);
    host.loop.endModal('cancel');
    await pending;
    expect(frameText(host)).not.toContain(secret.label!);
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/focus|command/i);
    warn.mockRestore();
  });
});
