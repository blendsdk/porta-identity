/** Implementation diagnostics for the direct user workspace. */

import {
  at,
  Button,
  createApplication,
  DataGrid,
  Group,
  Input,
  ListView,
  View,
  Window,
} from '@jsvision/ui';
import { describe, expect, it } from 'vitest';

import { createAdminUserWorkspace } from '../../src/admin/user-workspace.js';
import type { AdminUserDetail, AdminUserPage } from '../../src/admin/user-state.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const row = {
  id: '22222222-2222-4222-8222-222222222222',
  organizationId,
  email: 'alice@example.test',
  givenName: 'Alice',
  familyName: 'Admin',
  status: 'active' as const,
};
const page: AdminUserPage = { data: [row], total: 1, page: 1, pageSize: 20, totalPages: 1 };
const detail: AdminUserDetail = {
  ...row,
  emailVerified: true,
  hasPassword: false,
  middleName: null,
  nickname: null,
  preferredUsername: null,
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
  twoFactorEnabled: false,
  lastLoginAt: null,
  loginCount: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};
const capabilities = {
  canReadOrganizations: false,
  canCreateOrganizations: false,
  canReadUsers: true,
  canCreateUsers: false,
  canInviteUsers: false,
  canUpdateUsers: true,
  canManageUserLifecycle: true,
  canPurgeUsers: true,
};

/** Collects all descendants of one mounted view tree. */
function descendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(root);
  return result;
}

/** Mounts a workspace at the requested geometry. */
function mount(width = 80, height = 24) {
  const intents: string[] = [];
  const application = createApplication({ viewport: { width, height } });
  const workspace = createAdminUserWorkspace({
    capabilities,
    onIntent: (intent) => intents.push(intent.kind),
    focusView: (view) => application.loop.focusView(view),
  });
  const window = new Window('Users');
  window.setLayout({ rect: { x: 0, y: 0, width, height } });
  window.add(at(workspace.content, 1, 1, Math.max(1, width - 4), Math.max(1, height - 4)));
  application.desktop.addWindow(window);
  return { application, intents, window, workspace };
}

/** Lets dynamic view replacement and focus healing finish. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('user workspace implementation', () => {
  it('should use a bounded data grid and focus its rows after a page mounts', async () => {
    const mounted = mount();
    mounted.workspace.setState({ kind: 'page', page });
    await settle();
    mounted.workspace.focusCurrent();
    const views = descendants(mounted.window);
    const grid = views.find((view) => view instanceof DataGrid);

    expect(views.some((view) => view instanceof Input)).toBe(true);
    expect(views.filter((view) => view instanceof Button).length).toBeGreaterThan(2);
    expect(grid).toBeInstanceOf(DataGrid);
    expect(mounted.application.loop.getFocused()).toBe((grid as DataGrid<unknown>).rows);
  });

  it('should keep the compact workspace bounded and keyboard controls mounted', async () => {
    const mounted = mount(48, 12);
    mounted.workspace.setState({ kind: 'page', page });
    await settle();
    const frame = mounted.application.loop.renderRoot.buffer();
    const views = descendants(mounted.window);

    expect(frame.width).toBe(48);
    expect(frame.height).toBe(12);
    expect(views.some((view) => view instanceof DataGrid)).toBe(true);
    expect(views.some((view) => view instanceof Button)).toBe(true);
  });

  it('should keep every compact detail action reachable through its bounded list', async () => {
    const mounted = mount(48, 12);
    mounted.workspace.setState({ kind: 'detail', page, selected: row, detail, etag: null });
    await settle();
    const list = descendants(mounted.window).find((view) => view instanceof ListView);
    if (!(list instanceof ListView)) throw new Error('Compact detail list missing.');
    mounted.application.loop.focusView(list.rows);
    for (let index = 0; index < 30; index += 1)
      mounted.application.loop.dispatch({
        type: 'key',
        key: 'pagedown',
        ctrl: false,
        alt: false,
        shift: false,
      });
    mounted.application.loop.dispatch({
      type: 'key',
      key: 'enter',
      ctrl: false,
      alt: false,
      shift: false,
    });

    expect(mounted.intents).toEqual(['purge']);
  });

  it('should remove retained projections on clear and ignore state after disposal', async () => {
    const mounted = mount();
    mounted.workspace.setState({ kind: 'detail', page, selected: row, detail, etag: null });
    await settle();
    expect(descendants(mounted.window).some((view) => view instanceof Button)).toBe(true);

    mounted.workspace.clear();
    await settle();
    expect(descendants(mounted.window).filter((view) => view instanceof Button)).toHaveLength(0);

    mounted.workspace.dispose();
    mounted.workspace.setState({ kind: 'page', page });
    await settle();
    expect(descendants(mounted.window).some((view) => view instanceof DataGrid)).toBe(false);
  });

  it.each([
    ['suspended', 'Unsuspend'],
    ['locked', 'Unlock'],
    ['inactive', 'Reactivate'],
  ] as const)('should mount only the %s lifecycle recovery action', async (status, expected) => {
    const mounted = mount();
    mounted.workspace.setState({
      kind: 'detail',
      page,
      selected: { ...row, status },
      detail: { ...detail, status },
      etag: null,
    });
    await settle();
    const labels = descendants(mounted.window)
      .filter((view) => view instanceof Button)
      .map((button) => button.activation.label);

    expect(labels).toContain(expected);
    expect(labels).not.toEqual(expect.arrayContaining(['Suspend', 'Lock', 'Deactivate']));
  });
});
