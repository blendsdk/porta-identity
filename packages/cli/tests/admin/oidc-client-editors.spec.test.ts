/** Immutable behavior specifications for focused OIDC client editors and credentials. */

import type { GenerateSecretInput, UpdateClientInput } from '@portaidentity/sdk';
import {
  Button,
  CheckGroup,
  ComboBox,
  cover,
  createApplication,
  DataGrid,
  DatePicker,
  Dialog,
  Group,
  GroupBox,
  Input,
  Switch,
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

type EditorResult =
  | { readonly kind: 'update'; readonly clientId: string; readonly input: UpdateClientInput }
  | { readonly kind: 'cancel' };

interface FocusedEditorExports {
  /** Opens the full-page Authentication collection editor. */
  readonly showClientAuthenticationDialog: EditorFunction<EditorResult>;
  /** Opens the full-page Protocol editor. */
  readonly showClientProtocolDialog: EditorFunction<EditorResult>;
  /** Opens the full-page Login experience editor. */
  readonly showClientLoginDialog: EditorFunction<EditorResult>;
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

type EditorFunction<T> = (
  host: ReturnType<typeof createApplication>,
  signal: AbortSignal,
  organization: AdminOrganizationContext,
  client: AdminClient,
) => Promise<T>;

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

/** Verifies the fixed full-page contract shared by the three multi-field editors. */
function expectFullPage(host: ReturnType<typeof createApplication>, dialog: Dialog): void {
  const views = descendants(dialog);
  const save = button(dialog, 'Save');
  const cancel = button(dialog, 'Cancel');
  expect(dialog.isZoomed()).toBe(true);
  expect(dialog.closable || dialog.resizable || dialog.zoomable).toBe(false);
  expect(views.filter((view) => view instanceof GroupBox).length).toBeGreaterThanOrEqual(2);
  expect(views.filter((view) => view instanceof TabView)).toHaveLength(0);
  const saveOrigin = host.loop.renderRoot.originOf(save);
  const cancelOrigin = host.loop.renderRoot.originOf(cancel);
  if (!saveOrigin || !cancelOrigin) throw new Error('Editor actions are not mounted.');
  expect(saveOrigin.y).toBe(cancelOrigin.y);
  expect(saveOrigin.y).toBeGreaterThanOrEqual(dialog.bounds.height - 4);
  for (const action of [save, cancel]) {
    expect(action.layout.size).toBeUndefined();
    expect(action.bounds.width).toBe(action.measure().width);
  }
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
        typeof candidate === 'object' &&
        candidate !== null &&
        'label' in candidate &&
        candidate.label === label,
    );
  if (!item) throw new Error(`${label} choice missing.`);
  combo.value.set(item);
}

/** Replaces dialog-local collection rows without crossing the network boundary. */
function replaceRows(grid: DataGrid<unknown>, values: readonly string[]): void {
  const setRows = Reflect.get(grid, 'setRows');
  if (typeof setRows !== 'function') throw new Error('Collection staging seam missing.');
  Reflect.apply(setRows, grid, [values.map((value, index) => ({ id: String(index), value }))]);
}

/** Reads values from the focused editor's explicit staging seam. */
function stagedValues(grid: DataGrid<unknown>): readonly string[] {
  const getRows = Reflect.get(grid, 'getRows');
  if (typeof getRows !== 'function') throw new Error('Collection staging seam missing.');
  const rows = Reflect.apply(getRows, grid, []);
  if (!Array.isArray(rows)) throw new Error('Collection staging rows missing.');
  return rows.flatMap((row) =>
    typeof row === 'object' && row !== null && 'value' in row && typeof row.value === 'string'
      ? [row.value]
      : [],
  );
}

/** Opens one full-page editor on a real terminal surface. */
async function openEditor(
  kind: 'authentication' | 'protocol' | 'login',
  value: AdminClient = client,
  width = 80,
  height = 24,
) {
  const host = createApplication({ viewport: { width, height } });
  const dialogs = await editorExports();
  const open =
    kind === 'authentication'
      ? dialogs.showClientAuthenticationDialog
      : kind === 'protocol'
        ? dialogs.showClientProtocolDialog
        : dialogs.showClientLoginDialog;
  const pending = open(host, new AbortController().signal, organization, value);
  await settle();
  return { host, pending, dialog: activeDialog(host) };
}

/** Returns the one collection selector and one reused collection grid. */
function collectionControls(dialog: Dialog): {
  readonly selector: ComboBox<unknown>;
  readonly grid: DataGrid<unknown>;
  readonly input: Input;
} {
  const views = descendants(dialog);
  const selector = views.find((view) => view instanceof ComboBox);
  const grid = views.find((view) => view instanceof DataGrid);
  const input = views.find((view) => view instanceof Input && view.getMaxLength() === 2_048);
  if (!(selector instanceof ComboBox) || !(grid instanceof DataGrid) || !(input instanceof Input)) {
    throw new Error('Authentication collection controls missing.');
  }
  return { selector, grid, input };
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

describe('Authentication collection editor', () => {
  it('preserves the selected redirect edit while switching collections at compact geometry', async () => {
    const { host, pending, dialog } = await openEditor('authentication', client, 48, 12);
    expectFullPage(host, dialog);
    let resolved = false;
    void pending.then(() => {
      resolved = true;
    });
    const { selector, grid, input } = collectionControls(dialog);
    grid.focused.set(1);
    host.loop.focusView(grid.rows);
    press(host, 'enter');
    await settle();
    expect(input.getValueSignal().peek()).toBe(client.redirectUris[1]);
    input.getValueSignal().set('https://portal.example.test/edited-callback');
    activate(host, button(dialog, 'Edit'));
    choose(selector, 'Post-logout redirect URIs');
    choose(selector, 'Allowed origins');
    choose(selector, 'Redirect URIs');
    await settle();
    expect(descendants(dialog).filter((view) => view instanceof DataGrid)).toEqual([grid]);
    expect(stagedValues(grid)).toContain('https://portal.example.test/edited-callback');
    expect(grid.selected.peek()).toBe(1);
    input.getValueSignal().set('https://portal.example.test/third-callback');
    activate(host, button(dialog, 'Add'));
    await settle();
    expect(stagedValues(grid)).toContain('https://portal.example.test/third-callback');
    expect(resolved).toBe(false);
    host.loop.endModal('cancel');
    await expect(pending).resolves.toEqual({ kind: 'cancel' });
    expect(client.redirectUris).not.toContain('https://portal.example.test/third-callback');
  });

  it.each([
    ['Redirect URIs', 'https://portal.example.test/callback'],
    ['Post-logout redirect URIs', 'https://portal.example.test/signed-out'],
    ['Allowed origins', 'https://portal.example.test'],
  ])('blocks an exact duplicate in %s', async (collection, duplicate) => {
    const { host, pending, dialog } = await openEditor('authentication');
    const { selector, grid, input } = collectionControls(dialog);
    choose(selector, collection);
    input.getValueSignal().set(duplicate);
    await settle();
    expect(button(dialog, 'Add').state.disabled).toBe(true);
    replaceRows(grid, [duplicate, duplicate]);
    await settle();
    expect(button(dialog, 'Save').state.disabled).toBe(true);
    host.loop.endModal('cancel');
    await pending;
  });

  it.each([
    ['Redirect URIs', ''],
    ['Redirect URIs', 'https://*.example.test/callback'],
    ['Redirect URIs', 'https://example.test/callback#fragment'],
    ['Redirect URIs', 'not a URI'],
    ['Redirect URIs', `https://example.test/${'x'.repeat(2_049)}`],
    ['Allowed origins', 'https://example.test/path'],
    ['Allowed origins', 'https://user:pass@example.test'],
  ])('rejects invalid input in %s: %j', async (collection, invalid) => {
    const { host, pending, dialog } = await openEditor('authentication');
    const { selector, input } = collectionControls(dialog);
    choose(selector, collection);
    const before = stagedValues(collectionControls(dialog).grid);
    input.getValueSignal().set(invalid);
    await settle();
    expect(button(dialog, 'Add').state.disabled).toBe(true);
    expect(frameText(host)).toMatch(/invalid|required/i);
    expect(stagedValues(collectionControls(dialog).grid)).toEqual(before);
    host.loop.endModal('cancel');
    await pending;
  });

  it('disables Remove when one redirect remains selected', async () => {
    const oneRedirect = { ...client, redirectUris: [client.redirectUris[0]!] };
    const { host, pending, dialog } = await openEditor('authentication', oneRedirect);
    expect(button(dialog, 'Remove').state.disabled).toBe(true);
    host.loop.endModal('cancel');
    await pending;
  });

  it.each([
    ['Redirect URIs', 1],
    ['Redirect URIs', 10],
    ['Redirect URIs', 11],
    ['Post-logout redirect URIs', 0],
    ['Post-logout redirect URIs', 10],
    ['Post-logout redirect URIs', 11],
    ['Allowed origins', 0],
    ['Allowed origins', 10],
    ['Allowed origins', 11],
  ])('enforces the %s boundary at %i rows', async (collection, count) => {
    const { host, pending, dialog } = await openEditor('authentication');
    const { selector, grid, input } = collectionControls(dialog);
    choose(selector, collection);
    const origin = collection === 'Allowed origins';
    replaceRows(
      grid,
      Array.from({ length: count }, (_, index) =>
        origin ? `https://site-${index}.example.test` : `https://site.example.test/${index}`,
      ),
    );
    input
      .getValueSignal()
      .set(origin ? 'https://additional.example.test' : 'https://site.example.test/additional');
    await settle();
    expect(button(dialog, 'Add').state.disabled).toBe(count >= 10);
    expect(button(dialog, 'Save').state.disabled).toBe(
      count > 10 || (collection === 'Redirect URIs' && count === 0),
    );
    host.loop.endModal('cancel');
    await pending;
  });

  it('returns one complete ordered collection replacement', async () => {
    const { host, pending, dialog } = await openEditor('authentication');
    const { selector, grid } = collectionControls(dialog);
    const expected = {
      redirectUris: ['https://new.example.test/one', 'https://new.example.test/two'],
      postLogoutRedirectUris: ['https://new.example.test/signed-out'],
      allowedOrigins: ['https://new.example.test', 'https://second.example.test'],
    };
    for (const [label, values] of [
      ['Redirect URIs', expected.redirectUris],
      ['Post-logout redirect URIs', expected.postLogoutRedirectUris],
      ['Allowed origins', expected.allowedOrigins],
    ] as const) {
      choose(selector, label);
      replaceRows(grid, values);
    }
    activate(host, button(dialog, 'Save'));
    await expect(pending).resolves.toEqual({
      kind: 'update',
      clientId: client.id,
      input: expected,
    });
  });
});

describe('Protocol and Login experience editors', () => {
  it.each([
    [
      'public',
      {
        ...client,
        clientType: 'public' as const,
        grantTypes: ['authorization_code', 'refresh_token'] as const,
        tokenEndpointAuthMethod: 'none' as const,
        requirePkce: true,
      },
    ],
    [
      'confidential',
      {
        ...client,
        grantTypes: ['authorization_code', 'client_credentials', 'refresh_token'] as const,
        tokenEndpointAuthMethod: 'client_secret_post' as const,
        requirePkce: false,
      },
    ],
  ])('emits one compatible %s protocol payload', async (_case, value) => {
    const { host, pending, dialog } = await openEditor('protocol', value);
    expectFullPage(host, dialog);
    activate(host, button(dialog, 'Save'));
    await expect(pending).resolves.toEqual({
      kind: 'update',
      clientId: client.id,
      input: {
        grantTypes: value.grantTypes,
        responseTypes: ['code'],
        scope: value.scope,
        tokenEndpointAuthMethod: value.tokenEndpointAuthMethod,
        requirePkce: value.requirePkce,
      },
    });
  });

  it('shows inherited effective methods with editing disabled', async () => {
    const { host, pending, dialog } = await openEditor('login');
    expectFullPage(host, dialog);
    const methods = descendants(dialog).find((view) => view instanceof CheckGroup);
    if (!(methods instanceof CheckGroup)) throw new Error('Login method choices missing.');
    expect(frameText(host)).toContain(organization.name);
    expect(frameText(host)).toContain('Password');
    expect(frameText(host)).toContain('Magic link');
    expect(methods.focusable).toBe(false);
    host.loop.endModal('cancel');
    await pending;
  });

  it.each([
    [['p'], ['password']],
    [['m'], ['magic_link']],
    [
      ['p', 'm'],
      ['password', 'magic_link'],
    ],
  ] as const)('emits explicit methods for %j', async (hotkeys, expected) => {
    const { host, pending, dialog } = await openEditor('login');
    const inheritance = descendants(dialog).find((view) => view instanceof Switch);
    if (!(inheritance instanceof Switch)) throw new Error('Inheritance switch missing.');
    inheritance.select(false);
    for (const key of hotkeys) {
      press(host, key, true);
    }
    activate(host, button(dialog, 'Save'));
    await expect(pending).resolves.toEqual({
      kind: 'update',
      clientId: client.id,
      input: { loginMethods: expected },
    });
  });

  it('disables Save for an empty explicit login-method selection', async () => {
    const { host, pending, dialog } = await openEditor('login');
    const inheritance = descendants(dialog).find((view) => view instanceof Switch);
    if (!(inheritance instanceof Switch)) throw new Error('Inheritance switch missing.');
    inheritance.select(false);
    await settle();
    expect(button(dialog, 'Save').state.disabled).toBe(true);
    host.loop.endModal('cancel');
    await pending;
  });

  it('emits null when organization defaults remain selected', async () => {
    const { host, pending, dialog } = await openEditor('login');
    activate(host, button(dialog, 'Save'));
    await expect(pending).resolves.toEqual({
      kind: 'update',
      clientId: client.id,
      input: { loginMethods: null },
    });
  });
});

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
      'This secret will remain valid until it is revoked. Regular rotation is recommended.',
    );
    expect(descendants(fields.content).filter((view) => view instanceof Dialog)).toHaveLength(0);
  });

  it('uses the complete expiry composition in focused secret generation', async () => {
    const { host, pending, dialog } = await openGenerator();
    const views = descendants(dialog);
    const combo = views.find((view) => view instanceof ComboBox);
    if (!(combo instanceof ComboBox)) throw new Error('Shared expiry choice missing.');
    expect(combo.items.peek()).toHaveLength(6);
    expect(
      views.filter((view) => view instanceof Input).every((input) => input.bounds.height === 1),
    ).toBe(true);
    choose(combo, 'Never');
    await settle();
    expect(frameText(host)).toMatch(/Regular.*rotation is recommended\./s);
    const generate = button(dialog, 'Generate');
    expect(generate.layout.size).toBeUndefined();
    expect(generate.bounds.width).toBe(generate.measure().width);
    activate(host, generate);
    await expect(pending).resolves.toEqual({ kind: 'generate', clientId: client.id });
  });

  it.each(['x'.repeat(256), 'bad\u001b'])(
    'disables Generate for unsafe label %j',
    async (label) => {
      const { host, pending, dialog } = await openGenerator();
      const input = descendants(dialog).find(
        (view) => view instanceof Input && view.getMaxLength() === 255,
      );
      if (!(input instanceof Input)) throw new Error('Secret label input missing.');
      input.getValueSignal().set(label);
      await settle();
      expect(button(dialog, 'Generate').state.disabled).toBe(true);
      host.loop.endModal('cancel');
      await pending;
    },
  );

  it('keeps an empty credential DataGrid and Generate visible', async () => {
    const mounted = await mountCredentials([]);
    const grid = descendants(mounted.workspace.content).find((view) => view instanceof DataGrid);
    expect(grid).toBeInstanceOf(DataGrid);
    for (const heading of ['Label', 'Status', 'Last used', 'Expires']) {
      expect(frameText(mounted.host)).toContain(heading);
    }
    if (!(grid instanceof DataGrid)) throw new Error('Credential grid missing.');
    mounted.host.loop.focusView(grid.rows);
    for (let index = 0; index < 40; index += 1) {
      press(mounted.host, 'right');
    }
    expect(frameText(mounted.host)).toContain('Created');
    expect(button(mounted.workspace.content, 'Generate').state.disabled).toBe(false);
  });

  it('revokes only the selected active secret', async () => {
    const revoked: AdminClientSecret = {
      id: '44444444-4444-4444-8444-444444444444',
      clientId: client.id,
      label: 'Old',
      status: 'revoked',
      lastUsedAt: null,
      expiresAt: null,
      createdAt: '2026-01-01T00:00:00Z',
    };
    const active: AdminClientSecret = {
      ...revoked,
      id: '55555555-5555-4555-8555-555555555555',
      label: 'Current',
      status: 'active',
    };
    const mounted = await mountCredentials([revoked, active]);
    const grid = descendants(mounted.workspace.content).find((view) => view instanceof DataGrid);
    if (!(grid instanceof DataGrid)) throw new Error('Credential grid missing.');
    const revoke = button(mounted.workspace.content, 'Revoke');
    expect(revoke.state.disabled).toBe(true);
    grid.focused.set(1);
    mounted.host.loop.focusView(grid.rows);
    press(mounted.host, 'enter');
    await settle();
    expect(revoke.state.disabled).toBe(false);
    activate(mounted.host, revoke);
    expect(mounted.intents).toContainEqual({
      kind: 'revoke-secret',
      clientId: client.id,
      secretId: active.id,
    });
  });

  it('cancels a focused editor synchronously when its context owner aborts', async () => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const controller = new AbortController();
    const pending = (await editorExports()).showClientAuthenticationDialog(
      host,
      controller.signal,
      organization,
      client,
    );
    await settle();
    controller.abort();
    await expect(pending).resolves.toEqual({ kind: 'cancel' });
    expect(host.desktop.activeWindow()).toBeNull();
  });
});
