/** JSVision presentation for the embedded Porta administration shell. */

import type { DrawContext, Size2D, StatusLine } from '@jsvision/ui';
import {
  Commands,
  Group,
  grow,
  item,
  MenuBar,
  spacer,
  statusItem,
  statusLine,
  stringWidth,
  subMenu,
  View,
} from '@jsvision/ui';
import { normalizeServerOrigin } from '../global-options.js';
import type { AdminConnectionState } from './state.js';

/** Command names handled by the administration application. */
export const ADMIN_COMMANDS = {
  authenticate: 'authenticate',
  retry: 'retry',
  reauthenticate: 'reauthenticate',
  whoAmI: 'who-am-i',
  createOrganization: 'create-organization',
  switchOrganization: 'switch-organization',
  browseUsers: 'browse-users',
  createUser: 'create-user',
  inviteUser: 'invite-user',
  unavailableUser: 'user-action-unavailable',
  cancel: 'cancel',
} as const;

/** Minimum geometry that can display the full administration landing view. */
const NORMAL_WIDTH = 64;
const NORMAL_HEIGHT = 16;

/** Minimum geometry that can display a useful compact shell. */
const COMPACT_WIDTH = 32;
const COMPACT_HEIGHT = 8;

/** Fixed public descriptions for failure categories. */
const FAILURE_LABELS = {
  unavailable: 'Unavailable. Authenticate again.',
  unauthenticated: 'Authentication is required.',
  unauthorized: 'The verified identity is not authorized.',
  'configuration-failure': 'The local configuration is invalid.',
  'storage-failure': 'Credentials could not be stored.',
} as const;

/** Fixed public descriptions for organization-operation failures. */
const ORGANIZATION_FAILURE_LABELS = {
  validation: 'Validation failed',
  unauthorized: 'Not authorized',
  conflict: 'Conflict',
  unavailable: 'Service unavailable',
  'invalid-response': 'Invalid server response',
} as const;

/** Presentation objects mounted into one JSVision application. */
export interface AdminPresentation {
  /** Full-screen body mounted between the application chrome rows. */
  readonly content: Group;
  /** Global and organization menu bar. */
  readonly menu?: MenuBar;
  /** Keyboard shortcut bar. */
  readonly status: StatusLine;
  /** Replaces displayed state and requests a repaint. */
  readonly setState: (state: AdminConnectionState) => void;
  /** Returns the state currently owned by the view. */
  readonly getState: () => AdminConnectionState;
  /** Mounts the selected-organization user workspace, or restores the landing view. */
  readonly setUserWorkspace: (workspace: View | null) => void;
}

/** Clips a control-free value to the available terminal display width. */
function clipText(value: string, maximumWidth: number): string {
  let result = '';
  for (const character of value) {
    if (stringWidth(result + character) > maximumWidth) break;
    result += character;
  }
  return result;
}

/** Converts a state discriminator to a stable, readable label. */
function stateLabel(state: AdminConnectionState): string {
  switch (state.kind) {
    case 'selecting-server':
      return 'Selecting server';
    case 'unauthenticated':
      return state.reason ? FAILURE_LABELS[state.reason] : 'Authentication required';
    case 'authenticating':
      return 'Authenticating';
    case 'verifying':
      return 'Verifying identity';
    case 'authenticated':
      return 'Authenticated';
    case 'unauthorized':
      return FAILURE_LABELS.unauthorized;
    case 'fatal':
      return FAILURE_LABELS[state.failure.kind];
  }
}

/** Returns the server origin without any path or credentials. */
function serverLabel(state: AdminConnectionState): string {
  if (!('server' in state)) return 'Not selected';
  try {
    return normalizeServerOrigin(state.server).origin;
  } catch {
    return 'Invalid configuration';
  }
}

/** Renders the current state into the real JSVision frame buffer. */
class AdminLandingView extends View {
  /** Creates a landing view bound to one mutable application-owned state cell. */
  constructor(
    private readonly readState: () => AdminConnectionState,
    private readonly insecure: boolean,
    private readonly reportRecoverableGeometry: (recoverable: boolean) => void,
  ) {
    super();
    this.focusable = true;
  }

