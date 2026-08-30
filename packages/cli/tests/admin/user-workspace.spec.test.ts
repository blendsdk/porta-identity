/** Observable specifications for the user administration workspace. */

import { at, Button, createApplication, Group, Input, ListView, View, Window } from '@jsvision/ui';
import { describe, expect, it } from 'vitest';

import type { AdminCapabilities } from '../../src/admin/state.js';
import type {
  AdminUserDetail,
  AdminUserPage,
  AdminUserViewState,
} from '../../src/admin/user-state.js';
import { createAdminUserWorkspace, type AdminUserIntent } from '../../src/admin/user-workspace.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const capabilities: AdminCapabilities = {
  canReadOrganizations: false,
  canCreateOrganizations: false,
  canReadUsers: true,
  canCreateUsers: true,
  canInviteUsers: true,
  canUpdateUsers: true,
  canManageUserLifecycle: true,
  canPurgeUsers: true,
};
const page: AdminUserPage = {
  data: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      organizationId,
      email: 'alice@example.test',
      givenName: 'Alice',
      familyName: 'Admin',
      status: 'active',
    },
  ],
  total: 21,
  page: 1,
  pageSize: 20,
  totalPages: 2,
};
const secondUser = {
  ...page.data[0]!,
  id: '33333333-3333-4333-8333-333333333333',
  email: 'bob@example.test',
  givenName: 'Bob',
};
const detail: AdminUserDetail = {
  ...page.data[0]!,
  emailVerified: false,
  hasPassword: true,
  middleName: null,
  nickname: 'Ali',
  preferredUsername: 'alice',
  profileUrl: 'https://example.test/alice',
  pictureUrl: 'https://pic.test/a',
  websiteUrl: 'https://web.test/a',
  gender: 'x',
  birthdate: '1990-01-02',
  zoneinfo: 'Europe/Amsterdam',
  locale: 'nl',
  phoneNumber: '+31123456789',
  phoneNumberVerified: false,
  addressStreet: 'Main Street 1',
  addressLocality: 'Leiden',
  addressRegion: 'ZH',
  addressPostalCode: '2311AA',
  addressCountry: 'NL',
  twoFactorEnabled: true,
  lastLoginAt: '2026-08-29T10:00:00Z',
  loginCount: 4,
  createdAt: '2026-01-01T10:00:00Z',
  updatedAt: '2026-08-29T10:00:00Z',
};

/** Reads visible characters from a real JSVision frame. */
function frameText(application: ReturnType<typeof createApplication>): string {
  return application.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

/** Collects one mounted view tree for behavioral control activation. */
function descendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(root);
  return result;
}

/** Mounts a workspace into a real headless application. */
function mount(initialState: AdminUserViewState = { kind: 'closed' }) {
  const intents: AdminUserIntent[] = [];
  const application = createApplication({ viewport: { width: 80, height: 24 } });
  const workspace = createAdminUserWorkspace({
    capabilities,
    onIntent: (intent) => intents.push(intent),
  });
  const window = new Window('Users');
  window.setLayout({ rect: { x: 0, y: 0, width: 80, height: 24 } });
  window.add(at(workspace.content, 1, 1, 76, 20));
  application.desktop.addWindow(window);
  workspace.setState(initialState);
  workspace.focusCurrent();
  return { application, intents, window, workspace };
}

/** Activates a mounted button through the normal keyboard path. */
function activate(application: ReturnType<typeof createApplication>, button: Button): void {
  application.loop.focusView(button);
  application.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
}

/** Clicks the visible face of a mounted control through the real mouse path. */
function click(application: ReturnType<typeof createApplication>, view: View): void {
  const origin = application.loop.renderRoot.originOf(view);
  if (!origin) throw new Error('Control has no rendered origin.');
  for (const kind of ['down', 'up'] as const) {
    application.loop.dispatch({
      type: 'mouse',
      kind,
      button: 0,
      x: origin.x + 2,
      y: origin.y + 1,
    });
  }
}

