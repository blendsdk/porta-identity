/**
 * Admin terminal specification for device-only client administration.
 *
 * Registration must allow a device-only client without a redirect URI and
 * keep an authorization-code client invalid without one. The Protocol editor
 * must display and save the full URN with an empty response-type collection.
 */

import {
  Button,
  CheckGroup,
  createApplication,
  Dialog,
  Group,
  Input,
  TabView,
  View,
} from '@jsvision/ui';
import { describe, expect, it } from 'vitest';

import {
  authenticationUrlRows,
  buildAuthenticationUrlUpdate,
} from '../../src/admin/client-authentication-dialog.js';
import { createAdminPresentation } from '../../src/admin/presentation.js';
import type { AdminCapabilities, AdminOrganizationContext } from '../../src/admin/state.js';
import type { AdminClient } from '../../src/admin/client-state.js';
import type { CreateClientInput } from '@portaidentity/sdk';

const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

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
const deviceClient: AdminClient = {
  id: '33333333-3333-4333-8333-333333333333',
  organizationId: organization.id,
  applicationId: application.id,
  clientId: 'device-terminal-client',
  clientName: 'Device Terminal Client',
  clientType: 'public',
  applicationType: 'native',
  redirectUris: [],
  postLogoutRedirectUris: [],
  grantTypes: [DEVICE_GRANT],
  responseTypes: [],
  scope: 'openid profile',
  tokenEndpointAuthMethod: 'none',
  allowedOrigins: [],
  requirePkce: true,
  requireConsent: false,
  loginMethods: null,
  effectiveLoginMethods: ['password', 'magic_link'],
  status: 'active',
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-08-02T00:00:00Z',
};
const authCodeClient: AdminClient = {
  ...deviceClient,
  clientType: 'confidential',
  applicationType: 'web',
  redirectUris: ['https://portal.example.test/callback'],
  grantTypes: ['authorization_code', 'refresh_token'],
  responseTypes: ['code'],
  tokenEndpointAuthMethod: 'client_secret_basic',
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

/** Collect every mounted descendant of one JSVision view. */
function descendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(root);
  return result;
}

/** Let reactive layout and modal transitions settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Activate one button through the normal keyboard route. */
function activate(host: ReturnType<typeof createApplication>, button: Button): void {
  host.loop.focusView(button);
  host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
}

/** Return the active dialog or fail clearly. */
function activeDialog(host: ReturnType<typeof createApplication>): Dialog {
  const dialog = host.desktop.activeWindow();
  if (!(dialog instanceof Dialog)) throw new Error('Expected a registration dialog.');
  return dialog;
}

/** Return the registration Create button. */
function createButton(dialog: Dialog): Button {
  const button = descendants(dialog)
    .filter((view) => view instanceof Button)
    .find((candidate) => candidate.activation.command === 'ok');
  if (!button) throw new Error('Create client button missing.');
  return button;
}

/** Toggle one checkbox through keyboard navigation. */
function toggleCheckbox(
  host: ReturnType<typeof createApplication>,
  group: CheckGroup,
  targetIndex: number,
  startIndex = 0,
): void {
  host.loop.focusView(group);
  for (let index = startIndex; index < targetIndex; index += 1) {
    host.loop.dispatch({ type: 'key', key: 'down', ctrl: false, alt: false, shift: false });
  }
  host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
}

/** Open the compact registration dialog. */
async function openRegistration() {
  const host = createApplication({ viewport: { width: 80, height: 34 } });
  const module = await import('../../src/admin/client-registration-dialog.js');
  const pending = module.showClientRegistrationDialog(host, new AbortController().signal, {
    organization,
    applications: [application],
  });
  await settle();
  return { host, pending, dialog: activeDialog(host) };
}

/** Mount a device-only detail workspace. */
async function mountDeviceWorkspace() {
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
    { width: 90, height: 32 },
  );
  const host = createApplication({
    content: presentation.content,
    menuBar: presentation.menu,
    statusLine: presentation.status,
    viewport: { width: 90, height: 32 },
  });
  const module = await import('../../src/admin/client-workspace.js');
  const workspace = module.createAdminClientWorkspace({
    organization,
    applications: [application],
    capabilities,
    onIntent: (intent: unknown) => intents.push(intent),
    focusView: (view: View) => host.loop.focusView(view),
  });
  presentation.setWorkspace(workspace.content);
  if (!(workspace.content instanceof Dialog)) throw new Error('Expected a client dialog.');
  workspace.setState({
    kind: 'detail',
    organizationId: organization.id,
    clients: [deviceClient],
    client: deviceClient,
    secrets: [],
  });
  workspace.focusCurrent();
  await settle();
  return { host, intents, dialog: workspace.content };
}

