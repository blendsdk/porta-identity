/** Public contracts for the selected-organization user workflow controller. */

import type { View } from '@jsvision/ui';

import type { AdminConnectionState } from './state.js';
import type {
  AdminUserDialogHost,
  CreateUserDialogResult,
  EditUserDialogResult,
  InviteUserDialogResult,
  PurgeUserDialogResult,
  SetUserPasswordDialogResult,
  UserConfirmationAction,
  UserConfirmationDialogResult,
  UserReasonDialogResult,
} from './user-dialogs.js';
import type { AdminInviteUserInput, AdminUserOperations } from './user-service.js';
import type { AdminUserSelection } from './user-state.js';
import type { AdminUserWorkspace, AdminUserWorkspaceOptions } from './user-workspace.js';

/** User-dialog functions used by the controller and replaceable in focused workflow tests. */
export interface AdminUserControllerDialogs {
  /** Collects create-user input. */
  readonly create: (
    host: AdminUserDialogHost,
    signal: AbortSignal,
  ) => Promise<CreateUserDialogResult>;
  /** Collects invitation input and supports a safe preview callback. */
  readonly invite: (
    host: AdminUserDialogHost,
    signal: AbortSignal,
    preview: (input: AdminInviteUserInput) => ReturnType<AdminUserOperations['previewInvitation']>,
  ) => Promise<InviteUserDialogResult>;
  /** Collects touched profile edits. */
  readonly edit: (
    host: AdminUserDialogHost,
    signal: AbortSignal,
    detail: AdminUserSelection['detail'],
  ) => Promise<EditUserDialogResult>;
  /** Collects a matching replacement password. */
  readonly setPassword: (
    host: AdminUserDialogHost,
    signal: AbortSignal,
    email: string,
  ) => Promise<SetUserPasswordDialogResult>;
  /** Collects one explicit confirmation. */
  readonly confirm: (
    host: AdminUserDialogHost,
    signal: AbortSignal,
    action: UserConfirmationAction,
    email: string,
  ) => Promise<UserConfirmationDialogResult>;
  /** Collects the optional or required lifecycle reason. */
  readonly reason: (
    host: AdminUserDialogHost,
    signal: AbortSignal,
    action: 'suspend' | 'lock',
    email: string,
  ) => Promise<UserReasonDialogResult>;
  /** Collects the distinct irreversible purge decision. */
  readonly purge: (
    host: AdminUserDialogHost,
    signal: AbortSignal,
    email: string,
  ) => Promise<PurgeUserDialogResult>;
}

/** Dependencies for one direct user controller. */
export interface AdminUserControllerOptions {
  /** Existing JSVision modal host. */
  readonly host: AdminUserDialogHost;
  /** Reads the latest application-owned connection and capability state. */
  readonly readState: () => AdminConnectionState;
  /** Reads validated user operations for the current verified session. */
  readonly readOperations: () => AdminUserOperations | undefined;
  /** Mounts or removes only the user workspace inside the existing presentation. */
  readonly mountWorkspace: (content: View | null) => void;
  /** Reports whether authentication, identity, or organization work owns the modal surface. */
  readonly isApplicationBusy: () => boolean;
  /** Publishes user-dialog ownership to the application. */
  readonly setDialogBusy: (busy: boolean) => void;
  /** Enters the existing authentication flow after a final session failure. */
  readonly requestAuthentication: () => void;
  /** Lets the application gate new mutations until a deliberate read reconciles state. */
  readonly setRecoveryRequired?: (required: boolean) => void;
  /** Focused test seam for constructing the direct user workspace. */
  readonly workspaceFactory?: (options: AdminUserWorkspaceOptions) => AdminUserWorkspace;
  /** Focused test seam for typed user dialogs. */
  readonly dialogs?: Partial<AdminUserControllerDialogs>;
}

/** Application-owned user workflow boundary. */
export interface AdminUserController {
  /** Atomically applies the selected organization and explicit verified-session epoch. */
  readonly syncContext: (state: AdminConnectionState, sessionEpoch: number) => void;
  /** Handles a recognized top-level user command. */
  readonly handleCommand: (command: string) => boolean;
  /** Cancels the current user read, preview, dialog, or mutation ownership. */
  readonly cancelActiveOperation: () => void;
  /** Hides or restores same-context state across recoverable terminal geometry. */
  readonly handleRecoverableGeometry: (recoverable: boolean) => void;
  /** Invalidates all work and removes the user workspace. */
  readonly dispose: () => void;
}
