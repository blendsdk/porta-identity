/** Direct JSVision workspace for browsing one organization's users. */

import {
  at,
  Button,
  ComboBox,
  Group,
  Input,
  Label,
  ListView,
  signal,
  Text,
  View,
} from '@jsvision/ui';
import type { Signal } from '@jsvision/ui';
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
  | { readonly kind: 'edit' }
  | { readonly kind: 'set-password' }
  | { readonly kind: 'clear-password' }
  | { readonly kind: 'verify-email' }
  | { readonly kind: 'suspend' }
  | { readonly kind: 'unsuspend' }
  | { readonly kind: 'lock' }
  | { readonly kind: 'unlock' }
  | { readonly kind: 'deactivate' }
  | { readonly kind: 'reactivate' }
  | { readonly kind: 'purge' };

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

/** Formats one validated row for the bounded list control. */
function rowText(user: AdminUserListItem): string {
  const name = [user.givenName, user.familyName].filter(Boolean).join(' ');
  return `${user.email}${name ? ` — ${name}` : ''} [${user.status}]`;
}

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
  const content = new Group();
  let currentState: AdminUserViewState = { kind: 'closed' };
  let currentFocus: View | null = null;
  let disposed = false;
  const searchValue = signal('');
  const filterStatus = signal<AdminUserStatus | null>(null);
  let focusedUserId: string | null = null;

  /** Returns current content geometry with safe pre-mount defaults. */
  const geometry = (): {
    readonly width: number;
    readonly height: number;
    readonly compact: boolean;
  } => {
    const width = content.bounds.width || 74;
    const height = content.bounds.height || 18;
    return { width, height, compact: width < 76 || height < 20 };
  };

  /** Adds a standard action button and remembers the first focus target. */
  const action = (
    label: string,
    intent: AdminUserIntent,
    x: number,
    y: number,
    width: number,
  ): void => {
    const button = new Button(label, { onClick: () => options.onIntent(intent) });
    content.add(at(button, x, y, width, 2));
    currentFocus ??= button;
  };

  /** Renders list browsing controls for one validated page. */
  const renderPage = (state: Extract<AdminUserViewState, { kind: 'page' }>): void => {
    const { width, height, compact } = geometry();
    const searchInput = new Input({ value: searchValue, maxLength: 255 });
    const searchFieldWidth = compact ? Math.max(8, width - 20) : 28;
    content.add(at(new Label('~S~earch', searchInput), 0, 1, 8, 1));
    content.add(at(searchInput, 8, 1, searchFieldWidth, 1));
    content.add(
      at(
        new Button('~S~earch', {
          onClick: () =>
            options.onIntent(
              searchValue.peek()
                ? { kind: 'search', value: searchValue.peek() }
                : { kind: 'search' },
            ),
        }),
        compact ? Math.max(8, width - 11) : 37,
        0,
        11,
        2,
      ),
    );
    currentFocus = searchInput;

    const filters: ReadonlyArray<readonly [string, AdminUserStatus | undefined]> = [
      ['~A~ll', undefined],
      ['Act~i~ve', 'active'],
      ['I~n~active', 'inactive'],
      ['~S~uspended', 'suspended'],
      ['~L~ocked', 'locked'],
    ];
    if (compact) {
      const statuses = signal<Array<AdminUserStatus | null>>([
        null,
        'active',
        'inactive',
        'suspended',
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
      content.add(at(new Text('Status'), 0, 3, 7, 1));
      content.add(at(filter, 7, 3, Math.max(12, width - 7), 1));
    } else {
      let filterX = 0;
      for (const [label, status] of filters) {
        const buttonWidth = label.replaceAll('~', '').length + 4;
        content.add(
          at(
            new Button(label, {
              onClick: () => {
                filterStatus.set(status ?? null);
                options.onIntent(status ? { kind: 'filter', status } : { kind: 'filter' });
              },
            }),
            filterX,
            3,
            buttonWidth,
            2,
          ),
        );
        filterX += buttonWidth + 1;
      }
      content.add(at(new Text(`Filter: ${filterStatus.peek() ?? 'All'}`), 58, 4, 16, 1));
    }

    const listY = compact ? 4 : 6;
    const pagingY = compact ? Math.max(5, height - 2) : 16;
    if (state.page.data.length === 0) {
      content.add(
        at(
          new Text(searchValue.peek() || filterStatus.peek() ? 'No matching users' : 'No users'),
          0,
          listY,
          width,
          1,
        ),
      );
    } else {
      const rows: Signal<AdminUserListItem[]> = signal([...state.page.data]);
      const focused = signal(
        Math.max(
          0,
          state.page.data.findIndex((user) => user.id === focusedUserId),
        ),
      );
      const list = new ListView({
        items: rows,
        getText: rowText,
        focused,
        sorted: false,
        onSelect: (_index, user) => {
          focusedUserId = user.id;
          options.onIntent({ kind: 'select', userId: user.id });
        },
      });
      content.add(at(list, 0, listY, width, compact ? Math.max(1, pagingY - listY) : 9));
      currentFocus = list.rows;
    }

    const previous = new Button('~P~revious', {
      disabled: state.page.page <= 1,
      onClick: () => options.onIntent({ kind: 'page', page: state.page.page - 1 }),
    });
    const next = new Button('~N~ext', {
      disabled: state.page.page >= state.page.totalPages,
      onClick: () => options.onIntent({ kind: 'page', page: state.page.page + 1 }),
    });
    content.add(at(previous, 0, pagingY, 13, 2));
    if (!compact)
      content.add(
        at(
          new Text(`Page ${state.page.page} of ${Math.max(1, state.page.totalPages)}`),
          15,
          pagingY,
          20,
          1,
        ),
      );
    content.add(at(next, compact ? Math.max(14, width - 10) : 36, pagingY, 9, 2));
    if (state.outcome)
      content.add(
        at(
          new Text(OUTCOME_LABELS[state.outcome]),
          compact ? 0 : 48,
          compact ? 0 : pagingY,
          compact ? width : 26,
          1,
        ),
      );
  };

  /** Returns every action valid for the selected user and current capabilities. */
  const detailActions = (
    user: AdminUserDetail,
  ): Array<{
    readonly label: string;
    readonly intent: AdminUserIntent;
    readonly width: number;
  }> => {
    const actions: Array<{
      readonly label: string;
      readonly intent: AdminUserIntent;
      readonly width: number;
    }> = [{ label: '~B~ack', intent: { kind: 'back' }, width: 9 }];
    if (options.capabilities.canReadUsers)
      actions.push({ label: '~H~istory', intent: { kind: 'history' }, width: 11 });
    if (options.capabilities.canUpdateUsers) {
      actions.push({ label: '~E~dit', intent: { kind: 'edit' }, width: 8 });
      actions.push({ label: 'Set password', intent: { kind: 'set-password' }, width: 16 });
      if (user.hasPassword)
        actions.push({ label: 'Clear password', intent: { kind: 'clear-password' }, width: 18 });
      if (!user.emailVerified)
        actions.push({ label: 'Verify email', intent: { kind: 'verify-email' }, width: 15 });
    }
    if (options.capabilities.canManageUserLifecycle) {
      if (user.status === 'active') {
        actions.push({ label: 'Suspend', intent: { kind: 'suspend' }, width: 11 });
        actions.push({ label: 'Lock', intent: { kind: 'lock' }, width: 8 });
        actions.push({ label: 'Deactivate', intent: { kind: 'deactivate' }, width: 13 });
      } else if (user.status === 'suspended')
        actions.push({ label: 'Unsuspend', intent: { kind: 'unsuspend' }, width: 13 });
      else if (user.status === 'locked')
        actions.push({ label: 'Unlock', intent: { kind: 'unlock' }, width: 10 });
      else actions.push({ label: 'Reactivate', intent: { kind: 'reactivate' }, width: 13 });
    }
    if (options.capabilities.canPurgeUsers)
      actions.push({ label: 'Purge', intent: { kind: 'purge' }, width: 9 });
    return actions;
  };

  /** Renders the allowlisted detail projection and exact available actions. */
  const renderDetail = (state: Extract<AdminUserViewState, { kind: 'detail' }>): void => {
    const user = state.detail;
    const { width, height, compact } = geometry();
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
      `Last login: ${optional(user.lastLoginAt)}`,
      `Created: ${user.createdAt}`,
      `Updated: ${user.updatedAt}`,
    ];
    const actions = detailActions(user);

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
      content.add(at(list, 0, 1, width, Math.max(1, height - 1)));
      currentFocus = list.rows;
    } else {
      const columnWidth = Math.max(1, Math.floor((width - 2) / 2));
      content.add(at(new Text(identityLines.join('\n')), 0, 1, columnWidth, 11));
      content.add(at(new Text(accountLines.join('\n')), columnWidth + 2, 1, columnWidth, 11));
      let x = 0;
      let y = 13;
      for (const item of actions) {
        if (x + item.width > width) {
          x = 0;
          y += 2;
        }
        action(item.label, item.intent, x, y, item.width);
        x += item.width + 1;
      }
      if (state.outcome) content.add(at(new Text(OUTCOME_LABELS[state.outcome]), 0, 10, width, 1));
    }
  };

  /** Renders the bounded first history page. */
  const renderHistory = (state: Extract<AdminUserViewState, { kind: 'history' }>): void => {
    const { width, height, compact } = geometry();
    const backY = compact ? Math.max(2, height - 2) : 16;
    content.add(at(new Text(`History for ${state.detail.email}`), 0, 1, width, 1));
    const entries = signal([...state.history.entries]);
    const list = new ListView({
      items: entries,
      getText: (entry) => `${entry.createdAt} — ${entry.eventType} — ${entry.actor}`,
      sorted: false,
    });
    content.add(at(list, 0, compact ? 2 : 3, width, compact ? Math.max(1, backY - 2) : 12));
    action('~B~ack', { kind: 'back' }, 0, backY, 9);
    currentFocus = list.rows;
    if (state.history.hasMore) content.add(at(new Text('More entries exist'), 12, backY, 22, 1));
    if (state.outcome)
      content.add(
        at(new Text(OUTCOME_LABELS[state.outcome]), compact ? 12 : 38, compact ? 0 : backY, 30, 1),
      );
  };

  /** Rebuilds only this feature-specific content from validated state. */
  const render = (): void => {
    for (const child of [...content.children]) content.remove(child);
    currentFocus = null;
    if (disposed || currentState.kind === 'closed') return;
    const { width, compact } = geometry();
    content.add(at(new Text('Users'), 0, 0, 20, 1));
    if (currentState.kind === 'loading') {
      if (currentState.previous) {
        const previous = previousState(currentState.previous);
        if (previous.kind === 'page') renderPage(previous);
        else if (previous.kind === 'detail') renderDetail(previous);
        else if (previous.kind === 'history') renderHistory(previous);
      }
      content.add(at(new Text('Loading users…'), compact ? Math.max(0, width - 15) : 50, 0, 15, 1));
      return;
    }
    if (currentState.kind === 'failure') {
      if (currentState.previous) {
        const previous = previousState(currentState.previous);
        if (previous.kind === 'page') renderPage(previous);
        else if (previous.kind === 'detail') renderDetail(previous);
        else if (previous.kind === 'history') renderHistory(previous);
      }
      content.add(
        at(
          new Text(OUTCOME_LABELS[currentState.failure]),
          compact ? 0 : 48,
          0,
          compact ? width : 26,
          1,
        ),
      );
      action('~R~etry', { kind: 'retry' }, Math.max(0, Math.min(62, width - 11)), 2, 10);
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
