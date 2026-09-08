/** Immutable behavior specifications for focused OIDC client editors and credentials. */

import type { GenerateSecretInput } from '@portaidentity/sdk';
import {
  Button,
  ComboBox,
  cover,
  createApplication,
  DataGrid,
  DatePicker,
  Dialog,
  Group,
  GroupBox,
  Input,
  Scroller,
  TabView,
  View,
} from '@jsvision/ui';
import { describe, expect, it } from 'vitest';

import { createClientSecretExpiryFields } from '../../src/admin/client-credential-dialogs.js';
import type { AdminClient, AdminClientSecret } from '../../src/admin/client-state.js';
import type { AdminCapabilities, AdminOrganizationContext } from '../../src/admin/state.js';

const organization: AdminOrganizationContext = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Example Organization',
  slug: 'example',
  status: 'active',
};
const client: AdminClient = {
  id: '33333333-3333-4333-8333-333333333333',
  organizationId: organization.id,
  applicationId: '22222222-2222-4222-8222-222222222222',
  clientId: 'porta-generated-client-id',
  clientName: 'Portal Web Client',
  clientType: 'confidential',
  applicationType: 'web',
  redirectUris: [
    'https://portal.example.test/callback',
    'https://portal.example.test/second-callback',
  ],
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

interface FocusedEditorExports {
  /** Opens focused client-secret generation with the shared expiry composition. */
  readonly showGenerateClientSecretDialog: (
    host: ReturnType<typeof createApplication>,
    signal: AbortSignal,
    client: AdminClient,
  ) => Promise<
    | { readonly kind: 'generate'; readonly clientId: string; readonly input?: GenerateSecretInput }
    | { readonly kind: 'cancel' }
  >;
}

/** Loads focused dialogs through their stable facade only when a specification executes. */
async function editorExports(): Promise<FocusedEditorExports> {
  return (await import('../../src/admin/client-dialogs.js')) as FocusedEditorExports;
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

/** Returns the active editor dialog. */
function activeDialog(host: ReturnType<typeof createApplication>): Dialog {
  const dialog = host.desktop.activeWindow();
  if (!(dialog instanceof Dialog)) throw new Error('Expected a focused client editor.');
  return dialog;
}

/** Returns a visible action by label. */
function button(root: View, label: string): Button {
  const result = descendants(root)
    .filter((view) => view instanceof Button)
    .find((candidate) => candidate.activation.label === label);
  if (!result) throw new Error(`${label} button missing.`);
  return result;
}

/** Activates a control through the ordinary keyboard route. */
function activate(host: ReturnType<typeof createApplication>, action: Button): void {
  host.loop.focusView(action);
  press(host, 'space');
}

/** Dispatches one keyboard event through the ordinary application loop. */
function press(host: ReturnType<typeof createApplication>, key: string, alt = false): void {
  host.loop.dispatch({
    type: 'key',
    key,
    codepoint: key.codePointAt(0),
    ctrl: false,
    alt,
    shift: false,
  });
}

/** Selects one labelled ComboBox item through its public value signal. */
function choose(combo: ComboBox<unknown>, label: string): void {
  const item = combo.items
    .peek()
    .find(
      (candidate): candidate is { readonly label: string } =>
        typeof candidate === 'object' && candidate !== null && 'label' in candidate &&
        candidate.label === label,
    );
  if (!item) throw new Error(`${label} choice missing.`);
  combo.value.set(item);
}

/** Opens the credential generator on a real terminal surface. */
async function openGenerator() {
  const host = createApplication({ viewport: { width: 80, height: 24 } });
  const pending = (await editorExports()).showGenerateClientSecretDialog(
    host,
    new AbortController().signal,
    client,
  );
  await settle();
  return { host, pending, dialog: activeDialog(host) };
}

/** Mounts the feature-local expiry composition inside a filling root group. */
function mountExpiry(fields: ReturnType<typeof createClientSecretExpiryFields>) {
  const content = new Group();
  content.add(cover(fields.content));
  return createApplication({ content, viewport: { width: 70, height: 10 } });
}

/** Mounts the credential projection and collects emitted workspace intents. */
async function mountCredentials(secrets: readonly AdminClientSecret[]) {
  const intents: unknown[] = [];
  const { createAdminClientWorkspace } = await import('../../src/admin/client-workspace.js');
  const workspace = createAdminClientWorkspace({
    organization,
    applications: [],
    capabilities,
    onIntent: (intent) => intents.push(intent),
  });
  const host = createApplication({
    content: workspace.content,
    viewport: { width: 80, height: 24 },
  });
  workspace.setState({
    kind: 'secrets',
    organizationId: organization.id,
    clients: [client],
    client,
    applicationName: 'Customer Portal',
    secrets,
  });
  await settle();
  return { host, intents, workspace };
}

describe('shared secret expiry and Credentials', () => {
  it.each([
    ['2026-09-07T12:00:00Z', '3 months', '2026-12-08T00:00:00.000Z'],
    ['2026-09-07T12:00:00Z', '6 months', '2027-03-08T00:00:00.000Z'],
    ['2026-09-07T12:00:00Z', '12 months', '2027-09-08T00:00:00.000Z'],
    ['2026-09-07T12:00:00Z', '24 months', '2028-09-08T00:00:00.000Z'],
    ['2026-01-31T12:00:00Z', '3 months', '2026-05-01T00:00:00.000Z'],
  ])('serializes %s from %s as %s', (now, choice, expected) => {
    const fields = createClientSecretExpiryFields(new Date(now));
    const combo = descendants(fields.content).find((view) => view instanceof ComboBox);
    if (!(combo instanceof ComboBox)) throw new Error('Expiry choice missing.');
    choose(combo, choice);
    expect(fields.expiresAt()).toBe(expected);
  });

  it('serializes a custom civil date on the following UTC day', async () => {
    const fields = createClientSecretExpiryFields(new Date('2026-09-07T12:00:00Z'));
    const host = mountExpiry(fields);
    const combo = descendants(fields.content).find((view) => view instanceof ComboBox);
    if (!(combo instanceof ComboBox)) throw new Error('Expiry choice missing.');
    choose(combo, 'Custom');
    await settle();
    const picker = descendants(fields.content).find((view) => view instanceof DatePicker);
    if (!(picker instanceof DatePicker)) throw new Error('Custom date picker missing.');
    const lines = frameText(host).split('\n');
    expect(lines.findIndex((line) => line.includes('Custom date'))).toBe(
      lines.findIndex((line) => line.includes('Expires')) + 2,
    );
    picker.value.set({ year: 2027, month: 3, day: 31 });
    expect(fields.expiresAt()).toBe('2027-04-01T00:00:00.000Z');
    expect(frameText(host)).toContain('Custom date');
  });

  it.each([
    [{ year: 2026, month: 9, day: 7 }, false, /future/i],
    [{ year: 2026, month: 9, day: 6 }, false, /future/i],
    [{ year: 2028, month: 9, day: 8 }, true, /after 24 months/i],
  ] as const)(
    'validates custom date %j without an extra confirmation',
    async (date, valid, guidance) => {
      const fields = createClientSecretExpiryFields(new Date('2026-09-07T12:00:00Z'));
      const host = mountExpiry(fields);
      const combo = descendants(fields.content).find((view) => view instanceof ComboBox);
      if (!(combo instanceof ComboBox)) throw new Error('Expiry choice missing.');
      choose(combo, 'Custom');
      await settle();
      const picker = descendants(fields.content).find((view) => view instanceof DatePicker);
      if (!(picker instanceof DatePicker)) throw new Error('Custom date picker missing.');
      picker.value.set(date);
      await settle();
      expect(fields.isValid()).toBe(valid);
      expect(frameText(host).replace(/\s+/g, ' ')).toMatch(guidance);
      expect(descendants(fields.content).filter((view) => view instanceof Dialog)).toHaveLength(0);
    },
  );

  it('omits Never and shows its complete warning', async () => {
    const fields = createClientSecretExpiryFields(new Date('2026-09-07T12:00:00Z'));
    const host = mountExpiry(fields);
    const combo = descendants(fields.content).find((view) => view instanceof ComboBox);
    if (!(combo instanceof ComboBox)) throw new Error('Expiry choice missing.');
    choose(combo, 'Never');
    await settle();
    expect(fields.expiresAt()).toBeUndefined();
    expect(frameText(host).replace(/\s+/g, ' ')).toContain(
      'This secret will remain valid until it is deleted. Regular rotation is recommended.',
    );
    expect(descendants(fields.content).filter((view) => view instanceof Dialog)).toHaveLength(0);
  });

  it('uses the complete expiry composition in focused secret generation', async () => {
    const { host, pending, dialog } = await openGenerator();
    const views = descendants(dialog);
    expect(views.some((view) => view instanceof GroupBox)).toBe(false);
    expect(views.some((view) => view instanceof Scroller)).toBe(false);
    const combo = views.find((view) => view instanceof ComboBox);
    if (!(combo instanceof ComboBox)) throw new Error('Shared expiry choice missing.');
    expect(combo.items.peek()).toHaveLength(6);
    expect(
      views.filter((view) => view instanceof Input).every((input) => input.bounds.height === 1),
    ).toBe(true);
    choose(combo, 'Never');
    await settle();
    expect(frameText(host)).toMatch(/Regular.*rotation is recommended\./s);
    const add = button(dialog, 'Add');
    expect(add.layout.size).toBeUndefined();
    expect(add.bounds.width).toBe(add.measure().width);
    activate(host, add);
    await expect(pending).resolves.toEqual({ kind: 'generate', clientId: client.id });
  });

  it.each(['x'.repeat(256), 'bad\u001b'])(
    'disables Add for unsafe label %j',
    async (label) => {
      const { host, pending, dialog } = await openGenerator();
      const input = descendants(dialog).find(
        (view) => view instanceof Input && view.getMaxLength() === 255,
      );
      if (!(input instanceof Input)) throw new Error('Secret label input missing.');
      input.getValueSignal().set(label);
      await settle();
      expect(button(dialog, 'Add').state.disabled).toBe(true);
      host.loop.endModal('cancel');
      await pending;
    },
  );

  it('keeps an unframed empty credential DataGrid and Add visible', async () => {
    const mounted = await mountCredentials([]);
    const tabs = descendants(mounted.workspace.content).find((view) => view instanceof TabView);
    if (!(tabs instanceof TabView)) throw new Error('Client tabs missing.');
    const credentials = tabs.tabs.peek()[4]?.content;
    if (!credentials) throw new Error('Credentials tab missing.');
    const grid = descendants(credentials).find((view) => view instanceof DataGrid);
    expect(grid).toBeInstanceOf(DataGrid);
    expect(descendants(credentials).some((view) => view instanceof GroupBox)).toBe(false);
    for (const heading of ['Label', 'Status', 'Last used', 'Expires']) {
      expect(frameText(mounted.host)).toContain(heading);
    }
    if (!(grid instanceof DataGrid)) throw new Error('Credential grid missing.');
    mounted.host.loop.focusView(grid.rows);
    for (let index = 0; index < 40; index += 1) {
      press(mounted.host, 'right');
    }
    expect(frameText(mounted.host)).toContain('Created');
    expect(button(credentials, 'Add').state.disabled).toBe(false);
    expect(button(credentials, 'Delete').state.disabled).toBe(true);
  });

  it('deletes only the selected secret', async () => {
    const first: AdminClientSecret = {
      id: '44444444-4444-4444-8444-444444444444',
      clientId: client.id,
      label: 'Old',
      status: 'active',
      lastUsedAt: null,
      expiresAt: null,
      createdAt: '2026-01-01T00:00:00Z',
    };
    const second: AdminClientSecret = {
      ...first,
      id: '55555555-5555-4555-8555-555555555555',
      label: 'Current',
      status: 'active',
    };
    const mounted = await mountCredentials([first, second]);
    const tabs = descendants(mounted.workspace.content).find((view) => view instanceof TabView);
    if (!(tabs instanceof TabView)) throw new Error('Client tabs missing.');
    const credentials = tabs.tabs.peek()[4]?.content;
    if (!credentials) throw new Error('Credentials tab missing.');
    const grid = descendants(credentials).find((view) => view instanceof DataGrid);
    if (!(grid instanceof DataGrid)) throw new Error('Credential grid missing.');
    const remove = button(credentials, 'Delete');
    expect(remove.state.disabled).toBe(false);
    grid.focused.set(1);
    mounted.host.loop.focusView(grid.rows);
    press(mounted.host, 'enter');
    await settle();
    expect(remove.state.disabled).toBe(false);
    activate(mounted.host, remove);
    expect(mounted.intents).toContainEqual({
      kind: 'delete-secret',
      clientId: client.id,
      secretId: second.id,
    });
  });

});