  /** Draws the responsive normal, compact, or resize-only presentation. */
  draw(context: DrawContext): void {
    const bodyStyle = context.color('window');
    context.fill(' ', bodyStyle);
    const { width, height } = context.size;
    const recoverable = width >= COMPACT_WIDTH && height >= COMPACT_HEIGHT;
    this.reportRecoverableGeometry(recoverable);
    if (!recoverable) {
      context.text(1, 1, 'Terminal too small.', bodyStyle);
      context.text(1, 2, `Resize to at least ${COMPACT_WIDTH}x${COMPACT_HEIGHT}.`, bodyStyle);
      context.text(1, Math.max(3, height - 2), 'Alt-X Quit', bodyStyle);
      return;
    }

    const state = this.readState();
    const compact = width < NORMAL_WIDTH || height < NORMAL_HEIGHT;
    const availableWidth = Math.max(1, width - (compact ? 2 : 4));
    const lines = compact
      ? this.compactLines(state, availableWidth)
      : this.normalLines(state, availableWidth);
    for (let index = 0; index < lines.length && index < height; index += 1) {
      context.text(compact ? 1 : 2, index, clipText(lines[index] ?? '', availableWidth), bodyStyle);
    }
  }

  /** Builds the complete landing content used by ordinary terminals. */
  private normalLines(state: AdminConnectionState, maximumWidth: number): string[] {
    const lines = [
      'Porta Administration',
      '',
      `Server: ${serverLabel(state)}`,
      `State: ${stateLabel(state)}`,
    ];
    this.appendOrganization(lines, state, maximumWidth);
    if (this.insecure) lines.push('Warning: insecure TLS verification is enabled.');
    lines.push('', ...this.actionLines(state));
    lines.push('Shortcuts: Alt-X Quit');
    return lines;
  }

  /** Builds the bounded landing content used by small but recoverable terminals. */
  private compactLines(state: AdminConnectionState, maximumWidth: number): string[] {
    const lines =
      state.kind === 'authenticated' && !state.organization
        ? ['', '', '', '', '', `Server: ${serverLabel(state)}`, `State: ${stateLabel(state)}`]
        : ['Porta Admin', `Server: ${serverLabel(state)}`, `State: ${stateLabel(state)}`];
    this.appendOrganization(lines, state, maximumWidth);
    if (this.insecure) lines.push('Warning: insecure TLS enabled.');
    lines.push(...this.actionLines(state));
    return lines;
  }

  /** Appends only the selected organization context, never identity or future modules. */
  private appendOrganization(
    lines: string[],
    state: AdminConnectionState,
    maximumWidth: number,
  ): void {
    if (state.kind !== 'authenticated') return;
    if (state.organizationFailure)
      lines.push(ORGANIZATION_FAILURE_LABELS[state.organizationFailure]);
    if (!state.organization) {
      lines.push('Choose or create an organization.');
      return;
    }
    lines.push(
      `Organization: ${clipText(state.organization.name, maximumWidth)}`,
      `Slug: ${clipText(state.organization.slug, maximumWidth)}`,
      `Status: ${state.organization.status}`,
    );
  }

  /** Lists keyboard-complete actions appropriate to the current state. */
  private actionLines(state: AdminConnectionState): string[] {
    if (state.kind === 'authenticated' || state.kind === 'unauthorized') {
      return ['Ctrl-R Reauthenticate', 'Alt-X Quit'];
    }
    if (state.kind === 'authenticating' || state.kind === 'verifying') {
      return ['Esc Cancel', 'Alt-X Quit'];
    }
    if (state.kind === 'unauthenticated') {
      return ['Alt-X Quit'];
    }
    return ['Alt-X Quit'];
  }
}

