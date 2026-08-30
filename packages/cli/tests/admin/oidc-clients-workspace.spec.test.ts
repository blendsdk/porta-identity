/** Observable specifications for selected-organization OIDC client administration. */

import {
  at,
  Button,
  createApplication,
  DataGrid,
  Dialog,
  Group,
  Input,
  Scroller,
  TabView,
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
  canPurgeUsers: false,
  canReadApplications: true,
  canCreateApplications: false,
  canUpdateApplications: false,
  canArchiveApplications: false,
  canReadClients: true,
  canCreateClients: true,
  canUpdateClients: true,
  canRevokeClients: true,
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
  readonly showClientConfigurationDialog: (
    host: ReturnType<typeof createApplication>,
    signal: AbortSignal,
    options:
      | {
          readonly mode: 'create';
          readonly organization: AdminOrganizationContext;
          readonly applications: readonly (typeof application)[];
          readonly initialTab: 'Basic';
        }
      | {
          readonly mode: 'edit';
          readonly organization: AdminOrganizationContext;
          readonly client: AdminClient;
          readonly initialTab: 'Basic' | 'Redirects' | 'Protocol' | 'Login';
        },
  ) => Promise<unknown>;
  readonly showClientLifecycleDialog: (
    host: ReturnType<typeof createApplication>,
    signal: AbortSignal,
    action: 'deactivate' | 'revoke',
    organization: AdminOrganizationContext,
    client: AdminClient,
  ) => Promise<unknown>;
  readonly showGenerateClientSecretDialog: (
    host: ReturnType<typeof createApplication>,
    signal: AbortSignal,
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

/** Submits a modal through its ordinary command route so validation runs. */
function submit(host: ReturnType<typeof createApplication>, dialog: Dialog): void {
  const button = descendants(dialog)
    .filter((view) => view instanceof Button)
    .find((candidate) => candidate.activation.command === 'ok');
  if (!button) throw new Error('Submit control missing.');
  activate(host, button);
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

  it.each([
    ['inactive', { ...client, status: 'inactive' as const }, true],
    ['revoked', { ...client, status: 'revoked' as const }, false],
  ])('renders complete %s detail with immutable context and correct editability', async (_status, value, editable) => {
    const mounted = await mountWorkspace({ organization });
    mounted.workspace.setState({ kind: 'detail', organizationId: organization.id, clients: [value], client: value, applicationName: application.name, secrets: [secret] });
    await settle();
    const text = frameText(mounted.host);
    for (const expected of [organization.name, application.name, value.clientId, value.clientType, value.applicationType, 'Basic', 'Redirects', 'Protocol', 'Login', 'Secrets'])
      expect(text).toContain(expected);
    const mutationButtons = descendants(mounted.window).filter((view) => view instanceof Button).filter((button) => ['Basic', 'Redirects', 'Protocol', 'Login', 'Secrets'].includes(button.activation.label));
    expect(mutationButtons.every((button) => !button.state.disabled)).toBe(editable);
    if (!editable) expect(text).toContain('Revoked clients are read only');
  });

  it('uses the immutable application ID in detail when application read is unavailable', async () => {
    const mounted = await mountWorkspace({ organization, capabilities: { ...capabilities, canReadApplications: false } });
    mounted.workspace.setState({ kind: 'detail', organizationId: organization.id, clients: [client], client, applicationName: 'Must not be disclosed', secrets: [] });
    await settle();
    expect(frameText(mounted.host)).toContain(application.id);
    expect(frameText(mounted.host)).not.toContain('Must not be disclosed');
  });

  it('renders metadata-only secrets, fixed capability states, and legacy transition guidance', async () => {
    const mounted = await mountWorkspace({ organization });
    mounted.workspace.setState({ kind: 'secrets', organizationId: organization.id, clients: [client], client, applicationName: application.name, secrets: [secret], legacyOnly: true });
    await settle();
    const text = frameText(mounted.host);
    expect(descendants(mounted.window).find((view) => view instanceof DataGrid)).toBeInstanceOf(DataGrid);
    for (const expected of ['Label', 'Status', 'Last used', 'Expires', 'Created', secret.label!, 'Generate a modern secret'])
      expect(text).toContain(expected);
    expect(text).not.toMatch(/plaintext|secret-value/i);
    expect(descendants(mounted.window).filter((view) => view instanceof Button).map((button) => button.activation.label)).toEqual(expect.arrayContaining(['Generate', 'Revoke']));
  });

  it.each([
    ['public', { ...client, clientType: 'public' as const }],
    ['revoked', { ...client, status: 'revoked' as const }],
  ])('keeps secret mutation visible-disabled for a %s client', async (_case, value) => {
    const mounted = await mountWorkspace({ organization });
    mounted.workspace.setState({ kind: 'secrets', organizationId: organization.id, clients: [value], client: value, applicationName: application.name, secrets: [] });
    await settle();
    const actions = descendants(mounted.window).filter((view) => view instanceof Button).filter((button) => ['Generate', 'Revoke'].includes(button.activation.label));
    expect(actions).toHaveLength(2);
    expect(actions.every((button) => button.state.disabled)).toBe(true);
  });

  it('keeps revocation visible-disabled for an already-revoked secret row', async () => {
    const mounted = await mountWorkspace({ organization });
    mounted.workspace.setState({ kind: 'secrets', organizationId: organization.id, clients: [client], client, applicationName: application.name, secrets: [{ ...secret, status: 'revoked' }] });
    await settle();
    const revoke = descendants(mounted.window).filter((view) => view instanceof Button).find((button) => button.activation.label === 'Revoke');
    expect(revoke?.state.disabled).toBe(true);
  });
});

describe('OIDC client configuration dialogs', () => {
  it.each(['Basic', 'Redirects', 'Protocol', 'Login'] as const)('opens the shared movable Layout DSL dialog on %s', async (initialTab) => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const pending = (await dialogExports()).showClientConfigurationDialog(host, new AbortController().signal, { mode: 'edit', organization, client, initialTab });
    await settle();
    const dialog = activeDialog(host);
    const views = descendants(dialog);
    expect(dialog.movable).toBe(true);
    expect(views.find((view) => view instanceof TabView)).toBeInstanceOf(TabView);
    expect(views.find((view) => view instanceof Scroller)).toBeInstanceOf(Scroller);
    expect(frameText(host)).toContain(initialTab);
    expect(views.filter((view) => view instanceof Input).every((input) => input.layout.position !== 'absolute')).toBe(true);
    host.loop.endModal('cancel');
    await expect(pending).resolves.toEqual({ kind: 'cancel' });
  });

  it('opens create on Basic with immutable owner/type selectors and collection DataGrid row actions', async () => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const pending = (await dialogExports()).showClientConfigurationDialog(host, new AbortController().signal, { mode: 'create', organization, applications: [application], initialTab: 'Basic' });
    await settle();
    const dialog = activeDialog(host);
    const views = descendants(dialog);
    expect(frameText(host)).toContain('Basic');
    expect(frameText(host)).toContain(organization.name);
    expect(frameText(host)).toContain(application.name);
    expect(frameText(host)).toMatch(/Application type.*Client type/s);
    expect(views.filter((view) => view instanceof DataGrid)).toHaveLength(3);
    expect(views.filter((view) => view instanceof Button).map((button) => button.activation.label)).toEqual(expect.arrayContaining(['Add', 'Edit', 'Remove']));
    host.loop.endModal('cancel');
    await pending;
  });

  it.each([[80, 24], [48, 12]])('keeps every single-line input one row and reachable through vertical scrolling at %sx%s', async (width, height) => {
    const host = createApplication({ viewport: { width, height } });
    const pending = (await dialogExports()).showClientConfigurationDialog(host, new AbortController().signal, { mode: 'edit', organization, client, initialTab: 'Protocol' });
    await settle();
    const dialog = activeDialog(host);
    const views = descendants(dialog);
    expect(dialog.bounds.width).toBeLessThanOrEqual(width);
    expect(dialog.bounds.height).toBeLessThanOrEqual(height);
    expect(views.filter((view) => view instanceof Input).every((input) => input.bounds.height === 1)).toBe(true);
    expect(views.find((view) => view instanceof Scroller)).toBeInstanceOf(Scroller);
    expect(frameText(host)).not.toContain('[jsvision/ui');
    host.loop.endModal('cancel');
    await pending;
  });

  it('omits untouched server defaults and immutable generated/context fields from create payload', async () => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const pending = (await dialogExports()).showClientConfigurationDialog(host, new AbortController().signal, { mode: 'create', organization, applications: [application], initialTab: 'Basic' });
    await settle();
    const dialog = activeDialog(host);
    const inputs = descendants(dialog).filter((view) => view instanceof Input);
    inputs.find((input) => input.getMaxLength() === 255)?.getValueSignal().set('New Client');
    const redirectGrid = descendants(dialog).find((view) => view instanceof DataGrid);
    if (!(redirectGrid instanceof DataGrid)) throw new Error('Redirect collection grid missing.');
    redirectGrid.setRows([{ id: 'redirect', value: 'https://portal.example.test/callback' }]);
    expect(frameText(host)).toContain('Server default');
    submit(host, dialog);
    await expect(pending).resolves.toEqual({
      kind: 'create',
      input: {
        applicationId: application.id,
        clientName: 'New Client',
        clientType: 'confidential',
        applicationType: 'web',
        redirectUris: ['https://portal.example.test/callback'],
      },
    });
  });

  it.each([
    ['name', '', false], ['name', 'x', true], ['name', 'x'.repeat(255), true], ['name', 'x'.repeat(256), false], ['name', 'bad\u001b', false],
    ['scope', '', true], ['scope', 'x', true], ['scope', 'x'.repeat(2_048), true], ['scope', 'x'.repeat(2_049), false], ['scope', 'bad\u0085', false],
  ])('enforces the exact adjacent single-value boundary for %s', async (field, value, accepted) => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const pending = (await dialogExports()).showClientConfigurationDialog(host, new AbortController().signal, { mode: 'edit', organization, client, initialTab: field === 'name' ? 'Basic' : 'Protocol' });
    await settle();
    const dialog = activeDialog(host);
    const inputs = descendants(dialog).filter((view) => view instanceof Input);
    const target = inputs.find((input) => input.getMaxLength() === (field === 'name' ? 255 : 2_048));
    if (!target) throw new Error(`${field} input missing.`);
    target.getValueSignal().set(value);
    submit(host, dialog);
    await settle();
    expect(host.desktop.activeWindow() !== dialog).toBe(accepted);
    if (!accepted) host.loop.endModal('cancel');
    await pending;
  });

  it.each([
    ['redirect minimum', ['https://a.example/callback'], true],
    ['redirect maximum count', Array.from({ length: 10 }, (_, index) => `https://a.example/${index}`), true],
    ['redirect empty', [], false],
    ['redirect too many', Array.from({ length: 11 }, (_, index) => `https://a.example/${index}`), false],
    ['redirect fragment', ['https://a.example/callback#fragment'], false],
    ['redirect wildcard', ['https://*.example/callback'], false],
    ['origin empty', [], true],
    ['origin maximum count', Array.from({ length: 10 }, (_, index) => `https://a${index}.example`), true],
    ['origin too many', Array.from({ length: 11 }, (_, index) => `https://a${index}.example`), false],
    ['origin path', ['https://a.example/path'], false],
    ['origin credentials', ['https://user:pass@a.example'], false],
  ])('enforces collection boundary: %s', async (_case, values, accepted) => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const pending = (await dialogExports()).showClientConfigurationDialog(host, new AbortController().signal, { mode: 'edit', organization, client, initialTab: _case.startsWith('origin') ? 'Protocol' : 'Redirects' });
    await settle();
    const dialog = activeDialog(host);
    const grids = descendants(dialog).filter((view) => view instanceof DataGrid);
    const grid = grids[_case.startsWith('origin') ? 2 : 0];
    if (!(grid instanceof DataGrid)) throw new Error('Collection grid missing.');
    grid.setRows(values.map((value, index) => ({ id: String(index), value })));
    submit(host, dialog);
    await settle();
    expect(host.desktop.activeWindow() !== dialog).toBe(accepted);
    if (!accepted) host.loop.endModal('cancel');
    await pending;
  });
});

