/** Immutable presentation specifications for the five Admin UI deletion surfaces. */

import {
  Button,
  createApplication,
  DataGrid,
  Dialog,
  Group,
  ListView,
  Scroller,
  TabView,
  View,
} from '@jsvision/ui';
import { describe, expect, it } from 'vitest';

const organization = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Example Organization',
  slug: 'example-organization',
  status: 'active' as const,
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
const moduleRow = {
  id: '33333333-3333-4333-8333-333333333333',
  applicationId: application.id,
  name: 'Billing',
  slug: 'billing',
  description: null,
  status: 'active' as const,
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-08-02T00:00:00Z',
};
const client = {
  id: '44444444-4444-4444-8444-444444444444',
  organizationId: organization.id,
  applicationId: application.id,
  clientId: 'porta-client',
  clientName: 'Portal Web Client',
  clientType: 'confidential' as const,
  applicationType: 'web' as const,
  redirectUris: ['https://client.example.test/callback'],
  postLogoutRedirectUris: [],
  grantTypes: ['authorization_code' as const],
  responseTypes: ['code' as const],
  scope: 'openid',
  tokenEndpointAuthMethod: 'client_secret_basic' as const,
  allowedOrigins: ['https://client.example.test'],
  requirePkce: true,
  loginMethods: null,
  effectiveLoginMethods: ['password' as const],
  status: 'active' as const,
  createdAt: '2026-01-03T00:00:00Z',
  updatedAt: '2026-08-03T00:00:00Z',
};
const user = {
  id: '55555555-5555-4555-8555-555555555555',
  organizationId: organization.id,
  email: 'alice@example.test',
  givenName: 'Alice',
  middleName: null,
  familyName: 'Admin',
  nickname: 'Ali',
  preferredUsername: 'alice',
  profileUrl: null,
  pictureUrl: null,
  websiteUrl: null,
  gender: null,
  birthdate: null,
  zoneinfo: null,
  locale: null,
  phoneNumber: null,
  phoneNumberVerified: false,
  addressStreet: null,
  addressLocality: null,
  addressRegion: null,
  addressPostalCode: null,
  addressCountry: null,
  emailVerified: false,
  hasPassword: true,
  twoFactorEnabled: false,
  status: 'active' as const,
  lastLoginAt: null,
  loginCount: 0,
  createdAt: '2026-01-04T00:00:00Z',
  updatedAt: '2026-08-04T00:00:00Z',
};

interface DeleteDialogCase {
  readonly label: string;
  readonly modulePath: string;
  readonly exportName: string;
  readonly args: readonly unknown[];
  readonly target: string;
  readonly affected: readonly string[];
}

const dialogCases: readonly DeleteDialogCase[] = [
  {
    label: 'organization',
    modulePath: '../../src/admin/organization-dialogs.js',
    exportName: 'showDeleteOrganizationDialog',
    args: [organization],
    target: organization.name,
    affected: ['users', 'clients', 'security data'],
  },
  {
    label: 'user',
    modulePath: '../../src/admin/user-dialogs.js',
    exportName: 'showDeleteUserDialog',
    args: [organization, user],
    target: user.email,
    affected: ['identity', 'security data', 'audit'],
  },
  {
    label: 'application',
    modulePath: '../../src/admin/application-dialogs.js',
    exportName: 'showDeleteApplicationDialog',
    args: [application],
    target: application.name,
    affected: ['deployment-global', 'modules', 'clients', 'roles', 'permissions', 'claims'],
  },
  {
    label: 'module',
    modulePath: '../../src/admin/application-dialogs.js',
    exportName: 'showDeleteModuleDialog',
    args: [application, moduleRow],
    target: moduleRow.name,
    affected: ['permissions', 'dependent links'],
  },
  {
    label: 'client',
    modulePath: '../../src/admin/client-dialogs.js',
    exportName: 'showDeleteClientDialog',
    args: [organization, client],
    target: client.clientName,
    affected: ['secrets', 'client', 'grant', 'protocol'],
  },
];