describe('device-only client registration', () => {
  it('creates a device-only client without a redirect URI and sends empty response types', async () => {
    const { host, pending, dialog } = await openRegistration();
    const inputs = descendants(dialog).filter((view) => view instanceof Input);
    const name = inputs.find((input) => input.getMaxLength() === 255);
    const group = descendants(dialog).find((view) => view instanceof CheckGroup);
    if (!name || !(group instanceof CheckGroup)) throw new Error('Registration controls missing.');

    name.getValueSignal().set('CLI device client');
    // Initial grants: authorization_code, refresh_token, client_credentials, device.
    toggleCheckbox(host, group, 0);
    toggleCheckbox(host, group, 3, 0);
    await settle();

    expect(createButton(dialog).state.disabled).toBe(false);
    activate(host, createButton(dialog));

    await expect(pending).resolves.toEqual({
      kind: 'create',
      input: {
        applicationId: application.id,
        clientName: 'CLI device client',
        clientType: 'confidential',
        applicationType: 'web',
        redirectUris: [],
        grantTypes: ['refresh_token', DEVICE_GRANT],
        responseTypes: [],
      } satisfies Omit<CreateClientInput, 'organizationId'>,
    });
  });

  it('keeps an authorization-code registration invalid without a redirect URI', async () => {
    const { dialog } = await openRegistration();
    const inputs = descendants(dialog).filter((view) => view instanceof Input);
    const name = inputs.find((input) => input.getMaxLength() === 255);
    if (!name) throw new Error('Client name input missing.');
    name.getValueSignal().set('Web client without redirect');
    await settle();

    expect(createButton(dialog).state.disabled).toBe(true);
  });
});

describe('device-only Protocol editor', () => {
  it('shows and saves the device grant with an empty response-type collection', async () => {
    const { host, intents, dialog } = await mountDeviceWorkspace();
    const tabs = descendants(dialog).find((view) => view instanceof TabView);
    if (!(tabs instanceof TabView)) throw new Error('Client tabs missing.');
    tabs.select(2);
    await settle();

    const protocol = tabs.tabs.peek()[2]?.content;
    if (!protocol) throw new Error('Protocol tab missing.');
    const views = descendants(protocol);
    expect(views.some((view) => view instanceof CheckGroup)).toBe(true);
    const scope = views.find((view) => view instanceof Input);
    if (!scope) throw new Error('Protocol scope input missing.');
    scope.getValueSignal().set('openid profile email');
    await settle();

    const save = descendants(protocol)
      .filter((view) => view instanceof Button)
      .find((button) => button.activation.label === 'Save');
    if (!save) throw new Error('Protocol Save button missing.');
    activate(host, save);

    expect(intents).toContainEqual({
      kind: 'save-protocol',
      clientId: deviceClient.id,
      input: {
        grantTypes: [DEVICE_GRANT],
        responseTypes: [],
        scope: 'openid profile email',
        tokenEndpointAuthMethod: 'none',
        requirePkce: true,
        requireConsent: false,
      },
    });
  });

  it('allows deleting the last redirect only when authorization code is disabled', () => {
    const deviceWithRedirect: AdminClient = {
      ...deviceClient,
      redirectUris: ['https://device.example.test/callback'],
    };
    const deviceRow = authenticationUrlRows(deviceWithRedirect).find(
      (row) => row.kind === 'redirect',
    );
    const authRow = authenticationUrlRows(authCodeClient).find((row) => row.kind === 'redirect');
    if (!deviceRow || !authRow) throw new Error('Redirect rows missing.');

    expect(
      buildAuthenticationUrlUpdate(deviceWithRedirect, { kind: 'delete', previous: deviceRow }),
    ).toMatchObject({ redirectUris: [] });
    expect(
      buildAuthenticationUrlUpdate(authCodeClient, { kind: 'delete', previous: authRow }),
    ).toBeUndefined();
  });
});