describe('client lifecycle and one-time secrets', () => {
  it.each(['deactivate', 'revoke'] as const)('names client and organization before %s with no restore path', async (action) => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const pending = (await dialogExports()).showClientLifecycleDialog(host, new AbortController().signal, action, organization, client);
    await settle();
    expect(frameText(host)).toContain(client.clientName);
    expect(frameText(host)).toContain(organization.name);
    if (action === 'revoke') expect(frameText(host)).toContain('permanent');
    expect(frameText(host)).not.toContain('Restore');
    host.loop.endModal('cancel');
    await pending;
  });

  it.each([
    ['label omitted', '', '', true], ['label maximum', 'x'.repeat(255), '', true],
    ['label too long', 'x'.repeat(256), '', false], ['label control', 'bad\u001b', '', false],
    ['expiry omitted', '', '', true], ['expiry valid', '', '2027-01-01T00:00:00Z', true],
    ['expiry malformed', '', 'tomorrow', false],
    ['expiry nonexistent date', '', '2027-02-30T00:00:00Z', false],
    ['expiry normalized hour', '', '2027-01-01T24:00:00Z', false],
  ])('validates secret generation boundary: %s', async (_case, label, expiry, accepted) => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const pending = (await dialogExports()).showGenerateClientSecretDialog(host, new AbortController().signal, client);
    await settle();
    const dialog = activeDialog(host);
    const inputs = descendants(dialog).filter((view) => view instanceof Input);
    expect(inputs.every((input) => input.bounds.height === 1)).toBe(true);
    inputs[0]?.getValueSignal().set(label);
    inputs[1]?.getValueSignal().set(expiry);
    submit(host, dialog);
    await settle();
    expect(host.desktop.activeWindow() !== dialog).toBe(accepted);
    if (!accepted) host.loop.endModal('cancel');
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