/** Allows a dynamic workspace rebuild and its coalesced frame to complete. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('user workspace', () => {
  it('should render explicit loading, empty, no-match, and fixed failure states', async () => {
    const mounted = mount({ kind: 'loading' });
    await settle();
    expect(frameText(mounted.application)).toContain('Loading users');

    mounted.workspace.setState({
      kind: 'page',
      page: { ...page, data: [], total: 0, totalPages: 0 },
    });
    await settle();
    expect(frameText(mounted.application)).toContain('No users');

    mounted.workspace.setState({ kind: 'page', page });
    await settle();
    const searchInput = descendants(mounted.window).find((view) => view instanceof Input);
    const searchButton = descendants(mounted.window)
      .filter((view) => view instanceof Button)
      .find((button) => button.activation.label === 'Search');
    if (!(searchInput instanceof Input) || !searchButton)
      throw new Error('Search controls missing.');
    searchInput.getValueSignal().set('missing');
    click(mounted.application, searchButton);
    mounted.workspace.setState({
      kind: 'page',
      page: { ...page, data: [], total: 0, totalPages: 0 },
    });
    await settle();
    expect(frameText(mounted.application)).toContain('No matching users');

    mounted.workspace.setState({
      kind: 'failure',
      failure: 'invalid-response',
    });
    await settle();
    expect(frameText(mounted.application)).toContain('Invalid server response');
    expect(frameText(mounted.application)).not.toContain('alice@example.test');
  });

  it('should emit bounded search and exact status filters while omitting empty values', async () => {
    const mounted = mount({ kind: 'page', page });
    await settle();
    const views = descendants(mounted.window);
    const input = views.find((view) => view instanceof Input);
    const buttons = views.filter((view) => view instanceof Button);
    if (!(input instanceof Input)) throw new Error('Search input was not mounted.');
    const search = buttons.find((button) => button.activation.label === 'Search');
    const active = buttons.find((button) => button.activation.label === 'Active');
    const inactive = buttons.find((button) => button.activation.label === 'Inactive');
    const suspended = buttons.find((button) => button.activation.label === 'Suspended');
    const locked = buttons.find((button) => button.activation.label === 'Locked');
    const all = buttons.find((button) => button.activation.label === 'All');
    if (!search || !active || !inactive || !suspended || !locked || !all)
      throw new Error('Search/filter controls were not mounted.');

    mounted.application.loop.focusView(input);
    for (let index = 0; index < 256; index += 1) {
      mounted.application.loop.dispatch({
        type: 'key',
        key: 'x',
        codepoint: 120,
        ctrl: false,
        alt: false,
        shift: false,
      });
    }
    activate(mounted.application, search);
    activate(mounted.application, active);
    activate(mounted.application, inactive);
    activate(mounted.application, suspended);
    activate(mounted.application, locked);
    input.getValueSignal().set('');
    activate(mounted.application, search);
    activate(mounted.application, all);

    expect(input.getMaxLength()).toBe(255);
    expect(input.getValueSignal().peek()).toBe('');
    expect(mounted.intents).toEqual([
      { kind: 'search', value: 'x'.repeat(255) },
      { kind: 'filter', status: 'active' },
      { kind: 'filter', status: 'inactive' },
      { kind: 'filter', status: 'suspended' },
      { kind: 'filter', status: 'locked' },
      { kind: 'search' },
      { kind: 'filter' },
    ]);
  });

  it('should emit only enabled pagination and validated row selection', async () => {
    const mounted = mount({ kind: 'page', page });
    await settle();
    const views = descendants(mounted.window);
    const buttons = views.filter((view) => view instanceof Button);
    const previous = buttons.find((button) => button.activation.label === 'Previous');
    const next = buttons.find((button) => button.activation.label === 'Next');
    const list = views.find((view) => view instanceof ListView);
    if (!previous || !next || !(list instanceof ListView))
      throw new Error('List controls missing.');

    click(mounted.application, next);
    activate(mounted.application, next);
    mounted.application.loop.focusView(list.rows);
    mounted.application.loop.dispatch({
      type: 'key',
      key: 'enter',
      ctrl: false,
      alt: false,
      shift: false,
    });

    expect(mounted.intents).toEqual([
      { kind: 'page', page: 2 },
      { kind: 'page', page: 2 },
      { kind: 'select', userId: page.data[0]!.id },
    ]);
  });

  it('should retain the selected row and allow paging back after a page shrinks', async () => {
    const twoRows = { ...page, data: [page.data[0]!, secondUser], total: 2, totalPages: 1 };
    const mounted = mount({ kind: 'page', page: twoRows });
    await settle();
    let list = descendants(mounted.window).find((view) => view instanceof ListView);
    if (!(list instanceof ListView)) throw new Error('User list missing.');
    list.focused.set(1);
    mounted.application.loop.focusView(list.rows);
    mounted.application.loop.dispatch({
      type: 'key',
      key: 'enter',
      ctrl: false,
      alt: false,
      shift: false,
    });
    mounted.workspace.setState({ kind: 'page', page: twoRows });
    await settle();
    list = descendants(mounted.window).find((view) => view instanceof ListView);
    if (!(list instanceof ListView)) throw new Error('Rebuilt user list missing.');
    expect(list.focused.peek()).toBe(1);

    mounted.workspace.setState({
      kind: 'page',
      page: { ...page, data: [], page: 2, total: 20, totalPages: 1 },
    });
    await settle();
    const previous = descendants(mounted.window)
      .filter((view) => view instanceof Button)
      .find((button) => button.activation.label === 'Previous');
    if (!previous) throw new Error('Previous action missing.');
    activate(mounted.application, previous);
    expect(mounted.intents.at(-1)).toEqual({ kind: 'page', page: 1 });
  });

  it('should preserve a validated page beneath a fixed retry state', async () => {
    const mounted = mount({
      kind: 'failure',
      failure: 'unavailable',
      previous: { kind: 'page', page },
    });
    await settle();
    const retry = descendants(mounted.window)
      .filter((view) => view instanceof Button)
      .find((button) => button.activation.label === 'Retry');
    if (!retry) throw new Error('Retry was not mounted.');

    expect(frameText(mounted.application)).toContain('alice@example.test');
    expect(frameText(mounted.application)).toContain('Service unavailable');
    activate(mounted.application, retry);
    expect(mounted.intents).toEqual([{ kind: 'retry' }]);
  });

  it('should render only the approved detail projection and status-valid actions', async () => {
    const mounted = mount({
      kind: 'detail',
      page,
      selected: page.data[0]!,
      detail,
      etag: 'opaque-never-rendered',
    });
    await settle();
    const frame = frameText(mounted.application);
    const actions = descendants(mounted.window)
      .filter((view) => view instanceof Button)
      .map((button) => button.activation.label);

    expect(frame).toContain('alice@example.test');
    expect(frame).toContain('Two-factor: enabled');
    expect(frame).toContain('Logins: 4');
    expect(frame).toContain('https://pic.test/a');
    expect(frame).toContain('https://web.test/a');
    expect(frame).toContain('Gender: x');
    expect(frame).toContain('Birthdate: 1990-01-02');
    expect(frame).toContain('Region: ZH');
    expect(frame).toContain('Postal: 2311AA');
    expect(frame).not.toContain('opaque-never-rendered');
    expect(actions).toEqual(
      expect.arrayContaining([
        'Edit',
        'Set password',
        'Clear password',
        'Verify email',
        'Suspend',
        'Lock',
        'Deactivate',
        'History',
        'Purge',
      ]),
    );
    expect(actions).not.toEqual(expect.arrayContaining(['Unsuspend', 'Unlock', 'Reactivate']));
  });

  it('should render bounded history without metadata or paging controls', async () => {
    const history = Array.from({ length: 20 }, (_, index) => ({
      eventType: `event-${index}`,
      actor: index === 0 ? 'System' : '33333333-3333-4333-8333-333333333333',
      createdAt: `2026-08-${String(29 - index).padStart(2, '0')}T10:00:00Z`,
    }));
    const mounted = mount({
      kind: 'history',
      page,
      selected: page.data[0]!,
      detail,
      etag: null,
      history: { entries: history, hasMore: true },
    });
    await settle();
    const frame = frameText(mounted.application);
    const actions = descendants(mounted.window)
      .filter((view) => view instanceof Button)
      .map((button) => button.activation.label);

    expect(frame).toContain('event-0');
    expect(frame).toContain('More entries exist');
    expect(frame).not.toContain('metadata');
    expect(actions).toContain('Back');
    expect(actions).not.toEqual(expect.arrayContaining(['Previous', 'Next']));

    const list = descendants(mounted.window).find((view) => view instanceof ListView);
    if (!(list instanceof ListView)) throw new Error('History list missing.');
    mounted.application.loop.focusView(list.rows);
    for (let index = 0; index < 20; index += 1)
      mounted.application.loop.dispatch({
        type: 'key',
        key: 'pagedown',
        ctrl: false,
        alt: false,
        shift: false,
      });
    await settle();
    expect(list.focused.peek()).toBe(19);
    expect(frameText(mounted.application)).toContain('event-19');
  });
});
