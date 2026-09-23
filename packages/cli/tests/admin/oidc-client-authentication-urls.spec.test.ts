/** Immutable behavior specifications for the unified OIDC authentication URL grid. */

import {
  Button,
  ComboBox,
  createApplication,
  DataGrid,
  Dialog,
  Group,
  GroupBox,
  Input,
  Scroller,
  TabView,
  View,
} from '@jsvision/ui';
import { describe, expect, it } from 'vitest';

import {
  authenticationUrlRows,
  buildAuthenticationUrlUpdate,
  showAuthenticationUrlDialog,
  showDeleteAuthenticationUrlDialog,
} from '../../src/admin/client-authentication-dialog.js';
import { createAdminClientWorkspace } from '../../src/admin/client-workspace.js';
import type {
  AdminAuthenticationUrlRow,
  AuthenticationUrlChoice,
} from '../../src/admin/client-authentication-dialog.js';
import type { AdminClient } from '../../src/admin/client-state.js';
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

/** Collects every mounted descendant of a JSVision view. */
function descendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(root);
  return result;
}

/** Lets reactive layout and modal transitions settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Returns one button by its visible label. */
function button(root: View, label: string): Button {
  const result = descendants(root)
    .filter((view) => view instanceof Button)
    .find((candidate) => candidate.activation.label === label);
  if (!result) throw new Error(`${label} button missing.`);
  return result;
}

/** Activates a button through the ordinary keyboard route. */
function activate(host: ReturnType<typeof createApplication>, action: Button): void {
  host.loop.focusView(action);
  host.loop.dispatch({
    type: 'key',
    key: 'space',
    codepoint: 32,
    ctrl: false,
    alt: false,
    shift: false,
  });
}

/** Selects one URL type through the ComboBox value signal. */
function choose(combo: ComboBox<AuthenticationUrlChoice>, label: string): void {
  const item = combo.items.peek().find((candidate) => candidate.label === label);
  if (!item) throw new Error(`${label} choice missing.`);
  combo.value.set(item);
}

/** Returns the active modal dialog. */
function activeDialog(host: ReturnType<typeof createApplication>): Dialog {
  const dialog = host.desktop.activeWindow();
  if (!(dialog instanceof Dialog)) throw new Error('Authentication URL dialog missing.');
  return dialog;
}

