/** Direct JSVision workspace for browsing one organization's users. */

import {
  Button,
  col,
  ComboBox,
  cover,
  DataGrid,
  Dialog,
  fixed,
  Group,
  GroupBox,
  grow,
  Input,
  Label,
  ListView,
  signal,
  spacer,
  Text,
  View,
  row,
} from '@jsvision/ui';
import type { Column, Signal } from '@jsvision/ui';
import { formatAdminDateTime, formatOptionalAdminDateTime } from './admin-date-time.js';
import type { AdminCapabilities } from './state.js';
import type {
  AdminUserDetail,
  AdminUserListItem,
  AdminUserOutcome,
  AdminUserProjection,
  AdminUserStatus,
  AdminUserViewState,
} from './user-state.js';

/** Closed set of user actions emitted by the workspace. */
export type AdminUserIntent =
  | { readonly kind: 'search'; readonly value?: string }
  | { readonly kind: 'filter'; readonly status?: AdminUserStatus }
  | { readonly kind: 'page'; readonly page: number }
  | { readonly kind: 'select'; readonly userId: string }
  | { readonly kind: 'history' }
  | { readonly kind: 'retry' }
  | { readonly kind: 'back' }
  | { readonly kind: 'roles' }
  | { readonly kind: 'edit' }
  | { readonly kind: 'set-password' }
  | { readonly kind: 'clear-password' }
  | { readonly kind: 'verify-email' }
  | { readonly kind: 'deactivate' }
  | { readonly kind: 'activate' }
  | { readonly kind: 'delete' };

/** Construction inputs for one user-specific workspace. */
export interface AdminUserWorkspaceOptions {
  /** Exact capabilities from the currently verified session. */
  readonly capabilities: AdminCapabilities;
  /** Receives only a closed user intent; network work is owned by the application controller. */
  readonly onIntent: (intent: AdminUserIntent) => void;
  /** Focuses one mounted JSVision control through the owning application loop. */
  readonly focusView?: (view: View) => void;
}

/** Mounted user workspace controlled through immutable validated state. */
export interface AdminUserWorkspace {
  /** Content mounted inside the administration shell. */
  readonly content: View;
  /** Replaces the complete validated view state. */
  readonly setState: (state: AdminUserViewState) => void;
  /** Restores focus to the current view's primary control. */
  readonly focusCurrent: () => void;
  /** Removes retained user state and controls. */
  readonly clear: () => void;
  /** Permanently removes the workspace controls. */
  readonly dispose: () => void;
}

/** Fixed labels for safe user-operation outcomes. */
const OUTCOME_LABELS: Readonly<Record<AdminUserOutcome, string>> = {
  validation: 'Validation failed',
  unauthorized: 'Not authorized',
  'not-found': 'User not found',
  conflict: 'Conflict',
  unavailable: 'Service unavailable',
  'invalid-response': 'Invalid server response',
  'outcome-unknown': 'The operation outcome is unknown',
};

/** Compact detail-list row, optionally activating one user intent. */
interface CompactDetailRow {
  /** Visible detail or action label. */
  readonly label: string;
  /** Action emitted only for selectable action rows. */
  readonly intent?: AdminUserIntent;
}

/** Temporary status displayed without discarding the last validated projection. */
interface WorkspaceStatus {
  /** Safe fixed text shown above retained content. */
  readonly label: string;
  /** Whether the user can request an authoritative reload. */
  readonly retry: boolean;
}

/** Columns shown in the user browser's standard JSVision data grid. */
const USER_COLUMNS: Column<AdminUserListItem>[] = [
  { title: 'Email', accessor: (user) => user.email, width: '2fr', minWidth: 18 },
  {
    title: 'Name',
    accessor: (user) => [user.givenName, user.familyName].filter(Boolean).join(' '),
    width: '1fr',
    minWidth: 12,
  },
  { title: 'Status', accessor: (user) => user.status, width: 11 },
];

/** Converts a nullable validated value to readable terminal text. */
function optional(value: string | null): string {
  return value ?? 'Not provided';
}