/** Collects all descendants from an ordinary JSVision view tree. */
function descendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(root);
  return result;
}

/** Reads the full terminal frame and normalizes wrapping for semantic assertions. */
function frameText(host: ReturnType<typeof createApplication>): string {
  return host.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

/** Lets modal mounting, focus, and reactive layout settle. */
async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

/** Loads one future dialog export without preventing the immutable suite from collecting. */
async function deleteDialog(
  testCase: DeleteDialogCase,
): Promise<(...args: unknown[]) => Promise<unknown>> {
  const exports = (await import(testCase.modulePath)) as object;
  const candidate = Reflect.get(exports, testCase.exportName);
  expect(typeof candidate).toBe('function');
  if (typeof candidate !== 'function') throw new TypeError(`Missing ${testCase.exportName}`);
  return (...args) => Promise.resolve(Reflect.apply(candidate, undefined, args));
}

/** Returns the active confirmation dialog and its buttons. */
function activeForm(host: ReturnType<typeof createApplication>): {
  readonly dialog: Dialog;
  readonly buttons: readonly Button[];
} {
  const dialog = host.desktop.activeWindow();
  if (!(dialog instanceof Dialog)) throw new Error('Expected a mounted deletion dialog.');
  return {
    dialog,
    buttons: descendants(dialog).filter((view): view is Button => view instanceof Button),
  };
}

/** Activates a mounted control through the ordinary keyboard route. */
function activate(host: ReturnType<typeof createApplication>, button: Button): void {
  host.loop.focusView(button);
  host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
}

/** Replaces only the displayed delete target while retaining every parent identifier. */
function argsWithTarget(testCase: DeleteDialogCase, target: string): readonly unknown[] {
  switch (testCase.label) {
    case 'organization':
      return [{ ...organization, name: target }];
    case 'user':
      return [organization, { ...user, email: target }];
    case 'application':
      return [{ ...application, name: target }];
    case 'module':
      return [application, { ...moduleRow, name: target }];
    case 'client':
      return [organization, { ...client, clientName: target }];
    default:
      throw new Error(`Unsupported deletion dialog case: ${testCase.label}`);
  }
}

describe.each(dialogCases)('$label deletion dialog', (testCase) => {
  it.each([
    { width: 80, height: 24 },
    { width: 48, height: 12 },
  ])('ST-36/ST-38 keeps the complete safe warning readable at $width×$height', async (viewport) => {
    const host = createApplication({ viewport });
    const show = await deleteDialog(testCase);
    const result = show(host, new AbortController().signal, ...testCase.args);
    await settle();

    const { dialog, buttons } = activeForm(host);
    const normalized = frameText(host).replace(/\s+/g, ' ');
    expect(dialog.bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(dialog.bounds.height).toBeLessThanOrEqual(viewport.height);
    expect(normalized).toContain(testCase.target);
    for (const affected of testCase.affected) expect(normalized.toLowerCase()).toContain(affected);
    expect(buttons.map((button) => button.activation.label)).toContain('Keep');
    expect(buttons.some((button) => button.activation.label.startsWith('Delete '))).toBe(true);
    expect((host.loop.getFocused() as Button).activation.label).toBe('Keep');

    host.loop.dispatch({ type: 'key', key: 'escape', ctrl: false, alt: false, shift: false });
    await expect(result).resolves.toEqual({ kind: 'cancel' });
    expect(host.desktop.activeWindow()).toBeNull();
  });

  it('ST-33/ST-37 provides measured Keep/Delete-name actions and Keep performs no deletion', async () => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const show = await deleteDialog(testCase);
    const result = show(host, new AbortController().signal, ...testCase.args);
    await settle();
    const { buttons } = activeForm(host);
    const keep = buttons.find((button) => button.activation.label === 'Keep');
    const remove = buttons.find(
      (button) => button.activation.label === `Delete ${testCase.target}`,
    );
    if (!keep || !remove) throw new Error('Expected exact Keep and Delete-name controls.');

    expect(keep.bounds.width).toBe(keep.measure().width);
    expect(remove.bounds.width).toBe(remove.measure().width);
    activate(host, keep);
    await expect(result).resolves.toEqual({ kind: 'cancel' });
  });

  it('ST-36/ST-38 keeps a maximum-length target and cascade inspectable at 48×12', async () => {
    const host = createApplication({ viewport: { width: 48, height: 12 } });
    const target = `Target-${'x'.repeat(240)}-END`;
    const show = await deleteDialog(testCase);
    const result = show(host, new AbortController().signal, ...argsWithTarget(testCase, target));
    await settle();

    const { dialog, buttons } = activeForm(host);
    const remove = buttons.find((button) => button.activation.label.startsWith('Delete '));
    const scroller = descendants(dialog).find((view) => view instanceof Scroller);
    if (!remove || !(scroller instanceof Scroller)) {
      throw new Error('Expected a bounded Delete action and scrollable complete target.');
    }
    expect(remove.bounds.width).toBeLessThan(dialog.bounds.width);
    expect(remove.activation.label).toMatch(/…$/u);
    const initial = frameText(host).replace(/\s+/g, ' ');
    expect(initial).toContain('Target-');
    for (const affected of testCase.affected) expect(initial.toLowerCase()).toContain(affected);

    host.loop.focusView(scroller);
    host.loop.dispatch({ type: 'key', key: 'end', ctrl: false, alt: false, shift: false });
    await settle();
    expect(frameText(host)).toContain('-END');

    host.loop.dispatch({ type: 'key', key: 'escape', ctrl: false, alt: false, shift: false });
    await expect(result).resolves.toEqual({ kind: 'cancel' });
  });
});

describe('organization deletion eligibility and failure presentation', () => {
  const capabilities = {
    canReadOrganizations: true,
    canCreateOrganizations: false,
    canReadUsers: false,
    canCreateUsers: false,
    canInviteUsers: false,
    canUpdateUsers: false,
    canManageUserLifecycle: false,
    canDeleteOrganizations: true,
    canDeleteUsers: false,
    canReadApplications: false,
    canCreateApplications: false,
    canUpdateApplications: false,
    canDeleteApplications: false,
    canDeleteModules: false,
    canReadClients: false,
    canCreateClients: false,
    canUpdateClients: false,
    canDeleteClients: false,
    canRevokeClientSecrets: false,
  };

  it('ST-32 disables Delete for the control-plane organization', async () => {
    const { showOrganizationChooser } = await import('../../src/admin/organization-dialogs.js');
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const result = showOrganizationChooser(host, {
      capabilities,
      organizations: Promise.resolve({
        kind: 'success',
        value: [{ ...organization, isSuperAdmin: true }],
      }),
    });
    await settle();
    const list = descendants(activeForm(host).dialog).find((view) => view instanceof ListView);
    if (!(list instanceof ListView)) throw new Error('Expected organization list.');
    const origin = host.loop.renderRoot.originOf(list.rows);
    if (!origin) throw new Error('Expected rendered organization rows.');
    host.loop.dispatch({
      type: 'mouse',
      kind: 'down',
      button: 0,
      x: origin.x + 1,
      y: origin.y,
    });
    await settle();
    const remove = activeForm(host).buttons.find((button) => button.activation.label === 'Delete');
    if (!remove) throw new Error('Expected organization Delete action.');
    expect(remove.state.disabled).toBe(true);

    host.loop.dispatch({ type: 'key', key: 'escape', ctrl: false, alt: false, shift: false });
    await expect(result).resolves.toEqual({ kind: 'cancel' });
  });

  it('ST-32 returns the selected non-control-plane organization from Delete', async () => {
    const { showOrganizationChooser } = await import('../../src/admin/organization-dialogs.js');
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const result = showOrganizationChooser(host, {
      capabilities,
      organizations: Promise.resolve({ kind: 'success', value: [organization] }),
    });
    await settle();
    const list = descendants(activeForm(host).dialog).find((view) => view instanceof ListView);
    if (!(list instanceof ListView)) throw new Error('Expected organization list.');
    list.selected.set(0);
    await settle();
    const remove = activeForm(host).buttons.find((button) => button.activation.label === 'Delete');
    if (!remove) throw new Error('Expected organization Delete action.');
    expect(remove.activation.command).toBe('admin:delete-organization');
    let commandResult: Awaited<typeof result> | undefined;
    void result.then((value) => {
      commandResult = value;
    });
    host.loop.dispatch({ type: 'command', command: remove.activation.command });
    await settle();
    const observed = commandResult;
    if (!observed) {
      host.loop.dispatch({ type: 'key', key: 'escape', ctrl: false, alt: false, shift: false });
      await result;
    }
    expect(observed).toEqual({ kind: 'delete', organization });
  });

  it('ST-35 retains a fixed deletion failure while the chooser reloads', async () => {
    const { showOrganizationChooser } = await import('../../src/admin/organization-dialogs.js');
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const result = showOrganizationChooser(host, {
      capabilities,
      failure: 'conflict',
      organizations: Promise.resolve({ kind: 'success', value: [organization] }),
    });
    await settle();
    expect(frameText(host)).toContain('Conflict');

    host.loop.dispatch({ type: 'key', key: 'escape', ctrl: false, alt: false, shift: false });
    await expect(result).resolves.toEqual({ kind: 'cancel' });
  });
});

describe('Admin deletion workspace placement', () => {
  it('keeps module Delete below its DataGrid with an empty DSL row and requires selection', async () => {
    const exports = (await import('../../src/admin/application-workspace.js')) as object;
    const create = Reflect.get(exports, 'createAdminApplicationWorkspace');
    expect(typeof create).toBe('function');
    if (typeof create !== 'function') throw new TypeError('Missing application workspace factory.');
    const intents: unknown[] = [];
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const capabilities = Object.assign(
      {
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
        canReadClients: false,
        canCreateClients: false,
        canUpdateClients: false,
        canRevokeClients: false,
      },
      { canDeleteApplications: true, canDeleteModules: true },
    );
    const workspace = Reflect.apply(create, undefined, [
      {
        capabilities,
        onIntent: (intent: unknown) => intents.push(intent),
        focusView: (view: View) => host.loop.focusView(view),
      },
    ]) as { readonly content: Group; readonly setState: (state: unknown) => void };
    host.desktop.addWindow(workspace.content as never);
    workspace.setState({
      kind: 'detail',
      scope: 'global',
      applications: [application],
      application,
      etag: null,
      modules: [moduleRow],
    });
    await settle();

    const tabs = descendants(workspace.content).find((view) => view instanceof TabView);
    if (!(tabs instanceof TabView)) throw new Error('Expected Application detail tabs.');
    tabs.select(1);
    host.loop.focusView(tabs.strip);
    await settle();

    const views = descendants(workspace.content);
    const grid = views.find((view) => view instanceof DataGrid);
    const remove = views
      .filter((view): view is Button => view instanceof Button)
      .find((button) => button.activation.label === 'Delete module');
    if (!(grid instanceof DataGrid) || !remove)
      throw new Error('Expected module grid and Delete module.');
    const gridOrigin = host.loop.renderRoot.originOf(grid);
    const removeOrigin = host.loop.renderRoot.originOf(remove);
    if (!gridOrigin || !removeOrigin) throw new Error('Expected rendered module controls.');
    expect(removeOrigin.y).toBeGreaterThan(gridOrigin.y + grid.bounds.height);

    activate(host, remove);
    expect(intents).toEqual([]);
    host.loop.focusView(grid.rows);
    host.loop.dispatch({ type: 'key', key: 'enter', ctrl: false, alt: false, shift: false });
    await settle();
    activate(host, remove);
    expect(intents).toContainEqual({
      kind: 'delete-module',
      applicationId: application.id,
      moduleId: moduleRow.id,
    });
  });
});
