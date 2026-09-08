/** Observable specifications for selected-organization OIDC client administration. */

import {
  at,
  Button,
  createApplication,
  DataGrid,
  Dialog,
  Group,
  Input,
  Text,
  View,
  Window,
} from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

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
  readonly content: Group;
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
  const host = createApplication({ viewport: { width, height } });
  const workspace = (await workspaceExports()).createAdminClientWorkspace({
    ...(options.organization ? { organization: options.organization } : {}),
    applications: options.applications ?? [application],
    capabilities: options.capabilities ?? capabilities,
    onIntent: (intent) => intents.push(intent),
    focusView: (view) => host.loop.focusView(view),
  });
  const window = new Window('OIDC Clients');
  window.setLayout({ rect: { x: 0, y: 0, width, height } });
  window.add(at(workspace.content, 1, 1, Math.max(1, width - 4), Math.max(1, height - 4)));
  host.desktop.addWindow(window);
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
    expect(grid).toBeInstanceOf(DataGrid);
    expect((grid as DataGrid<unknown>).layout.size).toEqual({ kind: 'fr', weight: 1 });
    expect((grid as DataGrid<unknown>).bounds.height).toBeGreaterThan(10);
    for (const heading of ['Name', 'Client ID', 'Application', 'Application Type', 'Client Type', 'Status'])
      expect(text).toContain(heading);
    expect(text).toContain(expectedApplication);
    expect(text).toContain('confidential');
    expect(text).toContain('active');
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
      for (const expected of [
        organization.name,
        application.name,
        value.clientId,
        value.clientType,
        value.applicationType,
        'Overview',
        'Authentication',
        'Protocol',
        'Login experience',
        'Credentials',
        'Lifecycle',
      ])
        expect(text).toContain(expected);
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
    expect(text).toContain(application.id.slice(24));
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
    ).toEqual(expect.arrayContaining(['Generate', 'Revoke']));
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
    const actions = descendants(mounted.window)
      .filter((view) => view instanceof Button)
      .filter((button) => ['Generate', 'Revoke'].includes(button.activation.label));
    expect(actions).toHaveLength(0);
  });

  it('keeps revocation visible-disabled for an already-revoked secret row', async () => {
    const mounted = await mountWorkspace({ organization });
    mounted.workspace.setState({ kind: 'secrets', organizationId: organization.id, clients: [client], client, applicationName: application.name, secrets: [{ ...secret, status: 'revoked' }] });
    await settle();
    const revoke = descendants(mounted.window).filter((view) => view instanceof Button).find((button) => button.activation.label === 'Revoke');
    expect(revoke?.state.disabled).toBe(true);
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
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const plaintext = 'one-time-secret-value';
    const pending = (await dialogExports()).showOneTimeClientSecretDialog(host, new AbortController().signal, {
      clientName: client.clientName,
      clientId: client.clientId,
      label: secret.label,
      plaintext,
    });
    await settle();
    const dialog = activeDialog(host);
    const views = descendants(dialog);
    const text = frameText(host);
    for (const expected of [client.clientName, client.clientId, secret.label!, plaintext, 'cannot be shown again'])
      expect(text).toContain(expected);
    expect(views.filter((view) => view instanceof Input)).toHaveLength(0);
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