describe('authentication URL projection', () => {
  // One grid projection retains collection identity even when exact values occur in different types.
  it('flattens all three ordered collections into discriminated rows', () => {
    expect(authenticationUrlRows(client)).toEqual([
      {
        id: 'redirect:0',
        kind: 'redirect',
        type: 'Redirect URI',
        value: client.redirectUris[0],
      },
      {
        id: 'redirect:1',
        kind: 'redirect',
        type: 'Redirect URI',
        value: client.redirectUris[1],
      },
      {
        id: 'post-logout:0',
        kind: 'post-logout',
        type: 'Post-logout redirect URI',
        value: client.postLogoutRedirectUris[0],
      },
      {
        id: 'origin:0',
        kind: 'origin',
        type: 'Allowed origin',
        value: client.allowedOrigins[0],
      },
    ]);
  });

  // A confirmed row mutation becomes one complete update through the existing client API contract.
  it('rebuilds exact backend collections after add, edit across types, and delete', () => {
    const rows = authenticationUrlRows(client);
    const added = buildAuthenticationUrlUpdate(client, {
      kind: 'add',
      next: { kind: 'origin', value: 'https://admin.example.test' },
    });
    expect(added).toEqual({
      redirectUris: client.redirectUris,
      postLogoutRedirectUris: client.postLogoutRedirectUris,
      allowedOrigins: ['https://portal.example.test', 'https://admin.example.test'],
    });

    const edited = buildAuthenticationUrlUpdate(client, {
      kind: 'edit',
      previous: rows[1]!,
      next: { kind: 'post-logout', value: 'https://portal.example.test/finished' },
    });
    expect(edited).toEqual({
      redirectUris: [client.redirectUris[0]],
      postLogoutRedirectUris: [
        client.postLogoutRedirectUris[0],
        'https://portal.example.test/finished',
      ],
      allowedOrigins: client.allowedOrigins,
    });

    expect(
      buildAuthenticationUrlUpdate(client, { kind: 'delete', previous: rows[2]! }),
    ).toEqual({
      redirectUris: client.redirectUris,
      postLogoutRedirectUris: [],
      allowedOrigins: client.allowedOrigins,
    });
  });

  // Invalid, duplicate, over-cap, stale, and last-redirect mutations never produce an API update.
  it('rejects mutations that violate collection invariants', () => {
    const onlyRedirect = { ...client, redirectUris: [client.redirectUris[0]!] };
    const redirect = authenticationUrlRows(onlyRedirect)[0]!;
    expect(
      buildAuthenticationUrlUpdate(onlyRedirect, { kind: 'delete', previous: redirect }),
    ).toBeUndefined();
    expect(
      buildAuthenticationUrlUpdate(onlyRedirect, {
        kind: 'edit',
        previous: redirect,
        next: { kind: 'origin', value: 'https://portal.example.test' },
      }),
    ).toBeUndefined();
    expect(
      buildAuthenticationUrlUpdate(client, {
        kind: 'add',
        next: { kind: 'origin', value: client.allowedOrigins[0]! },
      }),
    ).toBeUndefined();
  });

  it.each([
    ['redirect', ''],
    ['redirect', 'not a URL'],
    ['redirect', 'https://portal.example.test/*'],
    ['redirect', 'https://portal.example.test/callback#'],
    ['redirect', 'https://portal.example.test/callback#fragment'],
    ['post-logout', 'https://portal.example.test/signed-out#'],
    ['origin', 'ftp://portal.example.test'],
    ['origin', 'https://user:pass@portal.example.test'],
    ['origin', 'https://portal.example.test/path'],
    ['origin', 'https://portal.example.test?query=yes'],
    ['origin', 'https://portal.example.test#fragment'],
  ] as const)('rejects invalid %s value %j', (kind, value) => {
    expect(
      buildAuthenticationUrlUpdate(client, { kind: 'add', next: { kind, value } }),
    ).toBeUndefined();
  });

  it.each(['redirect', 'post-logout', 'origin'] as const)(
    'allows 10 %s values and rejects an eleventh',
    (kind) => {
      const values = Array.from({ length: 9 }, (_, index) =>
        kind === 'origin'
          ? `https://site-${index}.example.test`
          : `https://site.example.test/${kind}/${index}`,
      );
      const bounded: AdminClient = {
        ...client,
        redirectUris: kind === 'redirect' ? values : client.redirectUris,
        postLogoutRedirectUris: kind === 'post-logout' ? values : [],
        allowedOrigins: kind === 'origin' ? values : [],
      };
      const tenth = kind === 'origin'
        ? 'https://tenth.example.test'
        : `https://site.example.test/${kind}/tenth`;
      const tenValueUpdate = buildAuthenticationUrlUpdate(bounded, {
        kind: 'add',
        next: { kind, value: tenth },
      });
      expect(tenValueUpdate).toBeDefined();
      const full: AdminClient = {
        ...bounded,
        redirectUris: kind === 'redirect' ? tenValueUpdate!.redirectUris! : bounded.redirectUris,
        postLogoutRedirectUris: kind === 'post-logout'
          ? tenValueUpdate!.postLogoutRedirectUris!
          : bounded.postLogoutRedirectUris,
        allowedOrigins: kind === 'origin' ? tenValueUpdate!.allowedOrigins! : bounded.allowedOrigins,
      };
      expect(
        buildAuthenticationUrlUpdate(full, {
          kind: 'add',
          next: {
            kind,
            value: kind === 'origin'
              ? 'https://eleventh.example.test'
              : `https://site.example.test/${kind}/eleventh`,
          },
        }),
      ).toBeUndefined();
    },
  );

  it('allows the same exact value in different URL types', () => {
    expect(
      buildAuthenticationUrlUpdate(client, {
        kind: 'add',
        next: { kind: 'post-logout', value: client.redirectUris[0]! },
      }),
    ).toBeDefined();
  });
});

