/** Implementation regressions for OIDC client detail composition. */

import {
  Button,
  createApplication,
  DataGrid,
  Dialog,
  Group,
  GroupBox,
  ListBox,
  Scroller,
  View,
} from '@jsvision/ui';
import { describe, expect, it } from 'vitest';

import type { AdminApplication } from '../../src/admin/application-state.js';
import type { AdminClient, AdminClientViewState } from '../../src/admin/client-state.js';
import { createAdminClientWorkspace } from '../../src/admin/client-workspace.js';
import { createAdminPresentation } from '../../src/admin/presentation.js';
import type { AdminCapabilities, AdminOrganizationContext } from '../../src/admin/state.js';

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
const secrets = [
  {
    id: '44444444-4444-4444-8444-444444444444',
    clientId: client.id,
    label: 'Primary',
    status: 'active' as const,
    lastUsedAt: null,
    expiresAt: '2027-01-01T00:00:00Z',
    createdAt: '2026-01-03T00:00:00Z',
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    clientId: client.id,
    label: 'Secondary',
    status: 'active' as const,
    lastUsedAt: null,
    expiresAt: '2027-02-01T00:00:00Z',
    createdAt: '2026-01-04T00:00:00Z',
  },
];

/** Collects every descendant in retained-tree order. */
function descendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(root);
  return result;
}

/** Reads the complete composed terminal frame. */
function frameText(host: ReturnType<typeof createApplication>): string {
  return host.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

/** Allows reactive focus and layout work to settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Mounts one authoritative detail projection with observable intents. */
async function mountDetail(width = 80, height = 24) {
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
  const workspace = createAdminClientWorkspace({
    organization,
    applications: [application],
    capabilities,
    onIntent: (intent) => intents.push(intent),
    focusView: (view) => host.loop.focusView(view),
  });
  presentation.setWorkspace(workspace.content);
  workspace.setState(detail);
  workspace.focusCurrent();
  await settle();
  if (!(workspace.content instanceof Dialog)) throw new Error('Expected the client workspace.');
  const navigation = descendants(workspace.content).find((view) => view instanceof ListBox);
  if (!(navigation instanceof ListBox)) throw new Error('Expected detail navigation.');
  return { host, intents, navigation, window: workspace.content, workspace };
}

/** Activates one section through the real keyboard path. */
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

describe('OIDC client detail implementation', () => {
  it('retains selector identity and focus while replacing only selected content', async () => {
    const mounted = await mountDetail();
    const overview = descendants(mounted.window).find((view) => view instanceof GroupBox);

    await selectSection(mounted.host, mounted.navigation, 1);

    const currentViews = descendants(mounted.window);
    expect(currentViews.filter((view) => view instanceof ListBox)).toEqual([mounted.navigation]);
    expect(mounted.host.loop.getFocused()).toBe(mounted.navigation.rows);
    expect(currentViews).not.toContain(overview);
    expect(frameText(mounted.host)).toContain('Redirect URIs');
    expect(frameText(mounted.host)).not.toContain('Protocol summary');
  });

  it('reflows the same selected section without leaving stale cells', async () => {
    const mounted = await mountDetail();
    await selectSection(mounted.host, mounted.navigation, 2);

    for (const viewport of [
      { width: 48, height: 12 },
      { width: 80, height: 24 },
      { width: 48, height: 12 },
    ]) {
      mounted.host.loop.resize(viewport);
      await settle();
      const currentViews = descendants(mounted.window);
      const section = currentViews.find((view) => view instanceof GroupBox);
      expect(currentViews.filter((view) => view instanceof ListBox)).toEqual([mounted.navigation]);
      expect(mounted.navigation.selected.peek()).toBe(2);
      expect(frameText(mounted.host)).toContain(
        viewport.width === 48 ? 'Edit protocol' : 'Protocol configuration',
      );
      expect(frameText(mounted.host)).not.toContain('Redirect URIs');
      expect(frameText(mounted.host)).not.toContain('[jsvision/ui');
      expect(section).toBeInstanceOf(GroupBox);
      expect(currentViews.some((view) => view instanceof Scroller)).toBe(viewport.width === 48);
      if (viewport.width === 48 && section instanceof GroupBox) {
        expect(section.bounds.height).toBeGreaterThan(0);
      }
    }
  });

  it('preserves a newer section choice when secret metadata arrives or the viewport changes', async () => {
    const mounted = await mountDetail();
    await selectSection(mounted.host, mounted.navigation, 4);
    await selectSection(mounted.host, mounted.navigation, 2);

    mounted.workspace.setState({ ...detail, kind: 'secrets', secrets });
    mounted.host.loop.resize({ width: 48, height: 12 });
    await settle();

    expect(mounted.navigation.selected.peek()).toBe(2);
    expect(frameText(mounted.host)).toContain('Protocol');
  });

  it('restores credential grid focus from the retained secret selection', async () => {
    const mounted = await mountDetail();
    await selectSection(mounted.host, mounted.navigation, 4);
    mounted.workspace.setState({ ...detail, kind: 'secrets', secrets });
    await settle();
    const firstGrid = descendants(mounted.window).find((view) => view instanceof DataGrid);
    if (!(firstGrid instanceof DataGrid)) throw new Error('Expected the credentials grid.');
    firstGrid.focused.set(1);
    mounted.host.loop.focusView(firstGrid.rows);
    mounted.host.loop.dispatch({
      type: 'key',
      key: 'enter',
      ctrl: false,
      alt: false,
      shift: false,
    });
    await selectSection(mounted.host, mounted.navigation, 2);
    await selectSection(mounted.host, mounted.navigation, 4);

    const restoredGrid = descendants(mounted.window).find((view) => view instanceof DataGrid);
    if (!(restoredGrid instanceof DataGrid))
      throw new Error('Expected the rebuilt credentials grid.');
    expect(restoredGrid.focused.peek()).toBe(1);
  });

  it('keeps every mounted section operation naturally measured', async () => {
    const mounted = await mountDetail();
    const actionLabels = new Set([
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

    for (let index = 0; index < 6; index += 1) {
      await selectSection(mounted.host, mounted.navigation, index);
      const actions = descendants(mounted.window).filter(
        (view): view is Button => view instanceof Button && actionLabels.has(view.activation.label),
      );
      for (const action of actions) {
        expect(action.layout.size).toBeUndefined();
        expect(action.bounds.width).toBe(action.measure().width);
      }
    }
    expect(mounted.intents).toContainEqual({ kind: 'secrets', clientId: client.id });
  });
});