/** Builds the real JSVision view tree and application chrome. */
export function createAdminPresentation(
  initialState: AdminConnectionState,
  insecure: boolean,
  viewport?: Size2D,
  utf8 = true,
): AdminPresentation {
  let currentState = initialState;
  const belowRecoverable =
    viewport !== undefined && (viewport.width < COMPACT_WIDTH || viewport.height < COMPACT_HEIGHT);
  const fullMenuItems = () => {
    // Runtime-injected initial state may predate capability claims; missing claims grant nothing.
    const capabilities =
      currentState.kind === 'authenticated'
        ? (currentState.capabilities ?? {
            canReadOrganizations: false,
            canCreateOrganizations: false,
            canReadUsers: false,
            canCreateUsers: false,
            canInviteUsers: false,
            canUpdateUsers: false,
            canManageUserLifecycle: false,
            canPurgeUsers: false,
          })
        : {
            canReadOrganizations: false,
            canCreateOrganizations: false,
            canReadUsers: false,
            canCreateUsers: false,
            canInviteUsers: false,
            canUpdateUsers: false,
            canManageUserLifecycle: false,
            canPurgeUsers: false,
          };
    const hasOrganization = currentState.kind === 'authenticated' && currentState.organization;
    const hasUserCapability =
      capabilities.canReadUsers ||
      capabilities.canCreateUsers ||
      capabilities.canInviteUsers ||
      capabilities.canUpdateUsers ||
      capabilities.canManageUserLifecycle ||
      capabilities.canPurgeUsers;
    const usersTitle = !hasOrganization
      ? 'Users (organization required)'
      : hasUserCapability
        ? '~U~sers'
        : 'Users (user permission required)';
    const unavailableUserItem = (label: string, reason: string) =>
      item(`${label} (${reason})`, ADMIN_COMMANDS.unavailableUser);
    const usersMenu =
      hasOrganization && hasUserCapability
        ? subMenu(usersTitle, [
            capabilities.canReadUsers
              ? item('~B~rowse users…', ADMIN_COMMANDS.browseUsers)
              : unavailableUserItem('Browse users…', 'requires user read'),
            capabilities.canCreateUsers
              ? item('~C~reate user…', ADMIN_COMMANDS.createUser)
              : unavailableUserItem('Create user…', 'requires user create'),
            capabilities.canInviteUsers
              ? item('~I~nvite user…', ADMIN_COMMANDS.inviteUser)
              : unavailableUserItem('Invite user…', 'requires user invite'),
          ])
        : item(usersTitle, ADMIN_COMMANDS.unavailableUser);
    return [
      subMenu(utf8 ? '≡' : '[=]', [
        item('~W~ho am I…', ADMIN_COMMANDS.whoAmI),
        item('~R~eauthenticate', ADMIN_COMMANDS.reauthenticate, 'Ctrl+R'),
        item('~Q~uit', Commands.quit, 'Alt+X'),
      ]),
      subMenu('~O~rganizations', [
        item(
          capabilities.canCreateOrganizations
            ? '~C~reate organization…'
            : 'Create organization… (requires organization create)',
          ADMIN_COMMANDS.createOrganization,
        ),
        item(
          capabilities.canReadOrganizations
            ? '~S~witch organization…'
            : 'Switch organization… (requires organization read)',
          ADMIN_COMMANDS.switchOrganization,
        ),
      ]),
      usersMenu,
    ];
  };
  const fullStatusItems = () => [
    statusItem('~Alt-X~ Quit', Commands.quit, 'Alt+X'),
    spacer(),
    statusItem('~Ctrl-R~ Reauthenticate', ADMIN_COMMANDS.reauthenticate, 'Ctrl+R'),
  ];
  const quitStatusItems = () => [statusItem('~Alt-X~ Quit', Commands.quit, 'Alt+X')];
  const menu = new MenuBar();
  menu.setItems(belowRecoverable ? [] : fullMenuItems());
  const status = statusLine(belowRecoverable ? quitStatusItems() : fullStatusItems());
  let geometryIsRecoverable = !belowRecoverable;
  const landing = new AdminLandingView(
    () => currentState,
    insecure,
    (recoverable) => {
      if (recoverable === geometryIsRecoverable) return;
      geometryIsRecoverable = recoverable;
      menu.setItems(recoverable ? fullMenuItems() : []);
      status.setItems(recoverable ? fullStatusItems() : quitStatusItems());
    },
  );
  const content = new Group();
  content.add(grow(landing));
  let userWorkspace: View | null = null;

  return {
    content,
    menu,
    status,
    setState: (state) => {
      currentState = state;
      if (geometryIsRecoverable) menu.setItems(fullMenuItems());
      landing.invalidate();
    },
    getState: () => currentState,
    setUserWorkspace: (workspace) => {
      if (workspace === userWorkspace) return;
      if (userWorkspace) content.remove(userWorkspace);
      userWorkspace = workspace;
      landing.state.visible = workspace === null;
      if (workspace) content.add(grow(workspace));
      content.invalidateLayout();
    },
  };
}