/** Returns the previous safe projection retained beneath a loading/failure state. */
function previousState(previous: AdminUserProjection): AdminUserViewState {
  switch (previous.kind) {
    case 'page':
      return { kind: 'page', page: previous.page };
    case 'detail':
      return { ...previous };
    case 'history':
      return { ...previous };
  }
}

/** Builds the direct user workspace without a reusable screen abstraction. */
export function createAdminUserWorkspace(options: AdminUserWorkspaceOptions): AdminUserWorkspace {
  const content = new Dialog({ title: 'Users', width: 72, height: 20 });
  content.closable = false;
  content.resizable = false;
  content.zoomable = false;
  content.background = 'dialog';
  let currentState: AdminUserViewState = { kind: 'closed' };
  let currentFocus: View | null = null;
  let disposed = false;
  const searchValue = signal('');
  const filterStatus = signal<AdminUserStatus | null>(null);
  let focusedUserId: string | null = null;

  /** Reports when the dialog needs its bounded narrow-terminal presentation. */
  const isCompact = (): boolean =>
    (content.bounds.width || 74) < 60 || (content.bounds.height || 18) < 15;

  /** Builds an action button whose natural size is resolved by its Layout DSL row. */
  const action = (label: string, intent: AdminUserIntent): Button => {
    const button = new Button(label, { onClick: () => options.onIntent(intent) });
    currentFocus ??= button;
    return button;
  };

  /** Renders list browsing controls for one validated page. */
  const renderPage = (
    state: Extract<AdminUserViewState, { kind: 'page' }>,
    status?: WorkspaceStatus,
  ): void => {
    const compact = isCompact();
    const searchInput = new Input({ value: searchValue, maxLength: 255 });
    const searchButton = new Button('~S~earch', {
      onClick: () =>
        options.onIntent(
          searchValue.peek() ? { kind: 'search', value: searchValue.peek() } : { kind: 'search' },
        ),
    });
    const searchBar = row(
      { gap: 1 },
      fixed(new Label('~S~earch', searchInput), 7),
      grow(col(fixed(searchInput, 1), spacer())),
      searchButton,
    );
    currentFocus = searchInput;

    const filters: ReadonlyArray<readonly [string, AdminUserStatus | undefined]> = [
      ['~A~ll', undefined],
      ['Act~i~ve', 'active'],
      ['I~n~active', 'inactive'],
      ['~L~ocked', 'locked'],
    ];
    let filterBar: Group;
    if (compact) {
      const statuses = signal<Array<AdminUserStatus | null>>([
        null,
        'active',
        'inactive',
        'locked',
      ]);
      const filter = new ComboBox<AdminUserStatus | null>({
        items: statuses,
        getText: (status) => status ?? 'All',
        value: filterStatus,
        editable: false,
        onSelect: (_index, status) =>
          options.onIntent(status ? { kind: 'filter', status } : { kind: 'filter' }),
      });
      filterBar = row({ gap: 1 }, fixed(new Text('Status'), 6), grow(filter));
    } else {
      const filterControls: View[] = [];
      for (const [label, status] of filters) {
        filterControls.push(
          new Button(label, {
            onClick: () => {
              filterStatus.set(status ?? null);
              options.onIntent(status ? { kind: 'filter', status } : { kind: 'filter' });
            },
          }),
        );
      }
      filterBar = row(
        { gap: 1 },
        ...filterControls,
        spacer(),
        fixed(new Text(`Filter: ${filterStatus.peek() ?? 'All'}`), 16),
      );
    }

    const rows: Signal<AdminUserListItem[]> = signal([...state.page.data]);
    const focused = signal(
      Math.max(
        0,
        state.page.data.findIndex((user) => user.id === focusedUserId),
      ),
    );
    const grid = new DataGrid({
      rows,
      columns: USER_COLUMNS,
      focused,
      zebra: true,
      onSelect: (_index, user) => {
        focusedUserId = user.id;
        options.onIntent({ kind: 'select', userId: user.id });
      },
    });
    currentFocus = grid.rows;

    const previous = new Button('~P~revious', {
      disabled: state.page.page <= 1,
      onClick: () => options.onIntent({ kind: 'page', page: state.page.page - 1 }),
    });
    const next = new Button('~N~ext', {
      disabled: state.page.page >= state.page.totalPages,
      onClick: () => options.onIntent({ kind: 'page', page: state.page.page + 1 }),
    });
    const pager = row(
      { gap: 1 },
      previous,
      grow(new Text(`Page ${state.page.page} of ${Math.max(1, state.page.totalPages)}`)),
      spacer(),
      state.outcome && fixed(new Text(OUTCOME_LABELS[state.outcome]), compact ? 18 : 26),
      next,
    );
    const retry = status?.retry
      ? new Button('~R~etry', { onClick: () => options.onIntent({ kind: 'retry' }) })
      : undefined;
    const pageLayout = col(
      {
        gap: compact ? 0 : 1,
        padding: { top: 0, right: 1, bottom: 0, left: 1 },
      },
      status && fixed(row({ gap: 1 }, grow(new Text(status.label)), retry), 2),
      fixed(searchBar, 2),
      fixed(filterBar, compact ? 1 : 2),
      grow(grid),
      fixed(
        new Text(
          state.page.data.length === 0
            ? searchValue.peek() || filterStatus.peek()
              ? 'No matching users'
              : 'No users'
            : `↑↓ Move · Enter View details · ${state.page.total} ${state.page.total === 1 ? 'user' : 'users'}`,
        ),
        1,
      ),
      fixed(pager, 2),
    );
    content.add(cover(pageLayout));
    if (retry) currentFocus = retry;
  };

  /** Returns every action valid for the selected user and current capabilities. */
  const detailActions = (
    user: AdminUserDetail,
  ): Array<{
    readonly label: string;
    readonly intent: AdminUserIntent;
  }> => {
    const actions: Array<{
      readonly label: string;
      readonly intent: AdminUserIntent;
    }> = [];
    if (options.capabilities.canReadRoles) {
      actions.push({ label: 'Roles', intent: { kind: 'roles' } });
    }
    if (options.capabilities.canUpdateUsers) {
      actions.push({ label: '~E~dit', intent: { kind: 'edit' } });
      actions.push({ label: 'Set password', intent: { kind: 'set-password' } });
      if (user.hasPassword)
        actions.push({ label: 'Clear password', intent: { kind: 'clear-password' } });
      if (!user.emailVerified)
        actions.push({ label: 'Verify email', intent: { kind: 'verify-email' } });
    }
    if (options.capabilities.canManageUserLifecycle) {
      if (user.status === 'active') {
        actions.push({ label: 'Deactivate', intent: { kind: 'deactivate' } });
      } else if (user.status === 'inactive')
        actions.push({ label: 'Activate', intent: { kind: 'activate' } });
    }
    if (options.capabilities.canDeleteUsers)
      actions.push({ label: 'Delete', intent: { kind: 'delete' } });
    return actions;
  };

  /** Builds a bounded list for detail values that cannot all fit in a small terminal. */
  const detailList = (lines: readonly string[]): ListView<string> =>
    new ListView({
      items: signal([...lines]),
      getText: (line) => line,
      sorted: false,
    });

  /** Renders the allowlisted detail projection and exact available actions. */
  const renderDetail = (
    state: Extract<AdminUserViewState, { kind: 'detail' }>,
    status?: WorkspaceStatus,
  ): void => {
    const user = state.detail;
    const compact = isCompact();
    const identityLines = [
      `Email: ${user.email} (${user.emailVerified ? 'verified' : 'unverified'})`,
      `Name: ${optional(user.givenName)} ${optional(user.middleName)} ${optional(user.familyName)}`,
      `Username: ${optional(user.preferredUsername)}  Nickname: ${optional(user.nickname)}`,
      `Gender: ${optional(user.gender)}  Birthdate: ${optional(user.birthdate)}`,
      `Locale: ${optional(user.locale)}  Time zone: ${optional(user.zoneinfo)}`,
      `Profile: ${optional(user.profileUrl)}`,
      `Picture: ${optional(user.pictureUrl)}`,
      `Website: ${optional(user.websiteUrl)}`,
    ];
    const accountLines = [
      `Phone: ${optional(user.phoneNumber)} (${user.phoneNumberVerified ? 'verified' : 'unverified'})`,
      `Street: ${optional(user.addressStreet)}`,
      `Locality: ${optional(user.addressLocality)}`,
      `Region: ${optional(user.addressRegion)}`,
      `Postal: ${optional(user.addressPostalCode)}  Country: ${optional(user.addressCountry)}`,
      `Status: ${user.status}  Password: ${user.hasPassword ? 'set' : 'not set'}`,
      `Two-factor: ${user.twoFactorEnabled ? 'enabled' : 'disabled'}  Logins: ${user.loginCount}`,
      `Last login: ${formatOptionalAdminDateTime(user.lastLoginAt, 'Not provided')}`,
      `Created: ${formatAdminDateTime(user.createdAt)}`,
      `Updated: ${formatAdminDateTime(user.updatedAt)}`,
    ];
    const actions = state.outcome === 'outcome-unknown' ? [] : detailActions(user);
    const navigation = row(
      { gap: 1 },
      action('~B~ack to users', { kind: 'back' }),
      options.capabilities.canReadUsers && action('~H~istory', { kind: 'history' }),
      spacer(),
      state.outcome && new Text(OUTCOME_LABELS[state.outcome]),
    );
    const retry = status?.retry
      ? new Button('~R~etry', { onClick: () => options.onIntent({ kind: 'retry' }) })
      : undefined;
    const statusRow = status && fixed(row({ gap: 1 }, grow(new Text(status.label)), retry), 2);

    if (compact) {
      const rows = signal<CompactDetailRow[]>([
        ...identityLines.map((label) => ({ label })),
        ...accountLines.map((label) => ({ label })),
        ...actions.map(({ label, intent }) => ({
          label: `Action: ${label.replaceAll('~', '')}`,
          intent,
        })),
      ]);
      const list = new ListView({
        items: rows,
        getText: (row) => row.label,
        sorted: false,
        onSelect: (_index, row) => {
          if (row.intent) options.onIntent(row.intent);
        },
      });
      const section = new GroupBox({ title: 'User details & operations' });
      section.add(cover(list));
      content.add(
        cover(
          col(
            { gap: 1, padding: { top: 0, right: 1, bottom: 0, left: 1 } },
            statusRow,
            grow(section),
            fixed(navigation, 2),
          ),
        ),
      );
      currentFocus = list.rows;
    } else {
      const identity = detailList(identityLines);
      const account = detailList(accountLines);
      const identitySection = new GroupBox({ title: 'Identity' });
      identitySection.add(cover(identity));
      const accountSection = new GroupBox({ title: 'Account & security' });
      accountSection.add(cover(account));

      const primaryKinds = new Set<AdminUserIntent['kind']>([
        'roles',
        'edit',
        'set-password',
        'clear-password',
        'verify-email',
      ]);
      const primaryActions = actions.filter(({ intent }) => primaryKinds.has(intent.kind));
      const lifecycleActions = actions.filter(({ intent }) => !primaryKinds.has(intent.kind));
      const operationRows = [primaryActions, lifecycleActions]
        .filter((items) => items.length > 0)
        .map((items) =>
          fixed(
            row({ gap: 1 }, spacer(), ...items.map((item) => action(item.label, item.intent))),
            2,
          ),
        );
      const operationsSection = new GroupBox({ title: 'Operations' });
      operationsSection.add(
        cover(
          operationRows.length > 0
            ? col({ gap: 0 }, ...operationRows)
            : col(grow(new Text('No available operations'))),
        ),
      );
      content.add(
        cover(
          col(
            { gap: 0, padding: { top: 0, right: 1, bottom: 0, left: 1 } },
            statusRow,
            grow(row({ gap: 1 }, grow(identitySection), grow(accountSection))),
            fixed(operationsSection, Math.max(4, operationRows.length * 2 + 2)),
            fixed(navigation, 2),
          ),
        ),
      );
      currentFocus = identity.rows;
    }
    if (retry) currentFocus = retry;
  };

  /** Renders the bounded first history page. */
  const renderHistory = (
    state: Extract<AdminUserViewState, { kind: 'history' }>,
    status?: WorkspaceStatus,
  ): void => {
    const entries = signal([...state.history.entries]);
    const list = new ListView({
      items: entries,
      getText: (entry) =>
        `${formatAdminDateTime(entry.createdAt)} — ${entry.eventType} — ${entry.actor}`,
      sorted: false,
    });
    const historySection = new GroupBox({ title: `History for ${state.detail.email}` });
    historySection.add(cover(list));
    const back = action('~B~ack to user', { kind: 'back' });
    const retry = status?.retry
      ? new Button('~R~etry', { onClick: () => options.onIntent({ kind: 'retry' }) })
      : undefined;
    content.add(
      cover(
        col(
          { gap: 1, padding: { top: 0, right: 1, bottom: 0, left: 1 } },
          status && fixed(row({ gap: 1 }, grow(new Text(status.label)), retry), 2),
          grow(historySection),
          fixed(
            row(
              { gap: 1 },
              back,
              spacer(),
              state.history.hasMore && new Text('More entries exist'),
              state.outcome && new Text(OUTCOME_LABELS[state.outcome]),
            ),
            2,
          ),
        ),
      ),
    );
    currentFocus = list.rows;
    if (retry) currentFocus = retry;
  };

  /** Rebuilds only this feature-specific content from validated state. */
  const render = (): void => {
    for (const child of [...content.children]) content.remove(child);
    currentFocus = null;
    if (disposed || currentState.kind === 'closed') return;
    if (currentState.kind === 'success') {
      content.add(
        cover(
          col(
            { padding: { top: 1, right: 1, bottom: 1, left: 1 } },
            new Text(currentState.action === 'created' ? 'User created' : 'Invitation sent'),
            spacer(),
          ),
        ),
      );
      return;
    }
    if (currentState.kind === 'indeterminate') {
      content.add(
        cover(
          col(
            { padding: { top: 1, right: 1, bottom: 1, left: 1 } },
            new Text(OUTCOME_LABELS['outcome-unknown']),
            spacer(),
          ),
        ),
      );
      return;
    }
    if (currentState.kind === 'loading') {
      if (currentState.previous) {
        const previous = previousState(currentState.previous);
        const status = { label: 'Loading users…', retry: false };
        if (previous.kind === 'page') renderPage(previous, status);
        else if (previous.kind === 'detail') renderDetail(previous, status);
        else if (previous.kind === 'history') renderHistory(previous, status);
      } else
        content.add(
          cover(
            col(
              { padding: { top: 1, right: 1, bottom: 1, left: 1 } },
              new Text('Loading users…'),
              spacer(),
            ),
          ),
        );
      return;
    }
    if (currentState.kind === 'failure') {
      if (currentState.previous) {
        const previous = previousState(currentState.previous);
        const status = { label: OUTCOME_LABELS[currentState.failure], retry: true };
        if (previous.kind === 'page') renderPage(previous, status);
        else if (previous.kind === 'detail') renderDetail(previous, status);
        else if (previous.kind === 'history') renderHistory(previous, status);
      } else {
        const retry = action('~R~etry', { kind: 'retry' });
        content.add(
          cover(
            col(
              { gap: 1, padding: { top: 1, right: 1, bottom: 1, left: 1 } },
              new Text(OUTCOME_LABELS[currentState.failure]),
              row({ gap: 1 }, spacer(), retry),
              spacer(),
            ),
          ),
        );
      }
      return;
    }
    if (currentState.kind === 'page') renderPage(currentState);
    else if (currentState.kind === 'detail') renderDetail(currentState);
    else renderHistory(currentState);
  };

  content.onMount(render);
  return {
    content,
    setState: (state) => {
      if (!disposed) {
        currentState = state;
        render();
      }
    },
    focusCurrent: () => {
      if (!currentFocus) return;
      if (options.focusView) options.focusView(currentFocus);
      else content.host?.healFocus?.(content);
    },
    clear: () => {
      if (disposed) return;
      currentState = { kind: 'closed' };
      searchValue.set('');
      filterStatus.set(null);
      focusedUserId = null;
      render();
    },
    dispose: () => {
      disposed = true;
      currentState = { kind: 'closed' };
      searchValue.set('');
      filterStatus.set(null);
      focusedUserId = null;
      render();
    },
  };
}
