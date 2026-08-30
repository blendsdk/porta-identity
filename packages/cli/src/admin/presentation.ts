/** JSVision presentation for the embedded Porta administration shell. */

import type { DrawContext, Size2D, StatusLine } from '@jsvision/ui';
import {
  Commands,
  Desktop,
  grow,
  item,
  MenuBar,
  spacer,
  statusItem,
  statusLine,
  subMenu,
  View,
} from '@jsvision/ui';
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

/** Minimum geometry that can display a useful compact shell. */
const COMPACT_WIDTH = 32;
const COMPACT_HEIGHT = 8;

/** Presentation objects mounted into one JSVision application. */
export interface AdminPresentation {
  /** Full-screen body mounted between the application chrome rows. */
  readonly content: Desktop;
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

/** Provides a stable focus target and the resize-only fallback over the desktop. */
class AdminLandingView extends View {
  /** Creates the otherwise blank landing surface. */
  constructor(private readonly reportRecoverableGeometry: (recoverable: boolean) => void) {
    super();
    this.focusable = true;
  }

  /** Draws guidance only when the terminal is too small to operate safely. */
  draw(context: DrawContext): void {
    const { width, height } = context.size;
    const recoverable = width >= COMPACT_WIDTH && height >= COMPACT_HEIGHT;
    this.reportRecoverableGeometry(recoverable);
    if (recoverable) return;
    const style = context.color('desktop');
    context.text(1, 1, 'Terminal too small.', style);
    context.text(1, 2, `Resize to at least ${COMPACT_WIDTH}x${COMPACT_HEIGHT}.`, style);
    context.text(1, Math.max(3, height - 2), 'Alt-X Quit', style);
  }
}

/** Builds the real JSVision view tree and application chrome. */
export function createAdminPresentation(
  initialState: AdminConnectionState,
  _insecure: boolean,
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
  const landing = new AdminLandingView((recoverable) => {
    if (recoverable === geometryIsRecoverable) return;
    geometryIsRecoverable = recoverable;
    menu.setItems(recoverable ? fullMenuItems() : []);
    status.setItems(recoverable ? fullStatusItems() : quitStatusItems());
  });
  const content = new Desktop();
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