describe('Authentication tab', () => {
  // The tab directly hosts one unified grid and selection-dependent CRUD actions.
  it('shows one unframed grid and emits typed row intents', async () => {
    const intents: unknown[] = [];
    const workspace = createAdminClientWorkspace({
      organization,
      applications: [],
      capabilities,
      onIntent: (intent) => intents.push(intent),
    });
    const host = createApplication({ content: workspace.content, viewport: { width: 80, height: 24 } });
    workspace.setState({
      kind: 'detail',
      organizationId: organization.id,
      clients: [client],
      client,
      applicationName: 'Customer Portal',
      secrets: [],
      etag: 'etag-1',
    });
    await settle();
    const tabs = descendants(workspace.content).find((view) => view instanceof TabView);
    if (!(tabs instanceof TabView)) throw new Error('Client tabs missing.');
    tabs.select(1);
    await settle();
    const authentication = tabs.tabs.peek()[1]?.content;
    if (!authentication) throw new Error('Authentication tab missing.');
    const views = descendants(authentication);
    const grid = views.find((view) => view instanceof DataGrid);
    if (!(grid instanceof DataGrid)) throw new Error('Authentication URL grid missing.');
    expect(views.filter((view) => view instanceof DataGrid)).toHaveLength(1);
    expect(views.some((view) => view instanceof GroupBox)).toBe(false);
    expect(views.some((view) => view instanceof Scroller)).toBe(false);
    expect(views.filter((view) => view instanceof Button).map((action) => action.activation.label)).toEqual([
      'Add',
      'Edit',
      'Delete',
    ]);
    expect(button(authentication, 'Edit').state.disabled).toBe(true);
    expect(button(authentication, 'Delete').state.disabled).toBe(true);

    activate(host, button(authentication, 'Add'));
    grid.focused.set(2);
    host.loop.focusView(grid.rows);
    host.loop.dispatch({ type: 'key', key: 'enter', codepoint: 13, ctrl: false, alt: false, shift: false });
    await settle();
    activate(host, button(authentication, 'Edit'));
    activate(host, button(authentication, 'Delete'));

    const selected = authenticationUrlRows(client)[2]!;
    expect(intents).toEqual([
      { kind: 'add-authentication-url', clientId: client.id },
      { kind: 'edit-authentication-url', clientId: client.id, row: selected },
      { kind: 'delete-authentication-url', clientId: client.id, row: selected },
    ]);
  });
});

describe('authentication URL dialogs', () => {
  // Add and Edit use one compact, direct form with one type and one single-line value.
  it('adds one validated typed value without a GroupBox or Scroller', async () => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const pending = showAuthenticationUrlDialog(
      host,
      new AbortController().signal,
      client,
      null,
    );
    await settle();
    const dialog = activeDialog(host);
    const views = descendants(dialog);
    expect(dialog.title()).toBe('Add authentication URL');
    expect(views.some((view) => view instanceof GroupBox)).toBe(false);
    expect(views.some((view) => view instanceof Scroller)).toBe(false);
    const combo = views.find((view) => view instanceof ComboBox);
    const input = views.filter((view) => view instanceof Input).at(-1);
    if (!(combo instanceof ComboBox) || !(input instanceof Input)) throw new Error('URL fields missing.');
    expect(combo.items.peek()).toHaveLength(3);
    expect(input.bounds.height).toBe(1);
    expect(button(dialog, 'Add').state.disabled).toBe(true);
    choose(combo as ComboBox<AuthenticationUrlChoice>, 'Allowed origin');
    input.getValueSignal().set('https://admin.example.test');
    await settle();
    expect((combo.value.peek() as AuthenticationUrlChoice | null)?.kind).toBe('origin');
    expect(input.getValueSignal().peek()).toBe('https://admin.example.test');
    expect(dialog.valid('ok')).toBe(true);
    expect(button(dialog, 'Add').state.disabled).toBe(false);
    activate(host, button(dialog, 'Add'));
    await expect(pending).resolves.toEqual({
      kind: 'save',
      row: { kind: 'origin', value: 'https://admin.example.test' },
    });
  });

  // Changing the sole redirect into another type is blocked before submission.
  it('blocks converting the final redirect URI to another type', async () => {
    const onlyRedirect = { ...client, redirectUris: [client.redirectUris[0]!] };
    const row = authenticationUrlRows(onlyRedirect)[0]!;
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const pending = showAuthenticationUrlDialog(
      host,
      new AbortController().signal,
      onlyRedirect,
      row,
    );
    await settle();
    const dialog = activeDialog(host);
    const combo = descendants(dialog).find((view) => view instanceof ComboBox);
    if (!(combo instanceof ComboBox)) throw new Error('URL type missing.');
    choose(combo as ComboBox<AuthenticationUrlChoice>, 'Allowed origin');
    await settle();
    expect(button(dialog, 'Save').state.disabled).toBe(true);
    host.loop.endModal('cancel');
    await expect(pending).resolves.toEqual({ kind: 'cancel' });
  });

  // Destructive removal keeps the complete target in the details and uses a compact action.
  it('confirms deletion with Keep and Delete actions', async () => {
    const row: AdminAuthenticationUrlRow = authenticationUrlRows(client)[2]!;
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const pending = showDeleteAuthenticationUrlDialog(
      host,
      new AbortController().signal,
      client,
      row,
    );
    await settle();
    const dialog = activeDialog(host);
    expect(dialog.title()).toBe('Delete authentication URL');
    expect(button(dialog, 'Keep').activation.command).toBe('cancel');
    expect(
      descendants(dialog)
        .filter((view) => view instanceof Button)
        .map((action) => action.activation.label),
    ).toEqual(['Keep', 'Delete']);
    host.loop.endModal('yes');
    await expect(pending).resolves.toEqual({ kind: 'delete' });
  });
});
